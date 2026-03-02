/* eslint-disable react-refresh/only-export-components */

import type { CSSProperties, ComponentPropsWithoutRef, ReactNode } from 'react'
import clsx from 'clsx'

// ======================================================
// TOKENS
// ======================================================

export const MONO = {
  label: 'font-mono text-[11px] tracking-[0.16em] uppercase',
  value: 'font-mono tabular-nums',
} as const

export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: '#020617',
  border: '1px solid #1f2937',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 11,
  color: '#e5e7eb',
}

// ======================================================
// PANEL
// ======================================================

export interface PanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  title?: ReactNode
  subtitle?: ReactNode
  error?: boolean
  actions?: ReactNode
  noPad?: boolean
  className?: string
  children: ReactNode
}

export function Panel({
  title,
  subtitle,
  error,
  actions,
  noPad = false,
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <section
      className={clsx(
        'rounded-2xl border border-zinc-800 bg-[#050509] shadow-[0_0_0_1px_rgba(15,23,42,0.9)]',
        className,
      )}
      {...rest}
    >
      {(title || subtitle || typeof error !== 'undefined' || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-3">
          <div>
            {title && (
              <h2 className="text-xs font-semibold tracking-[0.16em] uppercase text-zinc-400">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-0.5 text-[11px] text-zinc-500">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-3">
            {typeof error !== 'undefined' && (
              <span
                className={clsx(
                  'inline-flex h-2 w-2 rounded-full',
                  error
                    ? 'bg-red-500 shadow-[0_0_0_4px_rgba(248,113,113,0.35)]'
                    : 'bg-emerald-400',
                )}
                aria-hidden="true"
              />
            )}
            {actions && <div className="flex items-center gap-2 text-xs text-zinc-400">{actions}</div>}
          </div>
        </header>
      )}

      <div className={noPad ? '' : 'px-4 py-3'}>{children}</div>
    </section>
  )
}

// ======================================================
// STAT CARD
// ======================================================

// IMPORTANT: omit native HTML `title` attribute because we use `title` as ReactNode.
type StatCardDivProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'>

export interface StatCardProps extends StatCardDivProps {
  title: ReactNode
  value: ReactNode
  icon?: ReactNode
  color?: string
  subtitle?: ReactNode
}

export function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
  className,
  ...props
}: StatCardProps) {
  return (
    <div
      {...props}
      className={clsx('rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 shadow-sm', className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{title}</div>

          <div className="mt-2 text-2xl font-black text-zinc-100 tabular-nums">{value}</div>

          {subtitle ? <div className="mt-1 text-xs text-zinc-500">{subtitle}</div> : null}
        </div>

        {icon ? (
          <div
            className={clsx(
              'shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-lg',
              color ? '' : '',
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ======================================================
// METRIC GRID
// ======================================================

export interface MetricGridProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode
  columns?: 1 | 2 | 3 | 4
}

export function MetricGrid({ children, columns = 3, className, ...rest }: MetricGridProps) {
  const colClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : columns === 3
          ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'

  return (
    <div className={clsx('grid gap-4', colClass, className)} {...rest}>
      {children}
    </div>
  )
}

// ======================================================
// ALERT
// ======================================================

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

export interface AlertProps extends ComponentPropsWithoutRef<'div'> {
  tone?: AlertTone
  title?: string
  message: string
  action?: ReactNode
}

export function Alert({ tone = 'info', title, message, action, className, ...rest }: AlertProps) {
  const toneClasses: Record<AlertTone, string> = {
    info: 'border-sky-500/25 bg-sky-500/10 text-sky-100',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
    danger: 'border-red-500/25 bg-red-500/10 text-red-100',
  }

  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs',
        toneClasses[tone],
        className,
      )}
      {...rest}
    >
      <div>
        {title ? (
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] opacity-80">{title}</p>
        ) : null}
        <p className="mt-0.5 text-[12px] leading-snug">{message}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

// ======================================================
// LOADING SPINNER
// ======================================================

export interface LoadingSpinnerProps extends ComponentPropsWithoutRef<'div'> {
  size?: 'sm' | 'md' | 'lg'
}

export function LoadingSpinner({ size = 'md', className, ...rest }: LoadingSpinnerProps) {
  const dimension =
    size === 'sm'
      ? 'h-4 w-4 border-2'
      : size === 'lg'
        ? 'h-10 w-10 border-4'
        : 'h-6 w-6 border-[3px]'

  return (
    <div className={clsx('inline-flex items-center justify-center', className)} {...rest}>
      <span
        className={clsx('animate-spin rounded-full border-zinc-700 border-t-transparent', dimension)}
        aria-label="Loading"
      />
    </div>
  )
}
export type ProgressColor = 'neutral' | 'success' | 'warning' | 'danger' | 'primary'

export function ProgressBar(props: {
  value: number
  max?: number
  label?: string
  showPercentage?: boolean
  color?: ProgressColor
}) {
  const max = props.max ?? 100
  const pct = max > 0 ? (props.value / max) * 100 : 0
  const clamped = Math.max(0, Math.min(100, pct))

  return (
    <div className="w-full">
      {props.label ? (
        <div className="mb-1 flex items-center justify-between text-xs opacity-80">
          <span>{props.label}</span>
          {props.showPercentage ? <span>{Math.round(clamped)}%</span> : null}
        </div>
      ) : null}

      <div className="h-2 w-full rounded bg-white/10">
        <div className="h-2 rounded bg-white/60" style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}
// ======================================================
// KPI CARD (upgraded for SofisRestaurantV2)
// - Accepts either simple trend ('up'|'down'|'flat') OR TrendMeta-like objects
// - Safe runtime normalization (no any required)
// ======================================================

type TrendLike =
  | 'up'
  | 'down'
  | 'flat'
  | {
      up?: boolean
      direction?: 'up' | 'down' | 'flat'
      trend?: 'up' | 'down' | 'flat'
      value?: number
      percent?: number
      label?: string
    }

function normalizeTrend(input: unknown): 'up' | 'down' | 'flat' {
  if (input === 'up' || input === 'down' || input === 'flat') return input

  if (input && typeof input === 'object') {
    const r = input as Record<string, unknown>

    const dir =
      (typeof r['direction'] === 'string' ? r['direction'] : undefined) ??
      (typeof r['trend'] === 'string' ? r['trend'] : undefined)

    if (dir === 'up' || dir === 'down' || dir === 'flat') return dir

    const up = r['up']
    if (typeof up === 'boolean') return up ? 'up' : 'down'
  }

  return 'flat'
}

export interface KPICardProps {
  label: string
  value: ReactNode
  sub?: string
  accent?: AccentColor
  hint?: string
  delta?: string
  trend?: TrendLike
  helperText?: string
  className?: string
}

export function KPICard({
  label,
  value,
  sub,
  accent = 'amber',
  trend,
  hint,
  helperText,
  className,
}: KPICardProps) {
  const accentMap: Record<AccentColor, string> = {
    amber: 'border-amber-500/40 bg-amber-500/5',
    emerald: 'border-emerald-500/40 bg-emerald-500/5',
    sky: 'border-sky-500/40 bg-sky-500/5',
    red: 'border-red-500/40 bg-red-500/5',
    slate: 'border-slate-500/40 bg-slate-500/5',
    blue: 'border-sky-500/40 bg-sky-500/5',
    violet: 'border-violet-500/40 bg-violet-500/5',
    rose: 'border-rose-500/40 bg-rose-500/5',
  }

  const t = normalizeTrend(trend)

  const trendIcon = t === 'up' ? '▲' : t === 'down' ? '▼' : '◆'
  const trendColor = t === 'up' ? 'text-emerald-400' : t === 'down' ? 'text-red-400' : 'text-slate-400'

  return (
    <div
      className={clsx(
        'flex flex-col justify-between rounded-2xl border px-4 py-3 md:px-5 md:py-4',
        'border-gray-800 bg-gray-950/60 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]',
        accentMap[accent],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-400">
            {label}
          </div>
          <div className={clsx('mt-1 text-xl font-semibold text-gray-50 md:text-2xl', MONO.value)}>
            {value}
          </div>
          {sub ? <div className="mt-1 text-xs text-gray-400">{sub}</div> : null}
        </div>

        {hint ? (
          <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] text-gray-400">
            {hint}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        {helperText ? <span>{helperText}</span> : <span />}
        <span className={clsx('inline-flex items-center gap-1', trendColor)}>
          <span className="text-[10px]">{trendIcon}</span>
          <span className="text-[10px] uppercase tracking-[0.16em]">
            {t === 'up' ? 'UP' : t === 'down' ? 'DOWN' : 'FLAT'}
          </span>
        </span>
      </div>
    </div>
  )
}
// ======================================================
// HEALTH BAR
// ======================================================

export interface HealthBarProps {
  label: string
  value: number // 0–100
  variant?: 'good' | 'warn' | 'bad'
  helperText?: string
}

export function HealthBar({ label, value, variant = 'good', helperText }: HealthBarProps) {
  const clamped = Math.max(0, Math.min(100, value))
  const color = variant === 'good' ? 'bg-emerald-500' : variant === 'warn' ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span className={MONO.value}>{clamped.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div className={clsx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${clamped}%` }} />
      </div>
      {helperText ? <div className="text-[11px] text-gray-500">{helperText}</div> : null}
    </div>
  )
}
export interface SkeletonBlockProps {
  className?: string
  height?: number | string
  width?: number | string
}

export function SkeletonBlock({ className, height, width }: SkeletonBlockProps) {
  return (
    <div
      className={clsx('animate-pulse rounded-xl bg-gray-800/60', className)}
      style={{ height: height ?? undefined, width: width ?? undefined }}
    />
  )
}

export interface SkeletonGridProps {
  rows?: number
  columns?: number
  cols?: number // backward-compat
  height?: number | string
  className?: string
}

export function SkeletonGrid({
  rows = 2,
  columns,
  cols,
  height,
  className,
}: SkeletonGridProps) {
  const colsCount = columns ?? cols ?? 2
  const count = Math.max(0, rows) * Math.max(0, colsCount)

  return (
    <div
      className={clsx('grid gap-3', className)}
      style={{ gridTemplateColumns: `repeat(${colsCount}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: count }, (_, i) => (
        // Skeleton placeholders are a safe exception for index keys:
        // non-interactive, fixed order, no local state.
        <SkeletonBlock key={`sk_${i}`} className="h-8" height={height} />
      ))}
    </div>
  )
}

export interface EmptyChartProps {
  message?: string
}

export function EmptyChart({ message = 'No data available yet' }: EmptyChartProps) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-950/40">
      <span className="mb-2 text-xl">📉</span>
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}
export function Table(props: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table {...props} className={`w-full text-sm ${props.className ?? ''}`} />
    </div>
  )
}
// ======================================================
// BADGE
// ======================================================

export interface BadgeProps {
  children?: ReactNode
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  const toneClasses: Record<NonNullable<BadgeProps['tone']>, string> = {
    neutral: 'bg-gray-800 text-gray-200 border-gray-700',
    success: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60',
    warning: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
    danger: 'bg-red-900/40 text-red-300 border-red-700/60',
    info: 'bg-sky-900/40 text-sky-300 border-sky-700/60',
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
        'tracking-[0.08em] uppercase',
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
export const ACCENT = {
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  red: 'text-red-400',
  slate: 'text-slate-300',

  // Back-compat aliases used by older admin pages:
  blue: 'text-sky-400',
  violet: 'text-violet-400',
  rose: 'text-rose-400',
} as const

export type AccentColor = keyof typeof ACCENT

// ======================================================
// EMPTY STATE + SKELETONS
// ======================================================

export interface EmptyStateAction {
  label: string
  onClick: () => void
}

export interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode | EmptyStateAction
  icon?: ReactNode
}

function isEmptyStateAction(action: ReactNode | EmptyStateAction | undefined): action is EmptyStateAction {
  if (!action || typeof action !== 'object') return false
  const maybe = action as Partial<EmptyStateAction>
  return typeof maybe.label === 'string' && typeof maybe.onClick === 'function'
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 bg-gray-950/40 px-6 py-10 text-center">
      <div className="mb-3 text-3xl">{icon ?? '✨'}</div>
      <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-xs text-gray-400">{description}</p> : null}
      {action ? (
        <div className="mt-4">
          {isEmptyStateAction(action) ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black shadow-sm hover:bg-amber-400"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ) : (
            action
          )}
        </div>
      ) : null}
    </div>
  )
}

export interface SkeletonProps {
  rows?: number
  className?: string
}

export function Skeleton({ rows = 3, className }: SkeletonProps) {
  return (
    <div className={clsx('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        // eslint-disable-next-line react/no-array-index-key
        <div key={i} className="h-8 animate-pulse rounded-xl bg-gray-800/60" />
      ))}
    </div>
  )
}
