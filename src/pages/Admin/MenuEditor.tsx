// src/pages/Admin/MenuEditor.tsx
// ============================================================================
// ADMIN MENU EDITOR — Tabbed, enterprise-grade (Feb 2026)
// ============================================================================
//
// Architecture:
//   - Two tabs per item: General (name/price/dietary) + Modifiers (groups/options)
//   - Reads all items from menu_items_full VIEW (admin — includes unavailable)
//   - Writes to menu_items TABLE via MenuService
//   - Modifier management delegated to MenuModifiersTab
//   - Full form validation before save
//   - Dirty-state warning (unsaved changes badge)
//   - Optimistic availability toggle in the item list
//
// Schema confirmed: Feb 2026 — database.types.ts
// ============================================================================

import type { MenuCategory } from '@/domain/menu/menu.types';
import { useEffect, useState, useCallback, useRef } from 'react';
import { ModalShell } from '@/components/ui/ModalShell';
import { AsyncButton } from '@/components/ui/AsyncButton';
import { ErrorBanner } from '@/components/ui/ErrorBanner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MenuGeneralTab, GENERAL_TAB_EMPTY } from '@/features/admin/menu/MenuGeneralTab';
import type { GeneralTabFormState } from '@/features/admin/menu/MenuGeneralTab';
import { isGeneralTabFormValid } from '@/domain/menu/menu-general.schema';
import { MenuModifiersTab } from '@/features/admin/menu/MenuModifiersTab';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import type { MenuItemAdmin } from '@/domain/menu/menu.types';
import { MenuAdminService } from '@/domain/menu/menu.service.admin';
import { MenuWriteService } from '@/domain/menu/menu.service.write';
// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type EditorTab = 'general' | 'modifiers';

function itemToForm(item: MenuItemAdmin): GeneralTabFormState {
  return {
    name: item.name,
    category: item.category,
    price: item.price.toString(),
    description: item.description ?? '',
    image_url: item.image_url ?? '',
    featured: item.featured,
    available: item.available,
    is_vegetarian: item.is_vegetarian ?? false,
    is_vegan: item.is_vegan ?? false,
    is_gluten_free: item.is_gluten_free ?? false,
    spicy_level: item.spicy_level?.toString() ?? '',
    sort_order: item.sort_order?.toString() ?? '',
    inventory_count: item.inventory_count?.toString() ?? '',
    low_stock_threshold: item.low_stock_threshold?.toString() ?? '',
    popularity_score: item.popularity_score?.toString() ?? '',
  };
}

function numOrUndef(s: string): number | undefined {
  const n = Number(s);
  return s.trim() && !isNaN(n) ? n : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminMenuEditor() {
  // ── List state ─────────────────────────────────────────────────────────────
  const [items, setItems] = useState<MenuItemAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemAdmin | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('general');
  const [form, setForm] = useState<GeneralTabFormState>(GENERAL_TAB_EMPTY);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const originalForm = useRef<GeneralTabFormState>(GENERAL_TAB_EMPTY);

  // ── Confirm delete state ───────────────────────────────────────────────────
  const [deleteTarget, setDeleteTarget] = useState<MenuItemAdmin | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Load all items
  // ─────────────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setPageError(null);

    try {
      const data = await MenuAdminService.getAllItems();
      setItems(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setPageError(err.message);
      } else {
        setPageError('Failed to load menu.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ─────────────────────────────────────────────────────────────────────────
  // Modal helpers
  // ─────────────────────────────────────────────────────────────────────────

  function openCreate() {
    const empty = { ...GENERAL_TAB_EMPTY };

    setEditingItem(null);
    setForm(empty);
    originalForm.current = empty;
    setIsDirty(false);
    setActiveTab('general');
    setModalError(null);
    setIsOpen(true);
  }

  function openEdit(item: MenuItemAdmin) {
    const f = itemToForm(item);

    setEditingItem(item);
    setForm(f);
    originalForm.current = f;
    setIsDirty(false);
    setActiveTab('general');
    setModalError(null);
    setIsOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setIsOpen(false);
    setModalError(null);
    setIsDirty(false);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Form change handler — tracks dirty state
  // ─────────────────────────────────────────────────────────────────────────

  function handleFormChange(
    key: keyof GeneralTabFormState,
    value: GeneralTabFormState[keyof GeneralTabFormState],
  ) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };

      const isChanged = JSON.stringify(next) !== JSON.stringify(originalForm.current);

      setIsDirty(isChanged);

      return next;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Save
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!isGeneralTabFormValid(form)) return;

    setSaving(true);
    setModalError(null);

    const payload = {
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price),
      description: form.description.trim() || undefined,
      image_url: form.image_url.trim() || undefined,
      featured: form.featured,
      available: form.available,
      is_vegetarian: form.is_vegetarian,
      is_vegan: form.is_vegan,
      is_gluten_free: form.is_gluten_free,
      spicy_level: numOrUndef(form.spicy_level),
      sort_order: numOrUndef(form.sort_order),
      inventory_count: numOrUndef(form.inventory_count),
      low_stock_threshold: numOrUndef(form.low_stock_threshold),
      popularity_score: numOrUndef(form.popularity_score),
    };

    try {
      let result: MenuItemAdmin;

      if (editingItem) {
        result = await MenuWriteService.update(editingItem.id, payload);

        setItems((prev) => prev.map((i) => (i.id === result.id ? result : i)));
      } else {
        result = await MenuWriteService.create(payload);

        setItems((prev) => [result, ...prev]);
        setActiveTab('modifiers'); // unlock modifiers for new item
      }

      setEditingItem(result);
      originalForm.current = itemToForm(result);
      setIsDirty(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setModalError(err.message);
      } else {
        setModalError('Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Delete
  // ─────────────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await MenuWriteService.delete(deleteTarget.id);
      setItems((p) => p.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setPageError('Failed to delete item.');
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Availability toggle — optimistic
  // ─────────────────────────────────────────────────────────────────────────

  async function handleToggle(item: MenuItemAdmin, available: boolean) {
    // optimistic update
    setItems((p) => p.map((i) => (i.id === item.id ? { ...i, available } : i)));

    try {
      await MenuWriteService.update(item.id, { available });
    } catch {
      // revert if failed
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, available: !available } : i)));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const isNewItem = !editingItem;
  const canSave = isGeneralTabFormValid(form) && !saving;
  const hasModifiers = (editingItem?.modifier_groups?.length ?? 0) > 0;

  const byCategory: Record<MenuCategory, MenuItemAdmin[]> = {
    appetizers: [],
    entrees: [],
    desserts: [],
    drinks: [],
    lunch: [],
    breakfast: [],
    specials: [],
  };

  for (const item of items) {
    byCategory[item.category].push(item);
  }

  return (
    <div className="py-6">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Editor</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {items.length} item{items.length !== 1 ? 's' : ''} · {Object.keys(byCategory).length}{' '}
            categor{Object.keys(byCategory).length !== 1 ? 'ies' : 'y'}
          </p>
        </div>
        <AsyncButton variant="primary" size="md" onClick={openCreate}>
          + Add Item
        </AsyncButton>
      </div>

      <ErrorBanner message={pageError} onDismiss={() => setPageError(null)} />

      {/* ── Item list ───────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin h-5 w-5 border-2 border-gray-200 border-t-gray-700 rounded-full" />
          <span className="ml-3 text-sm text-gray-400">Loading menu…</span>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(byCategory)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([category, catItems]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2 ">
                  {category} ({catItems.length})
                </h3>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['Name', 'Price', 'Modifiers', 'Dietary', 'Stock', 'Available', ''].map(
                          (h) => (
                            <th
                              key={h}
                              className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {catItems.map((item) => {
                        const stockStatus = PricingEngine.getStockStatus(item);
                        const stockMsg = PricingEngine.getStockMessage(item);
                        return (
                          <tr
                            key={item.id}
                            className={[
                              'hover:bg-gray-50 transition-colors',
                              item.available ? '' : 'opacity-50',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{item.name}</span>
                                {item.featured && (
                                  <span className="text-amber-400 text-xs">⭐</span>
                                )}
                              </div>
                              {item.description && (
                                <p className="text-xs text-gray-400 truncate max-w-180px">
                                  {item.description}
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-sm">
                              {PricingEngine.formatDollars(item.price)}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {item.modifier_groups.length > 0 ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full font-medium">
                                  🎛 {item.modifier_groups.length}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-base">
                              {item.is_vegan && '🌱'}
                              {item.is_vegetarian && '🌿'}
                              {item.is_gluten_free && '🌾'}
                              {item.spicy_level ? '🌶'.repeat(Math.min(item.spicy_level, 3)) : ''}
                            </td>
                            <td className="px-4 py-3 text-xs">
                              {stockMsg ? (
                                <span
                                  className={[
                                    'inline-flex items-center px-2 py-0.5 rounded-full font-medium',
                                    stockStatus === 'out_of_stock'
                                      ? 'bg-red-50 text-red-600'
                                      : stockStatus === 'low_stock'
                                        ? 'bg-amber-50 text-amber-700'
                                        : 'bg-gray-50 text-gray-600',
                                  ].join(' ')}
                                >
                                  {stockMsg}
                                </span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={item.available}
                                onChange={(e) => handleToggle(item, e.target.checked)}
                                className="h-4 w-4 accent-amber-500 cursor-pointer"
                                aria-label={`Toggle ${item.name}`}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => openEdit(item)}
                                  className="text-xs text-blue-600 hover:underline font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setDeleteTarget(item)}
                                  className="text-xs text-red-500 hover:underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

          {items.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-4">🍽</p>
              <p className="font-medium">No menu items yet.</p>
              <p className="text-sm mt-1">Click + Add Item to get started.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Editor modal ─────────────────────────────────────────────────── */}
      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        maxWidth="max-w-2xl"
        label={editingItem ? `Edit ${editingItem.name}` : 'New menu item'}
      >
        <div className="bg-white rounded-2xl overflow-hidden shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-900">
                {isNewItem ? 'New Menu Item' : editingItem!.name}
              </h2>
              {isDirty && (
                <span className="text-xs text-amber-600 font-medium px-2 py-0.5 bg-amber-50 rounded-full">
                  Unsaved
                </span>
              )}
            </div>
            <button
              onClick={closeModal}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 transition text-xl leading-none disabled:opacity-40"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-6">
            {[
              ['general', 'General'] as [EditorTab, string],
              ...(!isNewItem
                ? [
                    [
                      'modifiers',
                      hasModifiers
                        ? `Modifiers (${editingItem?.modifier_groups.length})`
                        : 'Modifiers',
                    ] as [EditorTab, string],
                  ]
                : []),
            ].map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  'px-4 py-3 text-sm font-medium border-b-2 transition -mb-px',
                  activeTab === tab
                    ? 'border-black text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="px-6 py-5 max-h-[65vh] overflow-y-auto">
            <ErrorBanner message={modalError} onDismiss={() => setModalError(null)} />
            {activeTab === 'general' && (
              <MenuGeneralTab form={form} onChange={handleFormChange} disabled={saving} />
            )}
            {activeTab === 'modifiers' && editingItem && (
              <MenuModifiersTab menuItemId={editingItem.id} />
            )}
          </div>

          {/* Footer — only on general tab */}
          {activeTab === 'general' && (
            <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400">
                {isNewItem
                  ? 'Modifiers tab unlocks after saving.'
                  : `ID: ${editingItem?.id.split('-')[0]}…`}
              </p>
              <div className="flex gap-3">
                <AsyncButton variant="secondary" size="sm" onClick={closeModal} disabled={saving}>
                  Cancel
                </AsyncButton>
                <AsyncButton
                  variant="primary"
                  size="sm"
                  loading={saving}
                  loadingText="Saving…"
                  disabled={!canSave}
                  onClick={handleSave}
                >
                  {isNewItem ? 'Create Item' : 'Save Changes'}
                </AsyncButton>
              </div>
            </div>
          )}
        </div>
      </ModalShell>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Menu Item"
        message={`Permanently delete "${deleteTarget?.name}"? Linked modifier groups will be detached.`}
        confirmText="Delete Item"
        variant="danger"
        loading={deleteLoading}
      />
    </div>
  );
}
