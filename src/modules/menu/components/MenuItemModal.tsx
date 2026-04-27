// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// MENU ITEM MODAL — 2026 Luxury Edition
// =============================================================================
// Visual overhaul:
//   - Cinematic modal entry animation (desktop: scale+rise, mobile: sheet-up)
//   - Richer glassmorphism header with warm-tinted surface
//   - Editorial price display with server-confirmed badge
//   - Redesigned modifier groups with tactile check indicators
//   - Premium quantity stepper with animated counter
//   - Polished sticky footer with total breakdown
//   - Accessible colour contrast on all interactive states
//   - All contracts and logic unchanged from source
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Info, Minus, Plus, Star, X, AlertCircle, Flame } from 'lucide-react';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { unlockScroll } from '@/lib/ui/scroll-lock';

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

interface Props {
  item: MenuItemPublic;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function TagPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium tracking-wide text-zinc-300">
      {label}
    </span>
  );
}

function AlertStrip({
  variant,
  children,
}: {
  variant: 'warning' | 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const styles = {
    warning: 'border-amber-500/20 bg-amber-500/[0.07] text-amber-200',
    error:   'border-red-500/20   bg-red-500/[0.07]   text-red-200',
    success: 'border-green-500/20 bg-green-500/[0.07] text-green-200',
    info:    'border-white/10     bg-white/[0.04]     text-zinc-300',
  };

  const icons = {
    warning: <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />,
    error:   <AlertCircle className="h-4 w-4 shrink-0 text-red-400   mt-0.5" aria-hidden="true" />,
    success: <Check        className="h-4 w-4 shrink-0 text-green-400 mt-0.5" aria-hidden="true" />,
    info:    <Info         className="h-4 w-4 shrink-0 text-zinc-400  mt-0.5" aria-hidden="true" />,
  };

  return (
    <div className={cx('mt-4 flex items-start gap-2.5 rounded-2xl border p-4 text-sm leading-relaxed', styles[variant])}>
      {icons[variant]}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MenuItemModal({ item, onClose }: Props) {
  const { addItem } = useCart();

  const invalidItem = !isMenuItemPublic(item);

  const rec = isRecord(item) ? (item as Record<string, unknown>) : {};
  const id = safeStr(rec.id, '', 128);
  const name = safeStr(rec.name, 'Menu item', 120);

  const scrollToken = id ? `menu-item:${id}` : 'menu-item:unknown';
  useScrollLock({ enabled: true, token: scrollToken });

  const categoryLabel = safeStr(rec.category, 'menu', 40);
  const description = safeStr(rec.description, '', 1200);
  const imageUrl =
    typeof rec.image_url === 'string' && rec.image_url.trim() ? rec.image_url.trim() : null;
  const tags = useMemo(() => parseTags(rec.tags), [rec.tags]);

  const isPopular =
    rec.is_popular === true ||
    rec.isPopular === true ||
    (typeof rec.popularity_score === 'number' &&
      Number.isFinite(rec.popularity_score) &&
      rec.popularity_score >= 80);

  // ── Phase + notes ────────────────────────────────────────────────────────────

  type CartPhase = 'idle' | 'adding' | 'success';
  const [phase, setPhase] = useState<CartPhase>('idle');
  const [notes, setNotes] = useState<string>('');
  const [liveStatus, setLiveStatus] = useState<string>('');
  const onLiveStatus = useCallback((msg: string) => setLiveStatus(msg), []);

  // ── Timers ───────────────────────────────────────────────────────────────────

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Modal refs ───────────────────────────────────────────────────────────────

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // ── Hooks ────────────────────────────────────────────────────────────────────

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

  // ── Close ────────────────────────────────────────────────────────────────────

  const close = useCallback(() => {
    unlockScroll(scrollToken);
    onClose();
  }, [onClose, scrollToken]);

  // ── Focus restore ────────────────────────────────────────────────────────────

  useEffect(() => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => closeBtnRef.current?.focus());

    return () => {
      unlockScroll(scrollToken);
      queueMicrotask(() => {
        const el = lastFocusRef.current;
        if (el && document.contains(el)) el.focus();
      });
    };
  }, [scrollToken]);

  // ── Keyboard: ESC + focus trap ───────────────────────────────────────────────

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
      const last = focusables.length - 1;

      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          focusables[last]?.focus();
        }
      } else {
        if (idx === -1 || idx >= last) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const abort = abortRef.current;
    const d = debounceTimer;
    const a = addTimer;
    const s = successTimer;
    return () => {
      abort?.abort();
      if (d.current) clearTimeout(d.current);
      if (a.current) clearTimeout(a.current);
      if (s.current) clearTimeout(s.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced preflight ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void runPreflight(safeQty), 200);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [id, safeQty, runPreflight]);

  // ── Derived price ────────────────────────────────────────────────────────────

  const unitPriceCents = useMemo(() => {
    if (preflight?.ok === true) return safeCents(preflight.unit_price_cents, 0);
    return 0;
  }, [preflight]);

  const modifiersCents = useMemo(() => computeSelectedModifierCents(selected), [selected]);

  const lineTotalCents = useMemo(
    () => (unitPriceCents + modifiersCents) * safeQty,
    [unitPriceCents, modifiersCents, safeQty],
  );

  const isLowStock = useMemo(() => {
    if (preflight?.ok !== true) return false;
    if (preflight.stock_count == null) return false;
    const thr = preflight.low_stock_threshold ?? 5;
    return preflight.stock_count > 0 && preflight.stock_count <= thr;
  }, [preflight]);

  // ── Modifier validation ──────────────────────────────────────────────────────

  const selectionBlockedIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const g of modifierGroups) {
      const sels = selected[g.id] ?? [];
      for (const s of sels) {
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
    return `Required: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''}`;
  }, [modifierGroups, selected]);

  // ── Add to cart ──────────────────────────────────────────────────────────────

  const handleAddToCart = useCallback(() => {
    if (!canAdd) {
      if (!modifierRulesOk) setLiveStatus('Choose required options before adding.');
      return;
    }
    if (preflight?.ok !== true) return;
    if (phase !== 'idle') return;

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
      successTimer.current = setTimeout(() => close(), 920);
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

  // ── Derived labels ───────────────────────────────────────────────────────────

  const stickyTotalLabel = useMemo(() => fmtUsdFromCents(lineTotalCents), [lineTotalCents]);
  const basePriceLabel = useMemo(() => fmtUsdFromCents(unitPriceCents), [unitPriceCents]);
  const extrasLabel = useMemo(() => {
    if (modifiersCents <= 0) return null;
    return `+${fmtUsdFromCents(modifiersCents)} options`;
  }, [modifiersCents]);

  const unavailable = preflight?.ok === true && preflight.available === false;

  const addBtnLabel = invalidItem
    ? 'Unavailable'
    : preflightLoading
      ? 'Checking…'
      : phase === 'adding'
        ? 'Adding…'
        : phase === 'success'
          ? '✓ Added!'
          : unavailable
            ? 'Unavailable'
            : !modifierRulesOk
              ? 'Choose options'
              : `Add to Order · ${stickyTotalLabel}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50">
      {/* ── Backdrop ── */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-backdrop-in"
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          close();
        }}
      />

      {/* ── Centering wrapper ── */}
      <div className="absolute inset-0 flex items-end justify-center p-0 sm:items-center sm:p-4">
        {/* ── Dialog card ── */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} — customize and add to order`}
          className={cx(
            // Structure
            'w-full sm:max-w-2xl flex flex-col min-h-0',
            // Shape — full bottom sheet on mobile, rounded card on desktop
            'rounded-t-[2rem] sm:rounded-3xl overflow-hidden',
            // Surface
            'bg-[#161410] border border-white/[0.07]',
            // Shadow & depth
            'shadow-[0_32px_100px_rgb(0_0_0/0.70),_0_8px_24px_rgb(0_0_0/0.40)]',
            // Height
            'max-h-[94vh] sm:max-h-[90vh]',
            // Entry animation
            'animate-sheet-in sm:animate-modal-in',
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Live region */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveStatus}
          </div>

          {/* ── Drag pill — mobile only ── */}
          <div className="sm:hidden flex justify-center pt-3 pb-1 flex-shrink-0" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-white/20" />
          </div>

          {/* ── Header ── */}
          <header className="flex-shrink-0 border-b border-white/[0.07] bg-[#161410]/95 backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4 px-6 py-5">
              <div className="min-w-0 flex-1">
                {/* Eyebrow */}
                <p className="modal-eyebrow">{categoryLabel}</p>

                {/* Title + Popular badge */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
                  <h2 className="text-[1.35rem] font-bold leading-tight tracking-tight text-white">
                    {name}
                  </h2>
                  {isPopular && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/12 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-300 ring-1 ring-amber-400/25 animate-scale-pop">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      Popular
                    </span>
                  )}
                </div>

                {/* Price row */}
                <div className="mt-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  {preflightLoading ? (
                    <div className="h-5 w-20 skeleton-dark rounded-md" aria-hidden="true" />
                  ) : preflight?.ok === true ? (
                    <>
                      <span className="text-xl font-bold tabular-nums text-amber-300/90">
                        {basePriceLabel}
                      </span>
                      {extrasLabel && (
                        <span className="text-xs text-zinc-500 tabular-nums">{extrasLabel}</span>
                      )}
                      <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-green-500/80"
                          aria-hidden="true"
                        />
                        live price
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-zinc-600">—</span>
                  )}
                </div>
              </div>

              {/* Close button */}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className={cx(
                  'flex-shrink-0 inline-flex h-10 w-10 items-center justify-center',
                  'rounded-xl border border-white/10 bg-white/[0.05]',
                  'text-zinc-400 transition-all duration-200',
                  'hover:border-white/20 hover:bg-white/10 hover:text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30',
                  'active:scale-90',
                )}
                aria-label="Close"
              >
                <X className="h-4.5 w-4.5" aria-hidden="true" />
              </button>
            </div>
          </header>

          {/* ── Scrollable body ── */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
            <div className="px-6 pb-8 pt-5 space-y-6">
              {invalidItem ? (
                <AlertStrip variant="error">
                  <p className="font-semibold text-red-100">Item unavailable</p>
                  <p className="mt-1 text-xs text-red-300/70">
                    This item can't be opened right now. Please try again.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-100 hover:bg-red-500/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
                  >
                    Close
                  </button>
                </AlertStrip>
              ) : (
                <>
                  {/* ── Hero image ── */}
                  <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] aspect-[16/7]">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2">
                        <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center">
                          <Flame className="h-6 w-6 text-amber-400/40" aria-hidden="true" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold text-white/70">Sofi's Kitchen</p>
                          <p className="mt-0.5 text-xs text-zinc-600">
                            Fresh plates, made to order
                          </p>
                        </div>
                      </div>
                    )}
                    {/* Gradient overlay */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#161410]/60 via-transparent to-transparent" />
                    {/* Subtle vignette */}
                    <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/[0.06]" />
                  </div>

                  {/* ── Description & tags ── */}
                  {(description || tags.length > 0) && (
                    <div>
                      {description && (
                        <p className="text-sm leading-relaxed text-zinc-400">{description}</p>
                      )}
                      {tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {tags.slice(0, 10).map((t) => (
                            <TagPill key={t} label={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Alerts ── */}
                  {preflightError && <AlertStrip variant="error">{preflightError}</AlertStrip>}
                  {isLowStock && preflight?.ok === true && preflight.stock_count != null && (
                    <AlertStrip variant="warning">
                      Only <strong>{preflight.stock_count}</strong> remaining — order soon.
                    </AlertStrip>
                  )}
                  {unavailable && (
                    <AlertStrip variant="error">This item is currently unavailable.</AlertStrip>
                  )}
                  {selectionPrunedWarning && (
                    <AlertStrip variant="warning">{selectionPrunedWarning}</AlertStrip>
                  )}
                  {hasBlockedSelections && (
                    <AlertStrip variant="error">
                      Some selected options are no longer available. Please update your choices.
                    </AlertStrip>
                  )}

                  {/* ── Modifier groups ── */}
                  <section aria-label="Customization options">
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <div>
                        <p className="section-eyebrow-light">Customize your order</p>
                        <p className="mt-1 text-[11px] text-zinc-600 leading-relaxed">
                          Options validated server-side at checkout.
                        </p>
                      </div>
                      {modifierGroups.length > 0 && (
                        <button
                          type="button"
                          onClick={clearSelections}
                          className="btn btn-ghost-dark btn-sm shrink-0"
                          aria-label="Clear all selections"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    {groupsLoading ? (
                      <div className="space-y-2.5">
                        {SKELETON_IDS.map((id) => (
                          <div
                            key={id}
                            className="h-16 skeleton-dark rounded-2xl"
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    ) : groupsError ? (
                      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
                        <div className="flex items-start gap-3.5">
                          <div className="flex-shrink-0 h-9 w-9 rounded-xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center">
                            <Info className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">Options unavailable</p>
                            <p className="mt-1 text-xs text-zinc-500">{groupsError}</p>
                            <button
                              type="button"
                              onClick={() => void loadModifierGroups()}
                              className="mt-3 btn btn-ghost-dark btn-sm"
                              aria-label="Retry loading options"
                            >
                              Retry
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : modifierGroups.length === 0 ? (
                      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-5 py-4 text-sm text-zinc-500">
                        No customization options for this item.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {modifierGroups.map((g) => {
                          const sels = selected[g.id] ?? [];
                          const expanded = Boolean(expandedGroups[g.id]);
                          const valid = isSelectionValidForGroup(g, sels);
                          const rangeLabel = groupSelectionRangeLabel(g);
                          const selectedCount = sels.length;
                          const max = g.max_selections ?? (g.type === 'radio' ? 1 : null);
                          const min = g.min_selections ?? (g.required ? 1 : 0);
                          const isRequired = g.required || min > 0;

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
                              key={g.id}
                              className={cx('modifier-group', !valid && 'modifier-group--invalid')}
                            >
                              {/* Group toggle */}
                              <button
                                type="button"
                                onClick={() => toggleGroupExpanded(g.id)}
                                className="modifier-group-toggle"
                                aria-expanded={expanded}
                                aria-label={`${g.name} options, ${isRequired ? 'required' : 'optional'}`}
                              >
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-white truncate">
                                      {g.name}
                                    </span>
                                    <span
                                      className={
                                        isRequired ? 'badge-required badge' : 'badge-optional badge'
                                      }
                                    >
                                      {isRequired ? 'Required' : 'Optional'}
                                    </span>
                                  </div>
                                  {g.description ? (
                                    <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">
                                      {g.description}
                                    </p>
                                  ) : (
                                    <p className="mt-0.5 text-xs text-zinc-600">{subline}</p>
                                  )}
                                  {!valid && (
                                    <p className="mt-1 text-[11px] font-semibold text-amber-300">
                                      {selectedCount < min
                                        ? `Select at least ${min}`
                                        : max != null
                                          ? `Max ${max} allowed`
                                          : 'Selection required'}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {selectedCount > 0 && (
                                    <span className="badge badge-amber text-[10px] px-2 py-0.5">
                                      {selectedCount}
                                    </span>
                                  )}
                                  <ChevronDown
                                    className={cx(
                                      'h-4.5 w-4.5 text-zinc-500 transition-transform duration-300',
                                      expanded && 'rotate-180',
                                    )}
                                    aria-hidden="true"
                                  />
                                </div>
                              </button>

                              {/* Modifier options */}
                              {expanded && (
                                <div className="border-t border-white/[0.06] px-4 py-3">
                                  <div className="grid gap-2">
                                    {g.modifiers.map((m) => {
                                      const on = sels.some((s) => s.id === m.id);
                                      const disabled = !m.available;

                                      return (
                                        <button
                                          key={m.id}
                                          type="button"
                                          disabled={disabled}
                                          onClick={() => setSelectionForGroup(g, m)}
                                          className={cx(
                                            'modifier-option',
                                            on && 'modifier-option--selected',
                                          )}
                                          aria-pressed={on}
                                          aria-label={`${m.name}${disabled ? ', unavailable' : ''}`}
                                        >
                                          <div className="min-w-0">
                                            <p
                                              className={cx(
                                                'text-sm font-medium truncate',
                                                on ? 'text-white' : 'text-zinc-200',
                                              )}
                                            >
                                              {m.name}
                                            </p>
                                            <p className="mt-0.5 text-[11px] text-zinc-500">
                                              {m.price_adjustment !== 0
                                                ? `${m.price_adjustment > 0 ? '+' : ''}${fmtUsdFromCents(m.price_adjustment)}`
                                                : 'No extra cost'}
                                              {!m.available ? ' · Unavailable' : ''}
                                            </p>
                                          </div>

                                          <div
                                            className={cx(
                                              'modifier-check flex-shrink-0',
                                              on ? 'modifier-check--on' : 'modifier-check--off',
                                            )}
                                          >
                                            {on && (
                                              <Check
                                                className="h-3.5 w-3.5 text-amber-300"
                                                aria-hidden="true"
                                              />
                                            )}
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>

                                  {maxSelectionHint && (
                                    <p className="mt-3 text-xs font-semibold text-amber-300/80">
                                      {maxSelectionHint}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* ── Special instructions ── */}
                  <section aria-label="Special instructions" className="mt-6">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold tracking-tight text-white">
                          Special instructions
                        </p>
                        <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                          Allergy notes, dietary preferences, or cooking requests.
                        </p>
                      </div>

                      <span className="text-[10px] uppercase tracking-wide text-zinc-500">
                        Optional
                      </span>
                    </div>

                    {/* Input */}
                    <div className="mt-3 relative">
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        maxLength={MAX_NOTES_LENGTH}
                        placeholder='e.g. "No onions, extra sauce, crispy please…"'
                        aria-label="Special instructions for the kitchen"
                        className="
        w-full resize-none rounded-xl
        bg-white/[0.04] 
        border border-white/10
        px-4 py-3 text-sm text-white
        placeholder:text-zinc-500
        backdrop-blur
        transition-all duration-200 ease-(--ease-standard)

        focus:outline-none
        focus:ring-2 focus:ring-(--color-gold-400)/40
        focus:border-(--color-gold-400)/40
        focus:bg-white/[0.06]

        hover:border-white/20
      "
                      />

                      {/* subtle glow (premium touch) */}
                      <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
                    </div>

                    {/* Footer */}
                    <div className="mt-2 flex items-center justify-between">
                      <span
                        className={`
        text-[11px] transition-colors
        ${notes.length > MAX_NOTES_LENGTH * 0.8 ? 'text-amber-400' : 'text-zinc-500'}
      `}
                      >
                        {notes.length > MAX_NOTES_LENGTH * 0.8 ? 'Getting long…' : 'Optional'}
                      </span>

                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        {clampInt(notes.length, 0, 999)}/{MAX_NOTES_LENGTH}
                      </span>
                    </div>
                  </section>

                  {/* Required options hint */}
                  {requiredHint && (
                    <AlertStrip variant="warning">
                      <span className="font-semibold">Action required · </span>
                      {requiredHint}
                    </AlertStrip>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── Sticky footer ── */}
          <footer className="flex-shrink-0 border-t border-white/[0.07] bg-[#161410]/96 backdrop-blur-xl">
            <div className="px-6 py-5">
              {/* Quantity + total row */}
              <div className="flex items-center justify-between gap-4 mb-4">
                {/* Qty stepper */}
                <div className="qty-stepper">
                  <div className="qty-divider" aria-hidden="true" />

                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => setQty((q) => clampInt(q - 1, 1, maxQty))}
                    disabled={safeQty <= 1 || preflightLoading || invalidItem}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="qty-divider" aria-hidden="true" />

                  <span className="qty-value" aria-label={`Quantity: ${safeQty}`}>
                    {safeQty}
                  </span>

                  <div className="qty-divider" aria-hidden="true" />

                  <button
                    type="button"
                    className="qty-btn"
                    onClick={() => setQty((q) => clampInt(q + 1, 1, maxQty))}
                    disabled={safeQty >= maxQty || preflightLoading || invalidItem}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <div className="qty-divider" aria-hidden="true" />
                </div>

                {/* Running total */}
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-600">Total</p>
                  {preflightLoading ? (
                    <div
                      className="mt-1 h-6 w-20 skeleton-dark rounded-md ml-auto"
                      aria-hidden="true"
                    />
                  ) : (
                    <p className="price-total">{stickyTotalLabel}</p>
                  )}
                </div>
              </div>

              {/* Add to order button */}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canAdd || phase !== 'idle' || invalidItem}
                aria-disabled={!canAdd || phase !== 'idle' || invalidItem}
                aria-label={addBtnLabel}
                className={cx(
                  'btn btn-lg w-full rounded-2xl font-semibold transition-all',
                  phase === 'success'
                    ? 'btn-success animate-success-pulse'
                    : canAdd && phase === 'idle' && !invalidItem
                      ? 'btn-primary'
                      : 'btn-ghost-dark opacity-60 cursor-not-allowed',
                )}
              >
                {phase === 'success' ? (
                  <span className="flex items-center gap-2 animate-check-bounce">
                    <Check className="h-4.5 w-4.5" aria-hidden="true" />
                    Added to order!
                  </span>
                ) : (
                  addBtnLabel
                )}
              </button>

              {/* Required nudge */}
              {!modifierRulesOk && !invalidItem && (
                <p className="mt-2.5 text-center text-[11px] font-medium text-amber-300/70">
                  Choose required options to continue
                </p>
              )}

              {/* Trust line */}
              <p className="mt-3 text-center text-[10px] text-zinc-700">
                Final totals, tax & promos confirmed at checkout via Stripe.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}