// =============================================================================
// PATH: supabase/functions/admin-gateway/actions/promos/index.ts
// =============================================================================
// Barrel file — re-exports all public symbols from the promo action modules so
// callers can import from a single path:
//
//   import { listPromos, createPromo, updatePromo, togglePromo, removePromo }
//     from './promos/index.ts';
// =============================================================================

export type { PromoListResult } from './list.ts';
export { listPromos } from './list.ts';

export type { CreatePromoPayload } from './create.ts';
export { createPromo } from './create.ts';

export type { UpdatePromoPayload } from './update.ts';
export { updatePromo } from './update.ts';

export type { TogglePromoPayload } from './toggle.ts';
export { togglePromo } from './toggle.ts';

export type { RemovePromoPayload } from './remove.ts';
export { removePromo } from './remove.ts';

export type { PromoRow, PromoType } from './shared.ts';