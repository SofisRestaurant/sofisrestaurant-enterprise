// src/domain/menu/modifier-hash.util.ts
// ============================================================================
// MODIFIER HASH UTILITY
// ============================================================================
// Generates deterministic version hashes for modifier group configurations.
// Used at checkout to detect stale configuration and price tampering.
//
// Design goals:
//   • Same configuration always produces same hash (deterministic)
//   • Any change to price/availability/rules changes the hash
//   • Sync hash for client-side (djb2); async SHA-256 for audit logging
// ============================================================================

import type { ModifierGroup } from '@/domain/menu/menu.types'
import type { ModifierGroupWritePayload, ModifierWritePayload } from '@/types/admin-menu'

// ─────────────────────────────────────────────────────────────────────────────
// djb2 sync hash (fast, non-cryptographic — suitable for cart integrity)
// ─────────────────────────────────────────────────────────────────────────────

function djb2(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i)
    h = h >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical serialization — order must be deterministic regardless of insertion
// ─────────────────────────────────────────────────────────────────────────────

function canonicalGroup(group: ModifierGroup): object {
  return {
    id:             group.id,
    type:           group.type,
    required:       group.required,
    min_selections: group.min_selections,
    max_selections: group.max_selections,
    modifiers: [...group.modifiers]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((m) => ({
        id:               m.id,
        price_adjustment: m.price_adjustment,
        available:        m.available,
      })),
  }
}

function canonicalGroups(groups: ModifierGroup[]): object[] {
  return [...groups]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(canonicalGroup)
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash for a single modifier group's configuration.
 * Changes when: price adjustments change, availability changes, rules change.
 * Does NOT change when: sort_order, name, description change.
 */
export function hashModifierGroup(group: ModifierGroup): string {
  return djb2(JSON.stringify(canonicalGroup(group)))
}

/**
 * Hash for a full item's modifier configuration.
 * Used in cart pricing_hash to detect stale config at checkout.
 */
export function hashItemModifierConfig(
  itemId: string,
  groups: ModifierGroup[],
): string {
  return djb2(JSON.stringify({ itemId, groups: canonicalGroups(groups) }))
}

/**
 * Hash for a write payload before it's persisted.
 * Used to detect if admin saved the same config twice.
 */
export function hashGroupWritePayload(
  payload: ModifierGroupWritePayload,
  modifiers: Omit<ModifierWritePayload, 'modifier_group_id'>[],
): string {
  const canonical = {
    type:           payload.type,
    required:       payload.required,
    min_selections: payload.min_selections,
    max_selections: payload.max_selections,
    active:         payload.active,
    modifiers: [...modifiers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((m) => ({
        name:             m.name,
        price_adjustment: m.price_adjustment,
        available:        m.available,
      })),
  }
  return djb2(JSON.stringify(canonical))
}

/**
 * Async SHA-256 version — for audit log entries and server-side verification.
 */
export async function hashModifierGroupAsync(group: ModifierGroup): Promise<string> {
  const input = JSON.stringify(canonicalGroup(group))
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  return djb2(input)
}

/**
 * Compare two hashes to detect configuration drift.
 * Returns true if configs are equivalent.
 */
export function configsMatch(hashA: string, hashB: string): boolean {
  return hashA === hashB
}