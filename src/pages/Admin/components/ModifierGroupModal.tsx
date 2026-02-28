// src/pages/Admin/components/ModifierGroupModal.tsx
// ============================================================================
// MODIFIER GROUP MODAL
// ============================================================================
// Create or edit a modifier group.
// Covers all modifier_groups table columns.
// Validated against modifier.schema.ts before save.
// ============================================================================

import { useState, useEffect } from 'react'
import { ModalShell } from '@/components/ui/ModalShell'
import { AsyncButton } from '@/components/ui/AsyncButton'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { InlineToggle } from '@/components/ui/InlineToggle'
import { FormSection, FormField } from '@/components/ui/FormSection'
import { formStyles } from '@/components/ui/formStyles'

import type {
  AdminModifierGroup,
  ModifierGroupWritePayload,
} from '@/types/admin-menu'

import { MODIFIER_GROUP_TYPES } from '@/domain/menu/modifier.constants'
import { validateModifierGroupPayload } from '@/domain/menu/modifier.schema'
import type { ModifierGroupType } from '@/domain/menu/menu.types'

// ─────────────────────────────────────────────────────────────────────────────
// Form State
// ─────────────────────────────────────────────────────────────────────────────

interface GroupFormState {
  name: string
  description: string
  type: ModifierGroupType
  required: boolean
  min_selections: string
  max_selections: string
  sort_order: string
  active: boolean
}

const EMPTY: GroupFormState = {
  name: '',
  description: '',
  type: 'radio',
  required: false,
  min_selections: '0',
  max_selections: '',
  sort_order: '0',
  active: true,
}

function toForm(g: AdminModifierGroup): GroupFormState {
  return {
    name: g.name,
    description: g.description ?? '',
    type: g.type,
    required: g.required,
    min_selections: g.min_selections.toString(),
    max_selections:
      g.max_selections !== null ? g.max_selections.toString() : '',
    sort_order: g.sort_order.toString(),
    active: (g as { active?: boolean }).active !== false,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface ModifierGroupModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (payload: ModifierGroupWritePayload) => Promise<void>
  editing?: AdminModifierGroup | null
}

export function ModifierGroupModal({
  isOpen,
  onClose,
  onSave,
  editing,
}: ModifierGroupModalProps) {
  const [form, setForm] = useState<GroupFormState>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setForm(editing ? toForm(editing) : EMPTY)
    setError(null)
  }, [isOpen, editing])

  function field<K extends keyof GroupFormState>(
    key: K,
    value: GroupFormState[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function buildPayload(): ModifierGroupWritePayload {
    const minNum = parseInt(form.min_selections, 10)
    const maxRaw = form.max_selections.trim()

    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      required: form.required,
      min_selections: isNaN(minNum) ? 0 : Math.max(0, minNum),
      max_selections: maxRaw ? parseInt(maxRaw, 10) || null : null,
      sort_order: parseInt(form.sort_order, 10) || 0,
      active: form.active,
    }
  }

  function getValidation() {
    return validateModifierGroupPayload(buildPayload())
  }

  async function handleSave() {
    const validation = getValidation()

    if (!validation.valid) {
      const firstError = Object.values(validation.errors).find(Boolean)
      setError(firstError ?? 'Invalid configuration')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave(buildPayload())
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group')
    } finally {
      setSaving(false)
    }
  }

  const validation = getValidation()
  const errs = validation.errors
  const isRadio = form.type === 'radio'

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={saving ? () => {} : onClose}
      maxWidth="max-w-md"
      label={editing ? 'Edit modifier group' : 'Add modifier group'}
    >
      <div className="bg-white rounded-2xl p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">
            {editing ? 'Edit Modifier Group' : 'New Modifier Group'}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Configure selection behavior and constraints.
          </p>
        </div>

        <ErrorBanner message={error} onDismiss={() => setError(null)} />

        <div className="space-y-6">
          {/* ── Basic Info ───────────────────────────────────────────── */}
          <FormSection title="Basic Info">
            <FormField
              label="Group Name"
              required
              error={errs.name}
            >
              <input
                value={form.name}
                onChange={(e) => field('name', e.target.value)}
                className={
                  errs.name
                    ? formStyles.inputError
                    : formStyles.input
                }
                autoFocus
              />
            </FormField>

            <FormField label="Description">
              <input
                value={form.description}
                onChange={(e) => field('description', e.target.value)}
                className={formStyles.input}
              />
            </FormField>
          </FormSection>

          {/* ── Selection Type ───────────────────────────────────────── */}
          <FormSection title="Selection Type">
            <FormField label="Type" required error={errs.type}>
              <select
                value={form.type}
                onChange={(e) =>
                  field('type', e.target.value as ModifierGroupType)
                }
                className={formStyles.select}
              >
                {MODIFIER_GROUP_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </FormField>

            <InlineToggle
              checked={form.required}
              onChange={(v) => field('required', v)}
              label="Required — customer must select"
            />
          </FormSection>

          {/* ── Limits ───────────────────────────────────────────────── */}
          {!isRadio && (
            <FormSection title="Selection Limits">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Min Selections"
                  error={errs.min_selections}
                >
                  <input
                    type="number"
                    min="0"
                    value={form.min_selections}
                    onChange={(e) =>
                      field('min_selections', e.target.value)
                    }
                    className={
                      errs.min_selections
                        ? formStyles.inputError
                        : formStyles.input
                    }
                  />
                </FormField>

                <FormField
                  label="Max Selections"
                  error={errs.max_selections}
                >
                  <input
                    type="number"
                    min="1"
                    value={form.max_selections}
                    onChange={(e) =>
                      field('max_selections', e.target.value)
                    }
                    className={
                      errs.max_selections
                        ? formStyles.inputError
                        : formStyles.input
                    }
                  />
                </FormField>
              </div>
            </FormSection>
          )}

          {/* ── Display Settings ─────────────────────────────────────── */}
          <FormSection title="Display">
            <FormField label="Sort Order">
              <input
                type="number"
                min="0"
                value={form.sort_order}
                onChange={(e) =>
                  field('sort_order', e.target.value)
                }
                className={formStyles.input}
              />
            </FormField>

            <InlineToggle
              checked={form.active}
              onChange={(v) => field('active', v)}
              label="Active — visible to customers"
            />
          </FormSection>
        </div>

        <div className="flex justify-end gap-3 mt-8 pt-5 border-t border-gray-100">
          <AsyncButton
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </AsyncButton>

          <AsyncButton
            variant="primary"
            size="sm"
            loading={saving}
            loadingText="Saving..."
            disabled={!validation.valid}
            onClick={handleSave}
          >
            {editing ? 'Save Changes' : 'Create Group'}
          </AsyncButton>
        </div>
      </div>
    </ModalShell>
  )
}