// src/components/ui/FormSection.tsx

import { type ReactNode } from 'react'

interface FormSectionProps {
  title?: string
  description?: string
  children: ReactNode
  divided?: boolean
  className?: string
  compact?: boolean
}

export function FormSection({
  title,
  description,
  children,
  divided = false,
  className = '',
  compact = false,
}: FormSectionProps) {
  return (
    <div
      className={[
        divided ? 'border-b border-gray-100 pb-5 mb-5' : '',
        compact ? 'space-y-3' : 'space-y-4',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {(title || description) && (
        <div className="mb-1">
          {title && (
            <h3 className="text-sm font-semibold text-gray-800">
              {title}
            </h3>
          )}
          {description && (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </div>
  )
}

interface FormFieldProps {
  label: string
  required?: boolean
  error?: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}

export function FormField({
  label,
  required = false,
  error,
  hint,
  children,
  htmlFor,
}: FormFieldProps) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>

      {children}

      {hint && !error && (
        <p className="text-xs text-gray-400 mt-1">{hint}</p>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>
      )}
    </div>
  )
}