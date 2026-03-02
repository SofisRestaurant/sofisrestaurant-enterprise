// src/pages/Admin/components/ModifierTemplateLibrary.tsx
// ============================================================================
// MODIFIER TEMPLATE LIBRARY
// ============================================================================
// Browse built-in modifier templates (Protein Choice, Size, Sauces, etc.)
// and apply them to the current menu item with one click.
//
// Templates are defined in modifier.constants.ts.
// Application is handled by ModifierTemplateService.applyToMenuItem().
// ============================================================================

import { useState }                  from 'react'
import { AsyncButton }               from '@/components/ui/AsyncButton'
import { ErrorBanner }               from '@/components/ui/ErrorBanner'
import { MODIFIER_TEMPLATES, TEMPLATE_CATEGORIES } from '@/domain/menu/modifier.constants'
import type { ModifierTemplate }     from '@/types/admin-menu'
import { PricingEngine }             from '@/domain/pricing/pricing.engine'

interface ModifierTemplateLibraryProps {
  onApply:       (templateId: string) => Promise<void>
  appliedIds?:   string[]    // template IDs already applied to this item
  disabled?:     boolean
}

export function ModifierTemplateLibrary({
  onApply,
  appliedIds = [],
  disabled = false,
}: ModifierTemplateLibraryProps) {
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [applyingId,     setApplyingId]     = useState<string | null>(null)
  const [error,          setError]          = useState<string | null>(null)
  const [justApplied,    setJustApplied]    = useState<Set<string>>(new Set())

  const filtered: ModifierTemplate[] =
    activeCategory === 'all'
      ? MODIFIER_TEMPLATES
      : MODIFIER_TEMPLATES.filter((t) => t.category === activeCategory)

  async function handleApply(template: ModifierTemplate) {
    if (applyingId || disabled) return
    setApplyingId(template.id)
    setError(null)
    try {
      await onApply(template.id)
      setJustApplied((p) => new Set(p).add(template.id))
      // Clear success flash after 3s
      setTimeout(() => {
        setJustApplied((p) => {
          const next = new Set(p)
          next.delete(template.id)
          return next
        })
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply template')
    } finally {
      setApplyingId(null)
    }
  }

  const allModifierCount = (t: ModifierTemplate) => t.modifiers.length
  const priceRange = (t: ModifierTemplate) => {
    const prices = t.modifiers.map((m) => m.price_adjustment)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    if (min === 0 && max === 0) return 'Free'
    if (min === max) return `+${PricingEngine.formatPrice(max)}`
    return `+${PricingEngine.formatPrice(min)} – +${PricingEngine.formatPrice(max)}`
  }

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Category filter tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={[
            'px-3 py-1.5 rounded-full text-xs font-medium transition',
            activeCategory === 'all'
              ? 'bg-black text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          ].join(' ')}
        >
          All ({MODIFIER_TEMPLATES.length})
        </button>
        {TEMPLATE_CATEGORIES.map((cat) => {
          const count = MODIFIER_TEMPLATES.filter((t) => t.category === cat).length
          if (!count) return null
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium capitalize transition',
                activeCategory === cat
                  ? 'bg-black text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              {cat} ({count})
            </button>
          )
        })}
      </div>

      {/* Template grid */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">No templates in this category.</p>
        )}

        {filtered.map((template) => {
          const alreadyApplied = appliedIds.includes(template.id)
          const wasJustApplied = justApplied.has(template.id)
          const isLoading      = applyingId === template.id

          return (
            <div
              key={template.id}
              className={[
                'flex items-start gap-4 p-4 border rounded-xl transition-all',
                alreadyApplied
                  ? 'border-green-200 bg-green-50'
                  : wasJustApplied
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-gray-200 bg-white hover:border-gray-300',
              ].join(' ')}
            >
              {/* Template icon */}
              <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-lg shrink-0">
                {template.icon ?? '🎛'}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-gray-900">{template.group.name}</span>
                  <span className="text-xs text-gray-400 capitalize">{template.group.type}</span>
                  {template.group.required && (
                    <span className="text-xs text-amber-600 font-medium">Required</span>
                  )}
                  {alreadyApplied && (
                    <span className="text-xs text-green-600 font-medium">✓ Applied</span>
                  )}
                </div>
                {template.description && (
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{template.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  {allModifierCount(template)} options · {priceRange(template)}
                </p>
                {/* Option preview */}
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {template.modifiers.slice(0, 4).map((m) => m.name).join(', ')}
                  {template.modifiers.length > 4 && ` + ${template.modifiers.length - 4} more`}
                </p>
              </div>

              {/* Apply button */}
              <AsyncButton
                variant={wasJustApplied ? 'secondary' : 'primary'}
                size="sm"
                loading={isLoading}
                loadingText="Applying..."
                disabled={disabled || !!applyingId}
                onClick={() => handleApply(template)}
              >
                {wasJustApplied ? '✓ Applied' : alreadyApplied ? 'Apply Again' : 'Apply'}
              </AsyncButton>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        Templates create a new group with pre-configured options. You can edit them after applying.
      </p>
    </div>
  )
}