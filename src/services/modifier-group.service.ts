// src/services/modifier-group.service.ts
// ============================================================================
// MODIFIER GROUP SERVICE — Production Grade (2026)
// ============================================================================
// Admin-safe CRUD for modifier_groups and menu_item_modifier_groups.
//
// Architecture:
// - All protected reads/writes flow through admin-gateway via invokeEdge()
// - No direct browser access to admin-only tables/views
// - Strong runtime parsing for unknown gateway payloads
// - Validation enforced before writes
// - Batch operations use single gateway actions where appropriate
//
// Required admin-gateway actions:
//   menu:modifier-groups:list
//   menu:modifier-groups:get
//   menu:modifier-groups:list-for-item
//   menu:modifier-groups:item-count
//   menu:modifier-groups:create
//   menu:modifier-groups:update
//   menu:modifier-groups:toggle-active
//   menu:modifier-groups:delete
//   menu:modifier-groups:reorder
//   menu:modifier-groups:attach
//   menu:modifier-groups:detach
//   menu:modifier-groups:set-item-groups
//   menu:modifier-groups:reorder-for-item
// ============================================================================

import { invokeEdge } from '@/lib/supabase/invoke';
import type { ModifierGroup } from '@/domain/menu/menu.types';
import type {
  AdminModifierGroup,
  MenuItemModifierGroupWritePayload,
  ModifierGroupWritePayload,
  ReorderPayload,
} from '@/types/admin-menu';
import { validateModifierGroupPayload } from '@/domain/menu/modifier.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ID_LENGTH = 128;
const MAX_NAME_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 1_000;
const FALLBACK_ISO_DATE = new Date(0).toISOString();

const MODIFIER_GROUP_TYPES = ['radio', 'checkbox', 'quantity'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierGroupServiceError extends Error {
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ModifierGroupServiceError';
    this.code = code;
    this.details = details;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AdminGatewayEnvelope<T> = {
  data: T;
  meta?: {
    requestedBy?: string;
    requestId?: string;
    ts?: number;
  };
};

type UnknownRecord = Record<string, unknown>;
type UnknownModifier = AdminModifierGroup['modifiers'][number];

// ─────────────────────────────────────────────────────────────────────────────
// Runtime guards / normalizers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRequiredString(value: unknown, fallback = '', max = MAX_NAME_LENGTH): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : fallback;
}

function normalizeNullableString(value: unknown, max = MAX_DESCRIPTION_LENGTH): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function normalizeRequiredBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeRequiredNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeRequiredIsoString(value: unknown): string {
  if (typeof value !== 'string') {
    return FALLBACK_ISO_DATE;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return FALLBACK_ISO_DATE;
  }

  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : FALLBACK_ISO_DATE;
}

function normalizeModifierGroupType(value: unknown): ModifierGroup['type'] {
  const normalized = normalizeRequiredString(value, 'radio', 32);

  if (normalized === 'checkbox') {
    return 'checkbox';
  }

  if (normalized === 'quantity') {
    return 'quantity';
  }

  return 'radio';
}

function normalizeId(id: string, label: string): string {
  const trimmed = id.trim();

  if (trimmed.length === 0) {
    throw new ModifierGroupServiceError(`${label} is required.`);
  }

  return trimmed.slice(0, MAX_ID_LENGTH);
}

function normalizeOptionalStringInput(value: string | null | undefined, max: number): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, max) : null;
}

function normalizeOptionalNumberInput(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function buildValidationMessage(
  payload: ModifierGroupWritePayload | Partial<ModifierGroupWritePayload>,
): string {
  const validation = validateModifierGroupPayload(payload);
  if (validation.valid) {
    return '';
  }

  return Object.values(validation.errors)
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .join('; ');
}

function extractErrorCode(error: unknown): string | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  return typeof error.code === 'string' && error.code.trim().length > 0 ? error.code.trim() : undefined;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (isRecord(error) && typeof error.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim();
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return fallback;
}

function isUnknownModifier(value: unknown): value is UnknownModifier {
  return isRecord(value);
}

function toModifierArray(value: unknown): AdminModifierGroup['modifiers'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isUnknownModifier);
}

/**
 * Maps a single raw gateway value to AdminModifierGroup.
 * Throws ModifierGroupServiceError if the id or name is missing/empty —
 * empty ids cause duplicate React keys and 400 errors on downstream fetches.
 */
function mapUnknownToAdminModifierGroup(value: unknown): AdminModifierGroup {
  if (!isRecord(value)) {
    throw new ModifierGroupServiceError(
      'Invalid modifier group payload returned by admin gateway.',
    );
  }

  const id = normalizeNullableString(value.id, MAX_ID_LENGTH);
  if (!id) {
    throw new ModifierGroupServiceError(
      'Invalid modifier group payload returned by admin gateway: missing id.',
    );
  }

  const name = normalizeNullableString(value.name, MAX_NAME_LENGTH);
  if (!name) {
    throw new ModifierGroupServiceError(
      `Invalid modifier group payload returned by admin gateway: missing name for group ${id}.`,
    );
  }

  return {
    id,
    name,
    description: normalizeNullableString(value.description, MAX_DESCRIPTION_LENGTH),
    type: normalizeModifierGroupType(value.type),
    required: normalizeRequiredBoolean(value.required, false),
    min_selections: normalizeRequiredNumber(value.min_selections, 0),
    max_selections: normalizeNullableNumber(value.max_selections),
    sort_order: normalizeRequiredNumber(value.sort_order, 0),
    active: normalizeRequiredBoolean(value.active, true),
    modifiers: toModifierArray(value.modifiers),
    item_count: normalizeRequiredNumber(value.item_count, 0),
    created_at: normalizeRequiredIsoString(value.created_at),
    updated_at: normalizeRequiredIsoString(value.updated_at),
  };
}

/**
 * Maps an array of raw gateway values to AdminModifierGroup[].
 * Silently skips any entry with a missing/empty id or name so that a single
 * corrupt DB row cannot poison the whole list or produce blank React keys.
 */
function mapUnknownArrayToAdminModifierGroups(value: unknown): AdminModifierGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const groups: AdminModifierGroup[] = [];

  for (const entry of value) {
    try {
      groups.push(mapUnknownToAdminModifierGroup(entry));
    } catch {
      // Skip invalid rows — a missing id would cause duplicate React keys and
      // 400 errors when the modifier fetch fires with an empty group_id.
    }
  }

  return groups;
}

function mapUnknownToNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gateway helper
// ─────────────────────────────────────────────────────────────────────────────

async function callAdminGateway<T>(action: string, payload?: UnknownRecord): Promise<T> {
  try {
    const response = await invokeEdge<AdminGatewayEnvelope<T>>('admin-gateway', {
      action,
      payload,
    });

    if (!isRecord(response) || !('data' in response)) {
      throw new ModifierGroupServiceError('Invalid admin gateway response.');
    }

    return response.data;
  } catch (error) {
    if (error instanceof ModifierGroupServiceError) {
      throw error;
    }

    throw new ModifierGroupServiceError(
      extractErrorMessage(error, 'Modifier group request failed.'),
      extractErrorCode(error),
      error,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Payload builders
// ─────────────────────────────────────────────────────────────────────────────

function buildCreatePayload(payload: ModifierGroupWritePayload): UnknownRecord {
  return {
    name: normalizeId(payload.name, 'Group name').slice(0, MAX_NAME_LENGTH),
    description: normalizeOptionalStringInput(payload.description, MAX_DESCRIPTION_LENGTH),
    type: MODIFIER_GROUP_TYPES.includes(payload.type) ? payload.type : 'radio',
    required: payload.required,
    min_selections: payload.min_selections ?? 0,
    max_selections: normalizeOptionalNumberInput(payload.max_selections),
    sort_order: payload.sort_order,
    active: payload.active,
  };
}

function buildUpdatePayload(id: string, payload: Partial<ModifierGroupWritePayload>): UnknownRecord {
  const update: UnknownRecord = {
    id: normalizeId(id, 'Modifier group id'),
  };

  if (payload.name !== undefined) {
    update.name = normalizeId(payload.name, 'Group name').slice(0, MAX_NAME_LENGTH);
  }

  if (payload.description !== undefined) {
    update.description = normalizeOptionalStringInput(payload.description, MAX_DESCRIPTION_LENGTH);
  }

  if (payload.type !== undefined) {
    update.type = MODIFIER_GROUP_TYPES.includes(payload.type) ? payload.type : 'radio';
  }

  if (payload.required !== undefined) {
    update.required = payload.required;
  }

  if (payload.min_selections !== undefined) {
    update.min_selections = payload.min_selections;
  }

  if (payload.max_selections !== undefined) {
    update.max_selections = normalizeOptionalNumberInput(payload.max_selections);
  }

  if (payload.sort_order !== undefined) {
    update.sort_order = payload.sort_order;
  }

  if (payload.active !== undefined) {
    update.active = payload.active;
  }

  return update;
}

function buildReorderPayload(items: ReorderPayload[]): UnknownRecord {
  return {
    items: items.map((item) => ({
      id: normalizeId(item.id, 'Modifier group id'),
      sort_order: item.sort_order,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class ModifierGroupService {
  // ── READ ───────────────────────────────────────────────────────────────────

  static async getAll(): Promise<AdminModifierGroup[]> {
    const data = await callAdminGateway<unknown>('menu:modifier-groups:list', {
      activeOnly: false,
    });

    return mapUnknownArrayToAdminModifierGroups(data);
  }

  static async getAllActive(): Promise<AdminModifierGroup[]> {
    const data = await callAdminGateway<unknown>('menu:modifier-groups:list', {
      activeOnly: true,
    });

    return mapUnknownArrayToAdminModifierGroups(data);
  }

  static async getById(id: string): Promise<AdminModifierGroup | null> {
    const data = await callAdminGateway<unknown>('menu:modifier-groups:get', {
      id: normalizeId(id, 'Modifier group id'),
    });

    if (data === null) {
      return null;
    }

    return mapUnknownToAdminModifierGroup(data);
  }

  static async getForMenuItem(menuItemId: string): Promise<AdminModifierGroup[]> {
    const data = await callAdminGateway<unknown>('menu:modifier-groups:list-for-item', {
      menu_item_id: normalizeId(menuItemId, 'Menu item id'),
    });

    return mapUnknownArrayToAdminModifierGroups(data);
  }

  static async getItemCount(groupId: string): Promise<number> {
    const data = await callAdminGateway<unknown>('menu:modifier-groups:item-count', {
      id: normalizeId(groupId, 'Modifier group id'),
    });

    if (isRecord(data) && 'count' in data) {
      return mapUnknownToNumber(data.count, 0);
    }

    return mapUnknownToNumber(data, 0);
  }

  // ── CREATE ─────────────────────────────────────────────────────────────────

  static async create(payload: ModifierGroupWritePayload): Promise<AdminModifierGroup> {
    const validationMessage = buildValidationMessage(payload);
    if (validationMessage.length > 0) {
      throw new ModifierGroupServiceError(`Validation failed: ${validationMessage}`);
    }

    const data = await callAdminGateway<unknown>(
      'menu:modifier-groups:create',
      buildCreatePayload(payload),
    );

    return mapUnknownToAdminModifierGroup(data);
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  static async update(
    id: string,
    payload: Partial<ModifierGroupWritePayload>,
  ): Promise<AdminModifierGroup> {
    const validationMessage = buildValidationMessage(payload);
    if (validationMessage.length > 0) {
      throw new ModifierGroupServiceError(`Validation failed: ${validationMessage}`);
    }

    const data = await callAdminGateway<unknown>(
      'menu:modifier-groups:update',
      buildUpdatePayload(id, payload),
    );

    return mapUnknownToAdminModifierGroup(data);
  }

  static async toggleActive(id: string, active: boolean): Promise<void> {
    await callAdminGateway<unknown>('menu:modifier-groups:toggle-active', {
      id: normalizeId(id, 'Modifier group id'),
      active,
    });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  static async delete(id: string, force = false): Promise<void> {
    const normalizedId = normalizeId(id, 'Modifier group id');

    if (!force) {
      const count = await ModifierGroupService.getItemCount(normalizedId);
      if (count > 0) {
        throw new ModifierGroupServiceError(
          `Cannot delete: group is used by ${count} menu item${count !== 1 ? 's' : ''}. Deactivate it instead.`,
        );
      }
    }

    await callAdminGateway<unknown>('menu:modifier-groups:delete', {
      id: normalizedId,
      force,
    });
  }

  // ── REORDER ────────────────────────────────────────────────────────────────

  static async reorder(items: ReorderPayload[]): Promise<void> {
    await callAdminGateway<unknown>('menu:modifier-groups:reorder', buildReorderPayload(items));
  }

  // ── ITEM LINKS ─────────────────────────────────────────────────────────────

  static async attachToMenuItem(payload: MenuItemModifierGroupWritePayload): Promise<void> {
    await callAdminGateway<unknown>('menu:modifier-groups:attach', {
      menu_item_id: normalizeId(payload.menu_item_id, 'Menu item id'),
      modifier_group_id: normalizeId(payload.modifier_group_id, 'Modifier group id'),
      sort_order: payload.sort_order,
    });
  }

  static async detachFromMenuItem(menuItemId: string, groupId: string): Promise<void> {
    await callAdminGateway<unknown>('menu:modifier-groups:detach', {
      menu_item_id: normalizeId(menuItemId, 'Menu item id'),
      modifier_group_id: normalizeId(groupId, 'Modifier group id'),
    });
  }

  static async setItemGroups(menuItemId: string, groupIds: string[]): Promise<void> {
    await callAdminGateway<unknown>('menu:modifier-groups:set-item-groups', {
      menu_item_id: normalizeId(menuItemId, 'Menu item id'),
      group_ids: groupIds.map((groupId) => normalizeId(groupId, 'Modifier group id')),
    });
  }

  static async reorderForMenuItem(menuItemId: string, items: ReorderPayload[]): Promise<void> {
    await callAdminGateway<unknown>('menu:modifier-groups:reorder-for-item', {
      menu_item_id: normalizeId(menuItemId, 'Menu item id'),
      items: items.map((item) => ({
        id: normalizeId(item.id, 'Modifier group id'),
        sort_order: item.sort_order,
      })),
    });
  }
}