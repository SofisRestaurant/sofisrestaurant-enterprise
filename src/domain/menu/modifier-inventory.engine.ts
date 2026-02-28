// src/domain/menu/modifier-inventory.engine.ts
// ============================================================================
// MODIFIER INVENTORY ENGINE
// ============================================================================
// Handles inventory awareness for modifier selections.
//
// Current DB state (Feb 2026):
//   modifiers table does NOT have inventory_count or low_stock_threshold.
//   These are forward-looking V2 fields referenced in contracts/menu.contract.ts
//   but not yet present in the live DB.
//
// This engine is designed to be plugged in when inventory columns are added.
// Today it provides:
//   • A no-op pass-through that never blocks (always returns available)
//   • The full typed interface so nothing needs to change when columns land
//   • Utility functions for item-level inventory (which IS in the current DB)
// ============================================================================

import type { MenuItem, ModifierGroup, SelectedModifier } from '@/domain/menu/menu.types'
import { PricingEngine } from '@/domain/pricing/pricing.engine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ModifierInventoryStatus {
  modifier_id:   string
  available:     boolean
  stock_count:   number | null    // null = unlimited / untracked
  is_low_stock:  boolean
  is_out_of_stock: boolean
  message:       string | null
}

export interface ItemInventoryStatus {
  item_id:       string
  available:     boolean
  stock_count:   number | null
  is_low_stock:  boolean
  is_out_of_stock: boolean
  message:       string | null
}

export interface SelectionInventoryCheck {
  can_proceed:       boolean
  blocked_modifiers: string[]   // modifier_ids that are out of stock
  warnings:          string[]   // low-stock warnings
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier inventory status
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get inventory status for a single modifier.
 * Returns "available" until modifier inventory columns exist in DB.
 */
export function getModifierInventoryStatus(
  modifier: { id: string; available: boolean },
): ModifierInventoryStatus {
  return {
    modifier_id:     modifier.id,
    available:       modifier.available,
    stock_count:     null,   // no DB column yet
    is_low_stock:    false,
    is_out_of_stock: !modifier.available,
    message:         modifier.available ? null : 'Unavailable',
  }
}

/**
 * Check if a set of selections can proceed based on modifier availability.
 * Currently only checks the available flag (no stock count in DB yet).
 */
export function checkSelectionInventory(
  groups:            ModifierGroup[],
  selectedModifiers: Record<string, SelectedModifier[]>,
): SelectionInventoryCheck {
  const blocked: string[] = []
  const warnings: string[] = []

  for (const group of groups) {
    const selections = selectedModifiers[group.id] ?? []
    for (const selection of selections) {
      const modifier = group.modifiers.find((m) => m.id === selection.id)
      if (!modifier || !modifier.available) {
        blocked.push(selection.id)
      }
    }
  }

  return {
    can_proceed:       blocked.length === 0,
    blocked_modifiers: blocked,
    warnings,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Item-level inventory (uses current DB columns)
// ─────────────────────────────────────────────────────────────────────────────

export function getItemInventoryStatus(item: MenuItem): ItemInventoryStatus {
  return {
    item_id:         item.id,
    available:       item.available,
    stock_count:     item.inventory_count ?? null,
    is_low_stock:    PricingEngine.isLowStock(item),
    is_out_of_stock: PricingEngine.isOutOfStock(item),
    message:         PricingEngine.getStockMessage(item),
  }
}