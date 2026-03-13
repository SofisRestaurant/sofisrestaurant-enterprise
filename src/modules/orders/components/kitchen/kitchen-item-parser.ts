import type { OrderCartItem } from '@/domain/orders/order.types';
import type { DisplayModifier, DisplayModifierSelection } from './kitchen.types';

type UnknownRecord = Record<string, unknown>;

interface KitchenLooseModifier {
  id?: unknown;
  modifierId?: unknown;
  modifier_group_id?: unknown;
  group_id?: unknown;
  groupId?: unknown;
  group_name?: unknown;
  groupName?: unknown;
  name?: unknown;
  label?: unknown;
  title?: unknown;
  price_adjustment?: unknown;
  price?: unknown;
  price_cents?: unknown;
  quantity?: unknown;
  qty?: unknown;
  selections?: unknown;
  selected?: unknown;
  items?: unknown;
  values?: unknown;
  choices?: unknown;
}

interface KitchenLooseSelection {
  id?: unknown;
  modifierId?: unknown;
  name?: unknown;
  label?: unknown;
  title?: unknown;
  price_adjustment?: unknown;
  price?: unknown;
  price_cents?: unknown;
  quantity?: unknown;
  qty?: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getObjectValue(record: UnknownRecord, key: string): unknown {
  return key in record ? record[key] : undefined;
}

function toTrimmedText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function getFirstTextFromRecord(record: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const text = toTrimmedText(getObjectValue(record, key));
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function getArrayValue(record: UnknownRecord, keys: readonly string[]): readonly unknown[] {
  for (const key of keys) {
    const value = getObjectValue(record, key);
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function getOrderCartItemRecord(item: OrderCartItem): UnknownRecord | null {
  return isRecord(item) ? item : null;
}

function toLooseModifier(value: unknown): KitchenLooseModifier | null {
  return isRecord(value) ? value : null;
}

function toLooseSelection(value: unknown): KitchenLooseSelection | null {
  return isRecord(value) ? value : null;
}

function getRawModifiers(item: OrderCartItem): readonly KitchenLooseModifier[] {
  const record = getOrderCartItemRecord(item);
  if (record === null) {
    return [];
  }

  const rawModifiers = getArrayValue(record, ['modifiers', 'options', 'selected_modifiers']);
  const modifiers: KitchenLooseModifier[] = [];

  for (const entry of rawModifiers) {
    const modifier = toLooseModifier(entry);
    if (modifier !== null) {
      modifiers.push(modifier);
    }
  }

  return modifiers;
}

function getRawSelections(modifier: KitchenLooseModifier): readonly KitchenLooseSelection[] {
  const rawSelections =
    Array.isArray(modifier.selections) && modifier.selections.length > 0
      ? modifier.selections
      : Array.isArray(modifier.selected) && modifier.selected.length > 0
        ? modifier.selected
        : Array.isArray(modifier.items) && modifier.items.length > 0
          ? modifier.items
          : Array.isArray(modifier.values) && modifier.values.length > 0
            ? modifier.values
            : Array.isArray(modifier.choices) && modifier.choices.length > 0
              ? modifier.choices
              : [];

  const selections: KitchenLooseSelection[] = [];

  for (const entry of rawSelections) {
    const selection = toLooseSelection(entry);
    if (selection !== null) {
      selections.push(selection);
    }
  }

  return selections;
}

function getFirstText(...values: readonly unknown[]): string | null {
  for (const value of values) {
    const text = toTrimmedText(value);
    if (text !== null) {
      return text;
    }
  }

  return null;
}

function getModifierId(modifier: KitchenLooseModifier): string | null {
  return getFirstText(modifier.id, modifier.modifierId);
}

function getModifierGroupId(modifier: KitchenLooseModifier): string | null {
  return getFirstText(modifier.modifier_group_id, modifier.group_id, modifier.groupId);
}

function getModifierLabel(modifier: KitchenLooseModifier): string {
  return (
    getFirstText(
      modifier.group_name,
      modifier.groupName,
      modifier.name,
      modifier.label,
      modifier.title,
    ) ?? 'Modifier'
  );
}

function getSelectionId(selection: KitchenLooseSelection, fallback: string): string {
  return (
    getFirstText(
      selection.id,
      selection.modifierId,
      selection.name,
      selection.label,
      selection.title,
    ) ?? fallback
  );
}

function getSelectionName(selection: KitchenLooseSelection): string | null {
  return getFirstText(selection.name, selection.label, selection.title);
}

function getSelectionPriceAdjustment(selection: KitchenLooseSelection): number {
  return Math.round(
    toFiniteNumber(selection.price_adjustment ?? selection.price ?? selection.price_cents) ?? 0,
  );
}

function getSelectionQuantity(selection: KitchenLooseSelection): number {
  return Math.max(1, Math.floor(toFiniteNumber(selection.quantity ?? selection.qty) ?? 1));
}

function getFallbackModifierSelection(
  modifier: KitchenLooseModifier,
  label: string,
): DisplayModifierSelection | null {
  const fallbackName = getFirstText(modifier.name, modifier.label, modifier.title) ?? label;
  const fallbackId = getModifierId(modifier) ?? getModifierGroupId(modifier) ?? fallbackName;
  const priceAdjustment = Math.round(
    toFiniteNumber(modifier.price_adjustment ?? modifier.price ?? modifier.price_cents) ?? 0,
  );
  const quantity = Math.max(1, Math.floor(toFiniteNumber(modifier.quantity ?? modifier.qty) ?? 1));

  return {
    id: fallbackId,
    name: fallbackName,
    priceAdjustment,
    count: quantity,
  };
}

function buildSelectionMap(
  modifier: KitchenLooseModifier,
  label: string,
): Map<string, DisplayModifierSelection> {
  const selectionMap = new Map<string, DisplayModifierSelection>();
  const rawSelections = getRawSelections(modifier);

  if (rawSelections.length === 0) {
    const fallback = getFallbackModifierSelection(modifier, label);

    if (fallback !== null) {
      selectionMap.set(`${fallback.id}:${fallback.name}:${fallback.priceAdjustment}`, fallback);
    }

    return selectionMap;
  }

  for (const selection of rawSelections) {
    const selectionName = getSelectionName(selection);
    if (selectionName === null) {
      continue;
    }

    const priceAdjustment = getSelectionPriceAdjustment(selection);
    const quantity = getSelectionQuantity(selection);
    const selectionId = getSelectionId(selection, selectionName);
    const selectionKey = `${selectionId}:${selectionName}:${priceAdjustment}`;

    const existing = selectionMap.get(selectionKey);
    if (existing !== undefined) {
      existing.count += quantity;
      continue;
    }

    selectionMap.set(selectionKey, {
      id: selectionId,
      name: selectionName,
      priceAdjustment,
      count: quantity,
    });
  }

  return selectionMap;
}

function buildModifierSignature(item: OrderCartItem): string {
  const modifiers = parseDisplayModifiers(item);

  if (modifiers.length === 0) {
    return 'na';
  }

  return modifiers
    .map((modifier) => {
      const modifierId = modifier.id ?? modifier.label;
      const selections = modifier.selections
        .map(
          (selection) =>
            `${selection.id}:${selection.name}:${selection.priceAdjustment}:${selection.count}`,
        )
        .join(',');

      return `${modifierId}[${selections}]`;
    })
    .join('|');
}

function buildItemSignature(item: OrderCartItem): string {
  const record = getOrderCartItemRecord(item);

  const menuItemId =
    record !== null ? getFirstTextFromRecord(record, ['menu_item_id', 'menuItemId']) : null;

  const specialInstructions = getSpecialInstructions(item) ?? 'na';
  const kitchenNotes = getKitchenNotes(item) ?? 'na';
  const modifierSignature = buildModifierSignature(item);

  return [
    menuItemId ?? item.id ?? item.name,
    item.name,
    String(item.quantity),
    specialInstructions,
    kitchenNotes,
    modifierSignature,
  ].join('::');
}

export function getCartItemRecord(item: OrderCartItem): UnknownRecord | null {
  return getOrderCartItemRecord(item);
}

export function getCartItemKey(orderId: string, item: OrderCartItem, itemIndex = 0): string {
  const record = getOrderCartItemRecord(item);

  const stableLineId =
    record !== null
      ? getFirstTextFromRecord(record, ['lineId', 'line_id', 'cart_line_id', 'cartLineId'])
      : null;

  if (stableLineId !== null) {
    return `${orderId}:${stableLineId}`;
  }

  const itemId = toTrimmedText(item.id);
  const baseSignature = buildItemSignature(item);

  if (itemId !== null) {
    return `${orderId}:${itemId}:${baseSignature}:${itemIndex}`;
  }

  return `${orderId}:${baseSignature}:${itemIndex}`;
}

export function getSpecialInstructions(item: OrderCartItem): string | null {
  const record = getOrderCartItemRecord(item);

  if (record === null) {
    return toTrimmedText(item.notes);
  }

  return (
    getFirstTextFromRecord(record, [
      'special_instructions',
      'specialInstructions',
      'instructions',
      'notes',
    ]) ?? toTrimmedText(item.notes)
  );
}

export function getKitchenNotes(item: OrderCartItem): string | null {
  const record = getOrderCartItemRecord(item);
  if (record === null) {
    return null;
  }

  return getFirstTextFromRecord(record, ['kitchen_notes', 'kitchenNotes']);
}

export function getAllergens(item: OrderCartItem): string[] {
  const record = getOrderCartItemRecord(item);
  if (record === null) {
    return [];
  }

  const source = getArrayValue(record, ['allergens', 'allergen_flags', 'allergenFlags']);
  const allergens: string[] = [];

  for (const entry of source) {
    const text = toTrimmedText(entry);
    if (text !== null) {
      allergens.push(text);
    }
  }

  return allergens;
}

export function parseDisplayModifiers(item: OrderCartItem): DisplayModifier[] {
  const rawModifiers = getRawModifiers(item);

  if (rawModifiers.length === 0) {
    return [];
  }

  const modifiers: DisplayModifier[] = [];

  for (const rawModifier of rawModifiers) {
    const modifierId = getModifierId(rawModifier);
    const groupId = getModifierGroupId(rawModifier);
    const label = getModifierLabel(rawModifier);
    const selectionMap = buildSelectionMap(rawModifier, label);
    const selections = Array.from(selectionMap.values());

    if (selections.length === 0) {
      continue;
    }

    const keyBase = modifierId ?? groupId ?? label;
    const selectionSignature = selections
      .map((selection) => `${selection.id}:${selection.count}`)
      .join('|');

    modifiers.push({
      key: `${keyBase}:${selectionSignature}`,
      id: modifierId,
      label,
      selections,
    });
  }

  return modifiers;
}