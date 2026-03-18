import type {
  CSSProperties,
  ComponentPropsWithoutRef,
  ReactNode,
  TableHTMLAttributes,
} from 'react';
import clsx from 'clsx';

// ======================================================
// TOKENS
// ======================================================

export const MONO = {
  label: 'font-mono text-[11px] tracking-[0.16em] uppercase',
  value: 'font-mono tabular-nums',
} as const;

export const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: '#020617',
  border: '1px solid #1f2937',
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 11,
  color: '#e5e7eb',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ======================================================
// PANEL
// ======================================================

export interface PanelProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  error?: boolean;
  actions?: ReactNode;
  noPad?: boolean;
  className?: string;
  children: ReactNode;
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
                  error ? 'bg-red-500 shadow-[0_0_0_4px_rgba(248,113,113,0.35)]' : 'bg-emerald-400',
                )}
                aria-hidden="true"
              />
            )}
            {actions && (
              <div className="flex items-center gap-2 text-xs text-zinc-400">{actions}</div>
            )}
          </div>
        </header>
      )}

      <div className={noPad ? '' : 'px-4 py-3'}>{children}</div>
    </section>
  );
}

// ======================================================
// STAT CARD
// ======================================================

type StatCardDivProps = Omit<ComponentPropsWithoutRef<'div'>, 'title'>;

export interface StatCardProps extends StatCardDivProps {
  title: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  color?: string;
  subtitle?: ReactNode;
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
              color ? color : '',
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ======================================================
// METRIC GRID
// ======================================================

export interface MetricGridProps extends ComponentPropsWithoutRef<'div'> {
  children: ReactNode;
  columns?: 1 | 2 | 3 | 4;
}

export function MetricGrid({ children, columns = 3, className, ...rest }: MetricGridProps) {
  const colClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : columns === 3
          ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={clsx('grid gap-4', colClass, className)} {...rest}>
      {children}
    </div>
  );
}

// ======================================================
// ALERT
// ======================================================

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps extends ComponentPropsWithoutRef<'div'> {
  tone?: AlertTone;
  title?: string;
  message: string;
  action?: ReactNode;
}

export function Alert({ tone = 'info', title, message, action, className, ...rest }: AlertProps) {
  const toneClasses: Record<AlertTone, string> = {
    info: 'border-sky-500/25 bg-sky-500/10 text-sky-100',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-100',
    danger: 'border-red-500/25 bg-red-500/10 text-red-100',
  };

  return (
    <div
      className={clsx(
        'flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs',
        toneClasses[tone],
        className,
      )}
      role="alert"
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
  );
}

// ======================================================
// LOADING SPINNER
// ======================================================

export interface LoadingSpinnerProps extends ComponentPropsWithoutRef<'div'> {
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ size = 'md', className, ...rest }: LoadingSpinnerProps) {
  const dimension =
    size === 'sm'
      ? 'h-4 w-4 border-2'
      : size === 'lg'
        ? 'h-10 w-10 border-4'
        : 'h-6 w-6 border-[3px]';

  return (
    <div
      className={clsx('inline-flex items-center justify-center', className)}
      role="status"
      aria-live="polite"
      {...rest}
    >
      <span
        className={clsx(
          'animate-spin rounded-full border-zinc-700 border-t-transparent',
          dimension,
        )}
        aria-label="Loading"
      />
    </div>
  );
}

// ======================================================
// PROGRESS BAR
// ======================================================

export type ProgressColor = 'neutral' | 'success' | 'warning' | 'danger' | 'primary';

export function ProgressBar(props: {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  color?: ProgressColor;
}) {
  const max = props.max ?? 100;
  const pct = max > 0 ? (props.value / max) * 100 : 0;
  const clamped = Math.max(0, Math.min(100, pct));

  const colorClass: Record<ProgressColor, string> = {
    neutral: 'bg-white/60',
    success: 'bg-emerald-400/80',
    warning: 'bg-amber-400/80',
    danger: 'bg-red-400/80',
    primary: 'bg-sky-400/80',
  };

  return (
    <div className="w-full">
      {props.label ? (
        <div className="mb-1 flex items-center justify-between text-xs opacity-80">
          <span>{props.label}</span>
          {props.showPercentage ? <span>{Math.round(clamped)}%</span> : null}
        </div>
      ) : null}

      <div className="h-2 w-full rounded bg-white/10">
        <div
          className={clsx('h-2 rounded', colorClass[props.color ?? 'neutral'])}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

// ======================================================
// KPI CARD
// ======================================================

type TrendLike =
  | 'up'
  | 'down'
  | 'flat'
  | {
      up?: boolean;
      direction?: 'up' | 'down' | 'flat';
      trend?: 'up' | 'down' | 'flat';
      value?: number;
      percent?: number;
      label?: string;
    };

function normalizeTrend(input: unknown): 'up' | 'down' | 'flat' {
  if (input === 'up' || input === 'down' || input === 'flat') return input;

  if (isRecord(input)) {
    const direction = input.direction;
    if (direction === 'up' || direction === 'down' || direction === 'flat') return direction;

    const trend = input.trend;
    if (trend === 'up' || trend === 'down' || trend === 'flat') return trend;

    if (typeof input.up === 'boolean') return input.up ? 'up' : 'down';
  }

  return 'flat';
}

export const ACCENT = {
  amber: 'text-amber-400',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  red: 'text-red-400',
  slate: 'text-slate-300',
  blue: 'text-sky-400',
  violet: 'text-violet-400',
  rose: 'text-rose-400',
} as const;

export type AccentColor = keyof typeof ACCENT;

export interface KPICardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: AccentColor;
  trend?: TrendLike;
  trendLabel?: string;
  icon?: ReactNode;
  className?: string;
}

export function KPICard({
  label,
  value,
  sub,
  accent = 'slate',
  trend,
  trendLabel,
  icon,
  className,
}: KPICardProps) {
  const normalizedTrend = normalizeTrend(trend);
  const trendClass =
    normalizedTrend === 'up'
      ? 'text-emerald-400'
      : normalizedTrend === 'down'
        ? 'text-red-400'
        : 'text-zinc-400';
  const trendIcon = normalizedTrend === 'up' ? '↗' : normalizedTrend === 'down' ? '↘' : '→';

  return (
    <div
      className={clsx('rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5 shadow-sm', className)}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</div>
          <div className={clsx('mt-2 text-2xl font-black tabular-nums', ACCENT[accent])}>
            {value}
          </div>
          {sub ? <div className="mt-1 text-xs text-zinc-500">{sub}</div> : null}
        </div>

        {icon ? (
          <div
            className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-lg"
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
      </div>

      {trendLabel ? (
        <div className={clsx('mt-3 text-xs font-medium', trendClass)}>
          <span aria-hidden="true">{trendIcon}</span> {trendLabel}
        </div>
      ) : null}
    </div>
  );
}

// ======================================================
// HEALTH BAR
// ======================================================

export interface HealthBarProps {
  label: string;
  value: number;
  max?: number;
  tone?: ProgressColor;
}

export function HealthBar({ label, value, max = 100, tone = 'primary' }: HealthBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value)}</span>
      </div>
      <ProgressBar value={value} max={max} color={tone} />
    </div>
  );
}

// ======================================================
// SKELETONS
// ======================================================

export interface SkeletonBlockProps extends ComponentPropsWithoutRef<'div'> {
  height?: number;
}

export function SkeletonBlock({ height = 16, className, style, ...rest }: SkeletonBlockProps) {
  return (
    <div
      className={clsx('animate-pulse rounded-xl bg-zinc-800/60', className)}
      style={{ ...style, height }}
      {...rest}
    />
  );
}

export interface SkeletonGridProps extends ComponentPropsWithoutRef<'div'> {
  count?: number;
  columns?: 1 | 2 | 3 | 4;
  itemHeight?: number;
}

export function SkeletonGrid({
  count = 4,
  columns = 4,
  itemHeight = 120,
  className,
  ...rest
}: SkeletonGridProps) {
  const colClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : columns === 3
          ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
          : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4';

  return (
    <div className={clsx('grid gap-4', colClass, className)} {...rest}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={`grid-sk-${i}`} height={itemHeight} className="rounded-2xl" />
      ))}
    </div>
  );
}

// ======================================================
// EMPTY CHART
// ======================================================

export interface EmptyChartProps {
  title?: string;
  description?: string;
  height?: number;
}

export function EmptyChart({
  title = 'No data yet',
  description = 'Data will appear here when it becomes available.',
  height = 280,
}: EmptyChartProps) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/20 text-center"
      style={{ height }}
    >
      <div className="text-3xl" aria-hidden="true">
        📈
      </div>
      <h3 className="mt-3 text-sm font-semibold text-zinc-100">{title}</h3>
      <p className="mt-1 max-w-md text-xs text-zinc-500">{description}</p>
    </div>
  );
}

// ======================================================
// TABLE
// ======================================================

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  children: ReactNode;
  dense?: boolean;
}

export function Table({ children, className, dense = false, ...rest }: TableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800">
      <table
        className={clsx(
          'min-w-full divide-y divide-zinc-800 text-left text-sm text-zinc-300',
          dense ? 'text-xs' : '',
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}

// ======================================================
// BADGE
// ======================================================

export interface BadgeProps {
  children?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
  const toneClasses: Record<NonNullable<BadgeProps['tone']>, string> = {
    neutral: 'bg-gray-800 text-gray-200 border-gray-700',
    success: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/60',
    warning: 'bg-amber-900/40 text-amber-300 border-amber-700/60',
    danger: 'bg-red-900/40 text-red-300 border-red-700/60',
    info: 'bg-sky-900/40 text-sky-300 border-sky-700/60',
  };

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
  );
}

// ======================================================
// EMPTY STATE
// ======================================================

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode | EmptyStateAction;
  icon?: ReactNode;
}

function isEmptyStateAction(
  action: ReactNode | EmptyStateAction | undefined,
): action is EmptyStateAction {
  if (!isRecord(action)) return false;
  return typeof action.label === 'string' && typeof action.onClick === 'function';
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
  );
}

// ======================================================
// SKELETON (simple stacked rows variant)
// ======================================================

export interface SkeletonProps {
  rows?: number;
  /** Height of each skeleton row in pixels. */
  height?: number;
  className?: string;
}

export function Skeleton({ rows = 3, height = 16, className }: SkeletonProps) {
  return (
    <div className={clsx('space-y-3', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={`sk-row-${i}`} height={height} className="rounded-2xl" />
      ))}
    </div>
  );
}