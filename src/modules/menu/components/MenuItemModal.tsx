// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// MENU ITEM MODAL — Production (2026) — Luxury UX + Modifier Support
// =============================================================================
// This file is the modal shell: props → hooks → JSX.
// All state, business logic, and utilities live in their own modules.
//
// Contracts preserved exactly:
//   - preflight invoke + payload shape
//   - modifier selection rules + pruning behavior
//   - addItem payload shape
//   - pricingHash composition
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Info, Minus, Plus, Star, X } from 'lucide-react';
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

export default function MenuItemModal({ item, onClose }: Props) {
  const { addItem } = useCart();

  const invalidItem = !isMenuItemPublic(item);

  // Treat props as untrusted at runtime (shape drift safe)
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

  // ── Phase + notes (local to modal) ──────────────────────────────────────────

  type CartPhase = 'idle' | 'adding' | 'success';
  const [phase, setPhase] = useState<CartPhase>('idle');
  const [notes, setNotes] = useState<string>('');
  const [liveStatus, setLiveStatus] = useState<string>('');
  const onLiveStatus = useCallback((msg: string) => setLiveStatus(msg), []);

  // ── Timers ───────────────────────────────────────────────────────────────────

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Modal focus / keyboard refs ──────────────────────────────────────────────

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // ── Composed hooks ───────────────────────────────────────────────────────────

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

  // ── Modal close ──────────────────────────────────────────────────────────────

  const close = useCallback(() => {
    unlockScroll(scrollToken);
    onClose();
  }, [onClose, scrollToken]);

  // ── Focus restore ────────────────────────────────────────────────────────────

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
      if (focusables.length === 0) return;

      const active = document.activeElement;
      const idx = focusables.findIndex((x) => x === active);
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
    // Capture ref values at effect-run time so the cleanup closure sees the
    // correct instance even if the ref changes before unmount.
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
    return `Choose required options: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''}`;
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
      const chosen: Array<{ id: string; groupId: string; name: string; priceAdjustment: number }> =
        [];
      for (const g of modifierGroups) {
        for (const s of selected[g.id] ?? []) {
          chosen.push({
            id: s.id,
            groupId: s.groupId,
            name: s.name,
            priceAdjustment: safeCents(s.priceAdjustment, 0),
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
        unitPriceCents: preflight.unit_price_cents, // server confirmed
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

  const extrasLabel = useMemo(() => {
    if (modifiersCents <= 0) return null;
    return `+ ${fmtUsdFromCents(modifiersCents)} options`;
  }, [modifiersCents]);

  const unavailable = preflight?.ok === true && preflight.available === false;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          close();
        }}
      />

      <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} customization`}
          className={cx(
            'w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-white shadow-2xl',
            'max-h-[92vh]',
            'flex flex-col min-h-0',
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Live region */}
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveStatus}
          </div>

          {/* ── Header ── */}
          <div className="shrink-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                  {categoryLabel}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="truncate text-xl font-semibold">{name}</h2>
                  {isPopular ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/25">
                      <Star className="h-3.5 w-3.5" aria-hidden="true" />
                      Popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  <span className="font-semibold text-amber-300">{basePriceLabel}</span>{' '}
                  <span className="text-[11px] text-zinc-500">• {headerPriceLabel}</span>
                  {extrasLabel ? (
                    <span className="ml-2 text-[11px] text-zinc-500">{extrasLabel}</span>
                  ) : null}
                </p>
              </div>

              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* ── Scrollable body ── */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 [-webkit-overflow-scrolling:touch]">
            {invalidItem ? (
              <div className="pt-4">
                <div
                  className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200 shadow-xl"
                  aria-label="Item unavailable"
                >
                  This item can't be opened right now.
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                      aria-label="Close"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* ── Item image + meta ── */}
                <div className="pt-4">
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-56 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-56 w-full items-center justify-center bg-linear-to-br from-white/5 to-white/0">
                        <div className="text-center">
                          <p className="text-sm font-semibold text-neutral-200">Sofi's Kitchen</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Fresh, real plates, made to order.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-neutral-950/70 via-neutral-950/10 to-transparent" />
                  </div>

                  {description ? <p className="mt-4 text-sm text-zinc-300">{description}</p> : null}

                  {tags.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.slice(0, 10).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* ── Alerts ── */}
                {preflightError ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    {preflightError}
                  </div>
                ) : null}

                {isLowStock && preflight?.ok === true && preflight.stock_count != null ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Only {preflight.stock_count} left — order soon.
                  </div>
                ) : null}

                {unavailable ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    This item is currently unavailable.
                  </div>
                ) : null}

                {selectionPrunedWarning ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                    {selectionPrunedWarning}
                  </div>
                ) : null}

                {hasBlockedSelections ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    Some selected options are no longer available. Please update your choices.
                  </div>
                ) : null}

                {/* ── Modifier groups ── */}
                <div className="mt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Customize your order</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Options are validated for availability and required picks before adding to
                        cart.
                      </p>
                    </div>
                    {modifierGroups.length ? (
                      <button
                        type="button"
                        onClick={clearSelections}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                        aria-label="Clear all selections"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  {groupsLoading ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-zinc-300">Loading options…</p>
                      <div className="mt-3 grid gap-2">
                        {SKELETON_IDS.map((skeletonId) => (
                          <div
                            key={skeletonId}
                            className="h-10 animate-pulse rounded-xl bg-white/5"
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    </div>
                  ) : groupsError ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                          <Info className="h-4 w-4 text-zinc-200" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-white">Options unavailable</p>
                          <p className="mt-1 text-xs text-zinc-500">{groupsError}</p>
                          <button
                            type="button"
                            onClick={() => void loadModifierGroups()}
                            className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                            aria-label="Retry loading options"
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : !modifierGroups.length ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/3 p-4 text-sm text-zinc-300">
                      No customization options for this item.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {modifierGroups.map((g) => {
                        const sels = selected[g.id] ?? [];
                        const expanded = Boolean(expandedGroups[g.id]);
                        const valid = isSelectionValidForGroup(g, sels);
                        const rangeLabel = groupSelectionRangeLabel(g);

                        const selectedCount = sels.length;
                        const max = g.max_selections ?? (g.type === 'radio' ? 1 : null);
                        const min = g.min_selections ?? (g.required ? 1 : 0);

                        const subline =
                          g.type === 'radio'
                            ? `${rangeLabel}${selectedCount ? ` • selected` : ''}`
                            : `${rangeLabel}${
                                max != null
                                  ? ` • ${selectedCount}/${max}`
                                  : selectedCount
                                    ? ` • ${selectedCount} selected`
                                    : ''
                              }`;

                        return (
                          <div
                            key={g.id}
                            className={cx(
                              'overflow-hidden rounded-2xl border bg-white/3',
                              valid ? 'border-white/10' : 'border-amber-500/25',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleGroupExpanded(g.id)}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                              aria-expanded={expanded ? 'true' : 'false'}
                              aria-label={`${g.name} options`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {g.name}
                                  </p>
                                  {g.required || min > 0 ? (
                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/25">
                                      Required
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-300 ring-1 ring-white/10">
                                      Optional
                                    </span>
                                  )}
                                </div>
                                {g.description ? (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                                    {g.description}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-xs text-zinc-500">{subline}</p>
                                )}
                                {!valid ? (
                                  <p className="mt-1 text-[11px] font-semibold text-amber-200">
                                    {selectedCount < min
                                      ? `Select at least ${min}`
                                      : max != null
                                        ? `Select up to ${max}`
                                        : 'Selection required'}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                {selectedCount ? (
                                  <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-200">
                                    {selectedCount} selected
                                  </span>
                                ) : null}
                                <ChevronDown
                                  className={cx(
                                    'h-5 w-5 text-zinc-400 transition',
                                    expanded && 'rotate-180',
                                  )}
                                  aria-hidden="true"
                                />
                              </div>
                            </button>

                            {expanded ? (
                              <div className="border-t border-white/10 px-4 py-3">
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
                                          'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                                          on
                                            ? 'border-amber-500/30 bg-amber-500/10'
                                            : 'border-white/10 bg-white/5 hover:bg-white/8',
                                          disabled &&
                                            'cursor-not-allowed opacity-50 hover:bg-white/5',
                                        )}
                                        aria-pressed={on ? 'true' : 'false'}
                                        aria-label={`${m.name}${disabled ? ', unavailable' : ''}`}
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-white">
                                            {m.name}
                                          </p>
                                          <p className="mt-0.5 text-[11px] text-zinc-500">
                                            {m.price_adjustment !== 0
                                              ? `${m.price_adjustment > 0 ? '+' : ''}${fmtUsdFromCents(m.price_adjustment)}`
                                              : 'No extra cost'}
                                            {!m.available ? ' • Unavailable' : ''}
                                          </p>
                                        </div>
                                        <div className="shrink-0">
                                          {on ? (
                                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
                                              <Check
                                                className="h-4 w-4 text-amber-200"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          ) : (
                                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                                              <span
                                                className="h-2 w-2 rounded-full bg-white/20"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>

                                {maxSelectionHint ? (
                                  <p className="mt-3 text-xs font-semibold text-amber-200">
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

                {/* ── Special instructions ── */}
                <div className="mt-6">
                  <p className="text-sm font-semibold text-white">Special instructions</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Allergy notes, "no onions", "extra crispy", etc.
                  </p>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={MAX_NOTES_LENGTH}
                    className={cx(
                      'mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white',
                      'placeholder:text-zinc-500 outline-none',
                      'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
                    )}
                    placeholder="Add a note for the kitchen (optional)…"
                    aria-label="Special instructions"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {clampInt(notes.length, 0, 999)} / {MAX_NOTES_LENGTH}
                  </p>
                </div>

                {requiredHint ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                    {requiredHint}
                  </div>
                ) : null}

                <div className="h-4" aria-hidden="true" />
              </>
            )}
          </div>

          {/* ── Sticky footer ── */}
          <div className="shrink-0 border-t border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1">
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white hover:bg-white/10 disabled:opacity-40"
                      onClick={() => setQty((q) => clampInt(q - 1, 1, maxQty))}
                      disabled={safeQty <= 1 || preflightLoading || invalidItem}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-5 w-5" aria-hidden="true" />
                    </button>

                    <div className="min-w-3rem text-center font-semibold tabular-nums">
                      {safeQty}
                    </div>

                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white hover:bg-white/10 disabled:opacity-40"
                      onClick={() => setQty((q) => clampInt(q + 1, 1, maxQty))}
                      disabled={safeQty >= maxQty || preflightLoading || invalidItem}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400">Total</p>
                    <p className="truncate text-lg font-bold text-white">{stickyTotalLabel}</p>
                    <p className="text-[11px] text-zinc-500">
                      {preflightLoading ? 'Checking…' : preflight?.ok === true ? '' : '—'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={cx(
                    'h-12 rounded-2xl px-5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                    canAdd && !invalidItem
                      ? 'bg-amber-500 text-black hover:opacity-95'
                      : 'cursor-not-allowed bg-white/10 text-zinc-400',
                  )}
                  onClick={handleAddToCart}
                  disabled={!canAdd || phase !== 'idle' || invalidItem}
                  aria-disabled={!canAdd || phase !== 'idle' || invalidItem ? 'true' : 'false'}
                  aria-label="Add to order"
                >
                  {invalidItem
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
                              : 'Add to Order'}
                </button>
              </div>

              {!modifierRulesOk && !invalidItem ? (
                <p className="mt-2 text-center text-[11px] font-semibold text-amber-200">
                  Choose required options to continue.
                </p>
              ) : null}

              <p className="mt-2 text-center text-[11px] text-zinc-500">
                Final totals (tax, promos, credits) are enforced again at checkout by server +
                Stripe.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}