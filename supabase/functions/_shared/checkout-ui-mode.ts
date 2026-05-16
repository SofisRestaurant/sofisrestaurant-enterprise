// supabase/functions/_shared/checkout-ui-mode.ts
// =============================================================================
// Single source of truth for the Stripe Checkout `ui_mode` we support.
//
// Stripe currently supports 'hosted' | 'embedded' | 'custom'. We only expose
// 'hosted' and 'embedded' to the client. Adding 'custom' here later is
// intentional: every endpoint that accepts a ui_mode validates against this
// union, so a new mode requires explicit allowlisting at every gate.
// =============================================================================

export type CheckoutUiMode = "hosted" | "embedded";

export const DEFAULT_CHECKOUT_UI_MODE: CheckoutUiMode = "hosted";

export function isCheckoutUiMode(value: unknown): value is CheckoutUiMode {
  return value === "hosted" || value === "embedded";
}