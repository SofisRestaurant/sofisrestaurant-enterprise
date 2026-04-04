
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
  price_adjustment?: number | null;
  priceAdjustment?: number | null;
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

function getModifierAdjustment(value: ModifierLike | SelectedModLike): number {
  if ('price_adjustment' in value && typeof value.price_adjustment === 'number') {
    return value.price_adjustment;
  }
  if ('priceAdjustment' in value && typeof value.priceAdjustment === 'number') {
    return value.priceAdjustment;
  }
  return 0;
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


function guessMoneyUnit(value: number): MoneyUnit {
  if (Math.abs(value % 1) > 0) return 'dollars';
  if (Math.abs(value) > 0 && Math.abs(value) < 50) return 'dollars';
  return 'cents';
}


export function normalizeMoney(value: unknown, unit?: MoneyUnit): number {
  const raw = asNumber(value, 0);
  const resolvedUnit = unit ?? guessMoneyUnit(raw);

  if (resolvedUnit === 'dollars') {
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

      lookup.set(`${groupId}:${modifierId}`, {
        name: sanitizeLabel(modifier.name, modifierId),
        groupId,
        adjCents: clampInt(
          normalizeMoney(adjustment, guessMoneyUnit(adjustment)),
          -50_000_000,
          50_000_000,
        ),
      });
    }
  }

  return lookup;
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

        const priceAdjustmentCents = hit
          ? hit.adjCents
          : clampInt(
              normalizeMoney(adjustmentRaw, guessMoneyUnit(adjustmentRaw)),
              -50_000_000,
              50_000_000,
            );

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
   */
  static calculate(
    itemId: string,
    basePriceCents: number,
    modifiers: CartItemModifierCompat[],
    quantity: number,
  ): { subtotal: number; pricing_hash: string } {
    const safeItemId = sanitizeIdentifier(itemId);
    const safeQty = clampInt(asNumber(quantity, 1), 1, 99);
    const safeBase = clampInt(toCentsInt(basePriceCents, 0), 0, 50_000_000);

    const modSum = clampInt(
      modifiers.reduce((sum, modifier) => {
        const safeAdj = clampInt(
          toCentsInt(modifier.priceAdjustmentCents, 0),
          -50_000_000,
          50_000_000,
        );
        return sum + safeAdj;
      }, 0),
      -50_000_000,
      50_000_000,
    );

    const unit = clampInt(safeBase + modSum, 0, 50_000_000);
    const subtotal = clampInt(unit * safeQty, 0, 2_000_000_000);

    const payload = `${safeItemId}|${safeBase}|${safeQty}|${canonicalizeModifiers(modifiers)}`;
    const pricing_hash = fnv1a32(payload);

    return { subtotal, pricing_hash };
  }
}