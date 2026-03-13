// src/services/modifier.service.ts
// ============================================================================
// MODIFIER SERVICE — Gateway-Aligned (2026)
// ============================================================================
// All reads and writes go through the admin-gateway Edge Function.
// No supabase.from('modifiers') calls exist anywhere in this file.
//
// Why: The `modifiers` table is RLS-protected (service-role only for writes).
// The admin-gateway Edge Function holds the service-role key and owns all
// modifier mutations. Browser anon/user tokens cannot write to this table,
// which caused the 403 Forbidden errors on /rest/v1/modifiers.
//
// Gateway action map (src/supabase/functions/admin-gateway/index.ts):
//   menu:modifiers:list-for-group           → { group_id }
//   menu:modifiers:list-available-for-group → { group_id }
//   menu:modifiers:get                      → { id }
//   menu:modifiers:create                   → ModifierCreatePayload
//   menu:modifiers:create-batch             → { group_id, modifiers[] }
//   menu:modifiers:update                   → { id, ...patch }
//   menu:modifiers:toggle-availability      → { id, available }
//   menu:modifiers:toggle-group-availability→ { group_id, available }
//   menu:modifiers:delete                   → { id }
//   menu:modifiers:delete-all-in-group      → { group_id }
//   menu:modifiers:reorder                  → { items: { id, sort_order }[] }
//
// Return contracts:
//   Read-many  → Modifier[]       (domain type from menu.types.ts)
//   Read-one   → Modifier | null
//   Mutations  → AdminModifier    (includes created_at / updated_at)
//   Void ops   → void
// ============================================================================

import { invokeEdge } from '@/lib/supabase/invoke';
import type { AdminModifier } from '@/types/admin-menu';
import type { Modifier } from '@/domain/menu/menu.types';
import type { ModifierWritePayload, ReorderPayload } from '@/types/admin-menu';
import { validateModifierPayload } from '@/domain/menu/modifier.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierServiceError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ModifierServiceError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway response shapes (matches what the Edge Function returns)
// ─────────────────────────────────────────────────────────────────────────────

// The gateway returns raw DB rows. We keep these types private to this file;
// consumers always receive the domain Modifier / AdminModifier types.

interface RawModifierRow {
  id: string;
  modifier_group_id: string;
  name: string;
  price_adjustment: number;
  available: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type guards
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isRawModifierRow(v: unknown): v is RawModifierRow {
  return (
    isRecord(v) &&
    typeof v.id === 'string' &&
    typeof v.modifier_group_id === 'string' &&
    typeof v.name === 'string'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers  (raw gateway row → domain type)
// ─────────────────────────────────────────────────────────────────────────────

function rawToModifier(row: RawModifierRow): Modifier {
  return {
    id: row.id,
    modifier_group_id: row.modifier_group_id,
    name: row.name,
    price_adjustment: Number(row.price_adjustment ?? 0),
    available: row.available,
    sort_order: row.sort_order,
  };
}

function rawToAdminModifier(row: RawModifierRow): AdminModifier {
  return {
    id: row.id,
    modifier_group_id: row.modifier_group_id,
    name: row.name,
    price_adjustment: row.price_adjustment,
    available: row.available,
    sort_order: row.sort_order,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway call helpers
// ─────────────────────────────────────────────────────────────────────────────

// invokeEdge returns the unwrapped `data` field from the gateway Ok envelope.
// All calls below use this; error handling propagates via invokeEdge's throw.

async function callGateway<T>(body: Record<string, unknown>): Promise<T> {
  return invokeEdge<T>('admin-gateway', body);
}

function gatewayError(message: string, cause?: unknown): ModifierServiceError {
  const code =
    isRecord(cause) && typeof cause.code === 'string' ? cause.code : 'GATEWAY_ERROR';
  return new ModifierServiceError(message, code, cause);
}

// ─────────────────────────────────────────────────────────────────────────────
// Row coercers with safe fallback
// ─────────────────────────────────────────────────────────────────────────────

function coerceToModifierArray(raw: unknown, context: string): Modifier[] {
  if (!Array.isArray(raw)) {
    throw new ModifierServiceError(`Unexpected response for ${context}`, 'UNEXPECTED_RESPONSE');
  }
  return raw.filter(isRawModifierRow).map(rawToModifier);
}

function coerceToAdminModifier(raw: unknown, context: string): AdminModifier {
  if (!isRawModifierRow(raw)) {
    throw new ModifierServiceError(`Unexpected response for ${context}`, 'UNEXPECTED_RESPONSE');
  }
  return rawToAdminModifier(raw);
}

function coerceToAdminModifierArray(raw: unknown, context: string): AdminModifier[] {
  if (!Array.isArray(raw)) {
    throw new ModifierServiceError(`Unexpected response for ${context}`, 'UNEXPECTED_RESPONSE');
  }
  return raw.filter(isRawModifierRow).map(rawToAdminModifier);
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierService {
  // ─────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────

  /** All modifiers for a group, including unavailable (admin view). */
  static async getForGroup(groupId: string): Promise<Modifier[]> {
    // Hard guard: an empty groupId would reach the gateway as { group_id: '' }
    // which the parser correctly rejects with a 400. Fail fast here instead.
    if (!groupId || !groupId.trim()) {
      throw new ModifierServiceError('Modifier group id is required.', 'INVALID_GROUP_ID');
    }

    let raw: unknown;

    try {
      console.log(
        'MODIFIER_GET_FOR_GROUP_REQUEST',
        JSON.stringify({
          action: 'menu:modifiers:list-for-group',
          payload: { group_id: groupId },
        }),
      );

      raw = await callGateway({
        action: 'menu:modifiers:list-for-group',
        payload: { group_id: groupId },
      });
    } catch (e) {
      throw gatewayError('Failed to load modifiers', e);
    }

    return coerceToModifierArray(raw, 'getForGroup');
  }

  /** Available modifiers only (customer-facing). */
  static async getAvailableForGroup(groupId: string): Promise<Modifier[]> {
    if (!groupId || !groupId.trim()) {
      throw new ModifierServiceError('Modifier group id is required.', 'INVALID_GROUP_ID');
    }

    let raw: unknown;

    try {
      raw = await callGateway({
        action: 'menu:modifiers:list-available-for-group',
        payload: { group_id: groupId },
      });
    } catch (e) {
      throw gatewayError('Failed to load available modifiers', e);
    }

    return coerceToModifierArray(raw, 'getAvailableForGroup');
  }

  /** Single modifier by id. Returns null if not found. */
  static async getById(id: string): Promise<Modifier | null> {
    let raw: unknown;

    try {
      raw = await callGateway({
        action: 'menu:modifiers:get',
        payload: { id },
      });
    } catch (e) {
      throw gatewayError('Failed to load modifier', e);
    }

    if (raw === null || raw === undefined) return null;
    if (!isRawModifierRow(raw)) {
      throw new ModifierServiceError('Unexpected response for getById', 'UNEXPECTED_RESPONSE');
    }

    return rawToModifier(raw);
  }

  // ─────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────

  static async create(payload: ModifierWritePayload): Promise<AdminModifier> {
    const validation = validateModifierPayload(payload);

    if (!validation.valid) {
      const message = Object.values(validation.errors).filter(Boolean).join('; ');
      throw new ModifierServiceError(`Validation failed: ${message}`);
    }

    let raw: unknown;

    try {
      raw = await callGateway({
        action: 'menu:modifiers:create',
        payload: {
          modifier_group_id: payload.modifier_group_id,
          name: payload.name.trim(),
          price_adjustment: payload.price_adjustment,
          available: payload.available ?? true,
          sort_order: payload.sort_order ?? 0,
        },
      });
    } catch (e) {
      throw gatewayError('Failed to create modifier', e);
    }

    return coerceToAdminModifier(raw, 'create');
  }

  /**
   * Batch create modifiers in a single gateway round-trip.
   * Returns an empty array when modifiers is empty (no gateway call made).
   */
  static async createBatch(
    groupId: string,
    modifiers: Omit<ModifierWritePayload, 'modifier_group_id'>[],
  ): Promise<AdminModifier[]> {
    if (modifiers.length === 0) return [];

    let raw: unknown;

    try {
      raw = await callGateway({
        action: 'menu:modifiers:create-batch',
        payload: {
          group_id: groupId,
          modifiers: modifiers.map((m) => ({
            name: m.name.trim(),
            price_adjustment: m.price_adjustment,
            available: m.available ?? true,
            sort_order: m.sort_order ?? 0,
          })),
        },
      });
    } catch (e) {
      throw gatewayError('Failed to batch create modifiers', e);
    }

    return coerceToAdminModifierArray(raw, 'createBatch');
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────

  static async update(
    id: string,
    payload: Partial<Omit<ModifierWritePayload, 'modifier_group_id'>>,
  ): Promise<AdminModifier> {
    const validation = validateModifierPayload(payload);

    if (!validation.valid) {
      const message = Object.values(validation.errors).filter(Boolean).join('; ');
      throw new ModifierServiceError(`Validation failed: ${message}`);
    }

    // Build the patch — only include fields that were explicitly provided so
    // the gateway's `'field' in payload` checks work correctly.
    const patch: Record<string, unknown> = { id };

    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.price_adjustment !== undefined) patch.price_adjustment = payload.price_adjustment;
    if (payload.available !== undefined) patch.available = payload.available;
    if (payload.sort_order !== undefined) patch.sort_order = payload.sort_order;

    let raw: unknown;

    try {
      raw = await callGateway({ action: 'menu:modifiers:update', payload: patch });
    } catch (e) {
      throw gatewayError('Failed to update modifier', e);
    }

    return coerceToAdminModifier(raw, 'update');
  }

  /** Toggle a single modifier's availability. */
  static async toggleAvailability(id: string, available: boolean): Promise<void> {
    try {
      await callGateway({
        action: 'menu:modifiers:toggle-availability',
        payload: { id, available },
      });
    } catch (e) {
      throw gatewayError('Failed to toggle modifier availability', e);
    }
  }

  /** Toggle availability for every modifier in a group in one call. */
  static async toggleGroupAvailability(groupId: string, available: boolean): Promise<void> {
    try {
      await callGateway({
        action: 'menu:modifiers:toggle-group-availability',
        payload: { group_id: groupId, available },
      });
    } catch (e) {
      throw gatewayError('Failed to bulk toggle modifier availability', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // DELETE
  // ─────────────────────────────────────────────────────────────

  static async delete(id: string): Promise<void> {
    try {
      await callGateway({ action: 'menu:modifiers:delete', payload: { id } });
    } catch (e) {
      throw gatewayError('Failed to delete modifier', e);
    }
  }

  static async deleteAllInGroup(groupId: string): Promise<void> {
    try {
      await callGateway({
        action: 'menu:modifiers:delete-all-in-group',
        payload: { group_id: groupId },
      });
    } catch (e) {
      throw gatewayError('Failed to delete group modifiers', e);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // REORDER
  // ─────────────────────────────────────────────────────────────

  static async reorder(items: ReorderPayload[]): Promise<void> {
    if (items.length === 0) return;

    try {
      await callGateway({
        action: 'menu:modifiers:reorder',
        payload: {
          items: items.map(({ id, sort_order }) => ({ id, sort_order })),
        },
      });
    } catch (e) {
      throw gatewayError('Failed to reorder modifiers', e);
    }
  }
}