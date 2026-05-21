// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// Customer menu item modal — orchestrator (state, hooks, cart) + presentational UI.
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { unlockScroll } from '@/lib/ui/scroll-lock';

import { MenuItemModalShell } from './modal/MenuItemModalShell';
import { MenuItemModalImage } from './modal/MenuItemModalImage';
import { MenuItemModalHero } from './modal/MenuItemModalHero';
import { MenuItemModalCloseButton } from './modal/MenuItemModalCloseButton';
import { MenuItemModalAlerts } from './modal/MenuItemModalAlerts';
import { MenuItemModalModifiers } from './modal/MenuItemModalModifiers';
import { MenuItemModalNotes } from './modal/MenuItemModalNotes';
import { MenuItemModalStickyFooter } from './modal/MenuItemModalStickyFooter';
import { MenuItemModalAlertBanner } from './modal/MenuItemModalAlertBanner';
import { injectMenuItemModalKeyframes } from './modal/menuItemModalAnimations';

import { useMenuItemPreflight } from '../hooks/useMenuItemPreflight';
import { useMenuItemModifiers } from '../hooks/useMenuItemModifiers';
import { useMenuItemQty } from '../hooks/useMenuItemQty';

import {
  isRecord,
  isMenuItemPublic,
  safeStr,
  safeCents,
  fmtUsdFromCents,
} from '../utils/menuItemGuards';
import {
  parseTags,
  computeSelectedModifierCents,
  canonicalizeSelectionsForHash,
  isSelectionValidForGroup,
} from '../utils/modifierGuards';
import { pickMenuImageUrlFromRecord } from '@/lib/images/menuImageDelivery';
import { cx, getFocusable } from '../utils/uiHelpers';
import { MAX_NOTES_LENGTH } from '../constants';

type CartPhase = 'idle' | 'adding' | 'success';

interface Props {
  item: MenuItemPublic;
  onClose: () => void;
}

export default function MenuItemModal({ item, onClose }: Props) {
  injectMenuItemModalKeyframes();

  const { addItem } = useCart();
  const titleId = useId();

  const invalidItem = !isMenuItemPublic(item);

  const rec: Record<string, unknown> = isRecord(item) ? item : {};
  const id = safeStr(rec.id, '', 128);
  const name = safeStr(rec.name, 'Menu item', 120);
  const categoryLabel = safeStr(rec.category, 'menu', 40);
  const description = safeStr(rec.description, '', 1200);

  const imageUrl = pickMenuImageUrlFromRecord(rec);

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

  const [phase, setPhase] = useState<CartPhase>('idle');
  const [notes, setNotes] = useState('');
  const [liveStatus, setLiveStatus] = useState('');
  const onLiveStatus = useCallback((msg: string) => setLiveStatus(msg), []);

  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

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

  const close = useCallback(() => {
    unlockScroll(scrollToken);
    onClose();
  }, [onClose, scrollToken]);

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
      } else if (idx === -1 || idx >= lastIdx) {
        e.preventDefault();
        focusables[0]?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

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
              : 'Add to cart';

  return (
  <>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>

      <MenuItemModalShell
        titleId={titleId}
        dialogRef={dialogRef}
        onBackdropClose={close}
        hero={
          !invalidItem ? (
            <div className="relative shrink-0">
              <MenuItemModalImage
                imageUrl={imageUrl}
                name={name}
                description={description}
                tags={tags}
              />
              <MenuItemModalCloseButton closeBtnRef={closeBtnRef} onClose={close} />
            </div>
          ) : undefined
        }
        footer={
          !invalidItem ? (
            <MenuItemModalStickyFooter
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
          ) : undefined
        }
      >
        {invalidItem ? (
          <div className="pt-4">
            <h2 id={titleId} className="sr-only">
              Menu item unavailable
            </h2>
            <div className="mb-4 flex justify-end">
              <MenuItemModalCloseButton
                closeBtnRef={closeBtnRef}
                onClose={close}
                className="!relative !right-auto !top-auto border-(--menu-modal-border) bg-(--menu-modal-control-bg) text-ink-700 hover:bg-(--menu-modal-control-hover)"
              />
            </div>
            <div
              className={cx(
                'flex items-start gap-3 rounded-2xl border px-4 py-4',
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
                  This item can&rsquo;t be opened right now.
                </p>
                <button
                  type="button"
                  onClick={close}
                  className={cx(
                    'mt-3 rounded-xl border border-(--menu-modal-border) bg-(--menu-modal-control-bg)',
                    'px-4 py-2.5 text-xs font-semibold text-ink-700',
                    'hover:bg-(--menu-modal-control-hover) active:scale-95',
                  )}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <MenuItemModalHero
              titleId={titleId}
              categoryLabel={categoryLabel}
              name={name}
              description={description}
              isPopular={isPopular}
              basePriceLabel={basePriceLabel}
              extrasLabel={extrasLabel}
              preflightOk={preflight?.ok === true}
              preflightLoading={preflightLoading}
            />

            <MenuItemModalAlerts
              preflightError={preflightError}
              isLowStock={isLowStock}
              stockCount={preflight?.ok === true ? (preflight.stock_count ?? null) : null}
              unavailable={unavailable}
              selectionPrunedWarning={selectionPrunedWarning}
              hasBlockedSelections={hasBlockedSelections}
            />

            <MenuItemModalModifiers
              modifierGroups={modifierGroups}
              groupsLoading={groupsLoading}
              groupsError={groupsError}
              selected={selected}
              expandedGroups={expandedGroups}
              maxSelectionHint={maxSelectionHint}
              selectionBlockedIds={selectionBlockedIds}
              onClearSelections={clearSelections}
              onToggleGroup={toggleGroupExpanded}
              onSetSelection={setSelectionForGroup}
              onRetryLoad={loadModifierGroups}
            />

            <MenuItemModalNotes
              notes={notes}
              maxLength={MAX_NOTES_LENGTH}
              onChange={setNotes}
            />

            {requiredHint ? (
              <MenuItemModalAlertBanner variant="warning">{requiredHint}</MenuItemModalAlertBanner>
            ) : null}

            <div className="h-6" aria-hidden="true" />
          </>
        )}
      </MenuItemModalShell>
    </>
  );
}
