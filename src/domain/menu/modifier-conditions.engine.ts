// src/domain/menu/modifier-conditions.engine.ts
// ============================================================================
// MODIFIER CONDITIONS ENGINE
// ============================================================================
// Handles conditional modifier visibility and availability rules.
// Example: "Show 'Extra Sauce' only if 'Chicken' is selected"
//
// Design:
//   • Rules are pure data (serializable, storable)
//   • Evaluation is deterministic: same inputs → same output
//   • Circular dependency detection prevents unsafe rule graphs
//   • Engine is stateless: pass state in, get result out
//
// Current DB state:
//   No condition_rules table exists yet. This engine operates on in-memory
//   rule definitions until a rules table is added.
// ============================================================================

import type { SelectedModifier } from '@/domain/menu/menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Rule types
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionOperator =
  | 'modifier_selected'
  | 'modifier_not_selected'
  | 'group_has_any_selection'
  | 'group_has_no_selection';

export interface ModifierCondition {
  operator: ConditionOperator;
  target_group_id: string;
  target_modifier_id?: string;
}

export type ConditionEffect = 'show' | 'hide' | 'require' | 'disable';

export interface ModifierConditionRule {
  id: string;
  /** The group this rule controls */
  controlled_group_id: string;
  effect: ConditionEffect;
  /** All conditions must be true, AND logic */
  conditions: ModifierCondition[];
}

export type ModifierSelectionsByGroup = Record<string, readonly SelectedModifier[]>;

// ─────────────────────────────────────────────────────────────────────────────
// Evaluation
// ─────────────────────────────────────────────────────────────────────────────

function hasSelectedModifier(
  selections: readonly SelectedModifier[],
  modifierId: string,
): boolean {
  return selections.some((selection) => selection.id === modifierId);
}

function evaluateCondition(
  condition: ModifierCondition,
  selections: ModifierSelectionsByGroup,
): boolean {
  const groupSelections = selections[condition.target_group_id] ?? [];

  switch (condition.operator) {
    case 'modifier_selected': {
      if (!condition.target_modifier_id) {
        return false;
      }

      return hasSelectedModifier(groupSelections, condition.target_modifier_id);
    }

    case 'modifier_not_selected': {
      if (!condition.target_modifier_id) {
        return true;
      }

      return !hasSelectedModifier(groupSelections, condition.target_modifier_id);
    }

    case 'group_has_any_selection':
      return groupSelections.length > 0;

    case 'group_has_no_selection':
      return groupSelections.length === 0;
  }
}

function evaluateRule(
  rule: ModifierConditionRule,
  selections: ModifierSelectionsByGroup,
): boolean {
  return rule.conditions.every((condition) => evaluateCondition(condition, selections));
}

function createDefaultGroupResult(groupId: string): GroupVisibilityResult {
  return {
    group_id: groupId,
    visible: true,
    required: false,
    disabled: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public engine
// ─────────────────────────────────────────────────────────────────────────────

export interface GroupVisibilityResult {
  group_id: string;
  visible: boolean;
  required: boolean;
  disabled: boolean;
}

/**
 * Evaluate all condition rules against current selections.
 * Returns visibility, requirement, and disabled state for each controlled group.
 */
export function evaluateConditions(
  rules: readonly ModifierConditionRule[],
  selections: ModifierSelectionsByGroup,
): Map<string, GroupVisibilityResult> {
  const result = new Map<string, GroupVisibilityResult>();

  for (const rule of rules) {
    const current = result.get(rule.controlled_group_id) ?? createDefaultGroupResult(rule.controlled_group_id);

    if (!evaluateRule(rule, selections)) {
      result.set(rule.controlled_group_id, current);
      continue;
    }

    switch (rule.effect) {
      case 'hide':
        current.visible = false;
        break;

      case 'show':
        current.visible = true;
        break;

      case 'require':
        current.required = true;
        break;

      case 'disable':
        current.disabled = true;
        break;
    }

    result.set(rule.controlled_group_id, current);
  }

  return result;
}

/**
 * Detect circular rule dependencies.
 * Returns a list of cycle descriptions if any exist.
 */
export function detectCircularDependencies(
  rules: readonly ModifierConditionRule[],
): string[] {
  const graph = new Map<string, Set<string>>();

  for (const rule of rules) {
    const dependencies = graph.get(rule.controlled_group_id) ?? new Set<string>();

    for (const condition of rule.conditions) {
      dependencies.add(condition.target_group_id);
    }

    graph.set(rule.controlled_group_id, dependencies);
  }

  const cycles: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(groupId: string, path: readonly string[]): void {
    if (visiting.has(groupId)) {
      const cycleStartIndex = path.indexOf(groupId);
      const cyclePath = cycleStartIndex >= 0 ? path.slice(cycleStartIndex) : path;

      cycles.push([...cyclePath, groupId].join(' → '));
      return;
    }

    if (visited.has(groupId)) {
      return;
    }

    visiting.add(groupId);

    const dependencies = graph.get(groupId) ?? new Set<string>();

    for (const dependency of dependencies) {
      visit(dependency, [...path, groupId]);
    }

    visiting.delete(groupId);
    visited.add(groupId);
  }

  for (const groupId of graph.keys()) {
    visit(groupId, []);
  }

  return [...new Set(cycles)];
}

/**
 * Filter selections to only include visible groups.
 * When a group becomes hidden, its selections should be cleared.
 */
export function filterSelectionsToVisible(
  selections: ModifierSelectionsByGroup,
  visibility: ReadonlyMap<string, GroupVisibilityResult>,
): Record<string, SelectedModifier[]> {
  const filtered: Record<string, SelectedModifier[]> = {};

  for (const [groupId, groupSelections] of Object.entries(selections)) {
    const state = visibility.get(groupId);

    if (!state || state.visible) {
      filtered[groupId] = [...groupSelections];
    }
  }

  return filtered;
}

/**
 * Validate rule shape before saving or evaluating externally supplied rules.
 */
export function validateConditionRules(
  rules: readonly ModifierConditionRule[],
): string[] {
  const errors: string[] = [];

  for (const rule of rules) {
    if (!rule.id.trim()) {
      errors.push('Condition rule is missing an id.');
    }

    if (!rule.controlled_group_id.trim()) {
      errors.push(`Rule "${rule.id}" is missing controlled_group_id.`);
    }

    if (rule.conditions.length === 0) {
      errors.push(`Rule "${rule.id}" must have at least one condition.`);
    }

    for (const condition of rule.conditions) {
      if (!condition.target_group_id.trim()) {
        errors.push(`Rule "${rule.id}" has a condition missing target_group_id.`);
      }

      const needsModifierId =
        condition.operator === 'modifier_selected' ||
        condition.operator === 'modifier_not_selected';

      if (needsModifierId && !condition.target_modifier_id?.trim()) {
        errors.push(
          `Rule "${rule.id}" uses "${condition.operator}" but is missing target_modifier_id.`,
        );
      }
    }
  }

  return [...errors, ...detectCircularDependencies(rules).map((cycle) => `Circular dependency: ${cycle}`)];
}