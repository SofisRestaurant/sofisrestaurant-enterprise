// src/components/ui/AsyncButton.tsx
// ============================================================================
// ASYNC BUTTON
// ============================================================================
// Button with built-in loading, success, and error states.
// Prevents double-submit. Consistent with the amber/black admin design.
// ============================================================================

import { type ButtonHTMLAttributes, type ReactNode } from 'react'

type AsyncButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type AsyncButtonSize    = 'sm' | 'md' | 'lg'

interface AsyncButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children:    ReactNode
  loading?:    boolean
  loadingText?: string
  variant?:    AsyncButtonVariant
  size?:       AsyncButtonSize
  fullWidth?:  boolean
  icon?:       ReactNode
}

const variantClass: Record<AsyncButtonVariant, string> = {
  primary:   'bg-black text-white hover:opacity-90 disabled:opacity-40',
  secondary: 'border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40',
  danger:    'bg-red-600 text-white hover:bg-red-700 disabled:opacity-40',
  ghost:     'text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40',
}

const sizeClass: Record<AsyncButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2 text-sm',
  lg: 'px-7 py-3 text-base',
}

export function AsyncButton({
  children,
  loading = false,
  loadingText,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  disabled,
  className = '',
  ...rest
}: AsyncButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition select-none',
        variantClass[variant],
        sizeClass[size],
        fullWidth ? 'w-full' : '',
        'disabled:cursor-not-allowed',
        className,
      ].filter(Boolean).join(' ')}
    >
      {loading ? (
        <>
          <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
          {loadingText ?? children}
        </>
      ) : (
        <>
          {icon && <span className="shrink-0">{icon}</span>}
          {children}
        </>
      )}
    </button>
  )
}