// src/components/ui/InlineToggle.tsx
// ============================================================================
// INLINE TOGGLE
// ============================================================================
// Accessible toggle switch for boolean fields.
// Used for: active/inactive, available/unavailable, required/optional.
// ============================================================================

interface InlineToggleProps {
  checked:     boolean
  onChange:    (checked: boolean) => void
  label:       string
  description?: string
  disabled?:   boolean
  size?:       'sm' | 'md'
  id?:         string
  /** When true, the label text is visually hidden (sr-only) but still accessible */
  hideLabel?:  boolean
}

export function InlineToggle({
  checked,
  onChange,
  label,
  description,
  disabled  = false,
  size      = 'md',
  id,
  hideLabel = false,
}: InlineToggleProps) {
  const toggleId = id ?? `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`

  const trackSize = size === 'sm'
    ? 'h-5 w-9'
    : 'h-6 w-11'
  const thumbSize = size === 'sm'
    ? 'h-3.5 w-3.5 translate-x-0.5'
    : 'h-4 w-4 translate-x-1'
  const thumbChecked = size === 'sm'
    ? 'translate-x-[1.15rem]'
    : 'translate-x-[1.375rem]'

  return (
    <label
      htmlFor={toggleId}
      className={[
        'flex items-center gap-3 cursor-pointer select-none',
        disabled ? 'opacity-50 cursor-not-allowed' : '',
      ].filter(Boolean).join(' ')}
    >
      {/* Track */}
      <div className="relative shrink-0">
        <input
          id={toggleId}
          type="checkbox"
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
        <div className={[
          trackSize,
          'rounded-full transition-colors duration-200',
          checked ? 'bg-amber-500' : 'bg-gray-200',
        ].join(' ')} />
        <div className={[
          thumbSize,
          'absolute top-1/2 -translate-y-1/2 rounded-full bg-white shadow-sm',
          'transition-transform duration-200',
          checked ? thumbChecked : '',
        ].join(' ')} />
      </div>

      {/* Label */}
      <div className={hideLabel ? 'sr-only' : undefined}>
        <span className="text-sm font-medium text-gray-800">{label}</span>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
    </label>
  )
}