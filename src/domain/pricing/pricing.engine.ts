export type {
  MoneyUnit,
  CartItemModifierCompat,
  CartItemModifierGroupCompat,
  CartItemModifiersCompat,
  SelectedModLike,
  SelectedByGroup,
  StockStatus,
} from './pricing.types';

import type { MoneyUnit, CartItemModifierCompat, StockStatus } from './pricing.types';
import type { SelectedModLike, SelectedByGroup } from './pricing.input.types';

type ModifierLike = {
  id: string;
  name: string;
  // price_adjustment is the single canonical field.
  // priceAdjustment (camelCase) intentionally absent — dual-field reads
  // in a pricing function create ambiguity. Callers must normalise to
  // price_adjustment before reaching this layer.
  price_adjustment?: number | null;
};

type ModifierGroupLike = {
  id: string;
  name: string;
  modifiers?: ModifierLike[] | null;
};

type UnknownRecord = Record<string, unknown>;

type ModifierLookupValue = {
  name: string;
  groupId: string;
  adjCents: number;
};


function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function toCentsInt(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.trunc(Math.round(value));
}

function isModifierLike(value: unknown): value is ModifierLike {
  return isRecord(value) && typeof value.id === 'string';
}

function isModifierGroupLike(value: unknown): value is ModifierGroupLike {
  return isRecord(value) && typeof value.id === 'string';
}

function isSelectedModLike(value: unknown): value is SelectedModLike {
  return isRecord(value) && typeof value.id === 'string';
}

function sanitizeIdentifier(value: unknown, maxLength = 128): string {
  const trimmed = asString(value).trim();
  if (!trimmed) return '';
  return trimmed.slice(0, maxLength);
}

function sanitizeLabel(value: unknown, fallback = '', maxLength = 240): string {
  const trimmed = asString(value, fallback).trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, maxLength);
}

/**
 * Read the modifier's price adjustment from the single canonical field.
 * Returns null when the field is absent or not a finite number.
 * Callers in the domain layer must treat null as an error.
 * Callers in the display layer may substitute 0 with explicit intent.
 */
function getModifierAdjustment(value: ModifierLike | SelectedModLike): number | null {
  if ('price_adjustment' in value && typeof value.price_adjustment === 'number' && Number.isFinite(value.price_adjustment)) {
    return value.price_adjustment;
  }
  return null;
}

function getModifierGroups(item: unknown): ModifierGroupLike[] {
  if (!isRecord(item)) return [];

  const snake = item.modifier_groups;
  if (Array.isArray(snake)) {
    return snake.filter(isModifierGroupLike);
  }

  const camel = (item as UnknownRecord).modifierGroups;
  if (Array.isArray(camel)) {
    return camel.filter(isModifierGroupLike);
  }

  return [];
}

function getGroupModifiers(group: ModifierGroupLike): ModifierLike[] {
  if (!Array.isArray(group.modifiers)) return [];
  return group.modifiers.filter(isModifierLike);
}

function getSelectedByGroup(selected: unknown): Array<[string, SelectedModLike[]]> {
  if (!isRecord(selected)) return [];

  const result: Array<[string, SelectedModLike[]]> = [];

  for (const [groupIdRaw, rawMods] of Object.entries(selected)) {
    const groupId = sanitizeIdentifier(groupIdRaw);
    if (!groupId || !Array.isArray(rawMods)) continue;

    const safeMods = rawMods.filter(isSelectedModLike);
    if (safeMods.length === 0) continue;

    result.push([groupId, safeMods]);
  }

  return result;
}


/**
 * Convert a known-unit value to integer cents.
 *
 * Unit MUST be supplied explicitly by the caller. There is no default and
 * no inference — the caller is responsible for knowing what unit their
 * data is in. Ambiguous inputs must be rejected before reaching this function.
 *
 * 'cents'  — value is already integer cents, returned as-is after truncation.
 * 'dollars' — value is a dollar float (e.g. 0.50 = 50¢), multiplied by 100.
 */
export function normalizeMoney(value: unknown, unit: MoneyUnit): number {
  const raw = asNumber(value, 0);

  if (unit === 'dollars') {
    return toCentsInt(raw * 100, 0);
  }

  return toCentsInt(raw, 0);
}

/**
 * Stable, deterministic, fast hash for client integrity tags.
 * NOT cryptographic security.
 */
function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }

  return hash.toString(36);
}

function canonicalizeModifiers(mods: CartItemModifierCompat[]): string {
  const sorted = [...mods].sort((a, b) => {
    if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
    if (a.id !== b.id) return a.id.localeCompare(b.id);
    return a.priceAdjustmentCents - b.priceAdjustmentCents;
  });

  return sorted
    .map(({ groupId, id, priceAdjustmentCents }) => `${groupId}:${id}:${priceAdjustmentCents}`)
    .join('|');
}

function buildModifierLookup(groups: ModifierGroupLike[]): Map<string, ModifierLookupValue> {
  const lookup = new Map<string, ModifierLookupValue>();

  for (const group of groups) {
    const groupId = sanitizeIdentifier(group.id);
    if (!groupId) continue;

    for (const modifier of getGroupModifiers(group)) {
      const modifierId = sanitizeIdentifier(modifier.id);
      if (!modifierId) continue;

      const adjustment = getModifierAdjustment(modifier);
      if (adjustment === null) continue;

      // price_adjustment on Modifier is integer cents by the time it reaches
      // this layer — normalizeGroups() converts DB dollar float → cents via
      // Math.trunc(Math.round(dollars * 100)) before storing on the domain type.
      // We assert it is an integer here. If it is not, the normalization layer
      // has a bug that must surface immediately rather than be silently corrected.
      if (!Number.isInteger(adjustment)) {
        throw new Error(
          `buildModifierLookup: modifier(id=${modifierId}, group=${groupId}) ` +
          `price_adjustment is not an integer: ${adjustment}. ` +
          `Expected integer cents. Check the normalization boundary (normalizeGroups).`,
        );
      }

      lookup.set(`${groupId}:${modifierId}`, {
        name:     sanitizeLabel(modifier.name, modifierId),
        groupId,
        adjCents: clampInt(adjustment, -50_000_000, 50_000_000),
      });
    }
  }

  return lookup;
}

/**
 * Validates the modifier array before it enters pricing math.
 * Throws on:
 *   - duplicate modifier ids within the same group
 *   - non-finite priceAdjustmentCents
 *   - missing id or groupId
 * This is the single gate before calculate(). If it passes, pricing is safe.
 */
function validateModifiersForPricing(mods: CartItemModifierCompat[]): void {
  const seen = new Set<string>();

  for (const mod of mods) {
    if (!mod.id || typeof mod.id !== 'string') {
      throw new Error(`PricingEngine.validate: modifier has missing or invalid id`);
    }
    if (!mod.groupId || typeof mod.groupId !== 'string') {
      throw new Error(`PricingEngine.validate: modifier(id=${mod.id}) has missing groupId`);
    }
    if (typeof mod.priceAdjustmentCents !== 'number' || !Number.isFinite(mod.priceAdjustmentCents)) {
      throw new Error(
        `PricingEngine.validate: modifier(id=${mod.id}) has invalid priceAdjustmentCents: ` +
        String(mod.priceAdjustmentCents),
      );
    }

    const dedupeKey = `${mod.groupId}:${mod.id}`;
    if (seen.has(dedupeKey)) {
      throw new Error(
        `PricingEngine.validate: duplicate modifier(id=${mod.id}) in group(id=${mod.groupId})`,
      );
    }
    seen.add(dedupeKey);
  }
}

// ---------------------------------------------------------------------------
// PricingEngine
// ---------------------------------------------------------------------------

export class PricingEngine {
  static formatPrice(cents: number): string {
    const safeCents = clampInt(toCentsInt(cents, 0), -50_000_000, 50_000_000);

    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeCents / 100);
  }

  static formatDollars(dollars: number): string {
    return PricingEngine.formatPrice(normalizeMoney(dollars, 'dollars'));
  }

  static formatCents(cents: number): string {
    return PricingEngine.formatPrice(cents);
  }

  // =========================================================================
  // Stock helpers
  // =========================================================================

  static getStockCount(item: unknown): number | null {
    if (!isRecord(item)) return null;

    const raw =
      item.inventory_count ??
      item.inventoryCount ??
      item.stock_count ??
      item.stockCount ??
      item.stock_qty ??
      item.stockQty ??
      item.stock ??
      item.inventory ??
      null;

    const parsed =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) return null;

    return Math.trunc(parsed);
  }

  static getLowStockThreshold(item: unknown): number {
    if (!isRecord(item)) return 5;

    const raw = item.low_stock_threshold ?? item.lowStockThreshold ?? null;
    const parsed =
      typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
    if (!Number.isFinite(parsed)) return 5;

    return Math.max(1, Math.trunc(parsed));
  }

  static getStockStatus(item: unknown): StockStatus {
    if (!isRecord(item)) return 'unknown';

    const available = asBool(item.available, true);
    if (!available) return 'out_of_stock';

    const count = PricingEngine.getStockCount(item);
    if (count === null) return 'unknown';
    if (count <= 0) return 'out_of_stock';
    if (count <= PricingEngine.getLowStockThreshold(item)) return 'low_stock';

    return 'in_stock';
  }

  static isOutOfStock(item: unknown): boolean {
    return PricingEngine.getStockStatus(item) === 'out_of_stock';
  }

  static isLowStock(item: unknown): boolean {
    return PricingEngine.getStockStatus(item) === 'low_stock';
  }

  static getStockMessage(item: unknown): string | null {
    const status = PricingEngine.getStockStatus(item);
    if (status === 'out_of_stock') return 'Out of stock';
    if (status === 'low_stock') return 'Low stock';
    return null;
  }

  /**
   * Build compat modifiers array from a MenuItem-like object + SelectedByGroup.
   * Client-display math only. Server re-prices from DB on every order.
   */
  static buildCartModifiers(item: unknown, selected: unknown): CartItemModifierCompat[] {
    const out: CartItemModifierCompat[] = [];
    const groups = getModifierGroups(item);
    const selectedEntries = getSelectedByGroup(selected);

    if (selectedEntries.length === 0) return out;

    const lookup = buildModifierLookup(groups);

    for (const [groupId, selectedMods] of selectedEntries) {
      for (const raw of selectedMods) {
        const id = sanitizeIdentifier(raw.id);
        if (!id) continue;

        const name = sanitizeLabel(raw.name, id);
        const hit = lookup.get(`${groupId}:${id}`);
        const adjustmentRaw = getModifierAdjustment(raw);
        // adjustmentRaw is null when price_adjustment is absent or non-finite.
        // Hit path:  use the lookup value, already validated as integer cents.
        // Miss path: the selected modifier must carry price_adjustment in integer
        //            cents itself. We assert it is an integer — no unit inference,
        //            no conversion. If the value is a dollar float (e.g. 0.5), the
        //            normalization boundary (normalizeGroups / gateway) has failed
        //            to convert it and must be fixed there, not here.
        const priceAdjustmentCents = hit
          ? hit.adjCents
          : (() => {
              if (adjustmentRaw === null) {
                throw new Error(
                  `PricingEngine.buildCartModifiers: modifier(id=${id}, group=${groupId}) ` +
                  `has no lookup entry and no valid price_adjustment on the selection. ` +
                  `Cannot price this modifier without an explicit integer cents value.`,
                );
              }
              if (!Number.isInteger(adjustmentRaw)) {
                throw new Error(
                  `PricingEngine.buildCartModifiers: modifier(id=${id}, group=${groupId}) ` +
                  `price_adjustment is not an integer cents value: ${adjustmentRaw}. ` +
                  `Normalize to integer cents at the data boundary before calling buildCartModifiers.`,
                );
              }
              return clampInt(adjustmentRaw, -50_000_000, 50_000_000);
            })();

        out.push({
          id,
          groupId,
          name: hit?.name || name,
          priceAdjustmentCents,
          modifier_group_id: groupId,
          group_id: groupId,
        });
      }
    }

    return out;
  }

  /**
   * Core pricing math — CLIENT DISPLAY ONLY.
   * The server always re-prices from the DB; this is for UI feedback only.
   *
   * Throws before computing if any modifier is invalid (missing id/groupId,
   * non-finite priceAdjustmentCents, or duplicate within the same group).
   * This ensures subtotal is always deterministic or fails loudly.
   */
  static calculate(
    itemId: string,
    basePriceCents: number,
    modifiers: CartItemModifierCompat[],
    quantity: number,
  ): { subtotal: number; pricing_hash: string } {
    // Validate first — throws on any invalid modifier state
    validateModifiersForPricing(modifiers);

    const safeItemId = sanitizeIdentifier(itemId);
    if (!safeItemId) {
      throw new Error('PricingEngine.calculate: itemId is missing or empty');
    }

    if (typeof basePriceCents !== 'number' || !Number.isFinite(basePriceCents) || basePriceCents < 0) {
      throw new Error(
        `PricingEngine.calculate: basePriceCents is invalid: ${String(basePriceCents)}`,
      );
    }

    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 1) {
      throw new Error(
        `PricingEngine.calculate: quantity is invalid: ${String(quantity)}`,
      );
    }

    const safeQty  = clampInt(quantity, 1, 99);
    const safeBase = clampInt(toCentsInt(basePriceCents, 0), 0, 50_000_000);

    // modifiers are already validated above — priceAdjustmentCents is finite
    const modSum = clampInt(
      modifiers.reduce((sum, modifier) => {
        return sum + clampInt(modifier.priceAdjustmentCents, -50_000_000, 50_000_000);
      }, 0),
      -50_000_000,
      50_000_000,
    );

    const unit     = clampInt(safeBase + modSum, 0, 50_000_000);
    const subtotal = clampInt(unit * safeQty, 0, 2_000_000_000);

    const payload      = `${safeItemId}|${safeBase}|${safeQty}|${canonicalizeModifiers(modifiers)}`;
    const pricing_hash = fnv1a32(payload);

    return { subtotal, pricing_hash };
  }
}