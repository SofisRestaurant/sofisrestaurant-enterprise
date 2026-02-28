// src/components/menu/MenuItemModal.tsx
// ============================================================================
// MENU ITEM MODAL — Configuration Engine UI
// ============================================================================
// Architecture:
//   • Calls MenuService.getMenuItemWithModifiers() on mount to load the
//     full modifier graph from menu_items_full view
//   • FSM: loading → configuring → invalid → submitting
//   • All pricing via PricingEngine (deterministic, hashed)
//   • Passes AddToCartPayload to onAddToCart — cart never sees MenuItem
//   • No console.log
// ============================================================================

import { useReducer, useMemo, useEffect } from 'react';
import { MenuService } from '@/services/menu.service';
import { PricingEngine } from '@/domain/pricing/pricing.engine';
import type { MenuItem, ModifierGroup, SelectedModifier } from '@/domain/menu/menu.types';
import type { AddToCartPayload } from '@/features/cart/cart.types';

// ─────────────────────────────────────────────────────────────────────────────
// FSM
// ─────────────────────────────────────────────────────────────────────────────

type Phase = 'loading' | 'configuring' | 'invalid' | 'submitting';

interface State {
  phase: Phase;
  item: MenuItem | null; // enriched with modifiers after load
  errors: Record<string, string>;
  selectedModifiers: Record<string, SelectedModifier[]>;
  quantity: number;
  notes: string;
  loadError: string | null;
}

type Action =
  | { type: 'LOADED'; item: MenuItem }
  | { type: 'LOAD_FAILED'; error: string }
  | {
      type: 'SELECT_MODIFIER';
      groupId: string;
      modifier: SelectedModifier;
      groupType: ModifierGroup['type'];
      maxSelections: number | null;
    }
  | { type: 'SET_QUANTITY'; quantity: number }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'VALIDATION_FAIL'; errors: Record<string, string> }
  | { type: 'SUBMIT' };

function initState(item: MenuItem): State {
  // Pre-select first option on required radio groups
  const preselected: Record<string, SelectedModifier[]> = {};
  for (const g of item.modifier_groups ?? []) {
    if (g.type === 'radio' && g.required && g.modifiers.length > 0) {
      const first = g.modifiers[0];
      preselected[g.id] = [
        { id: first.id, name: first.name, price_adjustment: first.price_adjustment },
      ];
    }
  }
  return {
    phase: 'configuring',
    item,
    errors: {},
    selectedModifiers: preselected,
    quantity: 1,
    notes: '',
    loadError: null,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOADED':
      return initState(action.item);

    case 'LOAD_FAILED':
      return { ...state, phase: 'configuring', loadError: action.error };

    case 'SELECT_MODIFIER': {
      const { groupId, modifier, groupType, maxSelections } = action;
      const current = state.selectedModifiers[groupId] ?? [];
      let next: SelectedModifier[];

      if (groupType === 'radio') {
        next = [modifier];
      } else {
        const exists = current.some((m) => m.id === modifier.id);
        if (exists) {
          next = current.filter((m) => m.id !== modifier.id);
        } else if (maxSelections && current.length >= maxSelections) {
          return {
            ...state,
            errors: { ...state.errors, [groupId]: `Maximum ${maxSelections} selections` },
          };
        } else {
          next = [...current, modifier];
        }
      }
      return {
        ...state,
        phase: 'configuring',
        errors: { ...state.errors, [groupId]: '' },
        selectedModifiers: { ...state.selectedModifiers, [groupId]: next },
      };
    }

    case 'SET_QUANTITY':
      return { ...state, quantity: Math.max(1, Math.floor(action.quantity)) };

    case 'SET_NOTES':
      return { ...state, notes: action.notes };

    case 'VALIDATION_FAIL':
      return { ...state, phase: 'invalid', errors: action.errors };

    case 'SUBMIT':
      return { ...state, phase: 'submitting' };

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MenuItemModalProps {
  /** Shallow item from list query — modifiers may be empty [] */
  item: MenuItem;
  onClose: () => void;
  onAddToCart: (payload: AddToCartPayload) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MenuItemModal({ item, onClose, onAddToCart }: MenuItemModalProps) {
  const [state, dispatch] = useReducer(reducer, item, (i) => ({
    phase: 'loading' as Phase,
    item: i,
    errors: {},
    selectedModifiers: {},
    quantity: 1,
    notes: '',
    loadError: null,
  }));

  // ── Load full modifier graph on mount ──────────────────────────────────────
  // List queries return items with modifier_groups: [] (flat row from view
  // without the json_agg join sometimes). This ensures we always have
  // the full graph before rendering.
  useEffect(() => {
    let cancelled = false;
    MenuService.getMenuItemWithModifiers(item.id)
      .then((full) => {
        if (cancelled) return;
        if (full) {
          dispatch({ type: 'LOADED', item: full });
        } else {
          // Fallback: use the item we already have (may have empty modifiers)
          dispatch({ type: 'LOADED', item });
        }
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: 'LOADED', item });
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const activeItem = state.item ?? item;
  const modifierGroups = activeItem.modifier_groups ?? [];
  const isLoading = state.phase === 'loading';
  const isSubmitting = state.phase === 'submitting';

  const cartModifiers = useMemo(
    () => PricingEngine.buildCartModifiers(activeItem, state.selectedModifiers),
    [activeItem, state.selectedModifiers],
  );

  const pricing = useMemo(
    () => PricingEngine.calculate(activeItem.id, activeItem.price, cartModifiers, state.quantity),
    [activeItem.id, activeItem.price, cartModifiers, state.quantity],
  );

  const stockStatus = PricingEngine.getStockStatus(activeItem);
  const stockMessage = PricingEngine.getStockMessage(activeItem);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleSelect(group: ModifierGroup, modifier: SelectedModifier) {
    if (isLoading || isSubmitting) return;
    dispatch({
      type: 'SELECT_MODIFIER',
      groupId: group.id,
      modifier,
      groupType: group.type,
      maxSelections: group.max_selections,
    });
  }

  function handleAddToCart() {
    const validation = PricingEngine.validateConfiguration(activeItem, state.selectedModifiers);
    if (!validation.valid) {
      dispatch({ type: 'VALIDATION_FAIL', errors: validation.errors });
      const firstId = Object.keys(validation.errors)[0];
      document
        .getElementById(`mg-${firstId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    dispatch({ type: 'SUBMIT' });
    onAddToCart({
      item_id: activeItem.id,
      name: activeItem.name,
      image_url: activeItem.image_url,
      base_price: activeItem.price,
      modifiers: cartModifiers,
      quantity: state.quantity,
      special_instructions: state.notes.trim() || undefined,
    });
    onClose();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Hero */}
        <div className="relative">
          {activeItem.image_url && (
            <div className="h-64 bg-gray-100">
              <img
                src={activeItem.image_url}
                alt={activeItem.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          {activeItem.featured && (
            <span className="absolute top-4 right-4 bg-amber-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow">
              ⭐ Featured
            </span>
          )}
          {stockMessage && stockStatus !== 'out' && (
            <span className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm font-semibold shadow animate-pulse">
              {stockMessage}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-1">
            <div className="flex-1 pr-4">
              <h2 className="text-3xl font-bold text-gray-900">{activeItem.name}</h2>
              {activeItem.description && (
                <p className="text-gray-500 text-sm mt-1">{activeItem.description}</p>
              )}
              <div className="flex gap-2 mt-2 flex-wrap">
                {activeItem.is_vegetarian && <Badge color="green">🌿 Vegetarian</Badge>}
                {activeItem.is_vegan && <Badge color="green">🌱 Vegan</Badge>}
                {activeItem.is_gluten_free && <Badge color="blue">🌾 Gluten-Free</Badge>}
                {activeItem.spicy_level ? (
                  <Badge color="red">{'🌶'.repeat(activeItem.spicy_level)}</Badge>
                ) : null}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none ml-2"
            >
              ×
            </button>
          </div>

          <p className="text-2xl font-bold text-amber-600 mt-3 mb-5">
            {PricingEngine.formatPrice(activeItem.price)}
          </p>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3 mb-6 animate-pulse">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-gray-100 rounded-lg" />
              ))}
            </div>
          )}

          {/* Modifier groups */}
          {!isLoading && modifierGroups.length > 0 && (
            <div className="space-y-6 mb-6">
              {modifierGroups.map((group) => (
                <div key={group.id} id={`mg-${group.id}`} className="border-t pt-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-lg text-gray-900">
                      {group.name}
                      {group.required && <span className="text-red-500 ml-1">*</span>}
                    </h3>
                    <span className="text-xs text-gray-400">
                      {group.type === 'radio'
                        ? 'Choose one'
                        : group.max_selections
                          ? `Choose up to ${group.max_selections}`
                          : 'Choose any'}
                    </span>
                  </div>

                  {group.description && (
                    <p className="text-xs text-gray-500 mb-2">{group.description}</p>
                  )}

                  {state.errors[group.id] && (
                    <p className="text-red-500 text-sm mb-2 font-medium">
                      ⚠ {state.errors[group.id]}
                    </p>
                  )}

                  <div className="space-y-2">
                    {group.modifiers.map((modifier) => {
                      const isSelected = (state.selectedModifiers[group.id] ?? []).some(
                        (m) => m.id === modifier.id,
                      );
                      return (
                        <button
                          key={modifier.id}
                          type="button"
                          disabled={!modifier.available || isSubmitting}
                          onClick={() =>
                            handleSelect(group, {
                              id: modifier.id,
                              name: modifier.name,
                              price_adjustment: modifier.price_adjustment,
                            })
                          }
                          className={[
                            'w-full flex justify-between items-center p-3 rounded-lg border-2 transition',
                            'disabled:opacity-40 disabled:cursor-not-allowed',
                            isSelected
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-200 hover:border-gray-300',
                          ].join(' ')}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className={[
                                'h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0',
                                isSelected ? 'border-amber-500 bg-amber-500' : 'border-gray-300',
                              ].join(' ')}
                            >
                              {isSelected && (
                                <span className="block h-1.5 w-1.5 rounded-full bg-white" />
                              )}
                            </span>
                            <span className="text-gray-800">{modifier.name}</span>
                          </span>
                          {modifier.price_adjustment > 0 && (
                            <span className="text-amber-600 font-semibold text-sm">
                              +{PricingEngine.formatPrice(modifier.price_adjustment)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Special instructions */}
          <textarea
            value={state.notes}
            onChange={(e) => dispatch({ type: 'SET_NOTES', notes: e.target.value })}
            placeholder="Special requests, allergies, substitutions..."
            maxLength={200}
            rows={2}
            className="w-full mb-1 px-4 py-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:border-amber-400"
          />
          <p className="text-xs text-gray-400 text-right mb-5">{state.notes.length}/200</p>

          {/* Quantity + total */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_QUANTITY', quantity: state.quantity - 1 })}
                className="w-9 h-9 border-2 border-gray-200 rounded-full text-lg font-bold text-gray-600 hover:border-amber-400 transition"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold text-lg">{state.quantity}</span>
              <button
                type="button"
                onClick={() => dispatch({ type: 'SET_QUANTITY', quantity: state.quantity + 1 })}
                className="w-9 h-9 border-2 border-gray-200 rounded-full text-lg font-bold text-gray-600 hover:border-amber-400 transition"
              >
                +
              </button>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-amber-600">
                {PricingEngine.formatPrice(pricing.subtotal)}
              </div>
              {pricing.modifier_total > 0 && (
                <div className="text-xs text-gray-400 mt-0.5">
                  {PricingEngine.formatPrice(activeItem.price)} +{' '}
                  {PricingEngine.formatPrice(pricing.modifier_total)} options
                </div>
              )}
            </div>
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={isLoading || isSubmitting || stockStatus === 'out'}
            className={[
              'w-full font-bold py-4 rounded-xl text-white text-lg transition',
              isLoading || isSubmitting || stockStatus === 'out'
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 active:scale-[0.98]',
            ].join(' ')}
          >
            {stockStatus === 'out'
              ? 'Out of Stock'
              : isLoading
                ? 'Loading...'
                : isSubmitting
                  ? 'Adding...'
                  : `Add to Cart · ${PricingEngine.formatPrice(pricing.subtotal)}`}
          </button>

          {state.phase === 'invalid' && Object.values(state.errors).some(Boolean) && (
            <p className="text-center text-sm text-red-500 mt-3">
              Please complete all required selections above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Badge({
  children,
  color,
}: {
  children: React.ReactNode;
  color: 'green' | 'blue' | 'red';
}) {
  const c = {
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  };
  return (
    <span className={`text-xs border rounded-full px-2 py-0.5 font-medium ${c[color]}`}>
      {children}
    </span>
  );
}