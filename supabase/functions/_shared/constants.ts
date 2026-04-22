// =============================================================================
// supabase/functions/_shared/constants.ts
// =============================================================================
// Single source of truth for shared business-rule constants used across
// Edge Function pipelines.
//
// MINIMUM ORDER:
//   Enforced in:
//     - create-checkout/index.ts          (primary pre-Stripe check)
//     - create-checkout-guest/index.ts    (primary pre-Stripe check)
//     - create-checkout/pending-cart.ts   (defense-in-depth inside find*Session)
//
//   All three files import MIN_ORDER_CENTS from here. There must be no
//   other declaration of this constant anywhere in the codebase.
// =============================================================================

export const MIN_ORDER_CENTS = 15_00; // $15.00