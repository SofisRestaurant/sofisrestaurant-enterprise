import type { ReactElement, ReactNode } from 'react';

export function HeaderButton({
  children,
  onClick,
  disabled = false,
  variant = 'default',
  type = 'button',
}: {
  children: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger' | 'success';
  type?: 'button' | 'submit';
}): ReactElement {
  const base =
    'rounded-xl border px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40';
  const tone =
    variant === 'danger'
      ? 'border-red-500/30 text-red-400 hover:bg-red-500/10 focus-visible:ring-red-500/30'
      : variant === 'success'
        ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 focus-visible:ring-emerald-500/30'
        : 'border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-zinc-700 focus-visible:ring-amber-500/30';

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
      {children}
    </button>
  );
}

export function TableWrapper({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return (
    <th
      className={`whitespace-nowrap border-b border-zinc-800 px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 ${className}`}
      scope="col"
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): ReactElement {
  return <td className={`px-4 py-3 align-top text-sm text-zinc-300 ${className}`}>{children}</td>;
}

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactElement;
}): ReactElement {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-500">{subtitle}</p>
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  );
}