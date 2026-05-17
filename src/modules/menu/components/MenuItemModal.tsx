// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// MENU ITEM MODAL — Production 2026 — Theme-aware (light + dark)
// =============================================================================
//
// Architecture:
//   Orchestrator shell (MenuItemModal) owns all state, hooks, and business logic.
//   Pure-presentational sub-components receive props — zero duplication of logic.
//
// Theme model:
//   ThemeProvider sets data-theme on <html>. Every surface in this modal resolves
//   through --menu-modal-* tokens declared in tokens.css. The component itself
//   is theme-agnostic — it only references semantic variables. No hardcoded
//   neutral-950 / white / zinc / amber backgrounds on core readability surfaces.
//
//   Brand-gold CTA gradient is intentionally retained — gold is the conversion
//   focal point in both modes and works on cream and stone alike. Status colours
//   on success / adding states are also intentionally fixed (semantic).
//
// Design: Apple HIG + Uber Eats conversion patterns.
//   - 48 px minimum tap targets on every interactive element
//   - Bottom-anchored single-row action bar (qty + CTA with embedded price)
//   - Staggered entrance animation, spring curve
//   - Gold accent hierarchy: price → CTA → badges → check indicators
//   - Clean modifier accordion with generous touch spacing
//   - Overscroll-contain body, sticky header + footer
//   - Safe area padding for iOS home indicator
//
// Business logic is IDENTICAL to the previous version — every hook, callback,
// memo, effect, and state variable is preserved exactly as-is.
//
// Z-INDEX: z-100 — above FloatingCartPill (z-40) and BottomNav (z-30).
// =============================================================================

import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FC, ReactNode } from 'react';
import { Check, ChevronDown, Info, Minus, Plus, Star, X } from 'lucide-react';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { unlockScroll } from '@/lib/ui/scroll-lock';

import { MenuItemModalImage } from './modal/MenuItemModalImage';
import { useMenuItemPreflight } from '../hooks/useMenuItemPreflight';
import { useMenuItemModifiers } from '../hooks/useMenuItemModifiers';
import { useMenuItemQty } from '../hooks/useMenuItemQty';

import {
  isRecord,
  isMenuItemPublic,
  safeStr,
  safeCents,
  clampInt,
  fmtUsdFromCents,
} from '../utils/menuItemGuards';
import {
  parseTags,
  computeSelectedModifierCents,
  canonicalizeSelectionsForHash,
  isSelectionValidForGroup,
  groupSelectionRangeLabel,
} from '../utils/modifierGuards';
import { cx, getFocusable } from '../utils/uiHelpers';
import { SKELETON_IDS, MAX_NOTES_LENGTH } from '../constants';

// ─── Inferred types from hooks ──────────────────────────────────────────────

type ModifierHookReturn = ReturnType<typeof useMenuItemModifiers>;
type ModifierGroup = ModifierHookReturn['modifierGroups'][number];
type ModifierSelection = NonNullable<ModifierHookReturn['selected'][string]>[number];

// ─── Types shared across sub-components ──────────────────────────────────────

type CartPhase = 'idle' | 'adding' | 'success';

// ─── Keyframe injection (SSR-safe, idempotent) ──────────────────────────────

const MODAL_KF = `
  @keyframes sofi-modal-backdrop {
    from { opacity: 0 }
    to   { opacity: 1 }
  }
  @keyframes sofi-modal-dialog {
    from { opacity: 0; transform: scale(0.96) translateY(16px) }
    to   { opacity: 1; transform: scale(1)    translateY(0) }
  }
  @keyframes sofi-stagger-in {
    from { opacity: 0; transform: translateY(6px) }
    to   { opacity: 1; transform: translateY(0) }
  }
  @keyframes sofi-accordion-open {
    from { opacity: 0; max-height: 0 }
    to   { opacity: 1; max-height: 600px }
  }
`;

let _kfInjected = false;
function injectKeyframes() {
  if (_kfInjected || typeof document === 'undefined') return;
  const s = document.createElement('style');
  s.id = 'sofi-modal-keyframes';
  s.textContent = MODAL_KF;
  document.head.appendChild(s);
  _kfInjected = true;
}

// ═════════════════════════════════════════════════════════════════════════════
// §1  SUB-COMPONENTS — Pure presentational, zero business logic
// ═════════════════════════════════════════════════════════════════════════════

// ─── §1.1  Alert Banner ─────────────────────────────────────────────────────

interface AlertBannerProps {
  variant: 'error' | 'warning' | 'info';
  children: ReactNode;
  stagger?: boolean;
}

const ALERT_STYLES = {
  error:
    'border-(--menu-modal-danger-border) bg-(--menu-modal-danger-bg) text-(--menu-modal-danger-text)',
  warning:
    'border-(--menu-modal-warning-border) bg-(--menu-modal-warning-bg) text-(--menu-modal-warning-text)',
  info: 'border-[var(--menu-modal-info-border)] bg-[var(--menu-modal-info-bg)] text-[var(--menu-modal-info-text)]',
} as const;

const ALERT_ICON_COLOR = {
  error: 'text-(--menu-modal-danger-text)',
  warning: 'text-(--menu-modal-warning-text)',
  info: 'text-(--menu-modal-subtle)',
} as const;

const AlertBanner: FC<AlertBannerProps> = ({ variant, children, stagger }) => (
  <div
    className={cx(
      'mt-5 flex items-start gap-3 rounded-2xl border px-4 py-3.5 text-sm',
      ALERT_STYLES[variant],
    )}
    role={variant === 'error' ? 'alert' : 'status'}
    style={stagger ? { animation: 'sofi-stagger-in 250ms ease both' } : undefined}
  >
    <Info
      className={cx('mt-0.5 h-4 w-4 shrink-0', ALERT_ICON_COLOR[variant])}
      aria-hidden="true"
    />
    <span>{children}</span>
  </div>
);

// ─── §1.2  Modal Header ─────────────────────────────────────────────────────

interface ModalHeaderProps {
  titleId: string;
  categoryLabel: string;
  name: string;
  isPopular: boolean;
  basePriceLabel: string;
  extrasLabel: string | null;
  preflightOk: boolean;
  preflightLoading: boolean;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

const ModalHeader = memo<ModalHeaderProps>(function ModalHeader({
  titleId,
  categoryLabel,
  name,
  isPopular,
  basePriceLabel,
  extrasLabel,
  preflightOk,
  preflightLoading,
  closeBtnRef,
  onClose,
}) {
  return (
    <div
      className={cx(
        'shrink-0 border-b border-(--menu-modal-border)',
        'bg-(--menu-modal-header-bg) backdrop-blur-xl',
        'px-5 pb-5 pt-3 sm:px-6 sm:pt-5',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-sans text-[0.68rem] font-semibold uppercase tracking-caps text-(--menu-modal-accent-muted)">
            {categoryLabel}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <h2
              id={titleId}
              className="font-sans text-[23px] font-semibold leading-editorial tracking-[-0.025em] text-(--menu-modal-text) sm:text-[1.65rem]"
            >
              {name}
            </h2>
            {isPopular && <PopularBadge />}
          </div>

          <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
            <span className="font-sans text-lg font-semibold tabular-nums text-(--menu-modal-accent)">
              {basePriceLabel}
            </span>
            {preflightOk ? (
              <VerifiedBadge />
            ) : preflightLoading ? (
              <span className="inline-block h-3 w-14 animate-pulse rounded bg-(--menu-modal-bg-soft)" />
            ) : null}
            {extrasLabel && (
              <span className="text-xs font-medium text-(--menu-modal-accent-muted)">
                {extrasLabel}
              </span>
            )}
          </div>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className={cx(
            'flex h-12 w-12 shrink-0 items-center justify-center',
            'rounded-2xl border border-(--menu-modal-border) bg-(--menu-modal-control-bg)',
            'text-(--menu-modal-subtle)',
            'transition-all duration-150',
            'hover:border-(--menu-modal-border-strong) hover:bg-(--menu-modal-control-hover) hover:text-(--menu-modal-text)',
            'active:scale-90',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--menu-modal-focus-ring)',
          )}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});

const PopularBadge: FC = () => (
  <span
    className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-bold uppercase tracking-wider ring-1"
    style={{
      background: 'var(--menu-modal-pill-popular-bg)',
      color: 'var(--menu-modal-pill-popular-text)',
      boxShadow: 'inset 0 0 0 1px var(--menu-modal-pill-popular-border)',
    }}
  >
    <Star className="h-3 w-3" aria-hidden="true" />
    Popular
  </span>
);

const VerifiedBadge: FC = () => (
  <span
    className="rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest"
    style={{
      background: 'var(--menu-modal-pill-verified-bg)',
      color: 'var(--menu-modal-pill-verified-text)',
    }}
  >
    Verified
  </span>
);

// ─── §1.3  Status Alerts Section ────────────────────────────────────────────

interface StatusAlertsProps {
  preflightError: string | null;
  isLowStock: boolean;
  stockCount: number | null;
  unavailable: boolean;
  selectionPrunedWarning: string | null;
  hasBlockedSelections: boolean;
}

const StatusAlerts = memo<StatusAlertsProps>(function StatusAlerts({
  preflightError,
  isLowStock,
  stockCount,
  unavailable,
  selectionPrunedWarning,
  hasBlockedSelections,
}) {
  return (
    <>
      {preflightError && (
        <AlertBanner variant="error" stagger>
          {preflightError}
        </AlertBanner>
      )}

      {isLowStock && stockCount != null && (
        <div
          className={cx(
            'mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm',
            'border-(--menu-modal-warning-border) bg-(--menu-modal-warning-bg) text-(--menu-modal-warning-text)',
          )}
          role="status"
          style={{ animation: 'sofi-stagger-in 250ms ease both' }}
        >
          <span className="text-lg leading-none" aria-hidden="true">
            ⚡
          </span>
          <span>
            Only <strong className="font-bold text-(--menu-modal-accent)">{stockCount}</strong> left
            — order soon.
          </span>
        </div>
      )}

      {unavailable && (
        <AlertBanner variant="error">This item is currently unavailable.</AlertBanner>
      )}

      {selectionPrunedWarning && (
        <AlertBanner variant="warning">{selectionPrunedWarning}</AlertBanner>
      )}

      {hasBlockedSelections && (
        <AlertBanner variant="error">
          Some selected options are no longer available. Please update your choices.
        </AlertBanner>
      )}
    </>
  );
});

// ─── §1.4  Single Modifier Option ───────────────────────────────────────────

interface ModifierOptionProps {
  modifier: ModifierGroup['modifiers'][number];
  isSelected: boolean;
  isBlocked: boolean;
  onSelect: () => void;
}

const ModifierOption = memo<ModifierOptionProps>(function ModifierOption({
  modifier: m,
  isSelected,
  isBlocked,
  onSelect,
}) {
  const disabled = !m.available;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl px-3.5 py-3.5 text-left',
        'transition-all duration-150',
        isSelected
          ? 'bg-(--menu-modal-accent)/10 ring-1 ring-(--menu-modal-accent)/25'
          : 'bg-(--menu-modal-card-bg) ring-1 ring-(--menu-modal-border) hover:bg-(--menu-modal-card-hover)',
        isBlocked && 'ring-1 ring-(--menu-modal-danger-border)',
        disabled && 'opacity-40',
      )}
      aria-pressed={isSelected}
      aria-label={`${m.name}${disabled ? ', unavailable' : ''}${
        m.price_adjustment !== 0
          ? `, ${m.price_adjustment > 0 ? 'add' : 'subtract'} ${fmtUsdFromCents(Math.abs(m.price_adjustment))}`
          : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-sans text-[0.96rem] font-semibold leading-snug tracking-[-0.01em] text-(--menu-modal-text)">
          {m.name}
        </p>
        <p className="mt-1 font-sans text-xs leading-relaxed text-(--menu-modal-muted)">
          {m.price_adjustment !== 0
            ? `${m.price_adjustment > 0 ? '+' : ''}${fmtUsdFromCents(m.price_adjustment)}`
            : 'Included'}
          {!m.available ? ' · Unavailable' : ''}
        </p>
      </div>

      <span
        className={cx(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
          isSelected
            ? 'bg-(--menu-modal-accent)/20 ring-1 ring-(--menu-modal-accent)/40'
            : 'bg-(--menu-modal-control-bg) ring-1 ring-(--menu-modal-border-strong)',
        )}
        aria-hidden="true"
      >
        {isSelected ? (
          <Check className="h-4 w-4 text-(--menu-modal-accent)" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-(--menu-modal-faint)" />
        )}
      </span>
    </button>
  );
});

// ─── §1.5  Modifier Group (Accordion) ───────────────────────────────────────

interface ModifierGroupAccordionProps {
  group: ModifierGroup;
  selections: ModifierSelection[];
  expanded: boolean;
  staggerIndex: number;
  selectionBlockedIds: Set<string>;
  maxSelectionHint: string | null;
  onToggleExpanded: (groupId: string) => void;
  onSetSelection: (group: ModifierGroup, modifier: ModifierGroup['modifiers'][number]) => void;
}

const ModifierGroupAccordion = memo<ModifierGroupAccordionProps>(
  function ModifierGroupAccordion({
    group: g,
    selections: sels,
    expanded,
    staggerIndex,
    selectionBlockedIds,
    maxSelectionHint,
    onToggleExpanded,
    onSetSelection,
  }) {
    const valid = isSelectionValidForGroup(g, sels);
    const rangeLabel = groupSelectionRangeLabel(g);
    const selectedCount = sels.length;
    const max = g.max_selections ?? (g.type === 'radio' ? 1 : null);
    const min = g.min_selections ?? (g.required ? 1 : 0);

    const subline =
      g.type === 'radio'
        ? `${rangeLabel}${selectedCount ? ' · selected' : ''}`
        : `${rangeLabel}${
            max != null
              ? ` · ${selectedCount}/${max}`
              : selectedCount
                ? ` · ${selectedCount} selected`
                : ''
          }`;

    return (
      <div
        role="listitem"
        className={cx(
          'overflow-hidden rounded-2xl border transition-colors duration-150',
          !valid
            ? 'border-(--menu-modal-warning-border) bg-(--menu-modal-warning-bg)'
            : 'border-(--menu-modal-border) bg-(--menu-modal-card-bg)',
        )}
        style={{
          animation: `sofi-stagger-in 260ms cubic-bezier(0.16,1,0.3,1) ${staggerIndex * 50}ms both`,
        }}
      >
        <button
          type="button"
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-(--menu-modal-card-hover)"
          onClick={() => onToggleExpanded(g.id)}
          aria-expanded={expanded}
          aria-controls={`mod-body-${g.id}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-sans text-[0.98rem] font-semibold tracking-[-0.015em] text-(--menu-modal-text)">
                {g.name}
              </p>
              {g.required || min > 0 ? (
                <span className="rounded-md bg-(--menu-modal-accent)/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-(--menu-modal-accent) ring-1 ring-(--menu-modal-accent)/20">
                  Required
                </span>
              ) : (
                <span className="rounded-md bg-(--menu-modal-control-bg) px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-(--menu-modal-subtle)">
                  Optional
                </span>
              )}
            </div>
            <p className="mt-1 font-sans text-xs leading-relaxed text-(--menu-modal-muted)">
              {g.description || subline}
            </p>
            {!valid && (
              <p className="mt-1.5 text-[11px] font-semibold text-(--menu-modal-warning-text)">
                {selectedCount < min
                  ? `Choose at least ${min}`
                  : max != null
                    ? `Choose up to ${max}`
                    : 'Selection required'}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {selectedCount > 0 && (
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-(--menu-modal-accent)/15 px-2 text-[11px] font-bold tabular-nums text-(--menu-modal-accent) ring-1 ring-(--menu-modal-accent)/20">
                {selectedCount}
              </span>
            )}
            <ChevronDown
              className={cx(
                'h-4 w-4 text-(--menu-modal-subtle) transition-transform duration-200',
                expanded && 'rotate-180',
              )}
              aria-hidden="true"
            />
          </div>
        </button>

        {expanded && (
          <div
            id={`mod-body-${g.id}`}
            className="border-t border-(--menu-modal-border) px-3 py-3"
            style={{ animation: 'sofi-accordion-open 200ms ease both' }}
          >
            <div className="space-y-1.5">
              {g.modifiers.map((m) => (
                <ModifierOption
                  key={m.id}
                  modifier={m}
                  isSelected={sels.some((s) => s.id === m.id)}
                  isBlocked={selectionBlockedIds.has(m.id)}
                  onSelect={() => onSetSelection(g, m)}
                />
              ))}
            </div>
            {maxSelectionHint && (
              <p className="mt-3 px-1 text-[11px] font-medium text-(--menu-modal-accent-muted)">
                {maxSelectionHint}
              </p>
            )}
          </div>
        )}
      </div>
    );
  },
);

// ─── §1.6  Modifier Groups Section ─────────────────────────────────────────

interface ModifiersSectionProps {
  modifierGroups: ModifierGroup[];
  groupsLoading: boolean;
  groupsError: string | null;
  selected: Record<string, ModifierSelection[]>;
  expandedGroups: Record<string, boolean>;
  selectionBlockedIds: Set<string>;
  maxSelectionHint: string | null;
  onToggleGroupExpanded: (id: string) => void;
  onSetSelectionForGroup: (
    group: ModifierGroup,
    modifier: ModifierGroup['modifiers'][number],
  ) => void;
  onClearSelections: () => void;
  onLoadModifierGroups: () => Promise<void>;
}

const ModifiersSection = memo<ModifiersSectionProps>(function ModifiersSection({
  modifierGroups,
  groupsLoading,
  groupsError,
  selected,
  expandedGroups,
  selectionBlockedIds,
  maxSelectionHint,
  onToggleGroupExpanded,
  onSetSelectionForGroup,
  onClearSelections,
  onLoadModifierGroups,
}) {
  return (
    <div className="mt-8">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-(--menu-modal-subtle)">
            Customize
          </p>
          <p className="mt-1 text-xs text-(--menu-modal-faint)">
            Required options are validated before adding.
          </p>
        </div>
        {modifierGroups.length > 0 && (
          <button
            type="button"
            onClick={onClearSelections}
            className={cx(
              'rounded-lg px-3 py-2 text-[11px] font-semibold transition-colors active:scale-95',
              'text-(--menu-modal-muted)',
              'hover:bg-(--menu-modal-control-hover) hover:text-(--menu-modal-text)',
            )}
            aria-label="Clear all selections"
          >
            Clear all
          </button>
        )}
      </div>

      {groupsLoading ? (
        <div className="mt-4 space-y-3">
          {SKELETON_IDS.map((sid) => (
            <div
              key={sid}
              className="h-16 animate-pulse rounded-2xl bg-(--menu-modal-bg-soft)"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : groupsError ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-(--menu-modal-border) bg-(--menu-modal-bg-soft) px-4 py-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-(--menu-modal-subtle)" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-(--menu-modal-text)">Options unavailable</p>
            <p className="mt-0.5 text-xs text-(--menu-modal-muted)">{groupsError}</p>
            <button
              type="button"
              onClick={() => void onLoadModifierGroups()}
              className={cx(
                'mt-3 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors active:scale-95',
                'border-(--menu-modal-border) bg-(--menu-modal-control-bg) text-(--menu-modal-muted)',
                'hover:bg-(--menu-modal-control-hover)',
              )}
              aria-label="Retry loading options"
            >
              Retry
            </button>
          </div>
        </div>
      ) : !modifierGroups.length ? (
        <div className="mt-4 rounded-2xl border border-(--menu-modal-border) bg-(--menu-modal-bg-soft) px-4 py-4 text-sm text-(--menu-modal-muted)">
          No customization options for this item.
        </div>
      ) : (
        <div className="mt-4 space-y-3" role="list">
          {modifierGroups.map((g, gi) => (
            <ModifierGroupAccordion
              key={g.id}
              group={g}
              selections={selected[g.id] ?? []}
              expanded={Boolean(expandedGroups[g.id])}
              staggerIndex={gi}
              selectionBlockedIds={selectionBlockedIds}
              maxSelectionHint={maxSelectionHint}
              onToggleExpanded={onToggleGroupExpanded}
              onSetSelection={onSetSelectionForGroup}
            />
          ))}
        </div>
      )}
    </div>
  );
});

// ─── §1.7  Notes Input ──────────────────────────────────────────────────────

interface NotesInputProps {
  notes: string;
  onChange: (value: string) => void;
}

const NotesInput = memo<NotesInputProps>(function NotesInput({ notes, onChange }) {
  const noteLen = clampInt(notes.length, 0, MAX_NOTES_LENGTH);
  const noteRatio = noteLen / MAX_NOTES_LENGTH;
  const counterDash = Math.round((1 - noteRatio) * 100);
  const counterNear = noteRatio >= 0.8;
  const counterFull = noteRatio >= 0.95;

  return (
    <div className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="font-sans text-[0.95rem] font-semibold text-(--menu-modal-text)">
            Special instructions
          </p>
          <p className="mt-0.5 text-xs text-(--menu-modal-faint)">
            Allergies, preferences, cooking requests
          </p>
        </div>

        <div className="relative h-8 w-8 shrink-0" aria-hidden="true">
          <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              strokeWidth="2"
              className="stroke-(--menu-modal-border)"
              strokeDasharray="100 100"
            />
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              strokeWidth="2"
              className={cx(
                'transition-all duration-200',
                counterFull
                  ? 'stroke-(--menu-modal-danger-text)'
                  : counterNear
                    ? 'stroke-(--menu-modal-accent)'
                    : 'stroke-(--menu-modal-subtle)',
              )}
              strokeDasharray="100 100"
              strokeDashoffset={counterDash}
              strokeLinecap="round"
            />
          </svg>
          {counterNear && (
            <span
              className={cx(
                'absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums',
                counterFull ? 'text-(--menu-modal-danger-text)' : 'text-(--menu-modal-accent)',
              )}
            >
              {MAX_NOTES_LENGTH - noteLen}
            </span>
          )}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={MAX_NOTES_LENGTH}
        className={cx(
          'w-full resize-none rounded-2xl border px-4 py-3.5',

          'font-sans text-[16px] leading-relaxed',

          'bg-(--menu-modal-input-bg) text-(--menu-modal-text) placeholder:text-(--menu-modal-faint)',

          'border-(--menu-modal-border)',

          'outline-none transition-all duration-150',

          'focus:border-(--menu-modal-accent)/40 focus:ring-2 focus:ring-(--menu-modal-focus-ring)',
        )}
        placeholder="Add a note for the kitchen (optional)…"
        aria-label="Special instructions"
        aria-describedby="notes-char-count"
      />
      <p id="notes-char-count" className="sr-only">
        {noteLen} of {MAX_NOTES_LENGTH} characters used
      </p>
    </div>
  );
});

// ─── §1.8  Sticky Footer — Compact Action Bar ──────────────────────────────
//
// REDESIGNED: Single horizontal row replaces the old stacked 2-row layout.
//
//   ┌─────────────────────────────────────────────────────────────┐
//   │  [–] 2 [+]          [ Add to Order          · $24.98 ] │
//   └─────────────────────────────────────────────────────────────┘
//
// • Price lives ONLY inside the CTA — zero redundancy.
// • Validation hint replaces CTA label ("Choose options") — no extra line.
// • Legal copy removed (belongs at checkout, not on conversion surface).
// • ~60 px height vs ~140 px before — nearly halved.
//
// The CTA gold gradient is intentionally retained across themes — gold is
// the brand conversion focal point and reads on both cream and stone surfaces.
// Success / adding states are semantic and also kept fixed.

interface StickyFooterProps {
  safeQty: number;
  maxQty: number;
  preflightLoading: boolean;
  stickyTotalLabel: string;
  canAdd: boolean;
  phase: CartPhase;
  ctaLabel: string;
  modifierRulesOk: boolean;
  onSetQty: (updater: (q: number) => number) => void;
  onAddToCart: () => void;
}

const StickyFooter = memo<StickyFooterProps>(function StickyFooter({
  safeQty,
  maxQty,
  preflightLoading,
  stickyTotalLabel,
  canAdd,
  phase,
  ctaLabel,
  modifierRulesOk,
  onSetQty,
  onAddToCart,
}) {
  const isIdle = phase === 'idle';
  const isSuccess = phase === 'success';
  const isAdding = phase === 'adding';
  const ctaDisabled = !canAdd || !isIdle;

  return (
    <div
      className={cx(
        'shrink-0 border-t border-(--menu-modal-border)',
        'bg-(--menu-modal-footer-bg) backdrop-blur-2xl',
        'px-4 sm:px-5',
      )}
      style={{
        boxShadow: 'var(--menu-modal-footer-shadow)',
        paddingTop: '12px',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
      }}
    >
      <div className="flex items-center gap-3">
        {/* ── Compact Qty Stepper ────────────────────────────────────── */}
        <div className="flex shrink-0 items-center rounded-2xl border border-(--menu-modal-border) bg-(--menu-modal-control-bg)">
          <button
            type="button"
            onClick={() => onSetQty((q) => clampInt(q - 1, 1, maxQty))}
            disabled={safeQty <= 1 || preflightLoading}
            className={cx(
              'flex h-10 w-10 items-center justify-center',
              'text-(--menu-modal-subtle) transition-all duration-100',
              'hover:text-(--menu-modal-text) active:scale-90',
              'disabled:opacity-25 disabled:active:scale-100',
            )}
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>

          <span
            className="flex h-10 w-9 items-center justify-center border-x border-(--menu-modal-border) text-sm font-bold tabular-nums text-(--menu-modal-text)"
            aria-live="polite"
            aria-label={`Quantity: ${safeQty}`}
          >
            {safeQty}
          </span>

          <button
            type="button"
            onClick={() => onSetQty((q) => clampInt(q + 1, 1, maxQty))}
            disabled={safeQty >= maxQty || preflightLoading}
            className={cx(
              'flex h-10 w-10 items-center justify-center',
              'text-(--menu-modal-subtle) transition-all duration-100',
              'hover:text-(--menu-modal-text) active:scale-90',
              'disabled:opacity-25 disabled:active:scale-100',
            )}
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* ── CTA — brand-gold (theme-stable), disabled state theme-aware ── */}
        <button
          type="button"
          onClick={onAddToCart}
          disabled={ctaDisabled}
          aria-disabled={ctaDisabled}
          aria-label={
            isSuccess
              ? 'Added to cart'
              : isAdding
                ? 'Adding to cart'
                : canAdd
                  ? `Add to order, ${stickyTotalLabel}`
                  : ctaLabel
          }
          className={cx(
            'relative flex h-12 min-w-0 flex-1 items-center justify-between gap-3',
            'rounded-xl px-5 font-sans text-sm font-semibold tracking-[-0.01em]',
            'transition-all duration-200',
            // Success
            isSuccess && 'bg-emerald-500 text-white shadow-[0_2px_12px_rgb(16_185_129/0.4)]',
            // Enabled idle — brand gold (intentionally fixed across themes)
            canAdd &&
              isIdle &&
              'bg-linear-to-r from-amber-400 via-yellow-300 to-amber-400 text-stone-950 shadow-[0_6px_24px_rgb(245_158_11/0.30)] hover:shadow-[0_8px_34px_rgb(245_158_11/0.42)] active:scale-[0.98]',
            // Disabled / validation needed — theme-aware
            !canAdd &&
              isIdle &&
              'bg-(--menu-modal-control-bg) text-(--menu-modal-subtle) cursor-not-allowed',
            // Adding (spinner) — intentionally fixed
            isAdding && 'bg-amber-500/80 text-neutral-950 cursor-wait',
          )}
        >
          {/* Left label */}
          <span className="truncate">
            {isSuccess ? (
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" aria-hidden="true" />
                Added!
              </span>
            ) : isAdding ? (
              <span className="inline-flex items-center gap-2">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                Adding…
              </span>
            ) : canAdd ? (
              'Add to Order'
            ) : (
              ctaLabel
            )}
          </span>

          {/* Right price badge — only when actionable. Sits inside the gold CTA, so
              the dark wash is theme-stable like the CTA itself. */}
          {canAdd && isIdle && (
            <span className="shrink-0 rounded-lg bg-neutral-950/15 px-2.5 py-1 text-xs font-bold tabular-nums">
              {preflightLoading ? (
                <span className="inline-block h-3.5 w-12 animate-pulse rounded bg-neutral-950/20" />
              ) : (
                stickyTotalLabel
              )}
            </span>
          )}

          {/* Inline validation pointer */}
          {!modifierRulesOk && isIdle && !canAdd && (
            <span className="shrink-0 text-2xs font-medium text-(--menu-modal-accent-muted)">
              required ↑
            </span>
          )}
        </button>
      </div>
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// §2  MAIN COMPONENT — Orchestrator (all state + hooks live here)
// ═════════════════════════════════════════════════════════════════════════════

interface Props {
  item: MenuItemPublic;
  onClose: () => void;
}

export default function MenuItemModal({ item, onClose }: Props) {
  injectKeyframes();

  const { addItem } = useCart();
  const titleId = useId();

  // ── Derived item fields ────────────────────────────────────────────────────

  const invalidItem = !isMenuItemPublic(item);

  const rec: Record<string, unknown> = isRecord(item) ? item : {};
  const id = safeStr(rec.id, '', 128);
  const name = safeStr(rec.name, 'Menu item', 120);
  const categoryLabel = safeStr(rec.category, 'menu', 40);
  const description = safeStr(rec.description, '', 1200);

  const rawImageUrl = rec.image_url;
  const imageUrl =
    typeof rawImageUrl === 'string' && rawImageUrl.trim() ? rawImageUrl.trim() : null;

  const rawTags = rec.tags;
  const tags = useMemo(() => parseTags(rawTags), [rawTags]);

  const rawPopularityScore = rec.popularity_score;
  const isPopular =
    rec.is_popular === true ||
    rec.isPopular === true ||
    (typeof rawPopularityScore === 'number' &&
      Number.isFinite(rawPopularityScore) &&
      rawPopularityScore >= 80);

  const scrollToken = id ? `menu-item:${id}` : 'menu-item:unknown';
  useScrollLock({ enabled: true, token: scrollToken });
  // ── Phase + notes ──────────────────────────────────────────────────────────

  const [phase, setPhase] = useState<CartPhase>('idle');
  const [notes, setNotes] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const onLiveStatus = useCallback((msg: string) => setLiveStatus(msg), []);

  // ── Timers ─────────────────────────────────────────────────────────────────

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // ── Hooks ──────────────────────────────────────────────────────────────────

  const { safeQty, maxQty, setQty, clampToServerMax } = useMenuItemQty();

  const { preflight, preflightLoading, preflightError, runPreflight, abortRef } =
    useMenuItemPreflight(id, onLiveStatus, clampToServerMax);

  const {
    modifierGroups,
    groupsLoading,
    groupsError,
    selected,
    expandedGroups,
    selectionPrunedWarning,
    maxSelectionHint,
    loadModifierGroups,
    setSelectionForGroup,
    toggleGroupExpanded,
    clearSelections,
  } = useMenuItemModifiers(id, onLiveStatus);

  // ── Close ──────────────────────────────────────────────────────────────────

  const close = useCallback(() => {
    unlockScroll(scrollToken);
    onClose();
  }, [onClose, scrollToken]);

  // ── Focus management ───────────────────────────────────────────────────────

  useEffect(() => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => {
      closeBtnRef.current?.focus();
    });
    return () => {
      unlockScroll(scrollToken);
      queueMicrotask(() => {
        const el = lastFocusRef.current;
        if (el && document.contains(el)) el.focus();
      });
    };
  }, [scrollToken]);

  // ── Keyboard: ESC + focus trap ─────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = getFocusable(dialog);
      if (!focusables.length) return;
      const idx = focusables.findIndex((x) => x === document.activeElement);
      const lastIdx = focusables.length - 1;
      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          focusables[lastIdx]?.focus();
        }
      } else {
        if (idx === -1 || idx >= lastIdx) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // ── Cleanup ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const abort = abortRef.current;
    const debounceTmr = debounceTimer;
    const addTmr = addTimer;
    const successTmr = successTimer;
    return () => {
      abort?.abort();
      if (debounceTmr.current) clearTimeout(debounceTmr.current);
      if (addTmr.current) clearTimeout(addTmr.current);
      if (successTmr.current) clearTimeout(successTmr.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced preflight ────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void runPreflight(safeQty);
    }, 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [id, safeQty, runPreflight]);

  // ── Derived price ──────────────────────────────────────────────────────────

  const unitPriceCents = useMemo(
    () => (preflight?.ok === true ? safeCents(preflight.unit_price_cents, 0) : 0),
    [preflight],
  );
  const modifiersCents = useMemo(() => computeSelectedModifierCents(selected), [selected]);
  const lineTotalCents = useMemo(
    () => (unitPriceCents + modifiersCents) * safeQty,
    [unitPriceCents, modifiersCents, safeQty],
  );

  const isLowStock = useMemo(() => {
    if (preflight?.ok !== true || preflight.stock_count == null) return false;
    const thr = preflight.low_stock_threshold ?? 5;
    return preflight.stock_count > 0 && preflight.stock_count <= thr;
  }, [preflight]);

  // ── Modifier validation ────────────────────────────────────────────────────

  const selectionBlockedIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const g of modifierGroups) {
      for (const s of selected[g.id] ?? []) {
        const mod = g.modifiers.find((m) => m.id === s.id);
        if (!mod || !mod.available) blocked.add(s.id);
      }
    }
    return blocked;
  }, [modifierGroups, selected]);

  const modifierRulesOk = useMemo(() => {
    for (const g of modifierGroups) {
      if (!isSelectionValidForGroup(g, selected[g.id] ?? [])) return false;
    }
    return true;
  }, [modifierGroups, selected]);

  const hasBlockedSelections = selectionBlockedIds.size > 0;

  const canAdd =
    phase === 'idle' &&
    preflight?.ok === true &&
    preflight.available === true &&
    unitPriceCents > 0 &&
    !preflightLoading &&
    modifierRulesOk &&
    !hasBlockedSelections;

  const requiredHint = useMemo(() => {
    if (!modifierGroups.length) return null;
    const missing = modifierGroups
      .filter((g) => !isSelectionValidForGroup(g, selected[g.id] ?? []))
      .map((g) => g.name);
    if (!missing.length) return null;
    return `Choose required options: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''}`;
  }, [modifierGroups, selected]);

  // ── Add to cart ────────────────────────────────────────────────────────────

  const handleAddToCart = useCallback(() => {
    if (!canAdd) {
      if (!modifierRulesOk) setLiveStatus('Choose required options before adding.');
      return;
    }
    if (preflight?.ok !== true || phase !== 'idle') return;

    setPhase('adding');
    setLiveStatus('Adding to cart…');

    if (addTimer.current) clearTimeout(addTimer.current);
    addTimer.current = setTimeout(() => {
      const chosen: Array<{
        id: string;
        groupId: string;
        name: string;
        priceAdjustmentCents: number;
      }> = [];

      for (const g of modifierGroups) {
        for (const s of selected[g.id] ?? []) {
          chosen.push({
            id: s.id,
            groupId: s.modifier_group_id,
            name: s.name,
            priceAdjustmentCents: safeCents(s.price_adjustment, 0),
          });
        }
      }

      const note = safeStr(notes, '', MAX_NOTES_LENGTH);
      const notesOrNull = note.length ? note : null;

      const pricingHash = `v2:preflight:${id}:${preflight.unit_price_cents}:mods:${canonicalizeSelectionsForHash(selected)}:qty:${safeQty}`;

      addItem({
        menuItemId: id,
        name,
        unitPriceCents: preflight.unit_price_cents,
        imageUrl: imageUrl ?? null,
        category: item.category,
        modifiers: chosen,
        quantity: safeQty,
        notes: notesOrNull,
        pricingHash,
      });

      setPhase('success');
      setLiveStatus('Added!');

      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => close(), 900);
    }, 180);
  }, [
    canAdd,
    modifierRulesOk,
    preflight,
    phase,
    addItem,
    id,
    name,
    imageUrl,
    item.category,
    safeQty,
    notes,
    modifierGroups,
    selected,
    close,
  ]);

  // ── Derived labels ─────────────────────────────────────────────────────────

  const stickyTotalLabel = useMemo(() => fmtUsdFromCents(lineTotalCents), [lineTotalCents]);
  const basePriceLabel = useMemo(() => fmtUsdFromCents(unitPriceCents), [unitPriceCents]);
  const extrasLabel = useMemo(
    () => (modifiersCents > 0 ? `+ ${fmtUsdFromCents(modifiersCents)} extras` : null),
    [modifiersCents],
  );
  const unavailable = preflight?.ok === true && preflight.available === false;

  const ctaLabel = invalidItem
    ? 'Unavailable'
    : preflightLoading
      ? 'Checking…'
      : phase === 'adding'
        ? 'Adding…'
        : phase === 'success'
          ? 'Added!'
          : unavailable
            ? 'Unavailable'
            : !modifierRulesOk
              ? 'Choose options'
              : 'Add to Order';

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-100" role="presentation">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {/* Backdrop — theme-aware scrim */}
      <div
        className="absolute inset-0 backdrop-blur-sm"
        aria-hidden="true"
        style={{
          animation: 'sofi-modal-backdrop 200ms ease both',
          background: 'var(--menu-modal-backdrop)',
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          close();
        }}
      />

      <div className="absolute inset-0 flex items-end justify-center sm:items-center sm:p-5">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cx(
            'relative flex w-full flex-col font-sans',
            'max-h-[94dvh] sm:max-h-[88vh] sm:max-w-xl',
            'rounded-t-[2rem] sm:rounded-[2rem]',
            'overflow-hidden',
            'text-(--menu-modal-text)',
            'border border-(--menu-modal-border)',
            'ring-1 ring-(--menu-modal-ring)',
          )}
          style={{
            animation: 'sofi-modal-dialog 380ms cubic-bezier(0.16,1,0.3,1) both',
            background: 'var(--menu-modal-bg)',
            boxShadow: 'var(--menu-modal-shadow)',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex shrink-0 justify-center pb-1 pt-3 sm:hidden" aria-hidden="true">
            <div
              className="h-1.5 w-12 rounded-full bg-(--menu-modal-border-strong)"
              style={{ boxShadow: '0 0 18px var(--menu-modal-accent-glow)' }}
            />
          </div>

          <ModalHeader
            titleId={titleId}
            categoryLabel={categoryLabel}
            name={name}
            isPopular={isPopular}
            basePriceLabel={basePriceLabel}
            extrasLabel={extrasLabel}
            preflightOk={preflight?.ok === true}
            preflightLoading={preflightLoading}
            closeBtnRef={closeBtnRef}
            onClose={close}
          />

          <div
            className={cx(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              'px-5 sm:px-6',
              '[-webkit-overflow-scrolling:touch]',
              'scrollbar-thin [scrollbar-color:var(--menu-modal-border-strong)_transparent]',
            )}
            style={{
              paddingBottom: 'calc(80px + env(safe-area-inset-bottom))',
            }}
          >
            {invalidItem ? (
              <div
                className={cx(
                  'mt-6 flex items-start gap-3 rounded-2xl border px-4 py-4',
                  'border-(--menu-modal-danger-border) bg-(--menu-modal-danger-bg)',
                )}
                role="alert"
              >
                <Info
                  className="mt-0.5 h-5 w-5 shrink-0 text-(--menu-modal-danger-text)"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-(--menu-modal-danger-text)">
                    This item can't be opened right now.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className={cx(
                      'mt-3 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors active:scale-95',
                      'border-(--menu-modal-border) bg-(--menu-modal-control-bg) text-(--menu-modal-muted)',
                      'hover:bg-(--menu-modal-control-hover)',
                    )}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mt-5">
                  <MenuItemModalImage
                    imageUrl={imageUrl}
                    name={name}
                    description={description}
                    tags={tags}
                  />
                </div>

                <StatusAlerts
                  preflightError={preflightError}
                  isLowStock={isLowStock}
                  stockCount={preflight?.ok === true ? (preflight.stock_count ?? null) : null}
                  unavailable={unavailable}
                  selectionPrunedWarning={selectionPrunedWarning}
                  hasBlockedSelections={hasBlockedSelections}
                />

                <ModifiersSection
                  modifierGroups={modifierGroups}
                  groupsLoading={groupsLoading}
                  groupsError={groupsError}
                  selected={selected}
                  expandedGroups={expandedGroups}
                  selectionBlockedIds={selectionBlockedIds}
                  maxSelectionHint={maxSelectionHint}
                  onToggleGroupExpanded={toggleGroupExpanded}
                  onSetSelectionForGroup={setSelectionForGroup}
                  onClearSelections={clearSelections}
                  onLoadModifierGroups={loadModifierGroups}
                />

                <NotesInput notes={notes} onChange={setNotes} />

                {requiredHint && <AlertBanner variant="warning">{requiredHint}</AlertBanner>}

                <div className="h-24" aria-hidden="true" />
              </>
            )}
          </div>

          {!invalidItem && (
            <StickyFooter
              safeQty={safeQty}
              maxQty={maxQty}
              preflightLoading={preflightLoading}
              stickyTotalLabel={stickyTotalLabel}
              canAdd={canAdd}
              phase={phase}
              ctaLabel={ctaLabel}
              modifierRulesOk={modifierRulesOk}
              onSetQty={setQty}
              onAddToCart={handleAddToCart}
            />
          )}
        </div>
      </div>
    </div>
  );
}