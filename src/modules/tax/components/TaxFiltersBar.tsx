// =============================================================================
// src/modules/tax/components/TaxFiltersBar.tsx
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  ChevronDown,
  Filter,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
  Check,
} from 'lucide-react';

import type {
  TaxReportFilters,
  TaxDatePresetOption,
  TaxDatePreset,
  TaxGranularity,
  FulfillmentType,
  TaxCurrency,
} from '../types/tax.types';

import { dateToYMD, formatDateLabel } from '../utils/taxTotals';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TaxFiltersBarProps {
  filters: TaxReportFilters;
  setFilters: (partial: Partial<TaxReportFilters>) => void;
  resetFilters: () => void;
  applyDatePreset: (preset: TaxDatePreset) => void;
  activePreset: TaxDatePreset;
  datePresets: TaxDatePresetOption[];
  dateRangeError: string | null;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefreshCache?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Option lists (must align with SQL enums)
// ---------------------------------------------------------------------------

const GRANULARITY_OPTIONS: { label: string; value: TaxGranularity }[] = [
  { label: 'Daily', value: 'daily' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Orders', value: 'orders' },
];

const FULFILLMENT_OPTIONS: { label: string; value: FulfillmentType | 'all' }[] = [
  { label: 'All Types', value: 'all' },
  { label: 'Pickup', value: 'pickup' },
  { label: 'Curbside', value: 'curbside' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Dine-In', value: 'dine_in' },
  { label: 'Drive-Through', value: 'drive_through' },
  { label: 'Ship', value: 'ship' },
];

const CURRENCY_OPTIONS: { label: string; value: TaxCurrency }[] = [
  { label: 'USD', value: 'usd' },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Generic dropdown */
function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const current = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((p) => !p)}
        className={[
          'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium',
          'border border-white/10 bg-white/5 text-white',
          'hover:bg-white/8 hover:border-white/20 transition-all duration-150',
          'focus:outline-none focus:ring-2 focus:ring-violet-500/50',
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        <span className="text-slate-400 text-xs uppercase tracking-wider mr-0.5">{label}</span>
        <span>{current?.label ?? '—'}</span>
        <ChevronDown
          size={14}
          className={['text-slate-400 transition-transform duration-150', open ? 'rotate-180' : ''].join(
            ' ',
          )}
        />
      </button>

      {open && (
        <div
          className={[
            'absolute top-full left-0 mt-1.5 z-50 min-w-160px',
            'rounded-xl border border-white/10 bg-slate-900/95 backdrop-blur-xl',
            'shadow-2xl shadow-black/50 py-1.5 overflow-hidden',
          ].join(' ')}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={[
                'flex items-center justify-between w-full px-3 py-2 text-sm text-left',
                'transition-colors duration-100',
                opt.value === value
                  ? 'bg-violet-500/15 text-violet-300'
                  : 'text-slate-300 hover:bg-white/6 hover:text-white',
              ].join(' ')}
            >
              {opt.label}
              {opt.value === value && <Check size={13} className="text-violet-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Toggle chip (for disputedOnly / refundedOnly) */
function FilterToggle({
  label,
  active,
  onChange,
  icon,
}: {
  label: string;
  active: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      className={[
        'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium',
        'border transition-all duration-150',
        'focus:outline-none focus:ring-2 focus:ring-violet-500/50',
        active
          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
          : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/8 hover:text-white hover:border-white/20',
      ].join(' ')}
    >
      {icon}
      {label}
      {active && <Check size={12} className="text-violet-400 ml-0.5" />}
    </button>
  );
}

/** Date range picker row */
function DateRangeInputs({
  dateFrom,
  dateTo,
  onChange,
  error,
}: {
  dateFrom: Date;
  dateTo: Date;
  onChange: (from: Date, to: Date) => void;
  error: string | null;
}) {
  const handleFrom = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = new Date(`${e.target.value}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime())) {
        onChange(d, dateTo);
      }
    },
    [dateTo, onChange],
  );

  const handleTo = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const d = new Date(`${e.target.value}T23:59:59.999Z`);
      if (!Number.isNaN(d.getTime())) {
        onChange(dateFrom, d);
      }
    },
    [dateFrom, onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Calendar
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="date"
          value={dateToYMD(dateFrom)}
          max={dateToYMD(dateTo)}
          onChange={handleFrom}
          className={[
            'pl-8 pr-3 py-2 rounded-xl text-sm bg-white/5 border',
            'text-white placeholder-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/50',
            'transition-colors duration-150',
            error ? 'border-rose-500/50' : 'border-white/10 hover:border-white/20',
          ].join(' ')}
        />
      </div>

      <span className="text-slate-500 text-sm font-medium">to</span>

      <div className="relative">
        <Calendar
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
        <input
          type="date"
          value={dateToYMD(dateTo)}
          min={dateToYMD(dateFrom)}
          onChange={handleTo}
          className={[
            'pl-8 pr-3 py-2 rounded-xl text-sm bg-white/5 border',
            'text-white placeholder-slate-500',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/50',
            'transition-colors duration-150',
            error ? 'border-rose-500/50' : 'border-white/10 hover:border-white/20',
          ].join(' ')}
        />
      </div>

      {error && (
        <p className="flex items-center gap-1 text-xs text-rose-400">
          <AlertTriangle size={12} />
          {error}
        </p>
      )}
    </div>
  );
}

/** Preset pill row */
function DatePresetPills({
  presets,
  active,
  onSelect,
}: {
  presets: TaxDatePresetOption[];
  active: TaxDatePreset;
  onSelect: (p: TaxDatePreset) => void;
}) {
  const shown = presets.filter((p) => p.value !== 'custom');

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shown.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onSelect(p.value)}
          className={[
            'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-violet-500/40',
            p.value === active
              ? 'bg-violet-500/25 text-violet-200 border border-violet-500/40'
              : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/8 hover:text-white',
          ].join(' ')}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function TaxFiltersBar({
  filters,
  setFilters,
  resetFilters,
  applyDatePreset,
  activePreset,
  datePresets,
  dateRangeError,
  isLoading,
  isRefreshing,
  onRefreshCache,
  className = '',
}: TaxFiltersBarProps) {
  const isDirty =
    filters.fulfillmentType !== 'all' || filters.disputedOnly || filters.refundedOnly;

  const formattedDateRange = useMemo(() => {
    return `${formatDateLabel(filters.dateFrom)} – ${formatDateLabel(filters.dateTo)}`;
  }, [filters.dateFrom, filters.dateTo]);

  return (
    <div
      className={[
        'rounded-2xl border border-white/8 bg-white/3 backdrop-blur-sm p-4 space-y-4',
        className,
      ].join(' ')}
    >
      {/* Row 1: Preset pills */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-2">
          <DatePresetPills
            presets={datePresets}
            active={activePreset}
            onSelect={applyDatePreset}
          />
          <p className="text-[11px] text-slate-500">
            Selected range: <span className="text-slate-300">{formattedDateRange}</span>
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {onRefreshCache && (
            <button
              type="button"
              onClick={onRefreshCache}
              disabled={isRefreshing || isLoading}
              title="Refresh materialized cache"
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium',
                'border border-white/10 bg-white/5 text-slate-400',
                'hover:bg-white/8 hover:text-white hover:border-white/20',
                'transition-all duration-150 focus:outline-none',
                isRefreshing || isLoading ? 'opacity-50 cursor-not-allowed' : '',
              ].join(' ')}
            >
              <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
              {isRefreshing ? 'Refreshing…' : 'Refresh cache'}
            </button>
          )}

          {isDirty && (
            <button
              type="button"
              onClick={resetFilters}
              className={[
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium',
                'border border-rose-500/30 bg-rose-500/10 text-rose-400',
                'hover:bg-rose-500/15 transition-all duration-150',
              ].join(' ')}
            >
              <RotateCcw size={12} />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Date pickers + granularity */}
      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeInputs
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          onChange={(from, to) => setFilters({ dateFrom: from, dateTo: to })}
          error={dateRangeError}
        />

        <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />

        <FilterDropdown
          label="View"
          value={filters.granularity}
          options={GRANULARITY_OPTIONS}
          onChange={(v) => setFilters({ granularity: v })}
          disabled={isLoading}
        />

        <FilterDropdown
          label="Currency"
          value={filters.currency}
          options={CURRENCY_OPTIONS}
          onChange={(v) => setFilters({ currency: v })}
          disabled={isLoading}
        />
      </div>

      {/* Row 3: Status / fulfillment filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1 text-xs text-slate-500 uppercase tracking-wider mr-1">
          <Filter size={11} />
          Filter
        </span>

        <FilterDropdown
          label="Type"
          value={filters.fulfillmentType}
          options={FULFILLMENT_OPTIONS}
          onChange={(v) => setFilters({ fulfillmentType: v })}
          disabled={isLoading}
        />

        <FilterToggle
          label="Disputed only"
          active={filters.disputedOnly}
          onChange={(v) => setFilters({ disputedOnly: v })}
          icon={<AlertTriangle size={13} />}
        />

        <FilterToggle
          label="Refunded only"
          active={filters.refundedOnly}
          onChange={(v) => setFilters({ refundedOnly: v })}
          icon={<RefreshCw size={13} />}
        />
      </div>
    </div>
  );
}

export default TaxFiltersBar;