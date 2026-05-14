import { getMenuModifierGroupsForItem } from '@/modules/menu/api/menu-modifiers.api';
import { listMenuCategories, listMenuItems } from '@/modules/menu/api/menu.api';
import {
  callAdminGateway,
  formatAdminGatewayError,
} from '@/features/admin/api/adminGateway.client';
import { MenuWriteService } from '@/domain/menu/menu.service.write';

import type {
  AdminMenuCategory,
  AdminMenuItem,
  AdminMenuModifierGroup,
  AdminMenuModifierOption,
  AdminMenuSnapshot,
} from '../../../features/admin/types/admin-common.types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];

  for (const entry of value) {
    const next = asString(entry);
    if (next) {
      result.push(next);
    }
  }

  return result;
}

function asMetadata(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asSortOrder(value: unknown, fallback: number): number {
  const parsed = asNumber(value);
  return parsed === null ? fallback : Math.trunc(parsed);
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `admin_menu_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function compareNullableString(left: string | null, right: string | null): number {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return left.localeCompare(right);
}

function sortCategories(
  categories: readonly AdminMenuCategory[],
): AdminMenuCategory[] {
  return [...categories].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortItems(items: readonly AdminMenuItem[]): AdminMenuItem[] {
  return [...items].sort((left, right) => {
    const categoryCompare = compareNullableString(left.categoryName, right.categoryName);
    if (categoryCompare !== 0) {
      return categoryCompare;
    }

    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortModifierOptions(
  options: readonly AdminMenuModifierOption[],
): AdminMenuModifierOption[] {
  return [...options].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function sortModifierGroups(
  groups: readonly AdminMenuModifierGroup[],
): AdminMenuModifierGroup[] {
  return [...groups].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function parseCategoryLike(value: unknown): AdminMenuCategory | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    slug: asString(value.slug) ?? id,
    name,
    description: asString(value.description),
    imageUrl: asString(value.imageUrl) ?? asString(value.image_url),
    imageAlt: asString(value.imageAlt) ?? asString(value.image_alt),
    sortOrder: asSortOrder(value.sortOrder ?? value.sort_order, 0),
    isActive: asBoolean(value.isActive ?? value.is_active, true),
    itemCount: Math.max(0, asSortOrder(value.itemCount ?? value.item_count, 0)),
    metadata: asMetadata(value.metadata ?? value.meta),
  };
}

function parseItemLike(value: unknown): AdminMenuItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);

  if (!id || !name) {
    return null;
  }

  return {
    id,
    slug: asString(value.slug) ?? id,
    name,
    description: asString(value.description),
    shortDescription: asString(value.shortDescription) ?? asString(value.short_description),
    categoryId: asString(value.categoryId) ?? asString(value.category_id),
    categorySlug: asString(value.categorySlug) ?? asString(value.category_slug),
    categoryName: asString(value.categoryName) ?? asString(value.category_name),
    imageUrl: asString(value.imageUrl) ?? asString(value.image_url),
    imageAlt: asString(value.imageAlt) ?? asString(value.image_alt),
    price: asNumber(value.price) ?? 0,
    compareAtPrice: asNumber(value.compareAtPrice) ?? asNumber(value.compare_at_price),
    currency: asString(value.currency) ?? 'USD',
    isActive: asBoolean(value.isActive ?? value.is_active, true),
    isFeatured: asBoolean(value.isFeatured ?? value.is_featured, false),
    isAvailable: asBoolean(value.isAvailable ?? value.is_available, true),
    sortOrder: asSortOrder(value.sortOrder ?? value.sort_order, 0),
    prepTimeMinutes: asNumber(value.prepTimeMinutes) ?? asNumber(value.prep_time_minutes),
    spiceLevel: asNumber(value.spiceLevel) ?? asNumber(value.spice_level),
    badges: asStringArray(value.badges),
    tags: asStringArray(value.tags),
    dietaryFlags: asStringArray(value.dietaryFlags ?? value.dietary_flags),
    metadata: asMetadata(value.metadata ?? value.meta),
  };
}

function parseModifierOptionLike(value: unknown): AdminMenuModifierOption | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const groupId = asString(value.groupId) ?? asString(value.group_id);
  const name = asString(value.name);

  if (!id || !groupId || !name) {
    return null;
  }

  return {
    id,
    groupId,
    name,
    description: asString(value.description),
    priceDelta: asNumber(value.priceDelta) ?? asNumber(value.price_delta) ?? 0,
    isDefault: asBoolean(value.isDefault ?? value.is_default, false),
    isActive: asBoolean(value.isActive ?? value.is_active, true),
    sortOrder: asSortOrder(value.sortOrder ?? value.sort_order, 0),
    maxQuantity: asNumber(value.maxQuantity) ?? asNumber(value.max_quantity),
    metadata: asMetadata(value.metadata ?? value.meta),
  };
}

function parseModifierGroupLike(value: unknown): AdminMenuModifierGroup | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name);

  if (!id || !name) {
    return null;
  }

  const optionsRaw = Array.isArray(value.options) ? value.options : [];
  const options = sortModifierOptions(
    optionsRaw
      .map((entry) => parseModifierOptionLike(entry))
      .filter((entry): entry is AdminMenuModifierOption => entry !== null),
  );

  return {
    id,
    itemId: asString(value.itemId) ?? asString(value.item_id),
    name,
    description: asString(value.description),
    minSelections: Math.max(
      0,
      asSortOrder(value.minSelections ?? value.min_selections, 0),
    ),
    maxSelections: Math.max(
      1,
      asSortOrder(value.maxSelections ?? value.max_selections, 1),
    ),
    isRequired: asBoolean(value.isRequired ?? value.is_required, false),
    isActive: asBoolean(value.isActive ?? value.is_active, true),
    sortOrder: asSortOrder(value.sortOrder ?? value.sort_order, 0),
    metadata: asMetadata(value.metadata ?? value.meta),
    options,
  };
}

function parseCategories(value: unknown): AdminMenuCategory[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortCategories(
    value
      .map((entry) => parseCategoryLike(entry))
      .filter((entry): entry is AdminMenuCategory => entry !== null),
  );
}

function parseItems(value: unknown): AdminMenuItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortItems(
    value
      .map((entry) => parseItemLike(entry))
      .filter((entry): entry is AdminMenuItem => entry !== null),
  );
}

function parseModifierGroups(value: unknown): AdminMenuModifierGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortModifierGroups(
    value
      .map((entry) => parseModifierGroupLike(entry))
      .filter((entry): entry is AdminMenuModifierGroup => entry !== null),
  );
}

function buildModifierGroupsByItemId(
  groups: readonly AdminMenuModifierGroup[],
): Record<string, AdminMenuModifierGroup[]> {
  const result: Record<string, AdminMenuModifierGroup[]> = {};

  for (const group of groups) {
    const itemId = group.itemId;
    if (!itemId) {
      continue;
    }

    const bucket = result[itemId] ?? [];
    bucket.push(group);
    result[itemId] = bucket;
  }

  for (const [itemId, itemGroups] of Object.entries(result)) {
    result[itemId] = sortModifierGroups(itemGroups);
  }

  return result;
}

function extractGatewayModifierGroups(raw: UnknownRecord): AdminMenuModifierGroup[] {
  const modifierGroupsRaw = Array.isArray(raw.modifierGroups)
    ? raw.modifierGroups
    : Array.isArray(raw.modifier_groups)
      ? raw.modifier_groups
      : [];

  return parseModifierGroups(modifierGroupsRaw);
}

async function getFallbackCategoriesAndItems(): Promise<{
  categories: AdminMenuCategory[];
  items: AdminMenuItem[];
}> {
  const [categoriesRaw, itemsRaw]: [unknown, unknown] = await Promise.all([
    listMenuCategories({
      includeInactive: true,
    }),
    listMenuItems({
      includeInactive: true,
      includeUnavailable: true,
      limit: 500,
    }),
  ]);

  const items = parseItems(itemsRaw);
  const itemCounts = new Map<string, number>();

  for (const item of items) {
    if (!item.categoryId) {
      continue;
    }

    itemCounts.set(item.categoryId, (itemCounts.get(item.categoryId) ?? 0) + 1);
  }

  const categories = parseCategories(categoriesRaw).map((category) => ({
    ...category,
    itemCount: itemCounts.get(category.id) ?? 0,
  }));

  return {
    categories: sortCategories(categories),
    items,
  };
}

export async function getAdminMenuModifierGroupsForItem(
  itemId: string,
): Promise<AdminMenuModifierGroup[]> {
  const normalizedItemId = itemId.trim();

  if (!normalizedItemId) {
    throw new Error('Menu item id is required.');
  }

  const raw: unknown = await getMenuModifierGroupsForItem(normalizedItemId, {
    includeInactive: true,
  });

  return parseModifierGroups(raw);
}

export async function getAdminMenuSnapshot(): Promise<AdminMenuSnapshot> {
  const requestId = createRequestId();

  try {
    const raw = await callAdminGateway('menu:full', undefined, { requestId });

    if (isRecord(raw)) {
      const categories = parseCategories(raw.categories);
      const items = parseItems(raw.items);
      const modifierGroups = extractGatewayModifierGroups(raw);

      if (categories.length > 0 || items.length > 0) {
        return {
          categories,
          items,
          modifierGroupsByItemId: buildModifierGroupsByItemId(modifierGroups),
          asOf: asString(raw.asOf) ?? nowIso(),
          requestId: asString(raw.requestId) ?? requestId,
        };
      }
    }
  } catch {
    // Fall through to public-table fallback below.
  }

  const fallback = await getFallbackCategoriesAndItems();

  return {
    categories: fallback.categories,
    items: fallback.items,
    modifierGroupsByItemId: {},
    asOf: nowIso(),
    requestId,
  };
}


export async function deleteAdminMenuItem(id: string): Promise<void> {
  try {
    await MenuWriteService.delete(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    throw new Error(`Failed to delete menu item: ${message}`, {
      cause: err,
    });
  }
}

export async function listAdminMenuCategories(): Promise<AdminMenuCategory[]> {
  const snapshot = await getAdminMenuSnapshot();
  return snapshot.categories;
}

export async function listAdminMenuItems(): Promise<AdminMenuItem[]> {
  const snapshot = await getAdminMenuSnapshot();
  return snapshot.items;
}

export async function getAdminMenuSummary(): Promise<{
  categoryCount: number;
  itemCount: number;
  activeItemCount: number;
}> {
  const snapshot = await getAdminMenuSnapshot();

  return {
    categoryCount: snapshot.categories.length,
    itemCount: snapshot.items.length,
    activeItemCount: snapshot.items.filter((item) => item.isActive).length,
  };
}

export function formatAdminMenuError(error: unknown): string {
  return formatAdminGatewayError(error);
}