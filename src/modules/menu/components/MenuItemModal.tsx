// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// MENU ITEM MODAL — Production (2026) — Luxury UX + Modifier Support
// =============================================================================
// Shell: props → hooks → JSX only. All business logic lives in hooks/utils.
//
// Contracts preserved exactly:
//   - preflight invoke + payload shape
//   - modifier selection rules + pruning behavior
//   - addItem payload shape
//   - pricingHash composition
//
// UX upgrades (2026 pass):
//   - Bottom-sheet on mobile, centered dialog on sm+
//   - Keyframe-driven enter animation (scale + fade, no deps)
//   - Full CSS component system (btn, modifier-*, qty-*, alert, badge, etc.)
//   - Drag handle pill on mobile
//   - Premium header with gold accent price row
//   - Modifier groups using component-layer classes (.modifier-group, .modifier-option)
//   - .textarea-dark + animated character counter ring
//   - Sticky footer with .qty-stepper + .btn-cart-added phase transition
//   - aria-labelledby tied to useId() — correct dialog labelling
//   - pointer-events isolation: backdrop mousedown ≠ dialog mousedown
//
// Z-INDEX: z-[100] — must sit above FloatingCartPill (z-40) and BottomNav (z-30).
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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

// ─── Keyframe injection ───────────────────────────────────────────────────────
// Self-contained, SSR-safe, idempotent. No tailwindcss-animate dependency.

const MODAL_KF = `
  @keyframes sofi-modal-backdrop {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sofi-modal-dialog {
    from { opacity: 0; transform: scale(0.97) translateY(10px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }
  @keyframes sofi-modal-sheet {
    from { opacity: 0.7; transform: translateY(48px); }
    to   { opacity: 1;   transform: translateY(0); }
  }
  @keyframes sofi-stagger-in {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sofi-counter-fill {
    from { stroke-dashoffset: 100; }
    to   { stroke-dashoffset: var(--sofi-dash-offset, 0); }
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

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  item: MenuItemPublic;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MenuItemModal({ item, onClose }: Props) {
  injectKeyframes();

  const { addItem } = useCart();
  const titleId = useId();

  const invalidItem = !isMenuItemPublic(item);

  // Treat props as untrusted at runtime (shape-drift safe)
  const rec = isRecord(item) ? (item as Record<string, unknown>) : {};
  const id = safeStr(rec.id, '', 128);
  const name = safeStr(rec.name, 'Menu item', 120);
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
      (rec.popularity_score as number) >= 80);

  const scrollToken = id ? `menu-item:${id}` : 'menu-item:unknown';
  useScrollLock({ enabled: true, token: scrollToken });

  // ── Phase + notes ────────────────────────────────────────────────────────────

  type CartPhase = 'idle' | 'adding' | 'success';
  const [phase, setPhase] = useState<CartPhase>('idle');
  const [notes, setNotes] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const onLiveStatus = useCallback((msg: string) => setLiveStatus(msg), []);

  // ── Timers ───────────────────────────────────────────────────────────────────

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Refs ─────────────────────────────────────────────────────────────────────

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

  // ── Focus management ─────────────────────────────────────────────────────────

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

  // ── Cleanup ──────────────────────────────────────────────────────────────────

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

  // ── Debounced preflight ──────────────────────────────────────────────────────

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

  // ── Derived price ────────────────────────────────────────────────────────────

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

  // ── Modifier validation ──────────────────────────────────────────────────────

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

  // ── Add to cart ──────────────────────────────────────────────────────────────

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

      // IMPORTANT: pricingHash composition must remain intact
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

  // ── Derived labels ───────────────────────────────────────────────────────────

  const headerPriceLabel = useMemo(() => {
    if (preflightLoading) return 'checking…';
    if (preflight?.ok === true) return 'server-confirmed';
    return '—';
  }, [preflightLoading, preflight]);

  const stickyTotalLabel = useMemo(() => fmtUsdFromCents(lineTotalCents), [lineTotalCents]);
  const basePriceLabel = useMemo(() => fmtUsdFromCents(unitPriceCents), [unitPriceCents]);
  const extrasLabel = useMemo(
    () => (modifiersCents > 0 ? `+ ${fmtUsdFromCents(modifiersCents)} options` : null),
    [modifiersCents],
  );

  const unavailable = preflight?.ok === true && preflight.available === false;

  // ── CTA button label ─────────────────────────────────────────────────────────

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

  // Notes character counter derived values
  const noteLen = clampInt(notes.length, 0, MAX_NOTES_LENGTH);
  const noteRatio = noteLen / MAX_NOTES_LENGTH;
  const counterDash = Math.round((1 - noteRatio) * 100);
  const counterNear = noteRatio >= 0.8;
  const counterFull = noteRatio >= 0.95;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* ── Backdrop ────────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
        aria-hidden="true"
        style={{ animation: 'sofi-modal-backdrop 220ms ease both' }}
        onMouseDown={(e) => {
          e.preventDefault();
          close();
        }}
      />

      {/* ── Positioning layer ────────────────────────────────────────────────── */}
      {/*   Mobile: bottom sheet flush to viewport edge                         */}
      {/*   sm+:    centered dialog, constrained width + padding                */}
      <div className="absolute inset-0 flex items-end justify-center sm:items-center sm:p-4 sm:pb-4">
        {/* ── Dialog ──────────────────────────────────────────────────────── */}
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cx(
            // Sizing
            'relative flex w-full min-h-0 flex-col',
            'max-h-[92dvh] sm:max-h-[90vh] sm:max-w-2xl',
            // Shape — bottom-sheet on mobile, card on desktop
            'rounded-t-[28px] sm:rounded-2xl',
            // Surface
            'overflow-hidden bg-neutral-950 text-white',
            // Border + shadow — layered depth
            'border border-white/8',
            'shadow-[0_-12px_48px_rgb(0_0_0/0.55),_0_-1px_0_rgb(255_255_255/0.06)]',
            'sm:shadow-[0_32px_80px_rgb(0_0_0/0.65),_0_0_0_1px_rgb(255_255_255/0.07)]',
          )}
          style={{ animation: 'sofi-modal-dialog 400ms cubic-bezier(0.16,1,0.3,1) both' }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* SR live region */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveStatus}
          </div>

          {/* ── Mobile drag handle ─────────────────────────────────────────── */}
          <div className="shrink-0 flex justify-center pt-3.5 pb-1 sm:hidden" aria-hidden="true">
            <div className="h-1 w-10 rounded-full bg-white/18" />
          </div>

          {/* ── Header ────────────────────────────────────────────────────── */}
          <div
            className={cx(
              'shrink-0 border-b border-white/8',
              'bg-neutral-950/95 backdrop-blur-xl',
              // Padding: tighter on mobile (no drag handle gap needed), normal sm+
              'px-5 pt-3 pb-4 sm:pt-5',
            )}
          >
            <div className="flex items-start justify-between gap-4">
              {/* Left: meta */}
              <div className="min-w-0 flex-1">
                {/* Category eyebrow */}
                <p className="modal-eyebrow">{categoryLabel}</p>

                {/* Name + popular badge */}
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <h2
                    id={titleId}
                    className="truncate text-xl font-semibold leading-tight text-white"
                    style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
                  >
                    {name}
                  </h2>
                  {isPopular ? (
                    <span className="badge badge-amber inline-flex items-center gap-1 shrink-0">
                      <Star className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Popular
                    </span>
                  ) : null}
                </div>

                {/* Price row */}
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="price-base">{basePriceLabel}</span>
                  <span className="text-[11px] text-zinc-600">
                    {preflightLoading
                      ? '· checking…'
                      : preflight?.ok === true
                        ? '· server-confirmed'
                        : '· —'}
                  </span>
                  {extrasLabel ? (
                    <span className="text-[11px] font-medium text-amber-400/70">{extrasLabel}</span>
                  ) : null}
                </div>
              </div>

              {/* Close button */}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className={cx(
                  'shrink-0 inline-flex h-9 w-9 items-center justify-center',
                  'rounded-xl border border-white/10 bg-white/6 text-zinc-400',
                  'transition-all duration-150 ease-out',
                  'hover:border-white/18 hover:bg-white/10 hover:text-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 focus-visible:ring-offset-1 focus-visible:ring-offset-neutral-950',
                  'active:scale-95',
                )}
                aria-label="Close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ── Scrollable body ──────────────────────────────────────────────── */}
          <div
            className={cx(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              'px-5 pb-5',
              '[-webkit-overflow-scrolling:touch]',
              // Custom scrollbar — minimal, on-brand
              '[scrollbar-width:thin] [scrollbar-color:rgb(255_255_255/0.10)_transparent]',
            )}
          >
            {invalidItem ? (
              /* ── Invalid item error ── */
              <div className="alert alert-error mt-5" role="alert" aria-label="Item unavailable">
                <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-semibold text-red-200">This item can't be opened right now.</p>
                  <button type="button" onClick={close} className="btn btn-ghost-dark btn-sm mt-3">
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ── Hero image + description + tags ── */}
                <MenuItemModalImage
                  imageUrl={imageUrl}
                  name={name}
                  description={description}
                  tags={tags}
                />

                {/* ── Status alerts ───────────────────────────────────────── */}
                {preflightError ? (
                  <div
                    className="alert alert-error mt-4"
                    role="alert"
                    style={{ animation: 'sofi-stagger-in 300ms ease both' }}
                  >
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-red-300" aria-hidden="true" />
                    <span>{preflightError}</span>
                  </div>
                ) : null}

                {isLowStock && preflight?.ok === true && preflight.stock_count != null ? (
                  <div
                    className="alert alert-warning mt-4"
                    role="status"
                    style={{ animation: 'sofi-stagger-in 300ms ease both' }}
                  >
                    <span className="shrink-0 text-base leading-none" aria-hidden="true">
                      ⚡
                    </span>
                    <span>
                      Only{' '}
                      <strong className="font-bold text-amber-300">{preflight.stock_count}</strong>{' '}
                      left — order soon.
                    </span>
                  </div>
                ) : null}

                {unavailable ? (
                  <div className="alert alert-error mt-4" role="alert">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>This item is currently unavailable.</span>
                  </div>
                ) : null}

                {selectionPrunedWarning ? (
                  <div className="alert alert-warning mt-4" role="status">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{selectionPrunedWarning}</span>
                  </div>
                ) : null}

                {hasBlockedSelections ? (
                  <div className="alert alert-error mt-4" role="alert">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>
                      Some selected options are no longer available. Please update your choices.
                    </span>
                  </div>
                ) : null}

                {/* ── Modifier groups ─────────────────────────────────────── */}
                <div className="mt-7">
                  {/* Section header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="section-eyebrow">Customize your order</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-600">
                        Required picks are validated before adding to cart.
                      </p>
                    </div>
                    {modifierGroups.length ? (
                      <button
                        type="button"
                        onClick={clearSelections}
                        className="btn btn-ghost-dark btn-sm shrink-0"
                        aria-label="Clear all selections"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  {/* Loading skeleton */}
                  {groupsLoading ? (
                    <div className="mt-4 space-y-2.5">
                      {SKELETON_IDS.map((sid) => (
                        <div
                          key={sid}
                          className="skeleton-dark h-[60px] rounded-2xl"
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  ) : groupsError ? (
                    /* Groups error state */
                    <div className="alert alert-info mt-4">
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                        <Info className="h-4 w-4 text-zinc-300" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-white">Options unavailable</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">{groupsError}</p>
                        <button
                          type="button"
                          onClick={() => void loadModifierGroups()}
                          className="btn btn-ghost-dark btn-sm mt-3"
                          aria-label="Retry loading options"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : !modifierGroups.length ? (
                    /* Empty state */
                    <div className="mt-4 rounded-2xl border border-white/8 bg-white/3 px-4 py-3.5 text-sm text-zinc-500">
                      No customization options for this item.
                    </div>
                  ) : (
                    /* Modifier group accordions */
                    <div className="mt-4 space-y-2.5" role="list">
                      {modifierGroups.map((g, gi) => {
                        const sels = selected[g.id] ?? [];
                        const expanded = Boolean(expandedGroups[g.id]);
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
                            key={g.id}
                            role="listitem"
                            className={cx('modifier-group', !valid && 'modifier-group--invalid')}
                            style={{
                              animation: `sofi-stagger-in 280ms cubic-bezier(0.16,1,0.3,1) ${gi * 40}ms both`,
                            }}
                          >
                            {/* Group toggle */}
                            <button
                              type="button"
                              className="modifier-group-toggle"
                              onClick={() => toggleGroupExpanded(g.id)}
                              aria-expanded={expanded}
                              aria-controls={`modifier-group-body-${g.id}`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {g.name}
                                  </p>
                                  {g.required || min > 0 ? (
                                    <span className="badge badge-required">Required</span>
                                  ) : (
                                    <span className="badge badge-optional">Optional</span>
                                  )}
                                </div>

                                {g.description ? (
                                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                                    {g.description}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-xs text-zinc-600">{subline}</p>
                                )}

                                {!valid ? (
                                  <p className="mt-1 text-[11px] font-semibold text-amber-300">
                                    {selectedCount < min
                                      ? `Choose at least ${min}`
                                      : max != null
                                        ? `Choose up to ${max}`
                                        : 'Selection required'}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 items-center gap-2.5">
                                {selectedCount ? (
                                  <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-semibold text-amber-300 ring-1 ring-amber-500/20">
                                    {selectedCount} selected
                                  </span>
                                ) : null}
                                <ChevronDown
                                  className={cx(
                                    'h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-250 ease-[cubic-bezier(0.16,1,0.3,1)]',
                                    expanded && 'rotate-180',
                                  )}
                                  aria-hidden="true"
                                />
                              </div>
                            </button>

                            {/* Group body */}
                            {expanded ? (
                              <div
                                id={`modifier-group-body-${g.id}`}
                                className="border-t border-white/8 px-3 py-3"
                              >
                                <div className="grid gap-2">
                                  {g.modifiers.map((m) => {
                                    const on = sels.some((s) => s.id === m.id);
                                    const disabled = !m.available;
                                    const blocked = selectionBlockedIds.has(m.id);

                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setSelectionForGroup(g, m)}
                                        className={cx(
                                          'modifier-option',
                                          on && 'modifier-option--selected',
                                          blocked && 'ring-1 ring-red-500/30',
                                        )}
                                        aria-pressed={on}
                                        aria-label={`${m.name}${disabled ? ', unavailable' : ''}${m.price_adjustment !== 0 ? `, ${m.price_adjustment > 0 ? 'add' : 'subtract'} ${fmtUsdFromCents(Math.abs(m.price_adjustment))}` : ''}`}
                                      >
                                        {/* Option text */}
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-white">
                                            {m.name}
                                          </p>
                                          <p className="mt-0.5 text-[11px] text-zinc-500">
                                            {m.price_adjustment !== 0
                                              ? `${m.price_adjustment > 0 ? '+' : ''}${fmtUsdFromCents(m.price_adjustment)}`
                                              : 'No extra cost'}
                                            {!m.available ? ' · Unavailable' : ''}
                                          </p>
                                        </div>

                                        {/* Check indicator */}
                                        <span
                                          className={cx(
                                            'modifier-check shrink-0',
                                            on ? 'modifier-check--on' : 'modifier-check--off',
                                          )}
                                          aria-hidden="true"
                                        >
                                          {on ? (
                                            <Check className="h-3.5 w-3.5 text-amber-300" />
                                          ) : (
                                            <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>

                                {maxSelectionHint ? (
                                  <p className="mt-3 text-[11px] font-semibold text-amber-300/80">
                                    {maxSelectionHint}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Special instructions ────────────────────────────────── */}
                <div className="mt-7">
                  {/* Label row */}
                  <div className="flex items-end justify-between gap-3 mb-2.5">
                    <div>
                      <p className="text-sm font-semibold text-white">Special instructions</p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        Allergies, "no onions", "extra crispy", etc.
                      </p>
                    </div>

                    {/* SVG ring counter */}
                    <div className="relative shrink-0 h-7 w-7" aria-hidden="true">
                      <svg
                        viewBox="0 0 32 32"
                        className="absolute inset-0 -rotate-90"
                        style={{ overflow: 'visible' }}
                      >
                        {/* Track */}
                        <circle
                          cx="16"
                          cy="16"
                          r="14"
                          fill="none"
                          strokeWidth="2.5"
                          className="stroke-white/8"
                          strokeDasharray="100 100"
                        />
                        {/* Fill */}
                        <circle
                          cx="16"
                          cy="16"
                          r="14"
                          fill="none"
                          strokeWidth="2.5"
                          className={cx(
                            'transition-all duration-200 ease-out',
                            counterFull
                              ? 'stroke-red-400'
                              : counterNear
                                ? 'stroke-amber-400'
                                : 'stroke-white/30',
                          )}
                          strokeDasharray="100 100"
                          strokeDashoffset={counterDash}
                          strokeLinecap="round"
                        />
                      </svg>
                      {/* Numeric label — only show near limit */}
                      {counterNear ? (
                        <span
                          className={cx(
                            'absolute inset-0 flex items-center justify-center',
                            'text-[8px] font-bold tabular-nums',
                            counterFull ? 'text-red-400' : 'text-amber-400',
                          )}
                        >
                          {MAX_NOTES_LENGTH - noteLen}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Textarea using component class */}
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={MAX_NOTES_LENGTH}
                    className="textarea-dark w-full"
                    placeholder="Add a note for the kitchen (optional)…"
                    aria-label="Special instructions"
                    aria-describedby="notes-char-count"
                  />

                  {/* Hidden count for screen readers */}
                  <p id="notes-char-count" className="sr-only">
                    {noteLen} of {MAX_NOTES_LENGTH} characters used
                  </p>
                </div>

                {/* ── Required hint inline ────────────────────────────────── */}
                {requiredHint ? (
                  <div className="alert alert-warning mt-4" role="status">
                    <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{requiredHint}</span>
                  </div>
                ) : null}

                {/* Scroll buffer so content clears the sticky footer */}
                <div className="h-6" aria-hidden="true" />
              </>
            )}
          </div>

          {/* ── Sticky footer ────────────────────────────────────────────────── */}
          <div
            className={cx(
              'shrink-0 border-t border-white/8',
              'bg-neutral-950/95 backdrop-blur-xl',
              'px-4 py-3.5 sm:px-5 sm:py-4',
            )}
          >
            {/* Qty + price + CTA row */}
            <div className="flex items-center gap-3">
              {/* Quantity stepper */}
              <div className="qty-stepper">
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
                <div className="qty-value" aria-live="polite" aria-label={`Quantity: ${safeQty}`}>
                  {safeQty}
                </div>
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
              </div>

              {/* Total price block */}
              <div className="min-w-0 flex-1 pl-1">
                <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Total</p>
                <p className="price-total leading-tight truncate">
                  {preflightLoading ? (
                    <span className="inline-block w-16 animate-pulse rounded bg-white/8 h-5 align-middle" />
                  ) : (
                    stickyTotalLabel
                  )}
                </p>
              </div>

              {/* Add to order CTA */}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canAdd || phase !== 'idle' || invalidItem}
                aria-disabled={!canAdd || phase !== 'idle' || invalidItem}
                aria-label={ctaLabel}
                className={cx(
                  'btn relative overflow-hidden shrink-0',
                  'h-12 rounded-2xl px-5 text-[13px]',
                  // Phase-aware variant
                  phase === 'success'
                    ? 'btn-success btn-cart-added'
                    : canAdd && phase === 'idle' && !invalidItem
                      ? 'btn-primary'
                      : 'btn-ghost-dark cursor-not-allowed',
                  // Smooth transition between states
                  'transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]',
                )}
              >
                {/* Label (fades out on success) */}
                <span className="btn-cart-label">{ctaLabel}</span>
                {/* Check icon (fades in on success) */}
                <span className="btn-cart-check" aria-hidden="true">
                  <Check className="h-5 w-5" />
                </span>
              </button>
            </div>

            {/* Required options hint — below CTA on mobile for thumb reach */}
            {!modifierRulesOk && !invalidItem ? (
              <p className="mt-2.5 text-center text-[11px] font-semibold text-amber-300/80">
                Choose required options to continue.
              </p>
            ) : null}

            {/* Legal note */}
            <p className="mt-2 text-center text-[10px] leading-relaxed text-zinc-700">
              Final totals (tax, promos, credits) are enforced at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}