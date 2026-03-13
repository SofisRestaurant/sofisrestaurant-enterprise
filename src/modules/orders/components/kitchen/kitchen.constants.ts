// =============================================================================
// PATH: src/modules/orders/components/kitchen/kitchen.constants.ts
// =============================================================================

export const CONFIG = {
  AUTO_REFRESH_INTERVAL: 20_000,
  DEFAULT_SOUND_ENABLED: true,
} as const;

export const MODIFIER_KEYS = ['modifiers', 'options', 'selected_modifiers'] as const;
export const SPECIAL_INSTRUCTION_KEYS = [
  'special_instructions',
  'specialInstructions',
  'instructions',
  'notes',
] as const;
export const KITCHEN_NOTE_KEYS = ['kitchen_notes', 'kitchenNotes'] as const;
export const ALLERGEN_KEYS = ['allergens', 'allergen_flags', 'allergenFlags'] as const;
export const MODIFIER_ID_KEYS = ['id', 'modifier_id', 'modifierId'] as const;
export const MODIFIER_GROUP_ID_KEYS = [
  'modifier_group_id',
  'modifierGroupId',
  'group_id',
  'groupId',
] as const;
export const MODIFIER_LABEL_KEYS = [
  'group_name',
  'groupName',
  'group',
  'name',
  'label',
  'title',
] as const;
export const MODIFIER_SELECTIONS_KEYS = [
  'selections',
  'selected',
  'items',
  'values',
  'choices',
] as const;
export const SELECTION_ID_KEYS = ['id', 'modifier_id', 'modifierId'] as const;
export const SELECTION_NAME_KEYS = ['name', 'label', 'title'] as const;
export const SELECTION_PRICE_KEYS = [
  'price_adjustment',
  'priceAdjustment',
  'price',
  'price_cents',
] as const;
export const SELECTION_QUANTITY_KEYS = ['quantity', 'qty'] as const;