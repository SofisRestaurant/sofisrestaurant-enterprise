// src/pages/Admin/components/MenuGeneralTab.tsx
// ============================================================================
// MENU GENERAL TAB — Pure presenter
// ============================================================================
// Renders the "General" tab for a menu item in the tabbed admin editor.
// This component owns NO types, NO validation logic, NO constants.
// All domain logic lives in the domain layer.
//
// Dependency flow:
//   MenuGeneralTab → domain/menu/menu-general.types
//   MenuGeneralTab → domain/menu/menu-general.schema
//   domain         → never imports from pages/
// ============================================================================

import type { GeneralTabFormState } from '@/domain/menu/menu-general.types'
import type { MenuCategory } from '@/domain/menu/menu.types'

import { InlineToggle } from '@/components/ui/InlineToggle'
import { FormSection } from '@/components/ui/FormSection'
import { formStyles } from '@/components/ui/formStyles'
import { VALID_CATEGORIES } from '@/domain/menu/menu-general.schema'

// Re-export domain types for upstream consumers
export type { GeneralTabFormState } from '@/domain/menu/menu-general.types'
export { GENERAL_TAB_EMPTY } from '@/domain/menu/menu-general.types'

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MenuGeneralTabProps {
  form: GeneralTabFormState
  onChange: <K extends keyof GeneralTabFormState>(
    key: K,
    value: GeneralTabFormState[K],
  ) => void
  disabled?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MenuGeneralTab({
  form,
  onChange,
  disabled = false,
}: MenuGeneralTabProps) {

  function field<K extends keyof GeneralTabFormState>(
    key: K,
    value: GeneralTabFormState[K],
  ) {
    onChange(key, value)
  }

  return (
    <div className="space-y-8">

      {/* ── Item Info ─────────────────────────────────────────────────────── */}
      <FormSection title="Item Info">
        <div>
          <label className={formStyles.label} htmlFor="menu-name">
            Name *
          </label>
          <input
            id="menu-name"
            value={form.name}
            onChange={(e) => field('name', e.target.value)}
            placeholder="e.g. Grilled Salmon"
            className={formStyles.input}
            disabled={disabled}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={formStyles.label} htmlFor="menu-category">
              Category *
            </label>
            <select
              id="menu-category"
              value={form.category}
              onChange={(e) =>
                field('category', e.target.value as MenuCategory)
              }
              className={formStyles.select}
              disabled={disabled}
            >
              {VALID_CATEGORIES.map((c) => (
                <option key={c} value={c} className="capitalize">
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={formStyles.label} htmlFor="menu-price">
              Price (USD) *
            </label>
            <input
              id="menu-price"
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              onChange={(e) => field('price', e.target.value)}
              placeholder="0.00"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <label className={formStyles.label} htmlFor="menu-description">
            Description
          </label>
          <textarea
            id="menu-description"
            value={form.description}
            onChange={(e) => field('description', e.target.value)}
            rows={3}
            placeholder="Short description shown on menu card"
            className={`${formStyles.input} resize-none`}
            disabled={disabled}
          />
        </div>

        <div>
          <label className={formStyles.label} htmlFor="menu-image">
            Image URL
          </label>
          <input
            id="menu-image"
            value={form.image_url}
            onChange={(e) => field('image_url', e.target.value)}
            placeholder="https://..."
            className={formStyles.input}
            disabled={disabled}
          />

          {form.image_url && (
            <img
              src={form.image_url}
              alt="Menu preview"
              className="mt-3 h-20 w-20 rounded-lg object-cover border border-gray-100"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          )}
        </div>
      </FormSection>

      {/* ── Visibility ────────────────────────────────────────────────────── */}
      <FormSection title="Visibility">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InlineToggle
            checked={form.available}
            onChange={(v) => field('available', v)}
            label="Available to customers"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.featured}
            onChange={(v) => field('featured', v)}
            label="⭐ Featured item"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.is_vegetarian}
            onChange={(v) => field('is_vegetarian', v)}
            label="🌿 Vegetarian"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.is_vegan}
            onChange={(v) => field('is_vegan', v)}
            label="🌱 Vegan"
            disabled={disabled}
          />
          <InlineToggle
            checked={form.is_gluten_free}
            onChange={(v) => field('is_gluten_free', v)}
            label="🌾 Gluten-Free"
            disabled={disabled}
          />
        </div>
      </FormSection>

      {/* ── Details ───────────────────────────────────────────────────────── */}
      <FormSection title="Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div>
            <label className={formStyles.label} htmlFor="menu-sort">
              Sort Order
            </label>
            <input
              id="menu-sort"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) => field('sort_order', e.target.value)}
              placeholder="0"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>

          <div>
            <label className={formStyles.label} htmlFor="menu-spicy">
              Spicy Level (0–5)
            </label>
            <input
              id="menu-spicy"
              type="number"
              min="0"
              max="5"
              value={form.spicy_level}
              onChange={(e) => field('spicy_level', e.target.value)}
              placeholder="0"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>

          <div>
            <label className={formStyles.label} htmlFor="menu-inventory">
              Inventory Count
            </label>
            <input
              id="menu-inventory"
              type="number"
              min="0"
              value={form.inventory_count}
              onChange={(e) => field('inventory_count', e.target.value)}
              placeholder="Unlimited"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>

          <div>
            <label className={formStyles.label} htmlFor="menu-lowstock">
              Low Stock Threshold
            </label>
            <input
              id="menu-lowstock"
              type="number"
              min="0"
              value={form.low_stock_threshold}
              onChange={(e) => field('low_stock_threshold', e.target.value)}
              placeholder="0"
              className={formStyles.input}
              disabled={disabled}
            />
          </div>
        </div>

        <div>
          <label className={formStyles.label} htmlFor="menu-popularity">
            Popularity Score
          </label>
          <input
            id="menu-popularity"
            type="number"
            min="0"
            value={form.popularity_score}
            onChange={(e) => field('popularity_score', e.target.value)}
            placeholder="0"
            className={formStyles.input}
            disabled={disabled}
          />
          <p className="text-xs text-gray-400 mt-1">
            Used to sort popular items in the customer menu. Higher = more prominent.
          </p>
        </div>
      </FormSection>

    </div>
  )
}