// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos.ts
// =============================================================================
// Backwards-compatible re-export shim.
// All promo action logic now lives in ./promos/ — this file exists so any
// existing import of '../actions/promos.ts' continues to resolve without changes.
// =============================================================================

export type { PromoListResult } from './promos/index.ts';
export type { CreatePromoPayload } from './promos/index.ts';
export type { UpdatePromoPayload } from './promos/index.ts';
export type { TogglePromoPayload } from './promos/index.ts';
export type { RemovePromoPayload } from './promos/index.ts';
export type { PromoRow, PromoType } from './promos/index.ts';

export { listPromos } from './promos/index.ts';
export { createPromo } from './promos/index.ts';
export { updatePromo } from './promos/index.ts';
export { togglePromo } from './promos/index.ts';
export { removePromo } from './promos/index.ts';