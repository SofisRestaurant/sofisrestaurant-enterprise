// src/services/modifier.service.ts
// ============================================================================
// MODIFIER SERVICE — Gateway-Aligned (2026)
// ============================================================================
// All reads and writes go through the admin-gateway Edge Function.
// No supabase.from('modifiers') calls exist anywhere in this file.
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
// Gateway response shapes
// ─────────────────────────────────────────────────────────────────────────────

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
// Mappers
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
// Gateway call helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE FIX: The admin-gateway Edge Function returns { data, meta } envelopes.
 * invokeEdge returns the full JSON response — it does NOT unwrap `data`.
 * We must unwrap it here so coercers always receive the actual payload.
 *
 * If the response IS already a plain value (array/object without meta),
 * we return it as-is for forward compatibility.
 */
async function callGateway<T>(body: Record<string, unknown>): Promise<T> {
  const response = await invokeEdge<unknown>('admin-gateway', body);

  // Unwrap { data, meta } envelope from admin-gateway
  if (isRecord(response) && 'data' in response && 'meta' in response) {
    return response.data as T;
  }

  // Already unwrapped (shouldn't happen, but safe fallback)
  return response as T;
}

function gatewayError(message: string, cause?: unknown): ModifierServiceError {
  const code =
    isRecord(cause) && typeof cause.code === 'string' ? cause.code : 'GATEWAY_ERROR';
  return new ModifierServiceError(message, code, cause);
}

// ─────────────────────────────────────────────────────────────────────────────
// Row coercers
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
  static async getForGroup(groupId: string): Promise<Modifier[]> {
    if (!groupId || !groupId.trim()) {
      throw new ModifierServiceError('Modifier group id is required.', 'INVALID_GROUP_ID');
    }
    let raw: unknown;
    try {
      raw = await callGateway({
        action: 'menu:modifiers:list-for-group',
        payload: { group_id: groupId },
      });
    } catch (e) {
      throw gatewayError('Failed to load modifiers', e);
    }
    return coerceToModifierArray(raw, 'getForGroup');
  }

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

  static async update(
    id: string,
    payload: Partial<Omit<ModifierWritePayload, 'modifier_group_id'>>,
  ): Promise<AdminModifier> {
    const validation = validateModifierPayload(payload);
    if (!validation.valid) {
      const message = Object.values(validation.errors).filter(Boolean).join('; ');
      throw new ModifierServiceError(`Validation failed: ${message}`);
    }
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