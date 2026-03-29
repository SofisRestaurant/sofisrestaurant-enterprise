// src/services/modifier-template.service.ts
// ============================================================================
// MODIFIER TEMPLATE SERVICE
// ============================================================================

import { ModifierGroupService } from './modifier-group.service';
import { ModifierService } from './modifier.service';
import type { ModifierTemplate } from '@/types/admin-menu';
import { MODIFIER_TEMPLATES } from '@/domain/menu/modifier.constants';

export class TemplateServiceError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'TemplateServiceError';
  }
}

export class ModifierTemplateService {
  static getTemplates(): ModifierTemplate[] {
    return MODIFIER_TEMPLATES;
  }

  static getByCategory(category: string): ModifierTemplate[] {
    return MODIFIER_TEMPLATES.filter((t) => t.category === category);
  }

  static getById(id: string): ModifierTemplate | null {
    return MODIFIER_TEMPLATES.find((t) => t.id === id) ?? null;
  }

  /**
   * Apply a template to a menu item.
   *
   * FIX: Appends a short unique suffix to the group name to avoid the
   * "duplicate key value violates unique constraint unique_modifier_group_name"
   * error that fires when the same template is applied more than once or to
   * multiple items.
   */
  static async applyToMenuItem(
    menuItemId: string,
    templateId: string,
    sortOrder?: number,
  ): Promise<string> {
    const template = ModifierTemplateService.getById(templateId);
    if (!template) throw new TemplateServiceError(`Template "${templateId}" not found`);

    // Append a short random suffix so the name is always unique in the DB.
    // Using 6 hex chars keeps it readable: "Size (a3f8c1)"
    const suffix = Math.random().toString(16).slice(2, 8);
    const uniqueName = `${template.group.name} (${suffix})`;

    const group = await ModifierGroupService.create({
      ...template.group,
      name: uniqueName,
    });

    await ModifierService.createBatch(group.id, template.modifiers);

    await ModifierGroupService.attachToMenuItem({
      menu_item_id: menuItemId,
      modifier_group_id: group.id,
      sort_order: sortOrder ?? 0,
    });

    return group.id;
  }

  /**
   * Clone an existing modifier group onto a different menu item.
   * Creates duplicate DB rows — does NOT share the same group ID.
   */
  static async cloneGroupToMenuItem(
    sourceGroupId: string,
    targetItemId: string,
    sortOrder?: number,
  ): Promise<string> {
    const [sourceGroup, sourceModifiers] = await Promise.all([
      ModifierGroupService.getById(sourceGroupId),
      ModifierService.getForGroup(sourceGroupId),
    ]);

    if (!sourceGroup) throw new TemplateServiceError(`Source group "${sourceGroupId}" not found`);

    const suffix = Math.random().toString(16).slice(2, 8);

    const clonedGroup = await ModifierGroupService.create({
      name: `${sourceGroup.name} (${suffix})`,
      type: sourceGroup.type,
      required: sourceGroup.required,
      min_selections: sourceGroup.min_selections,
      max_selections: sourceGroup.max_selections,
      sort_order: sortOrder ?? sourceGroup.sort_order,
      active: true,
    });

    await ModifierService.createBatch(
      clonedGroup.id,
      sourceModifiers.map((m) => ({
        name: m.name,
        price_adjustment: m.price_adjustment,
        available: m.available,
        sort_order: m.sort_order,
      })),
    );

    await ModifierGroupService.attachToMenuItem({
      menu_item_id: targetItemId,
      modifier_group_id: clonedGroup.id,
      sort_order: sortOrder ?? 0,
    });

    return clonedGroup.id;
  }
}