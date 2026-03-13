import {
  buildClientIntegrityHash,
  type CanonicalCartItem,
  type CanonicalModifier,
  PricingValidationError,
} from "../_shared/pricing.ts";
import type {
  DbClient,
  MenuItemLookupRow,
  MenuItemModifierGroupLookupRow,
  ModifierGroupLookupRow,
  ModifierLookupRow,
  RequestCartItemInput,
} from "./types.ts";

export async function loadCanonicalCartItems(
  db: DbClient,
  items: RequestCartItemInput[],
): Promise<CanonicalCartItem[]> {
  const menuItemIds = [...new Set(items.map((item) => item.id))];
  const modifierIds = [
    ...new Set(
      items.flatMap((item) => item.modifiers.map((modifier) => modifier.id)),
    ),
  ];

  const { data: menuItems, error: menuError } = await db
    .from("menu_items")
    .select("id, name, image_url, category, price, available")
    .in("id", menuItemIds);

  if (menuError) {
    throw new PricingValidationError(
      "MENU_LOOKUP_FAILED",
      "Unable to load menu items.",
      503,
    );
  }

  const menuItemMap = new Map<string, MenuItemLookupRow>();
  for (const row of (menuItems ?? []) as MenuItemLookupRow[]) {
    menuItemMap.set(row.id, row);
  }

  const { data: itemGroups, error: itemGroupsError } = await db
    .from("menu_item_modifier_groups")
    .select("id, menu_item_id, modifier_group_id, sort_order")
    .in("menu_item_id", menuItemIds);

  if (itemGroupsError) {
    throw new PricingValidationError(
      "MODIFIER_GROUP_LOOKUP_FAILED",
      "Unable to load modifier groups.",
      503,
    );
  }

  const itemGroupRows = (itemGroups ?? []) as MenuItemModifierGroupLookupRow[];
  const groupIds = [
    ...new Set(itemGroupRows.map((row) => row.modifier_group_id)),
  ];

  const { data: groups, error: groupsError } = groupIds.length > 0
    ? await db
      .from("modifier_groups")
      .select(
        "id, name, required, min_selections, max_selections, active, type, description, sort_order, created_at, updated_at",
      )
      .in("id", groupIds)
    : { data: [] as ModifierGroupLookupRow[], error: null };

  if (groupsError) {
    throw new PricingValidationError(
      "MODIFIER_GROUP_LOOKUP_FAILED",
      "Unable to load modifier groups.",
      503,
    );
  }

  const { data: modifiers, error: modifiersError } = modifierIds.length > 0
    ? await db
      .from("modifiers")
      .select(
        "id, modifier_group_id, name, price_adjustment, available, sort_order, created_at, updated_at",
      )
      .in("id", modifierIds)
    : { data: [] as ModifierLookupRow[], error: null };

  if (modifiersError) {
    throw new PricingValidationError(
      "MODIFIER_LOOKUP_FAILED",
      "Unable to load modifiers.",
      503,
    );
  }

  const menuItemGroupMap = new Map<string, MenuItemModifierGroupLookupRow[]>();
  for (const row of itemGroupRows) {
    const existing = menuItemGroupMap.get(row.menu_item_id) ?? [];
    existing.push(row);
    menuItemGroupMap.set(row.menu_item_id, existing);
  }

  const groupMap = new Map<string, ModifierGroupLookupRow>();
  for (const row of (groups ?? []) as ModifierGroupLookupRow[]) {
    groupMap.set(row.id, row);
  }

  const modifierMap = new Map<string, ModifierLookupRow>();
  for (const row of (modifiers ?? []) as ModifierLookupRow[]) {
    modifierMap.set(row.id, row);
  }

  const canonicalItems: CanonicalCartItem[] = [];

  for (const item of items) {
    const menuItem = menuItemMap.get(item.id);
    if (!menuItem || !menuItem.available) {
      throw new PricingValidationError(
        "MENU_ITEM_UNAVAILABLE",
        "One or more menu items are unavailable.",
        409,
      );
    }

    const allowedGroups = menuItemGroupMap.get(item.id) ?? [];
    const allowedGroupIds = new Set<string>(
      allowedGroups.map((row) => row.modifier_group_id),
    );
    const selectedCountByGroup = new Map<string, number>();
    const canonicalModifiers: CanonicalModifier[] = [];

    for (const selection of item.modifiers) {
      const modifier = modifierMap.get(selection.id);
      if (!modifier || !modifier.available) {
        throw new PricingValidationError(
          "MODIFIER_UNAVAILABLE",
          "One or more modifiers are unavailable.",
          409,
        );
      }

      const selectedGroupId = selection.groupId ?? modifier.modifier_group_id;
      if (selectedGroupId !== modifier.modifier_group_id) {
        throw new PricingValidationError(
          "MODIFIER_GROUP_MISMATCH",
          "Modifier group selection is invalid.",
          409,
        );
      }

      if (!allowedGroupIds.has(modifier.modifier_group_id)) {
        throw new PricingValidationError(
          "MODIFIER_NOT_ALLOWED",
          "Modifier is not allowed for this item.",
          409,
        );
      }

      const group = groupMap.get(modifier.modifier_group_id);
      if (!group || !group.active) {
        throw new PricingValidationError(
          "MODIFIER_GROUP_INACTIVE",
          "Modifier group is inactive.",
          409,
        );
      }

      const nextCount =
        (selectedCountByGroup.get(modifier.modifier_group_id) ?? 0) + 1;
      selectedCountByGroup.set(modifier.modifier_group_id, nextCount);

      if (
        typeof group.max_selections === "number" &&
        nextCount > group.max_selections
      ) {
        throw new PricingValidationError(
          "TOO_MANY_MODIFIERS",
          "Too many modifiers selected for a group.",
          409,
        );
      }

      canonicalModifiers.push({
        id: modifier.id,
        groupId: modifier.modifier_group_id,
        name: modifier.name,
        priceAdjustmentCents: Math.trunc(modifier.price_adjustment),
      });
    }

    for (const allowed of allowedGroups) {
      const group = groupMap.get(allowed.modifier_group_id);
      if (!group || !group.active) continue;

      const selectedCount = selectedCountByGroup.get(group.id) ?? 0;
      const requiredMin = typeof group.min_selections === "number"
        ? Math.max(0, Math.trunc(group.min_selections))
        : group.required
        ? 1
        : 0;

      if (selectedCount < requiredMin) {
        throw new PricingValidationError(
          "MISSING_REQUIRED_MODIFIER",
          "A required modifier selection is missing.",
          409,
        );
      }
    }

    const sortedModifiers = [...canonicalModifiers].sort((left, right) => {
      if (left.groupId !== right.groupId) {
        return left.groupId.localeCompare(right.groupId);
      }
      if (left.id !== right.id) return left.id.localeCompare(right.id);
      return left.priceAdjustmentCents - right.priceAdjustmentCents;
    });

    const baseUnitPriceCents = Math.round(Number(menuItem.price) * 100);

    canonicalItems.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      imageUrl: menuItem.image_url,
      category: menuItem.category,
      quantity: item.quantity,
      notes: item.notes,
      baseUnitPriceCents,
      modifiers: sortedModifiers,
      basePricingHash: buildClientIntegrityHash(
        menuItem.id,
        baseUnitPriceCents,
        sortedModifiers,
        item.quantity,
      ),
    });
  }

  return canonicalItems;
}
