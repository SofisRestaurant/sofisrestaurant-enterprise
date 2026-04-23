//path: supabase/functions/create-checkout/types.ts
import { createServiceClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import type { OrderType } from "../_shared/pricing.ts";

export type Db = Database;
export type DbClient = ReturnType<typeof createServiceClient>;

export type CheckoutRateLimitInsert =
  Db["public"]["Tables"]["checkout_rate_limits"]["Insert"];
export type CheckoutRateLimitUpdate =
  Db["public"]["Tables"]["checkout_rate_limits"]["Update"];

export type PendingCartInsert =
  & Db["public"]["Tables"]["pending_carts"]["Insert"]
  & {
    pricing_snapshot?: Json;
    pricing_hash?: string | null;
    currency?: string | null;
    consumed_at?: string | null;
    // Guest checkout columns (added by migration 001_guest_checkout.sql)
    guest_email?: string | null;
    guest_token?: string | null;
  };

export type PendingCartUpdate =
  & Db["public"]["Tables"]["pending_carts"]["Update"]
  & {
    pricing_snapshot?: Json;
    pricing_hash?: string | null;
    currency?: string | null;
    consumed_at?: string | null;
    // Loyalty reservation columns added by loyalty_checkout_reserve migration
    loyalty_account_id?: string | null;
    loyalty_reserved_points?: number | null;
    loyalty_discount_cents?: number | null;
    // Guest checkout columns (added by migration 001_guest_checkout.sql)
    guest_email?: string | null;
    guest_token?: string | null;
    // NOTE: `status` is intentionally omitted — the DB generated type does not
    // include a status column on pending_carts and rejects it as `never`.
    // Do not add status here.
  };

export type FraudLogInsert = Db["public"]["Tables"]["fraud_logs"]["Insert"];
export type SecurityEventInsert =
  Db["public"]["Tables"]["security_events"]["Insert"];

export type PromotionTableRow = Db["public"]["Tables"]["promotions"]["Row"];
export type MenuItemTableRow = Db["public"]["Tables"]["menu_items"]["Row"];
export type ModifierTableRow = Db["public"]["Tables"]["modifiers"]["Row"];
export type ModifierGroupTableRow =
  Db["public"]["Tables"]["modifier_groups"]["Row"];
export type MenuItemModifierGroupTableRow =
  Db["public"]["Tables"]["menu_item_modifier_groups"]["Row"];

export type PromotionLookupRow = Pick<
  PromotionTableRow,
  | "id"
  | "code"
  | "type"
  | "value"
  | "min_order_cents"
  | "max_uses"
  | "current_uses"
  | "starts_at"
  | "ends_at"
  | "expires_at"
  | "active"
  | "channel"
  | "per_user_limit"
>;

export type MenuItemLookupRow = Pick<
  MenuItemTableRow,
  "id" | "name" | "image_url" | "category" | "price" | "available"
>;

export type ModifierLookupRow = Pick<
  ModifierTableRow,
  | "id"
  | "modifier_group_id"
  | "name"
  | "price_adjustment"
  | "available"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

export type ModifierGroupLookupRow = Pick<
  ModifierGroupTableRow,
  | "id"
  | "name"
  | "required"
  | "min_selections"
  | "max_selections"
  | "active"
  | "type"
  | "description"
  | "sort_order"
  | "created_at"
  | "updated_at"
>;

export type MenuItemModifierGroupLookupRow = Pick<
  MenuItemModifierGroupTableRow,
  "id" | "menu_item_id" | "modifier_group_id" | "sort_order"
>;

export type RequestCartModifierInput = {
  id: string;
  groupId: string | null;
};

export type RequestCartItemInput = {
  id: string;
  quantity: number;
  notes: string | null;
  modifiers: RequestCartModifierInput[];
};

export type RequestBody = {
  items: RequestCartItemInput[];
  order_type: OrderType;
  notes: string | null;
  // Normalized ISO 8601 (seconds precision) or null for ASAP orders.
  // Optional here so that existing callers that do not yet send the field
  // are not affected — validateAuthBody sets it to null when absent.
  pickup_time?: string | null;
  promo_code: string | null;
  promo_id: string | null;
  credit_id: string | null;
  success_url: string | null;
  cancel_url: string | null;
  client_integrity_hash: string | null;
  loyalty_redeem_points: number | null;
  loyalty_reward_id: string | null;
  loyalty_redemption_id: string | null;
  loyalty_account_id: string | null;
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfterMs: number;
  reason: string;
};

export type PromoValidationResult =
  | { valid: true; promoId: string; discountCents: number }
  | { valid: false; error: string };

export type CreditValidationResult =
  | { valid: true; creditId: string; creditCents: number }
  | { valid: false; error: string };

export type JsonObject = { [key: string]: Json | undefined };

export type ReusablePendingCartRow = {
  id: string;
  stripeSessionId: string;
  expiresAt: string | null;
  pricingHash: string | null;
  currency: string | null;
};

export type ErrorCode =
  | "origin_not_allowed"
  | "method_not_allowed"
  | "authorization_required"
  | "invalid_token"
  | "unsupported_content_type"
  | "empty_body"
  | "body_too_large"
  | "body_read_failed"
  | "invalid_json"
  | "validation_failed"
  | "service_unavailable"
  | "rate_limited"
  | "pricing_failed"
  | "pricing_hash_failed"
  | "pricing_integrity_failed"
  | "promo_invalid"
  | "credit_invalid"
  | "pending_cart_persist_failed"
  | "line_items_failed"
  | "stripe_session_failed"
  | "discount_conflict"
  | "loyalty_reserve_conflict"
  | "loyalty_daily_limit"
  | "loyalty_order_limit"
  | "loyalty_cooldown"
  | "recent_order_exists"
  | "internal_error"
  | "auth_not_permitted";

export type SuccessCode =
  | "checkout_session_created"
  | "checkout_session_reused";