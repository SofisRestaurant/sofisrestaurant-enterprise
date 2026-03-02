// =============================================================================
// src/components/menu/MenuItemModal.tsx
// =============================================================================
// Production-ready MenuItemModal (Senior / Enterprise)
//  • Correct cents normalization (prevents $3.99 → $0.04 bugs)
//  • Uses SelectedModifier as canonical selection (PricingEngine-compatible)
//  • Enforces required/min/max selection rules (max=1 behaves like radio)
//  • Builds strict cart payload (NO totals/prices from UI beyond unit cents)
// =============================================================================

import { memo, useEffect, useMemo, useReducer, useRef, useCallback } from 'react';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import { useCart } from '@/hooks/useCart';
import type { CartItem, CartModifier } from '@/features/cart/cart.types';
import type { MenuItemBase, SelectedModifier } from '@/domain/menu/menu.types';
import type { Database } from '@/types/supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (runtime-safe)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.floor(v)));
}

type MenuCategory = Database['public']['Enums']['menu_category'];

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility types (repo drift: snake_case vs camelCase)
// ─────────────────────────────────────────────────────────────────────────────

type ModifierLike = {
  id: string;
  name: string;
  price_adjustment?: number | null;
  priceAdjustment?: number | null;
};

type ModifierGroupLike = {
  id: string;
  name: string;
  required?: boolean | null;
  min_selections?: number | null;
  max_selections?: number | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  modifiers?: ModifierLike[] | null;
};

type MenuItemLike = {
  id: string;
  name: string;
  description?: string | null;

  // drifted pricing fields:
  price_cents?: number | null;
  priceCents?: number | null;
  price?: number | null; // could be cents OR dollars in old data flows

  category?: MenuCategory | string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  available?: boolean | null;

  modifier_groups?: ModifierGroupLike[] | null;
  modifierGroups?: ModifierGroupLike[] | null;
};

// Cart payload type
type AddToCartInput = Omit<CartItem, 'lineTotalCents'>;

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers
// ─────────────────────────────────────────────────────────────────────────────

function getImageUrl(item: MenuItemLike): string | null {
  const v = item.image_url ?? item.imageUrl;
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s : null;
}

function getGroups(item: MenuItemLike): ModifierGroupLike[] {
  const raw = item.modifier_groups ?? item.modifierGroups ?? [];
  return raw.filter(
    (g): g is ModifierGroupLike => !!g && typeof g.id === 'string' && typeof g.name === 'string',
  );
}

function normalizeCategory(v: MenuItemLike['category']): MenuCategory {
  const fallback: MenuCategory = 'lunch';
  const s = typeof v === 'string' ? v : '';
  const allowed: ReadonlySet<string> = new Set([
    'breakfast',
    'lunch',
    'appetizers',
    'entrees',
    'specials',
    'desserts',
    'drinks',
  ]);
  return allowed.has(s) ? (s as MenuCategory) : fallback;
}

function getAdjCents(m: ModifierLike): number {
  const a = typeof m.price_adjustment === 'number' ? m.price_adjustment : null;
  const b = typeof m.priceAdjustment === 'number' ? m.priceAdjustment : null;
  const v = a ?? b ?? 0;
  return Number.isFinite(v) ? Math.round(v) : 0;
}

/**
 * ✅ Normalize unit price to cents.
 * Prefer explicit cents fields. If only `price` exists:
 * - decimals => dollars
 * - small ints (<50) => dollars (safer)
 * - otherwise => cents
 */
function normalizeUnitPriceCents(item: MenuItemLike): number {
  // 1) Always trust explicit cents fields
  const pc = asNumber(item.price_cents);
  if (pc !== null) return Math.max(0, Math.round(pc));

  const pCents = asNumber(item.priceCents);
  if (pCents !== null) return Math.max(0, Math.round(pCents));

  // 2) If `price` exists:
  //    - If it's clearly cents (>= 100), treat as cents
  //    - If it's clearly dollars (< 100), treat as dollars
  const p = asNumber(item.price);
  if (p === null) return 0;

  if (p >= 100) return Math.max(0, Math.round(p)); // cents
  return Math.max(0, Math.round(p * 100)); // dollars
}

function sanitizeNotes(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  return t.slice(0, 500);
}

// ─────────────────────────────────────────────────────────────────────────────
// Selection validation
// ─────────────────────────────────────────────────────────────────────────────

type SelectedByGroup = Record<string, SelectedModifier[]>;

function validateSelection(
  groups: ModifierGroupLike[],
  selected: SelectedByGroup,
): { ok: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const g of groups) {
    const picked = selected[g.id] ?? [];

    const required = g.required === true;
    const min =
      typeof g.min_selections === 'number'
        ? g.min_selections
        : typeof g.minSelections === 'number'
          ? g.minSelections
          : null;
    const max =
      typeof g.max_selections === 'number'
        ? g.max_selections
        : typeof g.maxSelections === 'number'
          ? g.maxSelections
          : null;

    if (required && picked.length === 0) {
      errors[g.id] = 'This selection is required';
      continue;
    }
    if (typeof min === 'number' && picked.length < min) {
      errors[g.id] = `Please select at least ${min} option${min !== 1 ? 's' : ''}`;
      continue;
    }
    if (typeof max === 'number' && picked.length > max) {
      errors[g.id] = `Maximum ${max} selection${max !== 1 ? 's' : ''} allowed`;
      continue;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors };
}

function toCartModifiers(selected: SelectedByGroup): CartModifier[] {
  const out: CartModifier[] = [];
  for (const [groupId, mods] of Object.entries(selected)) {
    for (const m of mods) {
      if (!m.id || !m.name) continue;
      const adj =
        typeof (m as unknown as UnknownRecord)['price_adjustment'] === 'number'
          ? Math.round((m as unknown as UnknownRecord)['price_adjustment'] as number)
          : 0;

      out.push({
        id: m.id,
        groupId,
        name: m.name,
        priceAdjustment: adj,
      });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing (safe wrapper)
// ─────────────────────────────────────────────────────────────────────────────

function computeLocalSubtotalCents(
  unitPriceCents: number,
  selected: SelectedByGroup,
  qty: number,
): number {
  const modSum = Object.values(selected)
    .flat()
    .reduce((sum, m) => {
      const adj =
        typeof (m as unknown as UnknownRecord)['price_adjustment'] === 'number'
          ? Math.round((m as unknown as UnknownRecord)['price_adjustment'] as number)
          : 0;
      return sum + adj;
    }, 0);

  const unit = Math.max(0, Math.round(unitPriceCents)) + modSum;
  return Math.max(0, unit * clampInt(qty, 1, 99));
}
function normalizePriceToCents(raw: unknown): number {
  // Accept numbers or numeric strings
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;

  if (!Number.isFinite(n) || n <= 0) return 0;

  // If it's an integer, assume it's already cents (typical DB schema)
  if (Number.isInteger(n)) return n;

  // If it's a float, assume dollars and convert to cents
  return Math.round(n * 100);
}
function computePricingSafe(args: {
  item: MenuItemLike;
  unitPriceCents: number;
  qty: number;
  selected: SelectedByGroup;
}): { subtotalCents: number; pricingHash: string } {
  const fallbackSubtotal = computeLocalSubtotalCents(args.unitPriceCents, args.selected, args.qty);

  try {
    // ✅ This is the key fix: selected is SelectedModifier[] (PricingEngine-compatible)
    const compatMods = PricingEngine.buildCartModifiers(args.item, args.selected);

    const raw = PricingEngine.calculate(
      args.item.id,
      args.unitPriceCents,
      compatMods,
      args.qty,
    ) as unknown;
    const rec = isRecord(raw) ? raw : {};

    const subtotal =
      typeof rec['subtotal'] === 'number'
        ? Math.max(0, Math.round(rec['subtotal'] as number))
        : fallbackSubtotal;

    const pricingHash =
      typeof rec['pricing_hash'] === 'string'
        ? (rec['pricing_hash'] as string)
        : typeof rec['pricingHash'] === 'string'
          ? (rec['pricingHash'] as string)
          : '';

    return { subtotalCents: subtotal, pricingHash };
  } catch {
    return { subtotalCents: fallbackSubtotal, pricingHash: '' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

type State = {
  quantity: number;
  notes: string;
  selected: SelectedByGroup;
  errors: Record<string, string>;
  isSubmitting: boolean;
};

type Action =
  | { type: 'RESET' }
  | { type: 'SET_QTY'; qty: number }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'TOGGLE_MOD'; groupId: string; mod: SelectedModifier; max?: number }
  | { type: 'VALIDATION_FAIL'; errors: Record<string, string> }
  | { type: 'SUBMIT' }
  | { type: 'SUBMIT_DONE' };

function initialState(): State {
  return { quantity: 1, notes: '', selected: {}, errors: {}, isSubmitting: false };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'RESET':
      return initialState();

    case 'SET_QTY':
      return { ...state, quantity: clampInt(action.qty, 1, 99) };

    case 'SET_NOTES':
      return { ...state, notes: action.notes };

    case 'TOGGLE_MOD': {
      const { groupId, mod, max } = action;
      const current = state.selected[groupId] ?? [];
      const exists = current.some((x) => x.id === mod.id);

      let next = exists ? current.filter((x) => x.id !== mod.id) : [...current, mod];

      // max=1 acts like radio: selecting a new item replaces existing
      if (max === 1 && !exists) next = [mod];

      if (typeof max === 'number' && max > 0 && next.length > max) {
        next = next.slice(next.length - max);
      }

      return {
        ...state,
        errors: { ...state.errors, [groupId]: '' },
        selected: { ...state.selected, [groupId]: next },
      };
    }

    case 'VALIDATION_FAIL':
      return { ...state, errors: action.errors, isSubmitting: false };

    case 'SUBMIT':
      return { ...state, isSubmitting: true };

    case 'SUBMIT_DONE':
      return { ...state, isSubmitting: false };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export interface MenuItemModalProps {
  isOpen: boolean;
  item: MenuItemBase;
  onClose: () => void;
}

export default memo(function MenuItemModal({ isOpen, item, onClose }: MenuItemModalProps) {
  const { addItem } = useCart();
  const compatItem = item as unknown as MenuItemLike;

  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const groups = useMemo(() => getGroups(compatItem), [compatItem]);
  const imageUrl = useMemo(() => getImageUrl(compatItem), [compatItem]);
  const category = useMemo(() => normalizeCategory(compatItem.category), [compatItem.category]);
  const unitPriceCents = useMemo(() => normalizeUnitPriceCents(compatItem), [compatItem]);

  useEffect(() => {
    if (!isOpen) return;
    dispatch({ type: 'RESET' });
    queueMicrotask(() => closeBtnRef.current?.focus());
  }, [isOpen, compatItem.id]);

  const pricing = useMemo(() => {
    return computePricingSafe({
      item: compatItem,
      unitPriceCents,
      qty: state.quantity,
      selected: state.selected,
    });
  }, [compatItem, unitPriceCents, state.quantity, state.selected]);

  const handleAddToCart = useCallback(() => {
    const v = validateSelection(groups, state.selected);
    if (!v.ok) {
      dispatch({ type: 'VALIDATION_FAIL', errors: v.errors });
      const firstId = Object.keys(v.errors)[0];
      if (firstId) {
        document
          .getElementById(`mg-${firstId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    dispatch({ type: 'SUBMIT' });

    const payload: AddToCartInput = {
      menuItemId: compatItem.id,
      name: compatItem.name,
      unitPriceCents, // ✅ normalized cents
      imageUrl,
      category,
      modifiers: toCartModifiers(state.selected),
      quantity: clampInt(state.quantity, 1, 99),
      notes: sanitizeNotes(state.notes),
      pricingHash: pricing.pricingHash,
    };
    console.log('price raw=', compatItem.price, 'unitPriceCents=', unitPriceCents);
    addItem(payload);
    dispatch({ type: 'SUBMIT_DONE' });
    onClose();
  }, [
    addItem,
    category,
    compatItem.id,
    compatItem.name,
    groups,
    imageUrl,
    onClose,
    pricing.pricingHash,
    state.notes,
    state.quantity,
    state.selected,
    unitPriceCents,
  ]);

  if (!isOpen) return null;

  const canSubmit = unitPriceCents > 0 && !state.isSubmitting;

  return (
    <div className="w-full max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-semibold text-zinc-100">{compatItem.name}</h2>
          {compatItem.description ? (
            <p className="mt-1 text-sm text-zinc-400">{compatItem.description}</p>
          ) : null}

          <div className="mt-2 text-sm text-zinc-300">
            <span className="font-semibold">{PricingEngine.formatPrice(unitPriceCents)}</span>
            {unitPriceCents <= 0 ? (
              <span className="ml-2 text-xs text-red-300">(price missing/invalid)</span>
            ) : null}
          </div>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900/50"
        >
          Close
        </button>
      </div>

      {/* Image */}
      {imageUrl ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <img src={imageUrl} alt={compatItem.name} className="h-56 w-full object-cover" />
        </div>
      ) : null}

      {/* Modifier groups */}
      <div className="space-y-5">
        {groups.map((g) => {
          const picked = state.selected[g.id] ?? [];
          const err = state.errors[g.id];
          const required = g.required === true;

          const max =
            typeof g.max_selections === 'number'
              ? g.max_selections
              : typeof g.maxSelections === 'number'
                ? g.maxSelections
                : undefined;

          const mods = g.modifiers ?? [];

          return (
            <div
              key={g.id}
              id={`mg-${g.id}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-100">{g.name}</p>
                    {required ? <span className="text-[11px] text-amber-300">Required</span> : null}
                    {typeof max === 'number' ? (
                      <span className="text-[11px] text-zinc-500">Max {max}</span>
                    ) : null}
                  </div>
                  {err ? <p className="mt-1 text-xs text-red-300">{err}</p> : null}
                </div>

                <div className="text-xs text-zinc-500">{picked.length} selected</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {mods.map((m) => {
                  const adj = getAdjCents(m);
                  const selected = picked.some((x) => x.id === m.id);

                  const mod: SelectedModifier = {
                    id: m.id,
                    name: m.name,
                    price_adjustment: adj,
                  };

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => dispatch({ type: 'TOGGLE_MOD', groupId: g.id, mod, max })}
                      className={[
                        'flex items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors',
                        selected
                          ? 'border-amber-500/40 bg-amber-500/10'
                          : 'border-zinc-800 bg-zinc-950/30 hover:bg-zinc-900/40',
                      ].join(' ')}
                    >
                      <span className="text-sm text-zinc-100">{m.name}</span>
                      <span className="text-xs text-zinc-400">
                        {adj !== 0 ? `${adj > 0 ? '+' : ''}${PricingEngine.formatPrice(adj)}` : '—'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes + Quantity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="text-xs font-semibold text-zinc-400">Special instructions</label>
          <textarea
            value={state.notes}
            onChange={(e) => dispatch({ type: 'SET_NOTES', notes: e.target.value })}
            rows={3}
            className="mt-1 w-full rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/40"
            placeholder="e.g., no onions, extra salsa…"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-zinc-400">Quantity</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-2">
            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-zinc-900/60"
              onClick={() => dispatch({ type: 'SET_QTY', qty: state.quantity - 1 })}
              aria-label="Decrease quantity"
            >
              −
            </button>

            <div className="flex-1 text-center text-sm font-semibold text-zinc-100">
              {state.quantity}
            </div>

            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-zinc-800 bg-zinc-950/60 text-zinc-200 hover:bg-zinc-900/60"
              onClick={() => dispatch({ type: 'SET_QTY', qty: state.quantity + 1 })}
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-zinc-300">
          <span className="text-zinc-500">Subtotal:</span>{' '}
          <span className="font-semibold">{PricingEngine.formatPrice(pricing.subtotalCents)}</span>
          {pricing.pricingHash ? (
            <span className="ml-2 text-[11px] text-zinc-600">verified</span>
          ) : (
            <span className="ml-2 text-[11px] text-zinc-600">estimated</span>
          )}
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!canSubmit}
          className={[
            'rounded-xl px-5 py-3 text-sm font-semibold transition-colors',
            !canSubmit
              ? 'cursor-not-allowed bg-zinc-800 text-zinc-400'
              : 'bg-amber-500 text-black hover:bg-amber-400',
          ].join(' ')}
        >
          {state.isSubmitting
            ? 'Adding…'
            : `Add to Cart · ${PricingEngine.formatPrice(pricing.subtotalCents)}`}
        </button>
      </div>
    </div>
  );
});
