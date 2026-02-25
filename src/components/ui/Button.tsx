// src/components/ui/Button.tsx
import { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'glass'
  size?: 'sm' | 'md' | 'lg' | 'xl'
  children: ReactNode
  isLoading?: boolean
  icon?: ReactNode
  iconPosition?: 'left' | 'right'
  className?: string
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  isLoading = false,
  icon,
  iconPosition = 'left',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
 const baseStyles = `
  inline-flex items-center justify-center gap-2
  font-semibold tracking-tight
  transition-all duration-200
  ease-[var(--ease-standard)]
  focus:outline-none
  focus-visible:ring-4
  focus-visible:ring-brand/30
  disabled:opacity-50 disabled:cursor-not-allowed
  relative
`

  const variants: Record<string, string> = {
  primary: `
    bg-brand
    text-white
    shadow-brand
    hover:bg-brand-600
    hover:shadow-brand-lg
    active:scale-[0.98]
  `,

  secondary: `
    bg-surface
    text-ink-700
    border border-border
    shadow-sm
    hover:bg-surface-alt
    hover:shadow-card
    active:scale-[0.98]
  `,

  outline: `
    border border-brand
    text-brand
    bg-transparent
    hover:bg-brand/10
    active:scale-[0.98]
  `,

  danger: `
    bg-error
    text-white
    shadow-md
    hover:brightness-110
    active:scale-[0.98]
  `,

  glass: `
    bg-glass-bg
    backdrop-blur
    border border-glass-border
    text-ink-700
    shadow-sm
    hover:shadow-md
    active:scale-[0.98]
  `,
}

  const sizes: Record<string, string> = {
    sm: 'px-3 py-1.5 text-sm rounded-md',
    md: 'px-5 py-2.5 text-base rounded-lg',
    lg: 'px-7 py-3.5 text-lg rounded-xl',
    xl: 'px-9 py-4 text-xl rounded-2xl',
  }

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center gap-2">
          <svg
            className="animate-spin h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
          <span>Loading...</span>
        </div>
      ) : (
        <>
          {icon && iconPosition === 'left' && icon}
          {children}
          {icon && iconPosition === 'right' && icon}
        </>
      )}
    </button>
  )
}

export default Button