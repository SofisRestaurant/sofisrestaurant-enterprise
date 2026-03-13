import type { ReactNode } from 'react';
import { IconRefresh } from './AdminLayoutIcons';

export interface AdminLayoutSnapshotLike {
  today_revenue_cents: number;
  today_orders: number;
  pending_orders: number;
  unread_notifications: number;
  fraud_events_7d: number;
  abandoned_carts: number;
  pending_carts: number;
  generated_at: string;
}

type LiveDotColor = 'amber' | 'red' | 'green';

export function formatUsdFromCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

export function formatCount(value: number): string {
  return Number.isFinite(value) ? String(Math.trunc(value)) : '—';
}

export function KpiSkeleton() {
  return (
    <div className="animate-pulse space-y-1.5 px-1 pt-1">
      <div className="h-7 w-28 rounded-md bg-zinc-800" />
      <div className="h-3 w-20 rounded bg-zinc-800/60" />
    </div>
  );
}

export function LiveDot({ color = 'amber' }: { color?: LiveDotColor }) {
  const ringClass =
    color === 'red' ? 'bg-red-400' : color === 'green' ? 'bg-green-400' : 'bg-amber-400';
  const fillClass =
    color === 'red' ? 'bg-red-500' : color === 'green' ? 'bg-green-500' : 'bg-amber-500';

  return (
    <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${ringClass} opacity-75`} />
      <span className={`relative inline-flex h-2 w-2 rounded-full ${fillClass}`} />
    </span>
  );
}

type RefreshIndicatorProps = {
  spinning: boolean;
  countdown: number;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

export function AdminRefreshButton({
  spinning,
  countdown,
  onClick,
  disabled = false,
  className,
}: RefreshIndicatorProps) {
  const resolvedClassName = [
    'flex items-center gap-1 text-[9px] text-zinc-600 transition-colors hover:text-zinc-400 disabled:opacity-40',
    className ?? '',
  ]
    .join(' ')
    .trim();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={resolvedClassName}
      title={`Auto-refresh in ${countdown}s`}
      aria-label="Refresh metrics"
    >
      <IconRefresh spinning={spinning} />
      <span>{spinning ? '…' : `${countdown}s`}</span>
    </button>
  );
}

type MetricHeaderProps = {
  isLoading: boolean;
  phase: 'idle' | 'loading' | 'refreshing' | 'error';
  snapshot: AdminLayoutSnapshotLike | null;
  errorMsg?: string | null;
  lastRefreshedAt?: Date | null;
  countdown: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
};

export function AdminMetricHeader({
  isLoading,
  phase,
  snapshot,
  errorMsg = null,
  lastRefreshedAt = null,
  countdown,
  onRefresh,
  isRefreshing = false,
}: MetricHeaderProps) {
  return (
    <>
      {isLoading ? (
        <KpiSkeleton />
      ) : (
        <>
          <div className="mb-0.5 flex items-center gap-2">
            <LiveDot color={phase === 'error' ? 'red' : 'amber'} />
            <span className="text-2xl font-black tracking-tight text-white">
              {snapshot ? formatUsdFromCents(snapshot.today_revenue_cents) : '—'}
            </span>
          </div>
          <p className="pl-4 text-xs text-zinc-500">
            {snapshot ? formatCount(snapshot.today_orders) : '—'} orders today
          </p>
        </>
      )}

      {phase === 'error' && errorMsg ? (
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[10px] text-red-400">
          <span aria-hidden="true">⚠</span>
          <span className="truncate">{errorMsg}</span>
        </div>
      ) : null}

      <div className="mt-2 flex items-center justify-between pl-4">
        <p className="text-[9px] text-zinc-700">
          {lastRefreshedAt
            ? lastRefreshedAt.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            : '—'}
        </p>

        <AdminRefreshButton
          spinning={isRefreshing}
          countdown={countdown}
          onClick={onRefresh}
          disabled={isRefreshing}
        />
      </div>
    </>
  );
}

type AlertBannerTone = 'red' | 'amber' | 'zinc';

type AlertBannerProps = {
  children: ReactNode;
  onClick?: () => void;
  tone?: AlertBannerTone;
  className?: string;
};

export function AdminAlertBanner({
  children,
  onClick,
  tone = 'red',
  className,
}: AlertBannerProps) {
  const toneClass =
    tone === 'red'
      ? 'border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/15'
      : tone === 'amber'
        ? 'border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/15'
        : 'border-zinc-700 bg-zinc-700/40 text-zinc-400 hover:bg-zinc-700/60';

  const Comp = onClick ? 'button' : 'div';

  return (
    <Comp
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={[
        'flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors',
        toneClass,
        className ?? '',
      ]
        .join(' ')
        .trim()}
    >
      {children}
    </Comp>
  );
}