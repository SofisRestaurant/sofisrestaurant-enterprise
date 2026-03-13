import type { Json } from './database.types.ts';

export type StoredOrderCartItemModifier = {
  id: string;
  groupId: string | null;
  name: string;
  priceAdjustmentCents: number;
};

export type StoredOrderCartItem = {
  menuItemId: string;
  name: string;
  quantity: number;
  notes: string | null;
  modifiers: StoredOrderCartItemModifier[];
  unitPriceCents: number;
  lineTotalCents: number;
  category: string | null;
  imageUrl: string | null;
  pricingHash: string | null;
};

export type StoredOrderCartItems = StoredOrderCartItem[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.trunc(value);
}

export function isStoredOrderCartItemModifier(value: unknown): value is StoredOrderCartItemModifier {
  if (!isRecord(value)) {
    return false;
  }

  const id = asString(value.id);
  const name = asString(value.name);
  const priceAdjustmentCents = asInteger(value.priceAdjustmentCents);

  return id !== null && name !== null && priceAdjustmentCents !== null;
}

export function isStoredOrderCartItem(value: unknown): value is StoredOrderCartItem {
  if (!isRecord(value)) {
    return false;
  }

  const menuItemId = asString(value.menuItemId);
  const name = asString(value.name);
  const quantity = asInteger(value.quantity);
  const unitPriceCents = asInteger(value.unitPriceCents);
  const lineTotalCents = asInteger(value.lineTotalCents);

  if (
    menuItemId === null ||
    name === null ||
    quantity === null ||
    quantity < 1 ||
    unitPriceCents === null ||
    unitPriceCents < 0 ||
    lineTotalCents === null ||
    lineTotalCents < 0 ||
    !Array.isArray(value.modifiers)
  ) {
    return false;
  }

  return value.modifiers.every(isStoredOrderCartItemModifier);
}

export function isStoredOrderCartItems(value: unknown): value is StoredOrderCartItems {
  return Array.isArray(value) && value.every(isStoredOrderCartItem);
}

export function toStoredOrderCartItemsJson(items: StoredOrderCartItems): Json {
  return items as Json;
}