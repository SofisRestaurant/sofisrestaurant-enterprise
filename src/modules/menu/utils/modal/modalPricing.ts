// =============================================================================
// PATH: src/modules/menu/utils/modal/modalPricing.ts
// =============================================================================
// Modal-specific pricing derivations.
//
// ⚠️  DO NOT duplicate:
//   - fmtUsdFromCents  → import from ../menuItemGuards
//   - safeCents        → import from ../menuItemGuards
//   - computeSelectedModifierCents → import from ../modifierGuards
//   - canonicalizeSelectionsForHash → import from ../modifierGuards
//
// This file only adds modal-level compositions that sit ABOVE those primitives.
// =============================================================================

import type { PreflightResult, SelectionMap, ModalPricingValues, ModalPriceLabels } from '@/domain/menu/menu-modal.types';
import { safeCents, fmtUsdFromCents } from '../menuItemGuards';
import { computeSelectedModifierCents, canonicalizeSelectionsForHash } from '../modifierGuards';
import { PRICING_HASH_VERSION } from '../../constants/menuItemModal.constants';

// ── Core pricing computation ──────────────────────────────────────────────────

/**
 * Derives the three price values that drive the modal footer.
 * All values are in cents (integer).
 */
export function computeModalPricing(
  preflight: PreflightResult | null,
  selected: SelectionMap,
  safeQty: number,
): ModalPricingValues {
  const unitPriceCents =
    preflight?.ok === true ? safeCents(preflight.unit_price_cents, 0) : 0;

  const modifiersCents = computeSelectedModifierCents(selected);

  const lineTotalCents = (unitPriceCents + modifiersCents) * safeQty;

  return { unitPriceCents, modifiersCents, lineTotalCents };
}

// ── Label derivation ─────────────────────────────────────────────────────────

/**
 * Converts raw cents + loading state into display-ready strings for the modal.
 */
export function computeModalPriceLabels(
  pricing: ModalPricingValues,
  preflightLoading: boolean,
  preflight: PreflightResult | null,
): ModalPriceLabels {
  const { unitPriceCents, modifiersCents, lineTotalCents } = pricing;

  const basePriceLabel = fmtUsdFromCents(unitPriceCents);
  const stickyTotalLabel = fmtUsdFromCents(lineTotalCents);

  const extrasLabel =
    modifiersCents > 0 ? `+ ${fmtUsdFromCents(modifiersCents)} options` : null;

  let headerPriceLabel: string;
  if (preflightLoading) {
    headerPriceLabel = 'checking…';
  } else if (preflight?.ok === true) {
    headerPriceLabel = 'server-confirmed';
  } else {
    headerPriceLabel = '—';
  }

  return { basePriceLabel, extrasLabel, stickyTotalLabel, headerPriceLabel };
}

// ── Pricing hash ─────────────────────────────────────────────────────────────

/**
 * Composes the pricingHash string that is sent with every addItem payload.
 *
 * Contract (preserved from original):
 *   `v2:preflight:{id}:{unit_price_cents}:mods:{canonicalized}:qty:{qty}`
 *
 * IMPORTANT: Do not change the format — the server validates this string.
 */
export function composePricingHash(
  id: string,
  unitPriceCents: number,
  selected: SelectionMap,
  safeQty: number,
): string {
  const modsHash = canonicalizeSelectionsForHash(selected);
  return `${PRICING_HASH_VERSION}:preflight:${id}:${unitPriceCents}:mods:${modsHash}:qty:${safeQty}`;
}