// src/services/modifier-template.service.ts
// ============================================================================
// MODIFIER TEMPLATE SERVICE
// ============================================================================
// Applies modifier templates (from modifier.constants.ts) to menu items.
// Creates real DB rows from template definitions.
// ============================================================================

import { ModifierGroupService } from './modifier-group.service'
import { ModifierService }      from './modifier.service'
import type { ModifierTemplate } from '@/types/admin-menu'
import { MODIFIER_TEMPLATES }   from '@/domain/menu/modifier.constants'

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class TemplateServiceError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message)
    this.name = 'TemplateServiceError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierTemplateService {

  /** Get all built-in templates */
  static getTemplates(): ModifierTemplate[] {
    return MODIFIER_TEMPLATES
  }

  /** Get templates by category */
  static getByCategory(category: string): ModifierTemplate[] {
    return MODIFIER_TEMPLATES.filter((t) => t.category === category)
  }

  /** Get a specific template by ID */
  static getById(id: string): ModifierTemplate | null {
    return MODIFIER_TEMPLATES.find((t) => t.id === id) ?? null
  }

  /**
   * Apply a template to a menu item:
   *   1. Create a new modifier_group from template.group
   *   2. Create all template.modifiers in that group
   *   3. Link the group to the menu item via menu_item_modifier_groups
   *
   * Returns the new group ID.
   */
  static async applyToMenuItem(
    menuItemId:  string,
    templateId:  string,
    sortOrder?:  number,
  ): Promise<string> {
    const template = ModifierTemplateService.getById(templateId)
    if (!template) throw new TemplateServiceError(`Template "${templateId}" not found`)

    // 1. Create group
    const group = await ModifierGroupService.create(template.group)

    // 2. Create modifiers in batch
    await ModifierService.createBatch(group.id, template.modifiers)

    // 3. Link to menu item
    await ModifierGroupService.attachToMenuItem({
      menu_item_id:      menuItemId,
      modifier_group_id: group.id,
      sort_order:        sortOrder ?? 0,
    })

    return group.id
  }

  /**
   * Clone an existing modifier group onto a different menu item.
   * Creates duplicate DB rows — does NOT share the same group ID.
   */
  static async cloneGroupToMenuItem(
    sourceGroupId: string,
    targetItemId:  string,
    sortOrder?:    number,
  ): Promise<string> {
    const [sourceGroup, sourceModifiers] = await Promise.all([
      ModifierGroupService.getById(sourceGroupId),
      ModifierService.getForGroup(sourceGroupId),
    ])

    if (!sourceGroup) throw new TemplateServiceError(`Source group "${sourceGroupId}" not found`)

    // Create clone group
    const clonedGroup = await ModifierGroupService.create({
      name:           `${sourceGroup.name} (copy)`,
      description:    sourceGroup.description,
      type:           sourceGroup.type,
      required:       sourceGroup.required,
      min_selections: sourceGroup.min_selections,
      max_selections: sourceGroup.max_selections,
      sort_order:     sortOrder ?? sourceGroup.sort_order,
      active:         sourceGroup.modifiers.length > 0,  // use count from domain
    })

    // Clone modifiers
    await ModifierService.createBatch(
      clonedGroup.id,
      sourceModifiers.map((m) => ({
        name:             m.name,
        price_adjustment: m.price_adjustment,
        available:        m.available,
        sort_order:       m.sort_order,
      })),
    )

    // Link
    await ModifierGroupService.attachToMenuItem({
      menu_item_id:      targetItemId,
      modifier_group_id: clonedGroup.id,
      sort_order:        sortOrder ?? 0,
    })

    return clonedGroup.id
  }
}