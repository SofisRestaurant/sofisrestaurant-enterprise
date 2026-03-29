import {
  MENU_API_ERROR_CODES,
  MenuApiError,
  fetchMenuTableRows,
} from './menu.api';

type UnknownRecord = Record<string, unknown>;

export interface MenuModifierOption {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  priceDelta: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  maxQuantity: number | null;
  metadata: UnknownRecord;
}

export interface MenuModifierGroup {
  id: string;
  itemId: string | null;
  name: string;
  description: string | null;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  metadata: UnknownRecord;
  options: MenuModifierOption[];
}

interface ListMenuModifierGroupsOptions {
  includeInactive?: boolean;
  signal?: AbortSignal;
  cacheTtlMs?: number;
}

interface MenuItemModifierLink {
  itemId: string;
  groupId: string;
  sortOrder: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;

  const chars = Array.from(value).map((char) => {
    const code = char.charCodeAt(0);
    return code >= 32 && code !== 127 ? char : ' ';
  });

  const clean = chars.join('').replace(/\s+/g, ' ').trim();

  return clean ? (clean.length <= maxLength ? clean : clean.slice(0, maxLength).trim()) : null;
}

function pickText(record: UnknownRecord, keys: readonly string[], maxLength: number): string | null {
  for (const key of keys) {
    const value = sanitizePlainText(record[key], maxLength);
    if (value) {
      return value;
    }
  }

  return null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }

  return null;
}

const asBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  return fallback;
};

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(Math.max(value, min), max) : min;

function pickNumber(record: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = asFiniteNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function pickBoolean(record: UnknownRecord, keys: readonly string[], fallback: boolean): boolean {
  for (const key of keys) {
    if (key in record) {
      return asBoolean(record[key], fallback);
    }
  }

  return fallback;
}

function pickRecord(record: UnknownRecord, keys: readonly string[]): UnknownRecord {
  for (const key of keys) {
    const candidate = record[key];
    if (isRecord(candidate)) {
      return candidate;
    }
  }

  return {};
}

function readPriceDelta(record: UnknownRecord): number {
  const cents = pickNumber(record, ['price_delta_cents', 'delta_cents', 'additional_price_cents']);
  if (cents !== null) {
    return Number((cents / 100).toFixed(2));
  }

  const major = pickNumber(record, ['price_delta', 'delta_price', 'additional_price']);
  if (major !== null) {
    return Number(major.toFixed(2));
  }

  return 0;
}

function throwInvalidInputError(message: string): never {
  throw new MenuApiError({
    code: MENU_API_ERROR_CODES.INVALID_INPUT,
    message,
    status: 400,
  });
}

function parseModifierGroup(record: unknown): MenuModifierGroup | null {
  if (!isRecord(record)) {
    return null;
  }

  const id = pickText(record, ['id', 'group_id', 'modifier_group_id'], 128);
  const name = pickText(record, ['name', 'title', 'group_name'], 120);

  if (!id || !name) {
    return null;
  }

  const minSelections = clamp(
    Math.trunc(pickNumber(record, ['min_selections', 'min_select', 'min_choices']) ?? 0),
    0,
    99,
  );
  const maxSelectionsRaw = pickNumber(record, ['max_selections', 'max_select', 'max_choices']);
  const maxSelections =
    maxSelectionsRaw === null
      ? Math.max(minSelections, 1)
      : clamp(Math.trunc(maxSelectionsRaw), minSelections, 99);

  return {
    id,
    itemId: pickText(record, ['menu_item_id', 'item_id'], 128),
    name,
    description: pickText(record, ['description', 'subtitle', 'summary'], 280),
    minSelections,
    maxSelections,
    isRequired: pickBoolean(record, ['is_required', 'required'], minSelections > 0),
    isActive: pickBoolean(record, ['is_active', 'active', 'enabled'], true),
    sortOrder: clamp(Math.trunc(pickNumber(record, ['sort_order', 'display_order', 'position']) ?? 0), -10_000, 10_000),
    metadata: pickRecord(record, ['metadata', 'meta']),
    options: [],
  };
}

function parseModifierOption(record: unknown): MenuModifierOption | null {
  if (!isRecord(record)) {
    return null;
  }

  const id = pickText(record, ['id', 'modifier_id', 'option_id'], 128);
  const groupId = pickText(record, ['modifier_group_id', 'group_id'], 128);
  const name = pickText(record, ['name', 'title', 'option_name'], 120);

  if (!id || !groupId || !name) {
    return null;
  }

  return {
    id,
    groupId,
    name,
    description: pickText(record, ['description', 'subtitle', 'summary'], 240),
    priceDelta: readPriceDelta(record),
    isDefault: pickBoolean(record, ['is_default', 'default_selected'], false),
    isActive: pickBoolean(record, ['is_active', 'active', 'enabled'], true),
    sortOrder: clamp(Math.trunc(pickNumber(record, ['sort_order', 'display_order', 'position']) ?? 0), -10_000, 10_000),
    maxQuantity: (() => {
      const value = pickNumber(record, ['max_quantity']);
      return value === null ? null : clamp(Math.trunc(value), 1, 99);
    })(),
    metadata: pickRecord(record, ['metadata', 'meta']),
  };
}

function parseItemModifierLink(record: unknown): MenuItemModifierLink | null {
  if (!isRecord(record)) {
    return null;
  }

  const itemId = pickText(record, ['menu_item_id', 'item_id'], 128);
  const groupId = pickText(record, ['modifier_group_id', 'group_id'], 128);

  if (!itemId || !groupId) {
    return null;
  }

  return {
    itemId,
    groupId,
    sortOrder: clamp(Math.trunc(pickNumber(record, ['sort_order', 'display_order', 'position']) ?? 0), -10_000, 10_000),
  };
}

function sortGroups(groups: MenuModifierGroup[]): MenuModifierGroup[] {
  return [...groups].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

function sortOptions(options: MenuModifierOption[]): MenuModifierOption[] {
  return [...options].sort((left, right) => {
    if (left.isDefault !== right.isDefault) {
      return left.isDefault ? -1 : 1;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    if (left.priceDelta !== right.priceDelta) {
      return left.priceDelta - right.priceDelta;
    }

    return left.name.localeCompare(right.name, undefined, {
      sensitivity: 'base',
      numeric: true,
    });
  });
}

export async function getMenuModifierGroupsForItem(
  itemId: string,
  options: ListMenuModifierGroupsOptions = {},
): Promise<MenuModifierGroup[]> {
  
  const normalizedItemId = sanitizePlainText(itemId, 128);

  if (!normalizedItemId) throwInvalidInputError('Menu item id is required.');

  const includeInactive = options.includeInactive ?? false;
  const cacheTtlMs = options.cacheTtlMs ?? 30_000;

  const [groupRows, optionRows, linkRows] = await Promise.all([
    fetchMenuTableRows('modifier_groups', {
      signal: options.signal,
      cacheTtlMs,
      allowMissing: true,
      limit: 1_000,
    }),
    
    fetchMenuTableRows('modifiers', {
      signal: options.signal,
      cacheTtlMs,
      allowMissing: true,
      limit: 2_000,
    }),
    fetchMenuTableRows('menu_item_modifier_groups', {
      signal: options.signal,
      cacheTtlMs,
      allowMissing: true,
      limit: 2_000,
    }),
  ]);

  const groups = groupRows
    .map(parseModifierGroup)
    .filter((group): group is MenuModifierGroup => group !== null);

  const optionsByGroupId = new Map<string, MenuModifierOption[]>();
  for (const option of optionRows
    .map(parseModifierOption)
    .filter((entry): entry is MenuModifierOption => entry !== null)) {
    const bucket = optionsByGroupId.get(option.groupId) ?? [];
    bucket.push(option);
    optionsByGroupId.set(option.groupId, bucket);
  }

  const links = linkRows
    .map(parseItemModifierLink)
    .filter((link): link is MenuItemModifierLink => link !== null);

  const linkedGroupIds = new Set(
    links
      .filter((link) => link.itemId === normalizedItemId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((link) => link.groupId),
  );

  let selectedGroups = groups.filter((group) => group.itemId === normalizedItemId);

  if (selectedGroups.length === 0 && linkedGroupIds.size > 0) {
    selectedGroups = groups.filter((group) => linkedGroupIds.has(group.id));
  }

  const hydratedGroups = selectedGroups
    .filter((group) => includeInactive || group.isActive)
    .map((group) => {
      const opts = sortOptions(
        (optionsByGroupId.get(group.id) ?? []).filter(
          (option) => includeInactive || option.isActive,
        ),
      );

      return { ...group, options: opts };
    })
    .filter((group) => group.options.length > 0 || includeInactive);

  return sortGroups(hydratedGroups);
}

export async function getRequiredMenuModifierGroupsForItem(
  itemId: string,
  options: ListMenuModifierGroupsOptions = {},
): Promise<MenuModifierGroup[]> {
  const groups = await getMenuModifierGroupsForItem(itemId, options);

  if (groups.length === 0) {
    throw new MenuApiError({
      code: MENU_API_ERROR_CODES.NOT_FOUND,
      message: 'No modifier groups were found for this menu item.',
      status: 404,
      details: {
        itemId,
      },
    });
  }

  return groups;
}