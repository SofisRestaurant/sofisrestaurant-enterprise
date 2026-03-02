// src/pages/Admin/components/ModifierCard.tsx
// ============================================================================
// MODIFIER CARD
// ============================================================================
// Renders a single modifier row within a modifier group in the admin.
// Shows name, price, availability toggle, edit and delete actions.
// ============================================================================

import { InlineToggle }          from '@/components/ui/InlineToggle'
import { DragHandle }            from '@/components/ui/DragHandle'
import { PricingEngine }         from '@/domain/pricing/pricing.engine'

import type { AdminModifier } from '@/types/admin-menu'

interface ModifierCardProps {
  modifier: AdminModifier
  onEdit: (modifier: AdminModifier) => void
  onDelete: (modifier: AdminModifier) => void
  onToggleAvailable: (modifier: AdminModifier, available: boolean) => void
  draggable?: boolean
  saving?: boolean
}

export function ModifierCard({
  modifier,
  onEdit,
  onDelete,
  onToggleAvailable,
  draggable = false,
  saving = false,
}: ModifierCardProps) {
  const priceLabel =
    modifier.price_adjustment === 0
      ? 'No charge'
      : modifier.price_adjustment > 0
        ? `+${PricingEngine.formatPrice(modifier.price_adjustment)}`
        : PricingEngine.formatPrice(modifier.price_adjustment)

  return (
    <div
      className={[
        'flex items-center gap-3 px-4 py-3 bg-white border border-gray-100 rounded-lg',
        modifier.available ? '' : 'opacity-50',
      ].filter(Boolean).join(' ')}
    >
      {/* Drag handle */}
      {draggable && <DragHandle />}

      {/* Name + price */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-800 truncate block">
          {modifier.name}
        </span>
        <span
          className={[
            'text-xs font-mono',
            modifier.price_adjustment === 0
              ? 'text-gray-400'
              : modifier.price_adjustment > 0
                ? 'text-emerald-600'
                : 'text-red-500',
          ].join(' ')}
        >
          {priceLabel}
        </span>
      </div>

      {/* Availability toggle */}
      <InlineToggle
        checked={modifier.available}
        onChange={(v) => onToggleAvailable(modifier, v)}
        label="Available"
        hideLabel
        disabled={saving}
      />

      {/* Edit */}
      <button
        onClick={() => onEdit(modifier)}
        disabled={saving}
        className="text-xs text-blue-600 hover:underline disabled:opacity-40"
        aria-label={`Edit ${modifier.name}`}
      >
        Edit
      </button>

      {/* Delete */}
      <button
        onClick={() => onDelete(modifier)}
        disabled={saving}
        className="text-xs text-red-500 hover:underline disabled:opacity-40"
        aria-label={`Delete ${modifier.name}`}
      >
        Delete
      </button>
    </div>
  )
}