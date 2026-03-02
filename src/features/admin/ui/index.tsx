/* eslint-disable react-refresh/only-export-components */

// =============================================================================
// src/features/admin/ui/index.tsx
// =============================================================================
// Admin UI primitives used across admin pages (Marketing, Finance, FraudLog, etc.)
// Public barrel for "@/features/admin/ui".
// =============================================================================

import type { ReactNode, HTMLAttributes, ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

// Re-export all primitives from AdminPrimitives (Panel, KPICard, Badge, EmptyState, etc.)
export * from './AdminPrimitives'

// ─────────────────────────────────────────────────────────────────────────────
// SectionHeader
// ─────────────────────────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  right?: ReactNode
  className?: string
}) {
  return (
    <div className={clsx('flex items-start justify-between gap-4', className)}>
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          {title}
        </p>
        {subtitle ? <p className="mt-1 text-sm text-zinc-400">{subtitle}</p> : null}
      </div>

      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ActionButton
// ─────────────────────────────────────────────────────────────────────────────

export interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: 'neutral' | 'primary' | 'danger'
  size?: 'sm' | 'md'
}

export function ActionButton({
  tone = 'neutral',
  size = 'md',
  className,
  ...props
}: ActionButtonProps) {
  const toneCls =
    tone === 'primary'
      ? 'border-amber-500/25 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15 hover:text-amber-100'
      : tone === 'danger'
        ? 'border-red-500/25 bg-red-500/10 text-red-200 hover:bg-red-500/15 hover:text-red-100'
        : 'border-zinc-700/60 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-900/80'

  const sizeCls = size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs'

  return (
    <button
      type="button"
      className={clsx(
        'inline-flex items-center justify-center rounded-lg border font-semibold transition-colors',
        sizeCls,
        toneCls,
        className,
      )}
      {...props}
    />
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TableWrapper / Th / Td
// ─────────────────────────────────────────────────────────────────────────────

export function TableWrapper({
  children,
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div
      className={clsx('overflow-hidden rounded-2xl border border-zinc-800 bg-[#050509]', className)}
      {...rest}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">{children}</table>
      </div>
    </div>
  )
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={clsx(
        'whitespace-nowrap border-b border-zinc-800/80 bg-zinc-950/60 px-4 py-3',
        'font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-500',
        className,
      )}
    >
      {children}
    </th>
  )
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={clsx('border-b border-zinc-900 px-4 py-3 text-zinc-300', className)}>
      {children}
    </td>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton (legacy simple)
// ─────────────────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-lg bg-zinc-800/60', className)} />
}