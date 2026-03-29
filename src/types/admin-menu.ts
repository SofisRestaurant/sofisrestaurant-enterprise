// src/types/admin-menu.ts
// ============================================================================
// ADMIN MENU TYPES
// ============================================================================
// Shared type definitions for the admin modifier system.
//
// Dependency flow:
//   admin-menu.ts  →  domain/menu/menu.types  (ModifierGroup, Modifier, etc.)
//   admin-menu.ts  →  supabase database.types (DB Insert/Update shapes)
//   domain/        →  never imports from this file (domain is upstream)
//   UI / services  →  import from here
//
// ── ModifierValidationResult disambiguation ──────────────────────────────────
//
//   Two distinct "validation result" shapes coexist in this codebase:
//
//   1. ModifierSchemaValidationResult (this file) — returned by modifier.schema.ts
//      (validateModifierGroupPayload / validateModifierPayload). Carries a
//      per-field errors map with plain string messages.
//      Import from: '@/types/admin-menu'
//
//   2. ModifierValidationResult (menu.types.ts) — returned by the cart /
//      order-time layer (PricingEngine, checkout). Shape: { ok, code, message }.
//      Import from: '@/domain/menu/menu.types'
//
//   modifier.schema.ts imports ModifierValidationResult from THIS file and gets
//   the schema-layer shape via the alias at the bottom of this file.
//   The two names never collide at runtime because they live in different modules.
//
// ── ModifierGroupWritePayload.type narrowing ─────────────────────────────────
//
//   Supabase generates DB enum columns as `string` in Insert/Update types.
//   modifier-group.service.ts calls MODIFIER_GROUP_TYPES.includes(payload.type)
//   where the array is `readonly ('radio' | 'checkbox' | 'quantity')[]`.
//   TypeScript's Array.includes() on a readonly literal tuple only accepts the
//   exact union — passing a plain `string` is a type error.
//   We fix this by overriding `type` to the literal union in our write payload.
//
// ── ModifierTemplate modifiers price_adjustment ──────────────────────────────
//
//   The DB Insert type for modifiers has price_adjustment as `number | null |
//   undefined`. Template modifiers always have a concrete number (they are
//   in-memory constants, not nullable DB rows). ModifierTemplateModifier narrows
//   price_adjustment to `number` so Math.min/max spreads don't blow up.
//
// ============================================================================

import type { ModifierGroup, Modifier, ModifierGroupType } from '@/domain/menu/menu.types';
import type { Database } from '@/../supabase/functions/_shared/database.types';

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export type { ModifierGroup, Modifier, ModifierGroupType };

// ─────────────────────────────────────────────────────────────────────────────
// Admin write payloads
// ─────────────────────────────────────────────────────────────────────────────
//
// We derive the base shapes from the DB Insert types, then tighten fields that
// Supabase generates too loosely for our use:
//
//   • `type`  on modifier_groups is generated as `string` (DB enum column).
//             We narrow it to the literal union so service-layer includes()
//             checks compile without error.
//
//   • Downstream consumers that spread a raw DB row back into this type are
//     unaffected — a value of type `string` is assignable to the narrowed
//     literal union IF it is one of the three valid values, which the DB
//     guarantees. The tightening only affects write-path callers, which is
//     exactly where we want the compiler to catch typos.
//
// ─────────────────────────────────────────────────────────────────────────────

type _ModifierGroupInsert = Database['public']['Tables']['modifier_groups']['Insert'];

/** Write payload for modifier_groups. `type` is narrowed to the literal union. */
export type ModifierGroupWritePayload = Omit<_ModifierGroupInsert, 'type'> & {
  type: ModifierGroupType;
};

export type ModifierWritePayload =
  Database['public']['Tables']['modifiers']['Insert'];

export interface MenuItemModifierGroupWritePayload {
  menu_item_id: string;
  modifier_group_id: string;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enriched admin views (read-only projections)
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminModifierGroup extends ModifierGroup {
  /** Number of menu items that reference this group. */
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface AdminModifier extends Modifier {
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reorder payloads
// ─────────────────────────────────────────────────────────────────────────────

export interface ReorderPayload {
  id: string;
  sort_order: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Template system
// ─────────────────────────────────────────────────────────────────────────────
//
// ModifierTemplateModifier narrows `price_adjustment` to `number` (not
// `number | null | undefined` as the DB Insert type allows). Template modifiers
// are in-memory constants — they always have a concrete price adjustment.
// This lets ModifierTemplateLibrary call Math.min/max(...prices) without error.
//
// ─────────────────────────────────────────────────────────────────────────────

type _ModifierInsertBase = Omit<ModifierWritePayload, 'modifier_group_id'>;

/** Template-specific modifier shape: price_adjustment is always a concrete number. */
export type ModifierTemplateModifier = Omit<_ModifierInsertBase, 'price_adjustment'> & {
  price_adjustment: number;
};

export interface ModifierTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Emoji or icon key displayed in the template library UI. */
  icon?: string;
  group: ModifierGroupWritePayload;
  modifiers: ModifierTemplateModifier[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit / history
// ─────────────────────────────────────────────────────────────────────────────

export type ModifierChangeType = 'created' | 'updated' | 'deleted' | 'reordered' | 'toggled';

export interface ModifierAuditEntry {
  id: string;
  entity_type: 'modifier_group' | 'modifier' | 'menu_item_modifier_groups';
  entity_id: string;
  change_type: ModifierChangeType;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_by: string;
  changed_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema validation result types
// ─────────────────────────────────────────────────────────────────────────────
// Used exclusively by modifier.schema.ts validators.
//
// Error fields are plain `string` (one message per field), NOT `string[]`.
// modifier.schema.ts assigns:  errors.name = 'Group name is required'
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierGroupValidationResult {
  valid: boolean;
  errors: {
    name?: string;
    description?: string;
    type?: string;
    min_selections?: string;
    max_selections?: string;
  };
}

export interface ModifierSchemaValidationResult {
  valid: boolean;
  errors: {
    name?: string;
    price_adjustment?: string;
    sort_order?: string;
  };
}

/**
 * Alias consumed by modifier.schema.ts via:
 *   import type { ModifierValidationResult } from '@/types/admin-menu'
 *
 * This resolves to ModifierSchemaValidationResult (per-field string errors).
 * It is intentionally distinct from ModifierValidationResult in menu.types.ts
 * ({ ok, code, message }), which is the cart/order-time shape.
 */
export type ModifierValidationResult = ModifierSchemaValidationResult;

// ─────────────────────────────────────────────────────────────────────────────
// UI state helpers
// ─────────────────────────────────────────────────────────────────────────────

export type DirtyState = {
  isDirty: boolean;
  fields: Set<string>;
  lastSaved: string | null;
};

export type AsyncStatus = 'idle' | 'loading' | 'saving' | 'success' | 'error';