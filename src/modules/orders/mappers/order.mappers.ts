import type { Json } from '@/types/supabase';
import type {
  KitchenOrder,
  Order,
  OrderCartItem,
  OrderCartItemModifier,
  OrderCartItemModifierSelection,
  OrderStatus,
  OrderType,
  PaymentStatus,
  ShippingAddress,
} from '@/domain/orders/order.types';
import type { UserId, GuestToken, CustomerIdentity } from '@/domain/orders/order.types';
import { isOrderStatus, isOrderType, isPaymentStatus } from '@/domain/orders/order.types';

import type { OrderEvent, OrderEventData, OrderInsert, OrderRow, OrderUpdate } from '../types';

// ─── Identity boundary helpers ────────────────────────────────────────────────
// Domain types are strict (no nulls). DB layer is nullable.
// These helpers normalize at the mapper boundary so nulls never leak into
// domain objects. After this file, every CustomerIdentity is guaranteed valid.

function toSafeUserId(value: unknown): UserId {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value as UserId;
  }
  return '' as UserId;
}

function toSafeGuestToken(value: unknown): GuestToken {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value as GuestToken;
  }
  return '' as GuestToken;
}

function buildIdentity(
  customerUid: string | null | undefined,
  guestTokenRaw: unknown,
): CustomerIdentity {
  if (customerUid) {
    return {
      source: 'auth' as const,
      userId: toSafeUserId(customerUid),
      guestToken: null,
    };
  }
  return {
    source: 'guest' as const,
    userId: null,
    guestToken: toSafeGuestToken(guestTokenRaw),
  };
}

const CART_ITEM_NAME_KEYS = [
  'name',
  'title',
  'item_name',
  'itemName',
  'menu_item_name',
  'menuItemName',
] as const;
const CART_ITEM_QUANTITY_KEYS = ['quantity', 'qty'] as const;
const CART_ITEM_PRICE_KEYS = [
  'price',
  'price_cents',
  'unit_price',
  'unitPrice',
  'base_price',
  'basePrice',
] as const;
const CART_ITEM_NOTES_KEYS = [
  'notes',
  'note',
  'special_instructions',
  'specialInstructions',
  'instructions',
] as const;
const CART_ITEM_ID_KEYS = ['id', 'menu_item_id', 'menuItemId'] as const;
const CART_ITEM_MENU_ITEM_ID_KEYS = ['menu_item_id', 'menuItemId', 'item_id', 'itemId'] as const;
const CART_ITEM_MODIFIERS_KEYS = ['modifiers', 'options', 'selected_modifiers'] as const;
const CART_ITEM_SPECIAL_INSTRUCTIONS_KEYS = [
  'special_instructions',
  'specialInstructions',
  'instructions',
] as const;
const CART_ITEM_KITCHEN_NOTES_KEYS = ['kitchen_notes', 'kitchenNotes'] as const;
const CART_ITEM_ALLERGEN_KEYS = ['allergens', 'allergen_flags', 'allergenFlags'] as const;
const CART_ITEM_BASE_PRICE_KEYS = ['base_price', 'basePrice'] as const;
const CART_ITEM_UNIT_PRICE_KEYS = ['unit_price', 'unitPrice'] as const;

const CART_ITEM_MODIFIER_NAME_KEYS = ['name', 'label', 'title'] as const;
const CART_ITEM_MODIFIER_GROUP_KEYS = ['groupName', 'group_name', 'group'] as const;
const CART_ITEM_MODIFIER_ID_KEYS = ['id', 'modifier_id', 'modifierId'] as const;
const CART_ITEM_MODIFIER_GROUP_ID_KEYS = [
  'modifier_group_id',
  'modifierGroupId',
  'group_id',
  'groupId',
] as const;
const CART_ITEM_MODIFIER_PRICE_KEYS = [
  'priceAdjustmentCents',
  'price_adjustment_cents',
  'price_adjustment',
] as const;
const CART_ITEM_MODIFIER_QUANTITY_KEYS = ['quantity', 'qty'] as const;
const CART_ITEM_MODIFIER_SELECTIONS_KEYS = [
  'selections',
  'selected',
  'items',
  'values',
  'choices',
] as const;

const SHIPPING_LINE1_KEYS = ['line1', 'address1', 'street'] as const;
const SHIPPING_CITY_KEYS = ['city'] as const;
const SHIPPING_STATE_KEYS = ['state', 'province'] as const;
const SHIPPING_POSTAL_KEYS = ['postal_code', 'postalCode', 'zip'] as const;
const SHIPPING_COUNTRY_KEYS = ['country'] as const;
const SHIPPING_LINE2_KEYS = ['line2', 'address2', 'unit'] as const;
const SHIPPING_NAME_KEYS = ['name'] as const;
const SHIPPING_PHONE_KEYS = ['phone'] as const;

const ORDER_ID_KEYS = ['id'] as const;
const ORDER_STRIPE_SESSION_ID_KEYS = ['stripe_session_id', 'stripeSessionId'] as const;
const ORDER_STRIPE_PAYMENT_INTENT_ID_KEYS = [
  'stripe_payment_intent_id',
  'stripePaymentIntentId',
] as const;
const ORDER_CREATED_AT_KEYS = ['created_at', 'createdAt'] as const;
const ORDER_UPDATED_AT_KEYS = ['updated_at', 'updatedAt'] as const;
const ORDER_CUSTOMER_UID_KEYS = ['customer_uid', 'customerUid'] as const;
const ORDER_CUSTOMER_EMAIL_KEYS = ['customer_email', 'customerEmail'] as const;
const ORDER_CUSTOMER_NAME_KEYS = ['customer_name', 'customerName'] as const;
const ORDER_CUSTOMER_PHONE_KEYS = ['customer_phone', 'customerPhone'] as const;
const ORDER_AMOUNT_SUBTOTAL_KEYS = ['amount_subtotal', 'amountSubtotal'] as const;
const ORDER_AMOUNT_TAX_KEYS = ['amount_tax', 'amountTax'] as const;
const ORDER_AMOUNT_SHIPPING_KEYS = ['amount_shipping', 'amountShipping'] as const;
const ORDER_AMOUNT_TOTAL_KEYS = ['amount_total', 'amountTotal'] as const;
const ORDER_ASSIGNED_TO_KEYS = ['assigned_to', 'assignedTo'] as const;
const ORDER_CURRENCY_KEYS = ['currency'] as const;
const ORDER_TYPE_KEYS = ['order_type', 'orderType'] as const;
const ORDER_PAYMENT_STATUS_KEYS = ['payment_status', 'paymentStatus'] as const;
const ORDER_STATUS_KEYS = ['status'] as const;
const ORDER_NUMBER_KEYS = ['order_number', 'orderNumber'] as const;
const ORDER_CART_ITEMS_KEYS = ['cart_items', 'cartItems'] as const;
const ORDER_ESTIMATED_READY_TIME_KEYS = ['estimated_ready_time', 'estimatedReadyTime'] as const;
const ORDER_SHIPPING_NAME_KEYS = ['shipping_name', 'shippingName'] as const;
const ORDER_SHIPPING_PHONE_KEYS = ['shipping_phone', 'shippingPhone'] as const;
const ORDER_SHIPPING_CITY_KEYS = ['shipping_city', 'shippingCity'] as const;
const ORDER_SHIPPING_STATE_KEYS = ['shipping_state', 'shippingState'] as const;
const ORDER_SHIPPING_ZIP_KEYS = ['shipping_zip', 'shippingZip'] as const;
const ORDER_SHIPPING_COUNTRY_KEYS = ['shipping_country', 'shippingCountry'] as const;
const ORDER_NOTES_KEYS = ['notes'] as const;
const ORDER_FULFILLMENT_TYPE_KEYS = ['fulfillment_type', 'fulfillmentType'] as const;
const ORDER_PICKUP_TIME_KEYS = ['pickup_time', 'pickupTime'] as const;

const ORDER_EVENT_ID_KEYS = ['id'] as const;
const ORDER_EVENT_ORDER_ID_KEYS = ['order_id', 'orderId'] as const;
const ORDER_EVENT_TYPE_KEYS = ['event_type', 'eventType'] as const;
const ORDER_EVENT_CREATED_AT_KEYS = ['created_at', 'createdAt'] as const;
const ORDER_EVENT_USER_ID_KEYS = ['user_id', 'userId', 'actor_uid', 'actorUid'] as const;
const ORDER_EVENT_DATA_KEYS = ['event_data', 'eventData', 'metadata'] as const;

type UnknownRecord = Record<string, unknown>;
type JsonRecord = Record<string, Json | undefined>;

type PricingSnapshotModifier = {
  id?: string;
  name?: string;
  groupId?: string;
  groupName?: string;
  priceAdjustmentCents?: number;
};

type PricingSnapshotLine = {
  lineId?: string;
  menuItemId?: string;
  name?: string;
  notes?: string | null;
  quantity?: number;
  modifiers: PricingSnapshotModifier[];
};

type PricingSnapshot = {
  lines: PricingSnapshotLine[];
};

type OrderCartItemWithKitchenFields = OrderCartItem & {
  kitchen_notes?: string | null;
  allergens?: string[];
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(record: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return null;
}

function readNumber(record: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const normalized = value.trim();
      if (normalized.length === 0) {
        continue;
      }

      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readUnknownArray(record: UnknownRecord, keys: readonly string[]): unknown[] | null {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) {
        result.push(item);
      }
      return result;
    }
  }

  return null;
}

function readUnknown(record: UnknownRecord, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key];
    }
  }

  return undefined;
}

function readStringArray(record: UnknownRecord, keys: readonly string[]): string[] {
  const value = readUnknown(record, keys);
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        result.push(trimmed);
      }
    }
  }

  return result;
}

function normalizeMoneyValue(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value);
}

function buildDefaultOrderStatus(): OrderStatus {
  const candidates = [
    'confirmed',
    'preparing',
    'ready',
    'shipped',
    'delivered',
    'cancelled',
  ] as const;

  for (const candidate of candidates) {
    if (isOrderStatus(candidate)) {
      return candidate;
    }
  }

  throw new Error('[order.mappers] Unable to resolve default OrderStatus.');
}

function buildDefaultOrderType(): OrderType {
  const candidates = ['food', 'merch'] as const;

  for (const candidate of candidates) {
    if (isOrderType(candidate)) {
      return candidate;
    }
  }

  throw new Error('[order.mappers] Unable to resolve default OrderType.');
}

function buildDefaultPaymentStatus(): PaymentStatus {
  const candidates = ['paid', 'failed', 'refunded'] as const;

  for (const candidate of candidates) {
    if (isPaymentStatus(candidate)) {
      return candidate;
    }
  }

  throw new Error('[order.mappers] Unable to resolve default PaymentStatus.');
}

const DEFAULT_ORDER_STATUS = buildDefaultOrderStatus();
const DEFAULT_ORDER_TYPE = buildDefaultOrderType();
const DEFAULT_PAYMENT_STATUS = buildDefaultPaymentStatus();

function normalizeOrderStatus(value: string): OrderStatus {
  return isOrderStatus(value) ? value : DEFAULT_ORDER_STATUS;
}

function normalizePaymentStatus(value: string): PaymentStatus {
  return isPaymentStatus(value) ? value : DEFAULT_PAYMENT_STATUS;
}

function normalizeOrderType(value: string): OrderType {
  return isOrderType(value) ? value : DEFAULT_ORDER_TYPE;
}

function toJsonValue(value: unknown): Json {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item): Json => toJsonValue(item));
  }

  if (isRecord(value)) {
    const result: JsonRecord = {};

    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonValue(entry);
    }

    return result;
  }

  return null;
}

function toOrderEventData(value: unknown): OrderEventData | null {
  if (!isRecord(value)) {
    return null;
  }

  const result: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    result[key] = toJsonValue(entry);
  }

  return result;
}

function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

function parsePricingSnapshotModifier(value: unknown): PricingSnapshotModifier | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    id: nullToUndefined(readText(value, ['id'])),
    name: nullToUndefined(readText(value, ['name', 'label', 'title'])),
    groupId: nullToUndefined(readText(value, ['groupId', 'group_id'])),
    groupName: nullToUndefined(readText(value, ['groupName', 'group_name', 'group'])),
    priceAdjustmentCents: normalizeMoneyValue(
      readNumber(value, ['priceAdjustmentCents', 'price_adjustment_cents']) ?? 0,
    ),
  };
}

function parsePricingSnapshotLine(value: unknown): PricingSnapshotLine | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawModifiers = readUnknownArray(value, ['modifiers']) ?? [];
  const modifiers: PricingSnapshotModifier[] = [];

  for (const rawModifier of rawModifiers) {
    const parsed = parsePricingSnapshotModifier(rawModifier);
    if (parsed !== null) {
      modifiers.push(parsed);
    }
  }

  return {
    lineId: nullToUndefined(readText(value, ['lineId', 'line_id'])),
    menuItemId: nullToUndefined(readText(value, ['menuItemId', 'menu_item_id'])),
    name: nullToUndefined(readText(value, ['name', 'title'])),
    notes: readText(value, ['notes', 'note', 'special_instructions', 'specialInstructions']),
    quantity: Math.max(1, Math.floor(readNumber(value, ['quantity', 'qty']) ?? 1)),
    modifiers,
  };
}

function parsePricingSnapshot(metadata: Json | null | undefined): PricingSnapshot {
  if (!isRecord(metadata)) {
    return { lines: [] };
  }

  const pricingSnapshot = readUnknown(metadata, ['pricing_snapshot']);
  if (!isRecord(pricingSnapshot)) {
    return { lines: [] };
  }

  const rawLines = readUnknownArray(pricingSnapshot, ['lines']) ?? [];
  const lines: PricingSnapshotLine[] = [];

  for (const rawLine of rawLines) {
    const parsed = parsePricingSnapshotLine(rawLine);
    if (parsed !== null) {
      lines.push(parsed);
    }
  }

  return { lines };
}

function getPricingSnapshotLineForCartItem(
  rawItem: UnknownRecord,
  index: number,
  snapshot: PricingSnapshot,
): PricingSnapshotLine | null {
  const menuItemId = readText(rawItem, CART_ITEM_MENU_ITEM_ID_KEYS);
  const itemId = readText(rawItem, CART_ITEM_ID_KEYS);

  for (const line of snapshot.lines) {
    if (menuItemId !== null && line.menuItemId === menuItemId) {
      return line;
    }

    if (itemId !== null && line.menuItemId === itemId) {
      return line;
    }

    if (itemId !== null && line.lineId !== undefined && line.lineId.startsWith(`${itemId}:`)) {
      return line;
    }
  }

  return snapshot.lines[index] ?? null;
}

function mapUnknownCartItemModifierSelection(
  value: unknown,
): OrderCartItemModifierSelection | null {
  if (!isRecord(value)) {
    return null;
  }

  const id =
    readText(value, CART_ITEM_MODIFIER_ID_KEYS) ??
    readText(value, CART_ITEM_MODIFIER_NAME_KEYS);
  const name = readText(value, CART_ITEM_MODIFIER_NAME_KEYS);

  if (id === null || name === null) {
    return null;
  }

  return {
    id,
    name,
    price_adjustment: normalizeMoneyValue(readNumber(value, CART_ITEM_MODIFIER_PRICE_KEYS) ?? 0),
  };
}

function expandSelectionsByQuantity(
  selection: OrderCartItemModifierSelection,
  quantity: number,
): OrderCartItemModifierSelection[] {
  if (quantity <= 1) {
    return [selection];
  }

  return Array.from({ length: quantity }, (): OrderCartItemModifierSelection => ({
    id: selection.id,
    name: selection.name,
    price_adjustment: selection.price_adjustment,
  }));
}

function mapUnknownCartItemModifier(
  rawModifier: UnknownRecord,
): OrderCartItemModifier | null {
  const modifierId = readText(rawModifier, CART_ITEM_MODIFIER_ID_KEYS) ?? undefined;
  const modifierGroupId = readText(rawModifier, CART_ITEM_MODIFIER_GROUP_ID_KEYS) ?? '';
  const groupName = readText(rawModifier, CART_ITEM_MODIFIER_GROUP_KEYS);
  const name = readText(rawModifier, CART_ITEM_MODIFIER_NAME_KEYS);
  const priceAdjustment = normalizeMoneyValue(
    readNumber(rawModifier, CART_ITEM_MODIFIER_PRICE_KEYS) ?? 0,
  );
  const quantity = Math.max(
    1,
    Math.floor(readNumber(rawModifier, CART_ITEM_MODIFIER_QUANTITY_KEYS) ?? 1),
  );

  const rawSelections = readUnknownArray(rawModifier, CART_ITEM_MODIFIER_SELECTIONS_KEYS);
  const selections: OrderCartItemModifierSelection[] = [];

  if (rawSelections !== null) {
    for (const rawSelection of rawSelections) {
      const parsedSelection = mapUnknownCartItemModifierSelection(rawSelection);
      if (parsedSelection !== null) {
        selections.push(parsedSelection);
      }
    }
  }

  if (selections.length === 0 && name !== null) {
    const fallbackSelection: OrderCartItemModifierSelection = {
      id: modifierId ?? name,
      name,
      price_adjustment: priceAdjustment,
    };

    selections.push(...expandSelectionsByQuantity(fallbackSelection, quantity));
  }

  if (selections.length === 0) {
    return null;
  }

  return {
    id:               modifierId ?? '',
    group_id:         modifierGroupId,
    group_name:       groupName,
    name:             name ?? groupName ?? selections[0]?.name ?? null,
    price_adjustment: priceAdjustment,
    selections,
  };
}

function mapSnapshotModifierToOrderCartItemModifier(
  modifier: PricingSnapshotModifier,
): OrderCartItemModifier | null {
  const modifierName = modifier.name?.trim() ?? '';
  if (modifierName.length === 0) {
    return null;
  }

  const selection: OrderCartItemModifierSelection = {
    id: modifier.id ?? modifierName,
    name: modifierName,
    price_adjustment: normalizeMoneyValue(modifier.priceAdjustmentCents),
  };

  return {
    id:               modifier.id ?? '',
    group_id:         modifier.groupId ?? '',
    group_name:       modifier.groupName ?? null,
    name:             modifierName,
    price_adjustment: selection.price_adjustment,
    selections:       [selection],
  };
}

function mapUnknownCartItemModifiers(
  value: unknown,
  fallbackLine?: PricingSnapshotLine | null,
): OrderCartItemModifier[] {
  if (Array.isArray(value)) {
    const modifiers: OrderCartItemModifier[] = [];

    for (const rawModifier of value) {
      if (!isRecord(rawModifier)) {
        continue;
      }

      const parsedModifier = mapUnknownCartItemModifier(rawModifier);
      if (parsedModifier !== null) {
        modifiers.push(parsedModifier);
      }
    }

    if (modifiers.length > 0) {
      return modifiers;
    }
  }

  if (fallbackLine === null || fallbackLine === undefined) {
    return [];
  }

  const mappedFallbackModifiers: OrderCartItemModifier[] = [];

  for (const modifier of fallbackLine.modifiers) {
    const parsed = mapSnapshotModifierToOrderCartItemModifier(modifier);
    if (parsed !== null) {
      mappedFallbackModifiers.push(parsed);
    }
  }

  return mappedFallbackModifiers;
}

function cartItemsToJson(items: readonly OrderCartItem[] | OrderCartItem[] | null | undefined): Json {
  if (!Array.isArray(items)) {
    return null;
  }

  return items.map((item): Json => {
    const itemWithKitchenFields = item as OrderCartItemWithKitchenFields;

    return {
      id: item.id ?? null,
      menu_item_id: item.menu_item_id ?? null,
      name: item.name,
      quantity: item.quantity,
      unit_price_cents: item.unit_price_cents,
      price: item.price ?? item.unit_price_cents ?? null,
      base_price: item.base_price ?? null,
      unit_price: item.unit_price ?? null,
      notes: item.notes ?? null,
      special_instructions: item.special_instructions ?? null,
      kitchen_notes: itemWithKitchenFields.kitchen_notes ?? null,
      allergens: Array.isArray(itemWithKitchenFields.allergens)
        ? itemWithKitchenFields.allergens
        : [],
      modifiers: Array.isArray(item.modifiers)
        ? item.modifiers.map((modifier) => ({
            id: modifier.id ?? null,
            group_id: modifier.group_id ?? null,
            group_name: modifier.group_name ?? null,
            name: modifier.name ?? null,
            price_adjustment: modifier.price_adjustment ?? null,
            selections: modifier.selections.map((selection: OrderCartItemModifierSelection) => ({
              id: selection.id,
              name: selection.name,
              price_adjustment: selection.price_adjustment,
            })),
          }))
        : [],
    };
  });
}

function shippingAddressToJson(address: ShippingAddress | null | undefined): Json {
  if (address == null) {
    return null;
  }

  return {
    name: address.name ?? null,
    line1: address.line1,
    line2: address.line2 ?? null,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
    country: address.country,
    phone: address.phone ?? null,
  };
}

function getRowRecord(row: OrderRow): UnknownRecord {
  return isRecord(row) ? row : {};
}

function deriveShippingNameFromAddress(address: ShippingAddress | null): string | null {
  return address?.name ?? null;
}

function deriveShippingPhoneFromAddress(address: ShippingAddress | null): string | null {
  return address?.phone ?? null;
}

function deriveShippingCity(
  address: ShippingAddress | null,
  rowRecord: UnknownRecord,
): string | null {
  return address?.city ?? readText(rowRecord, ORDER_SHIPPING_CITY_KEYS);
}

function deriveShippingState(
  address: ShippingAddress | null,
  rowRecord: UnknownRecord,
): string | null {
  return address?.state ?? readText(rowRecord, ORDER_SHIPPING_STATE_KEYS);
}

function deriveShippingZip(
  address: ShippingAddress | null,
  rowRecord: UnknownRecord,
): string | null {
  return address?.postal_code ?? readText(rowRecord, ORDER_SHIPPING_ZIP_KEYS);
}

function deriveShippingCountry(
  address: ShippingAddress | null,
  rowRecord: UnknownRecord,
): string | null {
  return address?.country ?? readText(rowRecord, ORDER_SHIPPING_COUNTRY_KEYS);
}

export function mapUnknownCartItems(
  value: unknown,
  metadata?: Json | null,
): OrderCartItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const snapshot = parsePricingSnapshot(metadata);
  const items: OrderCartItem[] = [];

  for (const [index, rawItem] of value.entries()) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const snapshotLine = getPricingSnapshotLineForCartItem(rawItem, index, snapshot);

    const name =
      readText(rawItem, CART_ITEM_NAME_KEYS) ??
      (snapshotLine?.name?.trim().length ? snapshotLine.name : null) ??
      'Item';

    const quantity = Math.max(
      1,
      Math.floor(
        readNumber(rawItem, CART_ITEM_QUANTITY_KEYS) ??
          snapshotLine?.quantity ??
          1,
      ),
    );

    const price = normalizeMoneyValue(readNumber(rawItem, CART_ITEM_PRICE_KEYS) ?? 0);
    const notes =
      readText(rawItem, CART_ITEM_NOTES_KEYS) ??
      (snapshotLine?.notes?.trim().length ? snapshotLine.notes : null);

    const id = readText(rawItem, CART_ITEM_ID_KEYS) ?? null;
    const menuItemId = readText(rawItem, CART_ITEM_MENU_ITEM_ID_KEYS) ?? snapshotLine?.menuItemId ?? 'unknown';
    const basePrice = normalizeMoneyValue(readNumber(rawItem, CART_ITEM_BASE_PRICE_KEYS) ?? 0);
    const unitPrice = normalizeMoneyValue(
      readNumber(rawItem, CART_ITEM_UNIT_PRICE_KEYS) ?? price,
    );

    const modifiers = mapUnknownCartItemModifiers(
      readUnknown(rawItem, CART_ITEM_MODIFIERS_KEYS),
      snapshotLine,
    );

    const specialInstructions = readText(rawItem, CART_ITEM_SPECIAL_INSTRUCTIONS_KEYS);
    const kitchenNotes = readText(rawItem, CART_ITEM_KITCHEN_NOTES_KEYS);
    const allergens = readStringArray(rawItem, CART_ITEM_ALLERGEN_KEYS);

    const item: OrderCartItemWithKitchenFields = {
      id,
      menu_item_id:         menuItemId,
      name,
      quantity,
      unit_price_cents:     unitPrice > 0 ? unitPrice : price,
      price,
      base_price:           basePrice > 0 ? basePrice : undefined,
      unit_price:           unitPrice > 0 ? unitPrice : undefined,
      notes,
      special_instructions: specialInstructions,
      modifiers,
      kitchen_notes:        kitchenNotes,
      allergens,
    };

    items.push(item);
  }

  return items;
}

export function mapUnknownShippingAddress(value: unknown): ShippingAddress | null {
  if (!isRecord(value)) {
    return null;
  }

  const line1 = readText(value, SHIPPING_LINE1_KEYS);
  const city = readText(value, SHIPPING_CITY_KEYS);
  const state = readText(value, SHIPPING_STATE_KEYS);
  const postalCode = readText(value, SHIPPING_POSTAL_KEYS);
  const country = readText(value, SHIPPING_COUNTRY_KEYS);

  if (
    line1 === null ||
    city === null ||
    state === null ||
    postalCode === null ||
    country === null
  ) {
    return null;
  }

  const line2 = readText(value, SHIPPING_LINE2_KEYS) ?? undefined;
  const name = readText(value, SHIPPING_NAME_KEYS) ?? undefined;
  const phone = readText(value, SHIPPING_PHONE_KEYS) ?? undefined;

  return {
    name,
    line1,
    line2,
    city,
    state,
    postal_code: postalCode,
    country,
    phone,
  };
}

// ─── Stub pricing block for rows that don't carry full pricing data ────────────
function buildStubPricing(row: OrderRow): Order['pricing'] {
  return {
    subtotal_cents:     (row.amount_subtotal   ?? 0) as import('@/domain/orders/order.types').Cents,
    tax_cents:          (row.amount_tax        ?? 0) as import('@/domain/orders/order.types').Cents,
    tip_cents:          0                            as import('@/domain/orders/order.types').Cents,
    discount_cents:     0                            as import('@/domain/orders/order.types').Cents,
    delivery_fee_cents: (row.amount_shipping   ?? 0) as import('@/domain/orders/order.types').Cents,
    service_fee_cents:  0                            as import('@/domain/orders/order.types').Cents,
    total_cents:        (row.amount_total      ?? 0) as import('@/domain/orders/order.types').Cents,
    currency:           (row as unknown as { currency?: string }).currency ?? 'USD',
  };
}

export function mapOrderRowToDomain(row: OrderRow): Order {
  const rowRecord = getRowRecord(row);
  const shippingAddress = mapUnknownShippingAddress(readUnknown(rowRecord, ['shipping_address']));

  const currency = (row as unknown as { currency?: string | null }).currency ?? 'USD';
  const fulfillmentType = readText(rowRecord, ORDER_FULFILLMENT_TYPE_KEYS) ?? 'pickup';
  const pickupTime = readText(rowRecord, ORDER_PICKUP_TIME_KEYS);
  const guestTokenRaw = (row as unknown as { guest_token?: string | null }).guest_token;

  return {
    id:                        row.id                    as Order['id'],
    stripe_session_id:         row.stripe_session_id     as Order['stripe_session_id'],
    stripe_payment_intent_id:  row.stripe_payment_intent_id as Order['stripe_payment_intent_id'],
    order_number:              row.order_number,
    identity:                  buildIdentity(row.customer_uid, guestTokenRaw),
    customer_uid:              row.customer_uid,
    guest_token:               guestTokenRaw ?? null,
    source:                    (row.customer_uid ? 'auth' : 'guest') as Order['source'],
    customer_email:            row.customer_email,
    customer_name:             row.customer_name,
    customer_phone:            row.customer_phone,
    order_type:                normalizeOrderType(row.order_type ?? ''),
    fulfillment_type:          fulfillmentType as Order['fulfillment_type'],
    pickup_time:               pickupTime as Order['pickup_time'],
    amount_subtotal:           normalizeMoneyValue(row.amount_subtotal),
    amount_tax:                normalizeMoneyValue(row.amount_tax),
    amount_shipping:           normalizeMoneyValue(row.amount_shipping),
    amount_total:              normalizeMoneyValue(row.amount_total),
    currency,
    pricing:                   buildStubPricing(row),
    payment_status:            normalizePaymentStatus(row.payment_status ?? ''),
    status:                    normalizeOrderStatus(row.status ?? ''),
    risk_score:                (row as unknown as { risk_score?: number | null }).risk_score ?? null,
    risk_level:                (row as unknown as { risk_level?: string | null }).risk_level as Order['risk_level'] ?? null,
    verification_status:       ((row as unknown as { verification_status?: string }).verification_status ?? 'not_required') as Order['verification_status'],
    cart_items:                mapUnknownCartItems(row.cart_items, row.metadata),
    assigned_to:               row.assigned_to,
    shipping_name:             row.shipping_name ?? deriveShippingNameFromAddress(shippingAddress),
    shipping_address:          shippingAddress,
    shipping_phone:            row.shipping_phone ?? deriveShippingPhoneFromAddress(shippingAddress),
    shipping_city:             deriveShippingCity(shippingAddress, rowRecord),
    shipping_state:            deriveShippingState(shippingAddress, rowRecord),
    shipping_zip:              deriveShippingZip(shippingAddress, rowRecord),
    shipping_country:          deriveShippingCountry(shippingAddress, rowRecord),
    notes:                     row.notes,
    estimated_ready_time:      readText(rowRecord, ORDER_ESTIMATED_READY_TIME_KEYS) as Order['estimated_ready_time'],
    metadata:                  row.metadata,
    created_at:                row.created_at as Order['created_at'],
    updated_at:                row.updated_at as Order['updated_at'],
  };
}

export function mapUnknownOrderToDomain(value: unknown): Order | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value, ORDER_ID_KEYS);
  const stripeSessionId = readText(value, ORDER_STRIPE_SESSION_ID_KEYS);
  const createdAt = readText(value, ORDER_CREATED_AT_KEYS);
  const updatedAt = readText(value, ORDER_UPDATED_AT_KEYS);

  if (id === null || stripeSessionId === null || createdAt === null || updatedAt === null) {
    return null;
  }

  const shippingAddress = mapUnknownShippingAddress(
    readUnknown(value, ['shipping_address', 'shippingAddress']),
  );

  const metadata = toJsonValue(readUnknown(value, ['metadata']));
  const currency = readText(value, ORDER_CURRENCY_KEYS) ?? 'USD';
  const customerUid = readText(value, ORDER_CUSTOMER_UID_KEYS);
  const fulfillmentType = readText(value, ORDER_FULFILLMENT_TYPE_KEYS) ?? 'pickup';
  const pickupTime = readText(value, ORDER_PICKUP_TIME_KEYS);
  const guestTokenRaw = readText(value, ['guest_token', 'guestToken']);

  const amountSubtotal = normalizeMoneyValue(readNumber(value, ORDER_AMOUNT_SUBTOTAL_KEYS) ?? 0);
  const amountTax      = normalizeMoneyValue(readNumber(value, ORDER_AMOUNT_TAX_KEYS)      ?? 0);
  const amountShipping = normalizeMoneyValue(readNumber(value, ORDER_AMOUNT_SHIPPING_KEYS) ?? 0);
  const amountTotal    = normalizeMoneyValue(readNumber(value, ORDER_AMOUNT_TOTAL_KEYS)    ?? 0);

  return {
    id:                       id          as Order['id'],
    stripe_session_id:        stripeSessionId as Order['stripe_session_id'],
    stripe_payment_intent_id: readText(value, ORDER_STRIPE_PAYMENT_INTENT_ID_KEYS) as Order['stripe_payment_intent_id'],
    order_number:             readNumber(value, ORDER_NUMBER_KEYS),
    identity:                 buildIdentity(customerUid, guestTokenRaw),
    customer_uid:             customerUid,
    guest_token:              guestTokenRaw,
    source:                   (customerUid ? 'auth' : 'guest') as Order['source'],
    customer_email:           readText(value, ORDER_CUSTOMER_EMAIL_KEYS),
    customer_name:            readText(value, ORDER_CUSTOMER_NAME_KEYS),
    customer_phone:           readText(value, ORDER_CUSTOMER_PHONE_KEYS),
    order_type:               normalizeOrderType(readText(value, ORDER_TYPE_KEYS) ?? ''),
    fulfillment_type:         fulfillmentType as Order['fulfillment_type'],
    pickup_time:              pickupTime as Order['pickup_time'],
    amount_subtotal:          amountSubtotal,
    amount_tax:               amountTax,
    amount_shipping:          amountShipping,
    amount_total:             amountTotal,
    currency,
    pricing: {
      subtotal_cents:     amountSubtotal  as Order['pricing']['subtotal_cents'],
      tax_cents:          amountTax       as Order['pricing']['tax_cents'],
      tip_cents:          0               as Order['pricing']['tip_cents'],
      discount_cents:     0               as Order['pricing']['discount_cents'],
      delivery_fee_cents: amountShipping  as Order['pricing']['delivery_fee_cents'],
      service_fee_cents:  0               as Order['pricing']['service_fee_cents'],
      total_cents:        amountTotal     as Order['pricing']['total_cents'],
      currency,
    },
    payment_status:           normalizePaymentStatus(readText(value, ORDER_PAYMENT_STATUS_KEYS) ?? ''),
    status:                   normalizeOrderStatus(readText(value, ORDER_STATUS_KEYS) ?? ''),
    risk_score:               null,
    risk_level:               null,
    verification_status:      'not_required',
    cart_items:               mapUnknownCartItems(readUnknownArray(value, ORDER_CART_ITEMS_KEYS), metadata),
    assigned_to:              readText(value, ORDER_ASSIGNED_TO_KEYS),
    shipping_name:            readText(value, ORDER_SHIPPING_NAME_KEYS) ?? deriveShippingNameFromAddress(shippingAddress),
    shipping_address:         shippingAddress,
    shipping_phone:           readText(value, ORDER_SHIPPING_PHONE_KEYS) ?? deriveShippingPhoneFromAddress(shippingAddress),
    shipping_city:            deriveShippingCity(shippingAddress, value),
    shipping_state:           deriveShippingState(shippingAddress, value),
    shipping_zip:             deriveShippingZip(shippingAddress, value),
    shipping_country:         deriveShippingCountry(shippingAddress, value),
    notes:                    readText(value, ORDER_NOTES_KEYS),
    estimated_ready_time:     readText(value, ORDER_ESTIMATED_READY_TIME_KEYS) as Order['estimated_ready_time'],
    metadata,
    created_at:               createdAt as Order['created_at'],
    updated_at:               updatedAt as Order['updated_at'],
  };
}

export function mapOrderRowsToDomain(rows: readonly OrderRow[]): Order[] {
  return rows.map((row) => mapOrderRowToDomain(row));
}

export function mapOrderRowToKitchenOrder(row: OrderRow): KitchenOrder {
  const rowRecord = getRowRecord(row);
  const fulfillmentType = readText(rowRecord, ORDER_FULFILLMENT_TYPE_KEYS) ?? 'pickup';
  const pickupTime = readText(rowRecord, ORDER_PICKUP_TIME_KEYS);

  return {
    id:               row.id               as KitchenOrder['id'],
    created_at:       row.created_at       as KitchenOrder['created_at'],
    customer_name:    row.customer_name,
    customer_phone:   row.customer_phone,
    amount_total:     normalizeMoneyValue(row.amount_total),
    status:           normalizeOrderStatus(row.status ?? ''),
    fulfillment_type: fulfillmentType       as KitchenOrder['fulfillment_type'],
    pickup_time:      pickupTime            as KitchenOrder['pickup_time'],
    cart_items:       mapUnknownCartItems(row.cart_items, row.metadata),
    assigned_to:      row.assigned_to,
    notes:            row.notes,
  };
}

export function mapOrderRowsToKitchenOrders(rows: readonly OrderRow[]): KitchenOrder[] {
  return rows.map((row) => mapOrderRowToKitchenOrder(row));
}

export function mapOrderToInsert(order: Order): OrderInsert {
  return {
    id:                       order.id,
    stripe_session_id:        order.stripe_session_id,
    stripe_payment_intent_id: order.stripe_payment_intent_id,
    customer_uid:             order.customer_uid,
    customer_email:           order.customer_email,
    customer_name:            order.customer_name,
    customer_phone:           order.customer_phone,
    amount_subtotal:          order.amount_subtotal,
    amount_tax:               order.amount_tax,
    amount_shipping:          order.amount_shipping,
    amount_total:             order.amount_total,
    assigned_to:              order.assigned_to,
    order_type:               order.order_type,
    payment_status:           order.payment_status,
    status:                   order.status,
    order_number:             order.order_number,
    cart_items:               cartItemsToJson(order.cart_items),
    shipping_name:            order.shipping_name,
    shipping_address:         shippingAddressToJson(order.shipping_address),
    shipping_phone:           order.shipping_phone,
    metadata:                 toJsonValue(order.metadata),
    notes:                    order.notes,
    created_at:               order.created_at,
    updated_at:               order.updated_at,
  };
}

export function mapPartialOrderToUpdate(patch: Partial<Order>): OrderUpdate {
  const update: OrderUpdate = {};

  if (patch.stripe_session_id       !== undefined) update.stripe_session_id       = patch.stripe_session_id;
  if (patch.stripe_payment_intent_id !== undefined) update.stripe_payment_intent_id = patch.stripe_payment_intent_id;
  if (patch.customer_uid            !== undefined) update.customer_uid            = patch.customer_uid;
  if (patch.customer_email          !== undefined) update.customer_email          = patch.customer_email;
  if (patch.customer_name           !== undefined) update.customer_name           = patch.customer_name;
  if (patch.customer_phone          !== undefined) update.customer_phone          = patch.customer_phone;
  if (patch.amount_subtotal         !== undefined) update.amount_subtotal         = patch.amount_subtotal;
  if (patch.amount_tax              !== undefined) update.amount_tax              = patch.amount_tax;
  if (patch.amount_shipping         !== undefined) update.amount_shipping         = patch.amount_shipping;
  if (patch.amount_total            !== undefined) update.amount_total            = patch.amount_total;
  if (patch.assigned_to             !== undefined) update.assigned_to             = patch.assigned_to;
  if (patch.order_type              !== undefined) update.order_type              = patch.order_type;
  if (patch.payment_status          !== undefined) update.payment_status          = patch.payment_status;
  if (patch.status                  !== undefined) update.status                  = patch.status;
  if (patch.order_number            !== undefined) update.order_number            = patch.order_number;
  if (patch.cart_items              !== undefined) update.cart_items              = cartItemsToJson(patch.cart_items);
  if (patch.shipping_name           !== undefined) update.shipping_name           = patch.shipping_name;
  if (patch.shipping_address        !== undefined) update.shipping_address        = shippingAddressToJson(patch.shipping_address);
  if (patch.shipping_phone          !== undefined) update.shipping_phone          = patch.shipping_phone;
  if (patch.metadata                !== undefined) update.metadata                = toJsonValue(patch.metadata);
  if (patch.notes                   !== undefined) update.notes                   = patch.notes;
  if (patch.updated_at              !== undefined) update.updated_at              = patch.updated_at;

  return update;
}

export function mapUnknownOrderEvent(value: unknown): OrderEvent | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = readText(value, ORDER_EVENT_ID_KEYS);
  const orderId = readText(value, ORDER_EVENT_ORDER_ID_KEYS);
  const eventType = readText(value, ORDER_EVENT_TYPE_KEYS);
  const createdAt = readText(value, ORDER_EVENT_CREATED_AT_KEYS);

  if (id === null || orderId === null || eventType === null || createdAt === null) {
    return null;
  }

  return {
    id,
    order_id:   orderId,
    user_id:    readText(value, ORDER_EVENT_USER_ID_KEYS),
    event_type: eventType,
    event_data: toOrderEventData(readUnknown(value, ORDER_EVENT_DATA_KEYS)),
    created_at: createdAt,
  };
}

export function mapUnknownOrderEvents(values: readonly unknown[]): OrderEvent[] {
  const events: OrderEvent[] = [];

  for (const value of values) {
    const event = mapUnknownOrderEvent(value);

    if (event !== null) {
      events.push(event);
    }
  }

  return events;
}