import { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from '@/i18n/useTranslation';
import type { TranslationKey } from '@/i18n';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'glass';
  size?: 'sm' | 'md' | 'lg' | 'xl';

  children?: ReactNode;

  labelKey?: TranslationKey;

  isLoading?: boolean;

  icon?: ReactNode;
  iconPosition?: 'left' | 'right';

  ariaLabel?: string;

  className?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  children,
  labelKey,
  isLoading = false,
  icon,
  iconPosition = 'left',
  className = '',
  disabled,
  ariaLabel,
  type = 'button',
  ...props
}: ButtonProps) {
  const { t } = useTranslation();

  const baseStyles = `
    inline-flex items-center justify-center gap-2
    font-semibold tracking-tight
    transition-all duration-200
    ease-(--ease-standard)
    focus:outline-none
    focus-visible:ring-4
    focus-visible:ring-(--color-gold-400)/30
    disabled:opacity-50 disabled:cursor-not-allowed
    relative
  `;

  const variants: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary: `
      relative
      bg-linear-to-r
      from-(--color-gold-400)
      to-(--color-gold-300)
      text-black
      font-semibold tracking-tight
      rounded-xl
      px-5 py-3
      shadow-[0_4px_14px_rgba(0,0,0,0.15)]
      transition-all duration-200 ease-(--ease-luxury)
      hover:shadow-[0_6px_20px_rgba(0,0,0,0.22)]
      hover:brightness-105
      active:scale-[0.97]
      active:shadow-[0_2px_8px_rgba(0,0,0,0.18)]
      focus-visible:ring-4
      focus-visible:ring-(--color-gold-400)/30
      disabled:opacity-50
      disabled:cursor-not-allowed
    `,
    secondary: `
      bg-(--btn-secondary-bg)
      text-(--btn-secondary-text)
      border border-(--btn-secondary-border)
      hover:brightness-105
      active:scale-[0.98]
    `,
    outline: `
      border border-(--btn-outline-border)
      text-(--btn-outline-text)
      bg-transparent
      hover:bg-(--btn-outline-border)/10
      active:scale-[0.98]
    `,
    danger: `
      bg-(--btn-danger-bg)
      text-(--btn-danger-text)
      hover:brightness-110
      active:scale-[0.98]
    `,
    glass: `
      bg-(--btn-glass-bg)
      backdrop-blur
      border border-(--btn-glass-border)
      text-(--text-primary)
      hover:brightness-110
      active:scale-[0.98]
    `,
  };

  const sizes: Record<NonNullable<ButtonProps['size']>, string> = {
    sm: 'px-3 py-1.5 text-sm rounded-md',
    md: 'px-5 py-2.5 text-base rounded-lg',
    lg: 'px-7 py-3.5 text-lg rounded-xl',
    xl: 'px-9 py-4 text-xl rounded-2xl',
  };

  const content = labelKey ? t(labelKey) : children;

  return (
    <button
      type={type}
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      aria-disabled={disabled || isLoading}
      aria-label={ariaLabel || (typeof content === 'string' ? content : undefined)}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center gap-2">
          <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24" aria-hidden="true">
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

          <span aria-live="polite">{t('button.loading')}</span>
        </div>
      ) : (
        <>
          {icon && iconPosition === 'left' && <span aria-hidden="true">{icon}</span>}

          <span>{content}</span>

          {icon && iconPosition === 'right' && <span aria-hidden="true">{icon}</span>}
        </>
      )}
    </button>
  );
}

export default Button;