// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// MENU ITEM MODAL — Production 2026 — Premium Mobile-First
// =============================================================================
//
// Design: Luxury dark bottom-sheet, Apple HIG + Uber Eats conversion patterns.
//   - 48px minimum tap targets on every interactive element
//   - Bottom-anchored CTA strip with qty stepper for thumb reach
//   - 56px dominant "Add to Order" CTA with price badge
//   - Staggered entrance animation, spring curve
//   - Gold accent hierarchy: price → CTA → badges → check indicators
//   - Clean modifier accordion with generous touch spacing
//   - Overscroll-contain body, sticky header + footer
//   - Safe area padding for iOS home indicator
//
// Business logic is IDENTICAL to the previous version — every hook, callback,
// memo, effect, and state variable is preserved exactly as-is.
//
// Z-INDEX: z-[100] — above FloatingCartPill (z-40) and BottomNav (z-30).
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

// ─── Keyframe injection (SSR-safe, idempotent) ───────────────────────────────

const MODAL_KF = `
  @keyframes sofi-modal-backdrop {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sofi-modal-dialog {
    from { opacity: 0; transform: scale(0.96) translateY(16px); }
    to   { opacity: 1; transform: scale(1)    translateY(0); }
  }
  @keyframes sofi-stagger-in {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
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

  // ── Phase + notes ──────────────────────────────────────────────────────────

  type CartPhase = 'idle' | 'adding' | 'success';
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

  // ── Notes counter ──────────────────────────────────────────────────────────

  const noteLen = clampInt(notes.length, 0, MAX_NOTES_LENGTH);
  const noteRatio = noteLen / MAX_NOTES_LENGTH;
  const counterDash = Math.round((1 - noteRatio) * 100);
  const counterNear = noteRatio >= 0.8;
  const counterFull = noteRatio >= 0.95;

  // ═════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      {/* SR live region */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        aria-hidden="true"
        style={{ animation: 'sofi-modal-backdrop 200ms ease both' }}
        onMouseDown={(e) => {
          e.preventDefault();
          close();
        }}
      />

      {/* ── Sheet/dialog positioning ──────────────────────────────────────── */}
      <div className="absolute inset-0 flex items-end justify-center sm:items-center sm:p-5">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={cx(
            'relative flex w-full flex-col',
            'max-h-[94dvh] sm:max-h-[88vh] sm:max-w-xl',
            'rounded-t-3xl sm:rounded-3xl',
            'overflow-hidden bg-neutral-950 text-white',
            'border border-white/[0.06]',
            'shadow-[0_-8px_40px_rgb(0_0_0/0.6)] sm:shadow-[0_24px_64px_rgb(0_0_0/0.7)]',
          )}
          style={{ animation: 'sofi-modal-dialog 380ms cubic-bezier(0.16,1,0.3,1) both' }}
          onMouseDown={(e) => e.stopPropagation()}
        >

          {/* ── Drag handle (mobile) ─────────────────────────────────────── */}
          <div className="flex shrink-0 justify-center pb-1 pt-3 sm:hidden" aria-hidden="true">
            <div className="h-[5px] w-12 rounded-full bg-white/20" />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              HEADER — Category · Name · Price · Close
              ══════════════════════════════════════════════════════════════ */}
          <div className="shrink-0 border-b border-white/[0.06] px-5 pb-5 pt-3 sm:px-6 sm:pt-5">
            <div className="flex items-start gap-4">
              {/* Left: name + meta */}
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  {categoryLabel}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2.5">
                  <h2
                    id={titleId}
                    className="text-[22px] font-bold leading-tight tracking-tight text-white sm:text-2xl"
                    style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
                  >
                    {name}
                  </h2>
                  {isPopular ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-400 ring-1 ring-amber-500/20">
                      <Star className="h-3 w-3" aria-hidden="true" />
                      Popular
                    </span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-baseline gap-2.5">
                  <span className="text-lg font-bold tabular-nums text-amber-400">
                    {basePriceLabel}
                  </span>
                  {preflight?.ok === true ? (
                    <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                      Verified
                    </span>
                  ) : preflightLoading ? (
                    <span className="inline-block h-3 w-14 animate-pulse rounded bg-white/8" />
                  ) : null}
                  {extrasLabel ? (
                    <span className="text-xs font-medium text-amber-400/50">{extrasLabel}</span>
                  ) : null}
                </div>
              </div>

              {/* Close — 48px touch target */}
              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className={cx(
                  'flex h-12 w-12 shrink-0 items-center justify-center',
                  'rounded-2xl border border-white/8 bg-white/[0.04]',
                  'text-zinc-400 transition-all duration-150',
                  'hover:border-white/15 hover:bg-white/8 hover:text-white',
                  'active:scale-90',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40',
                )}
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SCROLLABLE BODY
              ══════════════════════════════════════════════════════════════ */}
          <div
            className={cx(
              'min-h-0 flex-1 overflow-y-auto overscroll-contain',
              'px-5 pb-6 sm:px-6',
              '[-webkit-overflow-scrolling:touch]',
              '[scrollbar-width:thin] [scrollbar-color:rgb(255_255_255/0.08)_transparent]',
            )}
          >
            {invalidItem ? (
              /* ── Error: invalid item ── */
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-4" role="alert">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-red-200">
                    This item can't be opened right now.
                  </p>
                  <button
                    type="button"
                    onClick={close}
                    className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/8 active:scale-95"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ── Image + description + tags ── */}
                <div className="mt-5">
                  <MenuItemModalImage
                    imageUrl={imageUrl}
                    name={name}
                    description={description}
                    tags={tags}
                  />
                </div>

                {/* ── Status alerts ── */}
                {preflightError ? (
                  <div
                    className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3.5 text-sm text-red-200"
                    role="alert"
                    style={{ animation: 'sofi-stagger-in 250ms ease both' }}
                  >
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                    <span>{preflightError}</span>
                  </div>
                ) : null}

                {isLowStock && preflight?.ok === true && preflight.stock_count != null ? (
                  <div
                    className="mt-5 flex items-center gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3.5 text-sm text-amber-200"
                    role="status"
                    style={{ animation: 'sofi-stagger-in 250ms ease both' }}
                  >
                    <span className="text-lg leading-none" aria-hidden="true">⚡</span>
                    <span>
                      Only{' '}
                      <strong className="font-bold text-amber-300">{preflight.stock_count}</strong>{' '}
                      left — order soon.
                    </span>
                  </div>
                ) : null}

                {unavailable ? (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3.5 text-sm text-red-200" role="alert">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                    <span>This item is currently unavailable.</span>
                  </div>
                ) : null}

                {selectionPrunedWarning ? (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3.5 text-sm text-amber-200" role="status">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                    <span>{selectionPrunedWarning}</span>
                  </div>
                ) : null}

                {hasBlockedSelections ? (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3.5 text-sm text-red-200" role="alert">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
                    <span>Some selected options are no longer available. Please update your choices.</span>
                  </div>
                ) : null}

                {/* ══════════════════════════════════════════════════════════
                    MODIFIER GROUPS
                    ══════════════════════════════════════════════════════ */}
                <div className="mt-8">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        Customize
                      </p>
                      <p className="mt-1 text-xs text-zinc-600">
                        Required options are validated before adding.
                      </p>
                    </div>
                    {modifierGroups.length ? (
                      <button
                        type="button"
                        onClick={clearSelections}
                        className="rounded-lg px-3 py-2 text-[11px] font-semibold text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-200 active:scale-95"
                        aria-label="Clear all selections"
                      >
                        Clear all
                      </button>
                    ) : null}
                  </div>

                  {groupsLoading ? (
                    <div className="mt-4 space-y-3">
                      {SKELETON_IDS.map((sid) => (
                        <div key={sid} className="h-16 animate-pulse rounded-2xl bg-white/[0.03]" aria-hidden="true" />
                      ))}
                    </div>
                  ) : groupsError ? (
                    <div className="mt-4 flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-4">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-white">Options unavailable</p>
                        <p className="mt-0.5 text-xs text-zinc-500">{groupsError}</p>
                        <button
                          type="button"
                          onClick={() => void loadModifierGroups()}
                          className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:bg-white/8 active:scale-95"
                          aria-label="Retry loading options"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : !modifierGroups.length ? (
                    <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-4 text-sm text-zinc-500">
                      No customization options for this item.
                    </div>
                  ) : (
                    /* ── Accordion groups ── */
                    <div className="mt-4 space-y-3" role="list">
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
                            : `${rangeLabel}${max != null ? ` · ${selectedCount}/${max}` : selectedCount ? ` · ${selectedCount} selected` : ''}`;

                        return (
                          <div
                            key={g.id}
                            role="listitem"
                            className={cx(
                              'overflow-hidden rounded-2xl border transition-colors duration-150',
                              !valid
                                ? 'border-amber-500/25 bg-amber-500/[0.03]'
                                : 'border-white/[0.06] bg-white/[0.02]',
                            )}
                            style={{
                              animation: `sofi-stagger-in 260ms cubic-bezier(0.16,1,0.3,1) ${gi * 50}ms both`,
                            }}
                          >
                            {/* Group toggle — min 56px for thumb tap */}
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.02]"
                              onClick={() => toggleGroupExpanded(g.id)}
                              aria-expanded={expanded}
                              aria-controls={`mod-body-${g.id}`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-white">{g.name}</p>
                                  {g.required || min > 0 ? (
                                    <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-400 ring-1 ring-amber-500/20">
                                      Required
                                    </span>
                                  ) : (
                                    <span className="rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
                                      Optional
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {g.description || subline}
                                </p>
                                {!valid ? (
                                  <p className="mt-1.5 text-[11px] font-semibold text-amber-300">
                                    {selectedCount < min
                                      ? `Choose at least ${min}`
                                      : max != null
                                        ? `Choose up to ${max}`
                                        : 'Selection required'}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex shrink-0 items-center gap-2">
                                {selectedCount > 0 ? (
                                  <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-amber-500/15 px-2 text-[11px] font-bold tabular-nums text-amber-300 ring-1 ring-amber-500/20">
                                    {selectedCount}
                                  </span>
                                ) : null}
                                <ChevronDown
                                  className={cx(
                                    'h-4 w-4 text-zinc-500 transition-transform duration-200',
                                    expanded && 'rotate-180',
                                  )}
                                  aria-hidden="true"
                                />
                              </div>
                            </button>

                            {/* Group body */}
                            {expanded ? (
                              <div id={`mod-body-${g.id}`} className="border-t border-white/[0.06] px-3 py-3">
                                <div className="space-y-1.5">
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
                                          'flex w-full items-center gap-3 rounded-xl px-3.5 py-3.5 text-left transition-all duration-150',
                                          on
                                            ? 'bg-amber-500/[0.08] ring-1 ring-amber-500/25'
                                            : 'bg-transparent hover:bg-white/[0.03]',
                                          blocked && 'ring-1 ring-red-500/30',
                                          disabled && 'opacity-40',
                                        )}
                                        aria-pressed={on}
                                        aria-label={`${m.name}${disabled ? ', unavailable' : ''}${m.price_adjustment !== 0 ? `, ${m.price_adjustment > 0 ? 'add' : 'subtract'} ${fmtUsdFromCents(Math.abs(m.price_adjustment))}` : ''}`}
                                      >
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-white">{m.name}</p>
                                          <p className="mt-0.5 text-xs text-zinc-500">
                                            {m.price_adjustment !== 0
                                              ? `${m.price_adjustment > 0 ? '+' : ''}${fmtUsdFromCents(m.price_adjustment)}`
                                              : 'Included'}
                                            {!m.available ? ' · Unavailable' : ''}
                                          </p>
                                        </div>

                                        {/* Check — 28px */}
                                        <span
                                          className={cx(
                                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-150',
                                            on
                                              ? 'bg-amber-500/20 ring-1 ring-amber-400/40'
                                              : 'bg-white/[0.04] ring-1 ring-white/10',
                                          )}
                                          aria-hidden="true"
                                        >
                                          {on ? (
                                            <Check className="h-4 w-4 text-amber-300" />
                                          ) : (
                                            <span className="h-1.5 w-1.5 rounded-full bg-white/15" />
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {maxSelectionHint ? (
                                  <p className="mt-3 px-1 text-[11px] font-medium text-amber-300/70">
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

                {/* ══════════════════════════════════════════════════════════
                    SPECIAL INSTRUCTIONS
                    ══════════════════════════════════════════════════════ */}
                <div className="mt-8">
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">Special instructions</p>
                      <p className="mt-0.5 text-xs text-zinc-600">
                        Allergies, preferences, cooking requests
                      </p>
                    </div>

                    {/* Ring counter */}
                    <div className="relative h-8 w-8 shrink-0" aria-hidden="true">
                      <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
                        <circle cx="16" cy="16" r="13" fill="none" strokeWidth="2" className="stroke-white/[0.06]" strokeDasharray="100 100" />
                        <circle
                          cx="16" cy="16" r="13" fill="none" strokeWidth="2"
                          className={cx(
                            'transition-all duration-200',
                            counterFull ? 'stroke-red-400' : counterNear ? 'stroke-amber-400' : 'stroke-white/20',
                          )}
                          strokeDasharray="100 100"
                          strokeDashoffset={counterDash}
                          strokeLinecap="round"
                        />
                      </svg>
                      {counterNear ? (
                        <span className={cx(
                          'absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums',
                          counterFull ? 'text-red-400' : 'text-amber-400',
                        )}>
                          {MAX_NOTES_LENGTH - noteLen}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={MAX_NOTES_LENGTH}
                    className={cx(
                      'w-full resize-none rounded-2xl border bg-white/[0.02] px-4 py-3.5',
                      'text-sm text-white placeholder-zinc-600',
                      'outline-none transition-all duration-150',
                      'border-white/[0.06] focus:border-amber-500/30 focus:ring-2 focus:ring-amber-500/10',
                    )}
                    placeholder="Add a note for the kitchen (optional)…"
                    aria-label="Special instructions"
                    aria-describedby="notes-char-count"
                  />
                  <p id="notes-char-count" className="sr-only">
                    {noteLen} of {MAX_NOTES_LENGTH} characters used
                  </p>
                </div>

                {/* Required hint */}
                {requiredHint ? (
                  <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3.5 text-sm text-amber-200" role="status">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                    <span>{requiredHint}</span>
                  </div>
                ) : null}

                {/* Bottom clearance for sticky footer */}
                <div className="h-4" aria-hidden="true" />
              </>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              STICKY FOOTER — High-conversion bottom action area
              ─────────────────────────────────────────────────────────────────
              Row 1: Quantity stepper (48px buttons) + line total
              Row 2: 56px dominant CTA with inline price
              Safe area padding for iOS home indicator
              ══════════════════════════════════════════════════════════════ */}
          {!invalidItem ? (
            <div
              className={cx(
                'shrink-0 border-t border-white/[0.06]',
                'bg-neutral-950/95 backdrop-blur-xl',
                'px-5 pt-4 sm:px-6',
              )}
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)' }}
            >
              {/* Row 1: Qty + Total */}
              <div className="flex items-center justify-between gap-4">
                {/* Quantity stepper — 48px touch targets */}
                <div className="flex items-center rounded-2xl border border-white/[0.08] bg-white/[0.03]">
                  <button
                    type="button"
                    onClick={() => setQty((q) => clampInt(q - 1, 1, maxQty))}
                    disabled={safeQty <= 1 || preflightLoading}
                    className="flex h-12 w-12 items-center justify-center text-zinc-300 transition-colors hover:text-white active:scale-90 disabled:opacity-30"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <div className="flex h-12 w-12 items-center justify-center border-x border-white/[0.06]">
                    <span
                      className="text-base font-bold tabular-nums text-white"
                      aria-live="polite"
                      aria-label={`Quantity: ${safeQty}`}
                    >
                      {safeQty}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setQty((q) => clampInt(q + 1, 1, maxQty))}
                    disabled={safeQty >= maxQty || preflightLoading}
                    className="flex h-12 w-12 items-center justify-center text-zinc-300 transition-colors hover:text-white active:scale-90 disabled:opacity-30"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </button>
                </div>

                {/* Total */}
                <div className="text-right">
                  <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
                    Total
                  </p>
                  <p className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-white">
                    {preflightLoading ? (
                      <span className="inline-block h-6 w-20 animate-pulse rounded-lg bg-white/[0.06]" />
                    ) : (
                      stickyTotalLabel
                    )}
                  </p>
                </div>
              </div>

              {/* Row 2: CTA — full width, 56px, dominant gold gradient */}
              <button
                type="button"
                onClick={handleAddToCart}
                disabled={!canAdd || phase !== 'idle'}
                aria-disabled={!canAdd || phase !== 'idle'}
                aria-label={ctaLabel}
                className={cx(
                  'relative mt-4 flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-sm font-bold tracking-wide transition-all duration-200',
                  phase === 'success'
                    ? 'bg-emerald-500 text-white shadow-[0_4px_20px_rgb(16_185_129/0.35)]'
                    : canAdd && phase === 'idle'
                      ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-neutral-950 shadow-[0_4px_20px_rgb(245_158_11/0.3)] hover:shadow-[0_6px_28px_rgb(245_158_11/0.4)] active:scale-[0.97]'
                      : 'bg-white/[0.06] text-zinc-500 cursor-not-allowed',
                )}
              >
                {phase === 'success' ? (
                  <>
                    <Check className="h-5 w-5" aria-hidden="true" />
                    <span>Added!</span>
                  </>
                ) : phase === 'adding' ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>Adding…</span>
                  </>
                ) : (
                  <>
                    <span>{canAdd ? 'Add to Order' : ctaLabel}</span>
                    {canAdd ? (
                      <span className="font-bold tabular-nums">{stickyTotalLabel}</span>
                    ) : null}
                  </>
                )}
              </button>

              {/* Hint for missing required options */}
              {!modifierRulesOk ? (
                <p className="mt-2.5 text-center text-[11px] font-medium text-amber-300/70">
                  Choose required options to continue
                </p>
              ) : null}

              {/* Legal */}
              <p className="mt-2 text-center text-[10px] text-zinc-700">
                Final totals (tax, promos, credits) confirmed at checkout
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}