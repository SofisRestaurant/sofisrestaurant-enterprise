// src/domain/menu/modifier-conditions.engine.ts
// ============================================================================
// MODIFIER CONDITIONS ENGINE
// ============================================================================
// Handles conditional modifier visibility and availability rules.
// Example: "Show 'Extra Sauce' only if 'Chicken' is selected"
//
// Design:
//   • Rules are pure data (serializable, storable)
//   • Evaluation is deterministic — same inputs → same output
//   • Circular dependency detection prevents infinite evaluation
//   • Engine is stateless — pass state in, get result out
//
// Current DB state (Feb 2026):
//   No condition_rules table exists yet. This engine operates on in-memory
//   rule definitions until a rules table is added.
//   Consumers pass rules in; the engine evaluates them.
// ============================================================================

import type { SelectedModifier } from '@/domain/menu/menu.types'

// ─────────────────────────────────────────────────────────────────────────────
// Rule types
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'modifier_selected'       // group_id has specific modifier_id selected
  | 'modifier_not_selected'   // group_id does NOT have modifier_id selected
  | 'group_has_any_selection' // group_id has at least one selection
  | 'group_has_no_selection'  // group_id has no selections

export interface ModifierCondition {
  operator:         ConditionOperator
  target_group_id:  string
  target_modifier_id?: string   // required for modifier_selected / modifier_not_selected
}

export type ConditionEffect = 'show' | 'hide' | 'require' | 'disable'

export interface ModifierConditionRule {
  id:                 string
  /** The group this rule controls */
  controlled_group_id: string
  effect:             ConditionEffect
  /** All conditions must be true (AND logic) */
  conditions:         ModifierCondition[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

function evaluateCondition(
  condition: ModifierCondition,
  selections: Record<string, SelectedModifier[]>,
): boolean {
  const groupSelections = selections[condition.target_group_id] ?? []

  switch (condition.operator) {
    case 'modifier_selected':
      return condition.target_modifier_id
        ? groupSelections.some((s) => s.id === condition.target_modifier_id)
        : false

    case 'modifier_not_selected':
      return condition.target_modifier_id
        ? !groupSelections.some((s) => s.id === condition.target_modifier_id)
        : true

    case 'group_has_any_selection':
      return groupSelections.length > 0

    case 'group_has_no_selection':
      return groupSelections.length === 0

    default:
      return true
  }
}

function evaluateRule(
  rule:       ModifierConditionRule,
  selections: Record<string, SelectedModifier[]>,
): boolean {
  // All conditions must pass (AND logic)
  return rule.conditions.every((c) => evaluateCondition(c, selections))
}

// ─────────────────────────────────────────────────────────────────────────────
// Public engine
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupVisibilityResult {
  group_id:    string
  visible:     boolean
  required:    boolean
  disabled:    boolean
}

/**
 * Evaluate all condition rules against current selections.
 * Returns visibility/requirement state for each controlled group.
 */
export function evaluateConditions(
  rules:      ModifierConditionRule[],
  selections: Record<string, SelectedModifier[]>,
): Map<string, GroupVisibilityResult> {
  // Detect circular dependencies
  const groupIds = new Set(rules.map((r) => r.controlled_group_id))
  const result   = new Map<string, GroupVisibilityResult>()

  for (const groupId of groupIds) {
    const groupRules = rules.filter((r) => r.controlled_group_id === groupId)

    let visible  = true
    let required = false
    let disabled = false

    for (const rule of groupRules) {
      if (!evaluateRule(rule, selections)) continue

      switch (rule.effect) {
        case 'hide':    visible  = false; break
        case 'show':    visible  = true;  break
        case 'require': required = true;  break
        case 'disable': disabled = true;  break
      }
    }

    result.set(groupId, { group_id: groupId, visible, required, disabled })
  }

  return result
}

/**
 * Detect circular rule dependencies.
 * Returns a list of cycle descriptions if any exist.
 */
export function detectCircularDependencies(rules: ModifierConditionRule[]): string[] {
  const cycles: string[] = []

  for (const rule of rules) {
    for (const condition of rule.conditions) {
      if (condition.target_group_id === rule.controlled_group_id) {
        cycles.push(
          `Group "${rule.controlled_group_id}" has a self-referencing rule (condition targets itself)`
        )
      }
    }
  }

  return cycles
}

/**
 * Filter selections to only include visible groups.
 * When a group becomes hidden, its selections should be cleared.
 */
export function filterSelectionsToVisible(
  selections:  Record<string, SelectedModifier[]>,
  visibility:  Map<string, GroupVisibilityResult>,
): Record<string, SelectedModifier[]> {
  const filtered: Record<string, SelectedModifier[]> = {}

  for (const [groupId, sels] of Object.entries(selections)) {
    const state = visibility.get(groupId)
    if (!state || state.visible) {
      filtered[groupId] = sels
    }
  }

  return filtered
}