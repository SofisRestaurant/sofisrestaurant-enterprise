// src/domain/menu/modifier.constants.ts
// ============================================================================
// MODIFIER SYSTEM CONSTANTS
// ============================================================================
// All constants are derived from real DB schema constraints.
// Changing DB constraints requires updating these constants too.
// ============================================================================

import type { ModifierGroupType } from '@/domain/menu/menu.types'
import type { ModifierTemplate }  from '@/types/admin-menu'

// ─────────────────────────────────────────────────────────────────────────────
// Group type configuration
// ─────────────────────────────────────────────────────────────────────────────

export const MODIFIER_GROUP_TYPES: {
  value: ModifierGroupType
  label: string
  description: string
}[] = [
  {
    value: 'radio',
    label: 'Radio (choose one)',
    description: 'Customer picks exactly one option. Required groups must have one selected.',
  },
  {
    value: 'checkbox',
    label: 'Checkbox (choose many)',
    description: 'Customer picks one or more options up to the max limit.',
  },
  {
    value: 'quantity',
    label: 'Quantity',
    description: 'Customer specifies how many of each modifier to add.',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Limits (enforced in DB constraints and validated client-side)
// ─────────────────────────────────────────────────────────────────────────────

export const MODIFIER_LIMITS = {
  GROUP_NAME_MAX:       80,
  GROUP_DESC_MAX:       200,
  MODIFIER_NAME_MAX:    60,
  MAX_GROUPS_PER_ITEM:  20,   // soft limit — not enforced by DB constraint
  MAX_MODIFIERS_PER_GROUP: 50,
  MIN_PRICE_ADJUSTMENT: -999.99,
  MAX_PRICE_ADJUSTMENT:  999.99,
  MAX_SORT_ORDER:        9999,
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Default values for new groups and modifiers
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MODIFIER_GROUP = {
  name:           '',
  description:    '',
  type:           'radio' as ModifierGroupType,
  required:       false,
  min_selections: 0,
  max_selections: null as number | null,
  sort_order:     0,
  active:         true,
}

export const DEFAULT_MODIFIER = {
  name:             '',
  price_adjustment: 0,
  available:        true,
  sort_order:       0,
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in templates
// ─────────────────────────────────────────────────────────────────────────────

export const MODIFIER_TEMPLATES: ModifierTemplate[] = [
  {
    id:          'tmpl-protein-choice',
    name:        'Protein Choice',
    description: 'Common protein selection for bowls and entrees',
    category:    'proteins',
    group: {
      name:           'Choose Your Protein',
      description:    'Select your protein',
      type:           'radio',
      required:       true,
      min_selections: 1,
      max_selections: 1,
      sort_order:     0,
      active:         true,
    },
    modifiers: [
      { name: 'Chicken',   price_adjustment: 0,    available: true, sort_order: 0 },
      { name: 'Steak',     price_adjustment: 3.00, available: true, sort_order: 1 },
      { name: 'Shrimp',    price_adjustment: 2.00, available: true, sort_order: 2 },
      { name: 'Tofu',      price_adjustment: 0,    available: true, sort_order: 3 },
    ],
  },
  {
    id:          'tmpl-size',
    name:        'Size',
    description: 'Small / Medium / Large sizing',
    category:    'sizes',
    group: {
      name:           'Size',
      description: undefined as string | undefined,
      type:           'radio',
      required:       true,
      min_selections: 1,
      max_selections: 1,
      sort_order:     0,
      active:         true,
    },
    modifiers: [
      { name: 'Small',  price_adjustment: -1.00, available: true, sort_order: 0 },
      { name: 'Medium', price_adjustment: 0,     available: true, sort_order: 1 },
      { name: 'Large',  price_adjustment: 2.00,  available: true, sort_order: 2 },
    ],
  },
  {
    id:          'tmpl-sauces',
    name:        'Sauces',
    description: 'Optional sauce add-ons',
    category:    'sauces',
    group: {
      name:           'Sauce',
      description:    'Add a sauce',
      type:           'checkbox',
      required:       false,
      min_selections: 0,
      max_selections: 3,
      sort_order:     10,
      active:         true,
    },
    modifiers: [
      { name: 'Ranch',       price_adjustment: 0.50, available: true, sort_order: 0 },
      { name: 'Hot Sauce',   price_adjustment: 0.50, available: true, sort_order: 1 },
      { name: 'BBQ',         price_adjustment: 0.50, available: true, sort_order: 2 },
      { name: 'Honey Mustard', price_adjustment: 0.50, available: true, sort_order: 3 },
    ],
  },
  {
    id:          'tmpl-add-ons',
    name:        'Add-Ons',
    description: 'General paid add-ons',
    category:    'add-ons',
    group: {
      name:           'Add-Ons',
      description:    'Customize your order',
      type:           'checkbox',
      required:       false,
      min_selections: 0,
      max_selections: null,
      sort_order:     20,
      active:         true,
    },
    modifiers: [
      { name: 'Extra Cheese',  price_adjustment: 1.00, available: true, sort_order: 0 },
      { name: 'Avocado',       price_adjustment: 1.50, available: true, sort_order: 1 },
      { name: 'Bacon',         price_adjustment: 1.50, available: true, sort_order: 2 },
    ],
  },
  {
    id:          'tmpl-drink-temp',
    name:        'Temperature',
    description: 'Hot or iced for beverages',
    category:    'drinks',
    group: {
      name:           'Temperature',
      description: undefined as string | undefined,
      type:           'radio',
      required:       true,
      min_selections: 1,
      max_selections: 1,
      sort_order:     0,
      active:         true,
    },
    modifiers: [
      { name: 'Hot',  price_adjustment: 0, available: true, sort_order: 0 },
      { name: 'Iced', price_adjustment: 0, available: true, sort_order: 1 },
    ],
  },
]

export const TEMPLATE_CATEGORIES = [
  'proteins', 'sizes', 'sauces', 'add-ons', 'drinks',
] as const