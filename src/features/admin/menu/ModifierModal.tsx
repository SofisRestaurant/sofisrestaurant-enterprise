// src/pages/Admin/components/ModifierModal.tsx
// ============================================================================
// MODIFIER MODAL
// ============================================================================
// Create or edit a single modifier (name, price_adjustment, available, sort_order).
// Schema: modifiers table — confirmed columns Feb 2026.
// ============================================================================

import { useState, useEffect }   from 'react'
import { ModalShell }            from '@/components/ui/ModalShell'
import { AsyncButton }           from '@/components/ui/AsyncButton'
import { ErrorBanner }           from '@/components/ui/ErrorBanner'
import { FormSection,} from '@/components/ui/FormSection'
import { InlineToggle }          from '@/components/ui/InlineToggle'
import type { AdminModifier, ModifierWritePayload } from '@/types/admin-menu'
import { validateModifierPayload } from '@/domain/menu/modifier.schema'
import { PricingEngine }         from '@/domain/pricing/pricing.engine'
import { formStyles } from '@/components/ui/formStyles'
// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

interface ModifierFormState {
  name:             string
  price_adjustment: string
  available:        boolean
  sort_order:       string
}

const EMPTY: ModifierFormState = {
  name:             '',
  price_adjustment: '0',
  available:        true,
  sort_order:       '0',
}

function toForm(m: AdminModifier): ModifierFormState {
  return {
    name:             m.name,
    price_adjustment: m.price_adjustment.toString(),
    available:        m.available,
    sort_order:       m.sort_order.toString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ModifierModalProps {
  isOpen:       boolean
  onClose:      () => void
  onSave:       (payload: Omit<ModifierWritePayload, 'modifier_group_id'>) => Promise<void>
  editing?:     AdminModifier | null
  groupName?:   string
}

export function ModifierModal({
  isOpen,
  onClose,
  onSave,
  editing,
  groupName,
}: ModifierModalProps) {
  const [form,  setForm]  = useState<ModifierFormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset when modal opens
  useEffect(() => {
    if (!isOpen) return
    setForm(editing ? toForm(editing) : EMPTY)
    setError(null)
  }, [isOpen, editing])

  function field<K extends keyof ModifierFormState>(key: K, value: ModifierFormState[K]) {
    setForm((p) => ({ ...p, [key]: value }))
  }

  const priceNum = parseFloat(form.price_adjustment)
  const priceLabel = isNaN(priceNum) || priceNum === 0
    ? 'No price change'
    : priceNum > 0
      ? `Customer pays +${PricingEngine.formatPrice(priceNum)}`
      : `Discount of ${PricingEngine.formatPrice(Math.abs(priceNum))}`

  function buildPayload(): Omit<ModifierWritePayload, 'modifier_group_id'> {
    return {
      name:             form.name.trim(),
      price_adjustment: isNaN(priceNum) ? 0 : priceNum,
      available:        form.available,
      sort_order:       parseInt(form.sort_order, 10) || 0,
    }
  }

  function isValid(): boolean {
    const p = buildPayload()
    const v = validateModifierPayload(p)
    return v.valid
  }

  async function handleSave() {
    const payload = buildPayload()
    const v = validateModifierPayload(payload)
    if (!v.valid) {
      const msgs = Object.values(v.errors).filter(Boolean)
      setError(msgs[0] ?? 'Invalid input')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      maxWidth="max-w-sm"
      label={editing ? 'Edit option' : 'Add option'}
    >
      <div className="bg-white rounded-2xl p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {editing ? 'Edit Option' : 'Add Option'}
          </h2>
          {groupName && (
            <p className="text-xs text-gray-400 mt-0.5">Group: {groupName}</p>
          )}
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <FormSection className="space-y-4">
          {/* Name */}
          <div>
            <label className={formStyles.label}>Option Name *</label>
            <input
              value={form.name}
              onChange={(e) => field('name', e.target.value)}
              placeholder="e.g. Extra Cheese"
              className={formStyles.input}
              autoFocus
            />
          </div>

          {/* Price adjustment */}
          <div>
            <label className={formStyles.label}>Price Adjustment (USD)</label>
            <input
              type="number"
              step="0.01"
              value={form.price_adjustment}
              onChange={(e) => field('price_adjustment', e.target.value)}
              placeholder="0.00"
              className={formStyles.input}
            />
            <p className={['text-xs mt-1', isNaN(priceNum) ? 'text-red-500' : 'text-gray-400'].join(' ')}>
              {priceLabel}
            </p>
          </div>

          {/* Sort order */}
          <div>
            <label className={formStyles.label}>Sort Order</label>
            <input
              type="number"
              min="0"
              value={form.sort_order}
              onChange={(e) => field('sort_order', e.target.value)}
              placeholder="0"
              className={formStyles.input}
            />
          </div>

          {/* Available toggle */}
          <InlineToggle
            checked={form.available}
            onChange={(v) => field('available', v)}
            label="Available to customers"
          />
        </FormSection>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <AsyncButton variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </AsyncButton>
          <AsyncButton
            variant="primary"
            size="sm"
            loading={saving}
            loadingText="Saving..."
            disabled={!isValid()}
            onClick={handleSave}
          >
            {editing ? 'Save Changes' : 'Add Option'}
          </AsyncButton>
        </div>
      </div>
    </ModalShell>
  )
}