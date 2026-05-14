// src/types/admin-menu.ts
// ============================================================================
// ADMIN MENU TYPES
// ============================================================================
// Shared type definitions for the admin modifier system.
//
// Dependency flow:
//   admin-menu.ts  →  domain/menu/menu.types  (ModifierGroup, Modifier, etc.)
//   domain/        →  never imports from this file (domain is upstream)
//   UI / services  →  import from here
//
// ── Why write payloads are explicit interfaces, not Supabase derivations ─────
//
//   ModifierGroupWritePayload and ModifierWritePayload were previously derived
//   from Database['public']['Tables']...['Insert'] (Supabase-generated types).
//   That pattern is fragile: if database.types.ts is stale, missing, or has
//   structural gaps, the property-access chain can silently resolve to `any`.
//   `any` then propagates through Omit<> and ReadonlyArray<>, causing
//   @typescript-eslint/no-unsafe-argument violations in consumers.
//
//   The professional fix is to define these shapes as explicit domain
//   interfaces here. The persistence layer (modifier-group.service.ts, etc.)
//   is responsible for mapping these domain types to the Supabase Insert rows.
//   Domain types must never depend on generated infrastructure types.
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
// ── ModifierGroupWritePayload.type ───────────────────────────────────────────
//
//   `type` is defined directly as the literal union ModifierGroupType.
//   modifier-group.service.ts calls MODIFIER_GROUP_TYPES.includes(payload.type)
//   where the array is `readonly ('radio' | 'checkbox' | 'quantity')[]`.
//   TypeScript's Array.includes() on a readonly literal tuple only accepts the
//   exact union — the explicit interface satisfies this without any narrowing
//   ceremony.
//
// ── ModifierTemplateModifier ─────────────────────────────────────────────────
//
//   ModifierWritePayload defines price_adjustment as a concrete `number`.
//   Template modifiers are in-memory constants and always carry a real value,
//   so the explicit interface already captures this guarantee.
//   ModifierTemplateModifier omits modifier_group_id because templates do not
//   have a group id at definition time — it is assigned on instantiation.
//
// ============================================================================

import type { ModifierGroup, Modifier, ModifierGroupType } from '@/domain/menu/menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience
// ─────────────────────────────────────────────────────────────────────────────

export type { ModifierGroup, Modifier, ModifierGroupType };

// ─────────────────────────────────────────────────────────────────────────────
// Admin write payloads
// ─────────────────────────────────────────────────────────────────────────────
//
// Explicit domain interfaces — intentionally NOT derived from the
// Supabase-generated Database[...]['Insert'] types. The persistence service
// maps these to the Supabase Insert rows; the domain never looks downward into
// generated infrastructure types.
//
// ─────────────────────────────────────────────────────────────────────────────

/** Write payload for the modifier_groups table row. */
export interface ModifierGroupWritePayload {
  /** Present on update; omit on create (DB generates). */
  readonly id?: string;
  readonly name: string;
  /** Human-readable description shown in the admin UI. */
  readonly description?: string | null;
  readonly type: ModifierGroupType;
  /** Authoritative. Never inferred from min_selections. */
  readonly required: boolean;
  /** Non-negative integer. 0 = no minimum. */
  readonly min_selections: number;
  /** Positive integer or null (unlimited). */
  readonly max_selections: number | null;
  readonly sort_order: number;
  readonly active: boolean;
}

/** Write payload for the modifiers table row. */
export interface ModifierWritePayload {
  /** Present on update; omit on create (DB generates). */
  readonly id?: string;
  readonly modifier_group_id: string;
  readonly name: string;
  /** Cents. Integer. May be negative. */
  readonly price_adjustment: number;
  readonly available: boolean;
  readonly sort_order: number;
}

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
// ModifierTemplateModifier is the per-modifier shape used in template
// definitions. modifier_group_id is omitted because it is unknown at template
// definition time (it is only assigned when the template is instantiated).
// price_adjustment is `number` — template modifiers always carry a concrete
// value (they are in-memory constants, not nullable DB rows).
//
// ─────────────────────────────────────────────────────────────────────────────

/** Template-specific modifier shape: modifier_group_id is absent at definition time. */
export type ModifierTemplateModifier = Omit<ModifierWritePayload, 'modifier_group_id'>;

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