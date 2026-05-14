// src/domain/menu/modifier-hash.util.ts
// ============================================================================
// MODIFIER HASH UTILITY
// ============================================================================
// Generates deterministic hashes for modifier configurations and selections.
// Used at checkout to detect stale configuration and price tampering.
//
// Two distinct hash surfaces:
//   CONFIG hash  - hashes group rules + modifier prices/availability.
//                  Changes when admin edits the group. Used as pricing_hash.
//   SELECTION hash - hashes what the customer chose, ids only.
//                    Same selections in any click order means same hash always.
//
// Hardening rules:
//   - All sort comparators use localeCompare on a stable unique key.
//   - Every canonical function validates its input and throws on invalid fields.
//   - No unsafe any access.
//   - hashItemSelections normalises selection order before hashing so identical
//     choices produce identical output regardless of input order.
// ============================================================================

import type { ModifierGroup, SelectedModifier } from '@/domain/menu/menu.types';
import type { ModifierGroupWritePayload, ModifierWritePayload } from '@/types/admin-menu';

// ─────────────────────────────────────────────────────────────────────────────
// Runtime-safe local types
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

type CanonicalModifierConfig = {
  id: string;
  price_adjustment: number;
  available: boolean;
};

type CanonicalGroupConfig = {
  id: string;
  type: unknown;
  required: unknown;
  min_selections: unknown;
  max_selections: unknown;
  modifiers: CanonicalModifierConfig[];
};

type CanonicalSelection = {
  id: string;
};

type CanonicalGroupSelection = {
  group_id: string;
  selections: CanonicalSelection[];
};

type CanonicalWriteModifier = {
  name: string;
  price_adjustment: number;
  available: boolean;
};

type CanonicalWritePayload = {
  type: unknown;
  required: unknown;
  min_selections: unknown;
  max_selections: unknown;
  active: unknown;
  modifiers: CanonicalWriteModifier[];
};

// ─────────────────────────────────────────────────────────────────────────────
// djb2 sync hash
// Fast, non-cryptographic. Suitable for deterministic cart integrity checks.
// ─────────────────────────────────────────────────────────────────────────────

function djb2(input: string): string {
  let h = 5381;

  for (let i = 0; i < input.length; i += 1) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
    h = h >>> 0;
  }

  return h.toString(16).padStart(8, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe runtime helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, context: string): UnknownRecord {
  if (!isRecord(value)) {
    throw new Error(`${context}: expected a non-null object`);
  }

  return value;
}

function requireNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${context}: expected a non-empty string`);
  }

  return value.trim();
}

function requireFiniteNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${context}: expected a finite number`);
  }

  return value;
}

function requireBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${context}: expected a boolean`);
  }

  return value;
}

function requireArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${context}: expected an array`);
  }

  return value;
}

function compareById(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function compareByName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

// ─────────────────────────────────────────────────────────────────────────────
// Config canonical serialization
// ─────────────────────────────────────────────────────────────────────────────

function readModifierConfig(value: unknown, groupId: string): CanonicalModifierConfig {
  const modifier = requireRecord(value, `canonicalGroup: modifier in group(id=${groupId})`);

  const id = requireNonEmptyString(
    modifier.id,
    `canonicalGroup: modifier in group(id=${groupId}).id`,
  );

  const priceAdjustment = requireFiniteNumber(
    modifier.price_adjustment,
    `canonicalGroup: modifier(id=${id}) in group(id=${groupId}).price_adjustment`,
  );

  const available = requireBoolean(
    modifier.available,
    `canonicalGroup: modifier(id=${id}) in group(id=${groupId}).available`,
  );

  return {
    id,
    price_adjustment: priceAdjustment,
    available,
  };
}

/**
 * Produce a stable canonical object for a single ModifierGroup config.
 * Modifiers are sorted by id ASC.
 * Throws on missing or invalid fields.
 */
function canonicalGroup(group: ModifierGroup): CanonicalGroupConfig {
  const rawGroup = requireRecord(group, 'canonicalGroup: group');

  const id = requireNonEmptyString(rawGroup.id, 'canonicalGroup: group.id');
  const rawModifiers = requireArray(
    rawGroup.modifiers,
    `canonicalGroup: group(id=${id}).modifiers`,
  );

  const modifiers = rawModifiers.map((modifier) => readModifierConfig(modifier, id)).sort(compareById);

  return {
    id,
    type: rawGroup.type,
    required: rawGroup.required,
    min_selections: rawGroup.min_selections,
    max_selections: rawGroup.max_selections,
    modifiers,
  };
}

/**
 * Produce a stable canonical array of multiple ModifierGroups.
 * Groups are sorted by id ASC.
 *
 * NOTE: No Array.isArray guard here by design.
 *
 * TypeScript declares Array.isArray as `(arg: any) => arg is any[]`.
 * Applying that predicate to a `readonly ModifierGroup[]` parameter would
 * narrow the type via intersection — `readonly ModifierGroup[] & any[]` —
 * which collapses to `any[]` (because T & any = any in TypeScript's type
 * algebra). Every subsequent `.map()` callback variable would then be inferred
 * as `any`, causing @typescript-eslint/no-unsafe-argument to fire on the call
 * to canonicalGroup(group).
 *
 * The static type `readonly ModifierGroup[]` already guarantees array-ness at
 * compile time. Per-element integrity is enforced inside canonicalGroup via
 * requireRecord, so defense-in-depth is preserved without the guard.
 */
function canonicalGroups(groups: readonly ModifierGroup[]): CanonicalGroupConfig[] {
  return groups.map((group) => canonicalGroup(group)).sort(compareById);
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection canonical serialization
// ─────────────────────────────────────────────────────────────────────────────

function readSelection(value: unknown, groupId: string): CanonicalSelection {
  const selection = requireRecord(value, `canonicalSelections: selection in group(id=${groupId})`);

  const id = requireNonEmptyString(
    selection.id,
    `canonicalSelections: selection in group(id=${groupId}).id`,
  );

  const modifierGroupId = requireNonEmptyString(
    selection.modifier_group_id,
    `canonicalSelections: selection(id=${id}).modifier_group_id`,
  );

  if (modifierGroupId !== groupId) {
    throw new Error(
      `canonicalSelections: selection(id=${id}) has modifier_group_id="${modifierGroupId}", expected "${groupId}"`,
    );
  }

  return { id };
}

/**
 * Produce stable canonical customer selections.
 *
 * Normalisation:
 *   - Groups are sorted by modifier_group_id ASC.
 *   - Within each group, selections are sorted by id ASC.
 *
 * Only id is included for each selected modifier. Names and prices are excluded
 * because price integrity is handled by the config hash.
 */
function canonicalSelections(
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): CanonicalGroupSelection[] {
  if (!isRecord(selectedModifiers)) {
    throw new Error('canonicalSelections: selectedModifiers must be a non-null object');
  }

  const groupIds = Object.keys(selectedModifiers).sort((a, b) => a.localeCompare(b));

  return groupIds.map((groupId) => {
    const rawSelections = selectedModifiers[groupId];

    if (!Array.isArray(rawSelections)) {
      throw new Error(`canonicalSelections: selections for group(id=${groupId}) is not an array`);
    }

    const selections = rawSelections
      .map((selection) => readSelection(selection, groupId))
      .sort(compareById);

    return {
      group_id: groupId,
      selections,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Write payload canonical serialization
// ─────────────────────────────────────────────────────────────────────────────

function readWriteModifier(
  value: unknown,
  context: string,
): CanonicalWriteModifier {
  const modifier = requireRecord(value, context);

  const name = requireNonEmptyString(modifier.name, `${context}.name`);

  const priceAdjustment = requireFiniteNumber(
    modifier.price_adjustment,
    `${context}(name=${name}).price_adjustment`,
  );

  const available = requireBoolean(
    modifier.available,
    `${context}(name=${name}).available`,
  );

  return {
    name,
    price_adjustment: priceAdjustment,
    available,
  };
}

function canonicalWritePayload(
  payload: ModifierGroupWritePayload,
  modifiers: ReadonlyArray<Omit<ModifierWritePayload, 'modifier_group_id'>>,
): CanonicalWritePayload {
  const rawPayload = requireRecord(payload, 'hashGroupWritePayload: payload');

  if (!Array.isArray(modifiers)) {
    throw new Error('hashGroupWritePayload: modifiers is not an array');
  }

  const canonicalModifiers = modifiers
    .map((modifier) => readWriteModifier(modifier, 'hashGroupWritePayload: modifier'))
    .sort(compareByName);

  return {
    type: rawPayload.type,
    required: rawPayload.required,
    min_selections: rawPayload.min_selections,
    max_selections: rawPayload.max_selections,
    active: rawPayload.active,
    modifiers: canonicalModifiers,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: config hashes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash for a single modifier group's configuration.
 * Changes when price adjustments, availability, or group rules change.
 * Does not change when sort_order, name, or description change.
 */
export function hashModifierGroup(group: ModifierGroup): string {
  return djb2(JSON.stringify(canonicalGroup(group)));
}

/**
 * Hash for a full item's modifier configuration.
 * Used as cart pricing_hash to detect stale config at checkout.
 */
export function hashItemModifierConfig(
  itemId: string,
  groups: readonly ModifierGroup[],
): string {
  const safeItemId = requireNonEmptyString(itemId, 'hashItemModifierConfig: itemId');

  return djb2(
    JSON.stringify({
      itemId: safeItemId,
      groups: canonicalGroups(groups),
    }),
  );
}

/**
 * Hash for a write payload before it is persisted.
 * Used to detect if admin saved the same config twice.
 * Sorts modifiers by name ASC because id may not exist at write time.
 */
export function hashGroupWritePayload(
  payload: ModifierGroupWritePayload,
  modifiers: ReadonlyArray<Omit<ModifierWritePayload, 'modifier_group_id'>>,
): string {
  return djb2(JSON.stringify(canonicalWritePayload(payload, modifiers)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: selection hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Hash of what the customer selected.
 *
 * Deterministic regardless of click order:
 *   - Groups sorted by modifier_group_id ASC.
 *   - Selections within each group sorted by id ASC.
 */
export function hashItemSelections(
  itemId: string,
  selectedModifiers: Record<string, readonly SelectedModifier[]>,
): string {
  const safeItemId = requireNonEmptyString(itemId, 'hashItemSelections: itemId');

  return djb2(
    JSON.stringify({
      itemId: safeItemId,
      selections: canonicalSelections(selectedModifiers),
    }),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: async config hash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Async SHA-256 version for audit log entries and server-side verification.
 * Falls back to djb2 only when crypto.subtle is unavailable.
 */
export async function hashModifierGroupAsync(group: ModifierGroup): Promise<string> {
  const input = JSON.stringify(canonicalGroup(group));

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));

    return Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  return djb2(input);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: comparison
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compare two hashes to detect configuration drift.
 * Returns true when configs are equivalent.
 */
export function configsMatch(hashA: string, hashB: string): boolean {
  return hashA === hashB;
}