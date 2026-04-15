// src/domain/menu/modifier-hash.util.ts
// ============================================================================
// MODIFIER HASH UTILITY
// ============================================================================
// Generates deterministic hashes for modifier configurations and selections.
// Used at checkout to detect stale configuration and price tampering.
//
// Two distinct hash surfaces:
//   CONFIG hash  — hashes group rules + modifier prices/availability.
//                  Changes when admin edits the group. Used as pricing_hash.
//   SELECTION hash — hashes what the customer chose (ids only).
//                    Same selections in any click order → same hash always.
//
// Hardening rules:
//   • All sort comparators use localeCompare on a stable unique key.
//   • Every canonical function validates its input and throws on any invalid
//     field — no ?? or || fallbacks.
//   • hashItemSelections normalises selection order before hashing so that
//     identical choices produce identical output regardless of input order.
// ============================================================================

import type { ModifierGroup, SelectedModifier } from '@/domain/menu/menu.types';
import type { ModifierGroupWritePayload, ModifierWritePayload } from '@/types/admin-menu';

// ─────────────────────────────────────────────────────────────────────────────
// djb2 sync hash (fast, non-cryptographic — suitable for cart integrity)
// ─────────────────────────────────────────────────────────────────────────────

function djb2(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// Config canonical serialization (group rules + modifier prices)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a stable canonical object for a single ModifierGroup's config.
 * Modifiers sorted by id ASC. Throws on any missing or invalid field.
 */
function canonicalGroup(group: ModifierGroup): object {
  if (!group.id || typeof group.id !== 'string') {
    throw new Error(`canonicalGroup: group.id is missing or not a string`);
  }
  if (!Array.isArray(group.modifiers)) {
    throw new Error(`canonicalGroup: group(id=${group.id}).modifiers is not an array`);
  }

  const sortedModifiers = [...group.modifiers].sort((a, b) => {
    if (!a.id || typeof a.id !== 'string') {
      throw new Error(`canonicalGroup: modifier in group(id=${group.id}) is missing id`);
    }
    if (!b.id || typeof b.id !== 'string') {
      throw new Error(`canonicalGroup: modifier in group(id=${group.id}) is missing id`);
    }
    return a.id.localeCompare(b.id);
  });

  return {
    id:             group.id,
    type:           group.type,
    required:       group.required,
    min_selections: group.min_selections,
    max_selections: group.max_selections,
    modifiers: sortedModifiers.map((m) => {
      if (typeof m.price_adjustment !== 'number' || !Number.isFinite(m.price_adjustment)) {
        throw new Error(
          `canonicalGroup: modifier(id=${m.id}) in group(id=${group.id}) ` +
          `has invalid price_adjustment: ${m.price_adjustment}`,
        );
      }
      if (typeof m.available !== 'boolean') {
        throw new Error(
          `canonicalGroup: modifier(id=${m.id}) in group(id=${group.id}) ` +
          `has invalid available: ${m.available}`,
        );
      }
      return {
        id:               m.id,
        price_adjustment: m.price_adjustment,
        available:        m.available,
      };
    }),
  };
}

/**
 * Produce a stable canonical array of multiple ModifierGroups.
 * Groups sorted by id ASC. Throws on any missing id.
 */
function canonicalGroups(groups: readonly ModifierGroup[]): object[] {
  if (!Array.isArray(groups)) {
    throw new Error(`canonicalGroups: groups is not an array`);
  }
  return [...groups]
    .sort((a, b) => {
      if (!a.id || typeof a.id !== 'string') {
        throw new Error(`canonicalGroups: a group is missing id`);
      }
      if (!b.id || typeof b.id !== 'string') {
        throw new Error(`canonicalGroups: a group is missing id`);
      }
      return a.id.localeCompare(b.id);
    })
    .map(canonicalGroup);
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection canonical serialization (what the customer chose)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a stable canonical object for one group's customer selections.
 *
 * Normalisation:
 *   - Groups are sorted by modifier_group_id ASC.
 *   - Within each group, selections are sorted by id ASC.
 *
 * This guarantees that identical choices produce identical output regardless
 * of the order in which the customer clicked options.
 *
 * Only id and modifier_group_id are included — name and price_adjustment are
 * excluded because they come from the config, not from the selection itself.
 * Price integrity is handled separately by the config hash (pricing_hash).
 *
 * Throws if any selection is missing id or modifier_group_id.
 */
function canonicalSelections(
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): object {
  const groupIds = Object.keys(selectedModifiers).sort((a, b) => a.localeCompare(b));

  return groupIds.map((groupId) => {
    const selections = selectedModifiers[groupId];

    if (!Array.isArray(selections)) {
      throw new Error(
        `canonicalSelections: selections for group(id=${groupId}) is not an array`,
      );
    }

    const sortedSelections = [...selections].sort((a, b) => {
      if (!a.id || typeof a.id !== 'string') {
        throw new Error(
          `canonicalSelections: a selection in group(id=${groupId}) is missing id`,
        );
      }
      if (!b.id || typeof b.id !== 'string') {
        throw new Error(
          `canonicalSelections: a selection in group(id=${groupId}) is missing id`,
        );
      }
      return a.id.localeCompare(b.id);
    });

    return {
      group_id:   groupId,
      selections: sortedSelections.map((s) => {
        if (!s.modifier_group_id || s.modifier_group_id !== groupId) {
          throw new Error(
            `canonicalSelections: selection(id=${s.id}) has ` +
            `modifier_group_id="${s.modifier_group_id}", expected "${groupId}"`,
          );
        }
        return { id: s.id };
      }),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Config hashes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash for a single modifier group's configuration.
 * Changes when: price adjustments change, availability changes, rules change.
 * Does NOT change when: sort_order, name, description change.
 * Throws if the group is structurally invalid.
 */
export function hashModifierGroup(group: ModifierGroup): string {
  return djb2(JSON.stringify(canonicalGroup(group)));
}

/**
 * Hash for a full item's modifier configuration.
 * Used as cart pricing_hash to detect stale config at checkout.
 * Throws if any group or modifier is structurally invalid.
 */
export function hashItemModifierConfig(itemId: string, groups: readonly ModifierGroup[]): string {
  if (!itemId || typeof itemId !== 'string') {
    throw new Error(`hashItemModifierConfig: itemId is missing or not a string`);
  }
  return djb2(JSON.stringify({ itemId, groups: canonicalGroups(groups) }));
}

/**
 * Hash for a write payload before it's persisted.
 * Used to detect if admin saved the same config twice.
 * Sort: modifiers by name ASC (no id at write time).
 * Throws if any modifier entry is missing a name or has invalid fields.
 */
export function hashGroupWritePayload(
  payload: ModifierGroupWritePayload,
  modifiers: ReadonlyArray<Omit<ModifierWritePayload, 'modifier_group_id'>>,
): string {
  if (!Array.isArray(modifiers)) {
    throw new Error(`hashGroupWritePayload: modifiers is not an array`);
  }

  const sortedModifiers = [...modifiers].sort((a, b) => {
    if (typeof a.name !== 'string' || a.name.length === 0) {
      throw new Error(`hashGroupWritePayload: a modifier entry is missing a name`);
    }
    if (typeof b.name !== 'string' || b.name.length === 0) {
      throw new Error(`hashGroupWritePayload: a modifier entry is missing a name`);
    }
    return a.name.localeCompare(b.name);
  });

  const canonical = {
    type:           payload.type,
    required:       payload.required,
    min_selections: payload.min_selections,
    max_selections: payload.max_selections,
    active:         payload.active,
    modifiers: sortedModifiers.map((m) => {
      if (typeof m.price_adjustment !== 'number' || !Number.isFinite(m.price_adjustment)) {
        throw new Error(
          `hashGroupWritePayload: modifier(name=${m.name}) has invalid price_adjustment`,
        );
      }
      if (typeof m.available !== 'boolean') {
        throw new Error(
          `hashGroupWritePayload: modifier(name=${m.name}) has invalid available`,
        );
      }
      return {
        name:             m.name,
        price_adjustment: m.price_adjustment,
        available:        m.available,
      };
    }),
  };

  return djb2(JSON.stringify(canonical));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Selection hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash of what the customer actually selected.
 *
 * Deterministic regardless of click order:
 *   - Groups sorted by modifier_group_id ASC.
 *   - Selections within each group sorted by id ASC.
 *
 * Identical selections always produce the same hash.
 * Empty selection map produces a stable empty hash.
 *
 * Throws if any selection is missing id or has a mismatched modifier_group_id.
 */
export function hashItemSelections(
  itemId: string,
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): string {
  if (!itemId || typeof itemId !== 'string') {
    throw new Error(`hashItemSelections: itemId is missing or not a string`);
  }
  if (typeof selectedModifiers !== 'object' || selectedModifiers === null) {
    throw new Error(`hashItemSelections: selectedModifiers must be a non-null object`);
  }
  return djb2(JSON.stringify({ itemId, selections: canonicalSelections(selectedModifiers) }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Async config hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async SHA-256 version for audit log entries and server-side verification.
 * Falls back to djb2 only when crypto.subtle is genuinely unavailable.
 * Throws if the group is structurally invalid.
 */
export async function hashModifierGroupAsync(group: ModifierGroup): Promise<string> {
  const input = JSON.stringify(canonicalGroup(group));
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return djb2(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — Comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two hashes to detect configuration drift.
 * Returns true if configs are equivalent.
 */
export function configsMatch(hashA: string, hashB: string): boolean {
  return hashA === hashB;
}