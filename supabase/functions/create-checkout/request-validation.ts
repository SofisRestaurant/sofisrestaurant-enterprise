import type Stripe from "stripe";

import type { Json } from "../_shared/database.types.ts";
import {
  ALLOWED_ORDER_TYPES,
  isOrderType,
  MAX_CLIENT_HASH_LEN,
  MAX_ID_LEN,
  MAX_ITEMS,
  MAX_NOTES_LEN,
  MAX_PROMO_CODE_LEN,
  MAX_URL_LEN,
} from "./env.ts";
import { getAllowedOrigins } from "./cors.ts";
import type {
  RequestBody,
  RequestCartItemInput,
  RequestCartModifierInput,
} from "./types.ts";

// ─── Shared result type ───────────────────────────────────────────────────────

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// ─── Guest body type ──────────────────────────────────────────────────────────

export type GuestRequestBody = {
  items: RequestCartItemInput[];
  order_type: "pickup" | "delivery" | "dine_in";
  notes: string | null;
  guest_email: string;
  guest_token: string | null;
  success_url: string | null;
  cancel_url: string | null;
  // pickup_time: ISO 8601, seconds precision. null when not a scheduled order.
  pickup_time: string | null;
};

// ─── Fields that are forbidden in guest checkout ──────────────────────────────
// Any of these present in the request body → hard 422. Never silently ignore.
// pickup_time is intentionally NOT in this list — guests may schedule pickups.

const GUEST_FORBIDDEN_FIELDS = [
  "promo_code",
  "promo_id",
  "credit_id",
  "loyalty_redeem_points",
  "loyalty_reward_id",
  "loyalty_redemption_id",
  "loyalty_account_id",
  "client_integrity_hash",
] as const;

// ─── Fields that are forbidden in auth checkout ───────────────────────────────

const AUTH_FORBIDDEN_FIELDS = [
  "guest_email",
  "guest_token",
] as const;

// ─── Shared utility functions ─────────────────────────────────────────────────

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJson(value: unknown): value is Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJson(entry));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) =>
    entry === undefined || isJson(entry)
  );
}

export function serializeToJson(value: unknown): Json {
  const parsed: unknown = JSON.parse(JSON.stringify(value));
  if (!isJson(parsed)) {
    throw new Error("Value is not JSON-serializable");
  }
  return parsed;
}

export function isNonEmptySafeId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_ID_LEN &&
    /^[A-Za-z0-9._:-]+$/.test(value.trim())
  );
}

export function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeNotes(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return trimmed.slice(0, MAX_NOTES_LEN);
}

export function normCurrency(value: unknown): string {
  const currency = typeof value === "string" ? value.trim().toLowerCase() : "";
  return currency || "usd";
}

export function parseOptionalInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

export function pickMeta(
  meta: Stripe.Metadata | null | undefined,
  ...keys: string[]
): string | null {
  if (!meta) return null;

  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

// ─── pickup_time normalizer ───────────────────────────────────────────────────
// Light validation only — server-side business logic (e.g. minimum lead time,
// operating hours) is enforced by the Edge Function and/or webhook, not here.
// Accepts any parseable ISO 8601 string and normalizes to seconds precision.
// Returns null when the field is absent, empty, or not a parseable date so the
// caller can safely store it without a nullable type branch.

function normalizePickupTime(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;

  // Seconds-precision ISO 8601 — drop milliseconds for consistency with
  // parsePickupTimeFromMetadata() in the webhook.
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}

// ─── Item normalization (used by BOTH validators — copied, not shared) ────────
// Intentionally duplicated between auth and guest validators.
// A shared helper would allow a future change to silently affect both pipelines.

function normalizeRequestModifier_auth(
  value: unknown,
  fallbackGroupId: string | null,
): ValidationResult<RequestCartModifierInput | null> {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value === "string") {
    if (!isNonEmptySafeId(value)) {
      return { ok: false, error: "Modifier id is invalid" };
    }

    return {
      ok: true,
      value: {
        id: value.trim(),
        groupId: fallbackGroupId,
      },
    };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "Modifier entry is invalid" };
  }

  const modifierId = normalizeString(value["id"]) ??
    normalizeString(value["modifier_id"]);
  if (!modifierId || !isNonEmptySafeId(modifierId)) {
    return { ok: false, error: "Modifier id is invalid" };
  }

  const groupIdCandidate = normalizeString(value["group_id"]) ??
    normalizeString(value["modifier_group_id"]) ??
    fallbackGroupId;

  if (groupIdCandidate && !isNonEmptySafeId(groupIdCandidate)) {
    return { ok: false, error: "Modifier group id is invalid" };
  }

  return {
    ok: true,
    value: {
      id: modifierId,
      groupId: groupIdCandidate,
    },
  };
}

function normalizeRequestModifiers_auth(
  value: unknown,
): ValidationResult<RequestCartModifierInput[]> {
  if (value === null || value === undefined) {
    return { ok: true, value: [] };
  }

  const out: RequestCartModifierInput[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeRequestModifier_auth(entry, null);
      if (!normalized.ok) return { ok: false, error: normalized.error };
      if (normalized.value) out.push(normalized.value);
    }

    return { ok: true, value: out };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "'modifiers' must be an array or object map" };
  }

  for (const [groupKey, entry] of Object.entries(value)) {
    const fallbackGroupId = isNonEmptySafeId(groupKey) ? groupKey : null;

    if (Array.isArray(entry)) {
      for (const nested of entry) {
        const normalized = normalizeRequestModifier_auth(nested, fallbackGroupId);
        if (!normalized.ok) return { ok: false, error: normalized.error };
        if (normalized.value) out.push(normalized.value);
      }
      continue;
    }

    const normalized = normalizeRequestModifier_auth(entry, fallbackGroupId);
    if (!normalized.ok) return { ok: false, error: normalized.error };
    if (normalized.value) out.push(normalized.value);
  }

  return { ok: true, value: out };
}

function normalizeRequestItem_auth(
  value: unknown,
  index: number,
): ValidationResult<RequestCartItemInput> {
  if (!isRecord(value)) {
    return { ok: false, error: `items[${index}] must be an object` };
  }

  if ("price" in value || "amount" in value || "unit_amount" in value) {
    return {
      ok: false,
      error: `items[${index}] must not include price fields`,
    };
  }

  const id = normalizeString(value["id"]) ??
    normalizeString(value["menu_item_id"]) ??
    normalizeString(value["menuItemId"]);

  if (!id || !isNonEmptySafeId(id)) {
    return { ok: false, error: `items[${index}].id is invalid` };
  }

  const quantity = parseOptionalInteger(value["quantity"]);
  if (!quantity || quantity < 1 || quantity > 99) {
    return {
      ok: false,
      error: `items[${index}].quantity must be an integer between 1 and 99`,
    };
  }

  const notesValue = value["notes"];
  if (
    notesValue !== undefined && notesValue !== null &&
    typeof notesValue !== "string"
  ) {
    return { ok: false, error: `items[${index}].notes must be a string` };
  }

  const notes = normalizeNotes(notesValue);
  if (
    typeof notesValue === "string" && notesValue.trim().length > MAX_NOTES_LEN
  ) {
    return {
      ok: false,
      error: `items[${index}].notes too long (max ${MAX_NOTES_LEN})`,
    };
  }

  const modifiers = normalizeRequestModifiers_auth(value["modifiers"]);
  if (!modifiers.ok) {
    return { ok: false, error: `items[${index}].${modifiers.error}` };
  }

  return {
    ok: true,
    value: {
      id: id.trim(),
      quantity,
      notes,
      modifiers: modifiers.value,
    },
  };
}

// ─── Guest item normalization (intentionally separate copy) ───────────────────

function normalizeRequestModifier_guest(
  value: unknown,
  fallbackGroupId: string | null,
): ValidationResult<RequestCartModifierInput | null> {
  if (value === null || value === undefined) {
    return { ok: true, value: null };
  }

  if (typeof value === "string") {
    if (!isNonEmptySafeId(value)) {
      return { ok: false, error: "Modifier id is invalid" };
    }

    return {
      ok: true,
      value: {
        id: value.trim(),
        groupId: fallbackGroupId,
      },
    };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "Modifier entry is invalid" };
  }

  const modifierId = normalizeString(value["id"]) ??
    normalizeString(value["modifier_id"]);
  if (!modifierId || !isNonEmptySafeId(modifierId)) {
    return { ok: false, error: "Modifier id is invalid" };
  }

  const groupIdCandidate = normalizeString(value["group_id"]) ??
    normalizeString(value["modifier_group_id"]) ??
    fallbackGroupId;

  if (groupIdCandidate && !isNonEmptySafeId(groupIdCandidate)) {
    return { ok: false, error: "Modifier group id is invalid" };
  }

  return {
    ok: true,
    value: {
      id: modifierId,
      groupId: groupIdCandidate,
    },
  };
}

function normalizeRequestModifiers_guest(
  value: unknown,
): ValidationResult<RequestCartModifierInput[]> {
  if (value === null || value === undefined) {
    return { ok: true, value: [] };
  }

  const out: RequestCartModifierInput[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeRequestModifier_guest(entry, null);
      if (!normalized.ok) return { ok: false, error: normalized.error };
      if (normalized.value) out.push(normalized.value);
    }

    return { ok: true, value: out };
  }

  if (!isRecord(value)) {
    return { ok: false, error: "'modifiers' must be an array or object map" };
  }

  for (const [groupKey, entry] of Object.entries(value)) {
    const fallbackGroupId = isNonEmptySafeId(groupKey) ? groupKey : null;

    if (Array.isArray(entry)) {
      for (const nested of entry) {
        const normalized = normalizeRequestModifier_guest(nested, fallbackGroupId);
        if (!normalized.ok) return { ok: false, error: normalized.error };
        if (normalized.value) out.push(normalized.value);
      }
      continue;
    }

    const normalized = normalizeRequestModifier_guest(entry, fallbackGroupId);
    if (!normalized.ok) return { ok: false, error: normalized.error };
    if (normalized.value) out.push(normalized.value);
  }

  return { ok: true, value: out };
}

function normalizeRequestItem_guest(
  value: unknown,
  index: number,
): ValidationResult<RequestCartItemInput> {
  if (!isRecord(value)) {
    return { ok: false, error: `items[${index}] must be an object` };
  }

  if ("price" in value || "amount" in value || "unit_amount" in value) {
    return {
      ok: false,
      error: `items[${index}] must not include price fields`,
    };
  }

  const id = normalizeString(value["id"]) ??
    normalizeString(value["menu_item_id"]) ??
    normalizeString(value["menuItemId"]);

  if (!id || !isNonEmptySafeId(id)) {
    return { ok: false, error: `items[${index}].id is invalid` };
  }

  const quantity = parseOptionalInteger(value["quantity"]);
  if (!quantity || quantity < 1 || quantity > 99) {
    return {
      ok: false,
      error: `items[${index}].quantity must be an integer between 1 and 99`,
    };
  }

  const notesValue = value["notes"];
  if (
    notesValue !== undefined && notesValue !== null &&
    typeof notesValue !== "string"
  ) {
    return { ok: false, error: `items[${index}].notes must be a string` };
  }

  const notes = normalizeNotes(notesValue);
  if (
    typeof notesValue === "string" && notesValue.trim().length > MAX_NOTES_LEN
  ) {
    return {
      ok: false,
      error: `items[${index}].notes too long (max ${MAX_NOTES_LEN})`,
    };
  }

  const modifiers = normalizeRequestModifiers_guest(value["modifiers"]);
  if (!modifiers.ok) {
    return { ok: false, error: `items[${index}].${modifiers.error}` };
  }

  return {
    ok: true,
    value: {
      id: id.trim(),
      quantity,
      notes,
      modifiers: modifiers.value,
    },
  };
}

// ─── Shared URL validator ─────────────────────────────────────────────────────

function validateRedirectUrl(url: string): ValidationResult<string> {
  if (url.length > MAX_URL_LEN) {
    return { ok: false, error: "Redirect URL is too long" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Redirect URL is invalid" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, error: "Redirect URL must use http(s)" };
  }

  if (!getAllowedOrigins().has(parsed.origin)) {
    return { ok: false, error: "Redirect URL origin is not allowlisted" };
  }

  return { ok: true, value: parsed.toString() };
}

// ─── validateGuestBody ────────────────────────────────────────────────────────
// Runs forbidden-field rejection FIRST — before any other validation.
// A probing client that sends loyalty/promo fields gets an explicit 422,
// not a silent ignore.

export function validateGuestBody(raw: unknown): ValidationResult<GuestRequestBody> {
  if (!isRecord(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  // Hard reject any auth-only field before touching anything else.
  for (const field of GUEST_FORBIDDEN_FIELDS) {
    if (raw[field] !== undefined && raw[field] !== null) {
      return {
        ok: false,
        error: `Field '${field}' is not permitted in guest checkout`,
      };
    }
  }

  // Items
  const rawItems = raw["items"];
  if (!Array.isArray(rawItems)) {
    return { ok: false, error: "'items' must be an array" };
  }

  if (rawItems.length === 0) {
    return { ok: false, error: "'items' must not be empty" };
  }

  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `Too many items (max ${MAX_ITEMS})` };
  }

  const items: RequestCartItemInput[] = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const normalized = normalizeRequestItem_guest(rawItems[index], index);
    if (!normalized.ok) {
      return normalized;
    }
    items.push(normalized.value);
  }

  // order_type
  const rawOrderType = typeof raw["order_type"] === "string"
    ? raw["order_type"].trim()
    : "pickup";

  if (!isOrderType(rawOrderType)) {
    return {
      ok: false,
      error: `'order_type' must be one of: ${ALLOWED_ORDER_TYPES.join(", ")}`,
    };
  }

  // notes
  const notesValue = raw["notes"];
  if (
    notesValue !== undefined && notesValue !== null &&
    typeof notesValue !== "string"
  ) {
    return { ok: false, error: "'notes' must be a string" };
  }

  const notes = normalizeNotes(notesValue);
  if (
    typeof notesValue === "string" && notesValue.trim().length > MAX_NOTES_LEN
  ) {
    return { ok: false, error: `'notes' too long (max ${MAX_NOTES_LEN})` };
  }

  // guest_email — required
  const guestEmailRaw = raw["guest_email"];
  if (
    guestEmailRaw === undefined ||
    guestEmailRaw === null ||
    typeof guestEmailRaw !== "string" ||
    guestEmailRaw.trim().length === 0
  ) {
    return { ok: false, error: "'guest_email' is required" };
  }

  const guestEmail = guestEmailRaw.trim().toLowerCase();

  if (guestEmail.length > 254) {
    return { ok: false, error: "'guest_email' must be 254 characters or fewer" };
  }

  // RFC-5322 simplified — no local part can start/end with dot,
  // domain must have at least one dot
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) {
    return { ok: false, error: "'guest_email' is not a valid email address" };
  }

  // guest_token — optional, used for session resumption
  const guestTokenRaw = raw["guest_token"];
  let guestToken: string | null = null;

  if (guestTokenRaw !== undefined && guestTokenRaw !== null) {
    if (typeof guestTokenRaw !== "string") {
      return { ok: false, error: "'guest_token' must be a string" };
    }
    const trimmed = guestTokenRaw.trim();
    if (trimmed.length < 8 || trimmed.length > 64) {
      return { ok: false, error: "'guest_token' must be between 8 and 64 characters" };
    }
    if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
      return { ok: false, error: "'guest_token' contains invalid characters" };
    }
    guestToken = trimmed;
  }

  // pickup_time — optional. Light validation only; business-rule enforcement
  // (lead time, operating hours) happens in the Edge Function / webhook.
  const pickupTime = normalizePickupTime(raw["pickup_time"]);
  if (raw["pickup_time"] !== undefined && raw["pickup_time"] !== null && pickupTime === null) {
    return { ok: false, error: "'pickup_time' must be a valid ISO 8601 date string" };
  }

  // success_url
  const successUrlRaw = normalizeString(raw["success_url"]);
  if (successUrlRaw) {
    const validated = validateRedirectUrl(successUrlRaw);
    if (!validated.ok) {
      return { ok: false, error: `Invalid success_url: ${validated.error}` };
    }
  }

  // cancel_url
  const cancelUrlRaw = normalizeString(raw["cancel_url"]);
  if (cancelUrlRaw) {
    const validated = validateRedirectUrl(cancelUrlRaw);
    if (!validated.ok) {
      return { ok: false, error: `Invalid cancel_url: ${validated.error}` };
    }
  }

  return {
    ok: true,
    value: {
      items,
      order_type: rawOrderType as "pickup" | "delivery" | "dine_in",
      notes,
      guest_email: guestEmail,
      guest_token: guestToken,
      pickup_time: pickupTime,
      success_url: successUrlRaw ?? null,
      cancel_url:  cancelUrlRaw ?? null,
    },
  };
}

// ─── validateAuthBody (renamed from validateBody) ─────────────────────────────

export function validateAuthBody(raw: unknown): ValidationResult<RequestBody> {
  if (!isRecord(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
  }

  // Reject guest-only fields on the auth endpoint
  for (const field of AUTH_FORBIDDEN_FIELDS) {
    if (raw[field] !== undefined && raw[field] !== null) {
      return {
        ok: false,
        error: `Field '${field}' is not permitted in auth checkout`,
      };
    }
  }

  const rawItems = raw["items"];
  if (!Array.isArray(rawItems)) {
    return { ok: false, error: "'items' must be an array" };
  }

  if (rawItems.length === 0) {
    return { ok: false, error: "'items' must not be empty" };
  }

  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `Too many items (max ${MAX_ITEMS})` };
  }

  const items: RequestCartItemInput[] = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const normalized = normalizeRequestItem_auth(rawItems[index], index);
    if (!normalized.ok) {
      return normalized;
    }
    items.push(normalized.value);
  }

  const rawOrderType = typeof raw["order_type"] === "string"
    ? raw["order_type"].trim()
    : "pickup";

  if (!isOrderType(rawOrderType)) {
    return {
      ok: false,
      error: `'order_type' must be one of: ${ALLOWED_ORDER_TYPES.join(", ")}`,
    };
  }

  const notesValue = raw["notes"];
  if (
    notesValue !== undefined && notesValue !== null &&
    typeof notesValue !== "string"
  ) {
    return { ok: false, error: "'notes' must be a string" };
  }

  const notes = normalizeNotes(notesValue);
  if (
    typeof notesValue === "string" && notesValue.trim().length > MAX_NOTES_LEN
  ) {
    return { ok: false, error: `'notes' too long (max ${MAX_NOTES_LEN})` };
  }

  // pickup_time — optional. Light validation only.
  const pickupTime = normalizePickupTime(raw["pickup_time"]);
  if (raw["pickup_time"] !== undefined && raw["pickup_time"] !== null && pickupTime === null) {
    return { ok: false, error: "'pickup_time' must be a valid ISO 8601 date string" };
  }

  const promoCode = normalizeString(raw["promo_code"]);
  if (promoCode && promoCode.length > MAX_PROMO_CODE_LEN) {
    return {
      ok: false,
      error: `'promo_code' too long (max ${MAX_PROMO_CODE_LEN})`,
    };
  }

  const promoIdRaw = raw["promo_id"];
  if (
    promoIdRaw !== undefined && promoIdRaw !== null &&
    !isNonEmptySafeId(promoIdRaw)
  ) {
    return {
      ok: false,
      error: "'promo_id' must be a non-empty safe identifier",
    };
  }

  const creditIdRaw = raw["credit_id"];
  if (
    creditIdRaw !== undefined && creditIdRaw !== null &&
    !isNonEmptySafeId(creditIdRaw)
  ) {
    return {
      ok: false,
      error: "'credit_id' must be a non-empty safe identifier",
    };
  }

  const successUrlRaw = normalizeString(raw["success_url"]);
  if (successUrlRaw) {
    const validated = validateRedirectUrl(successUrlRaw);
    if (!validated.ok) {
      return { ok: false, error: `Invalid success_url: ${validated.error}` };
    }
  }

  const cancelUrlRaw = normalizeString(raw["cancel_url"]);
  if (cancelUrlRaw) {
    const validated = validateRedirectUrl(cancelUrlRaw);
    if (!validated.ok) {
      return { ok: false, error: `Invalid cancel_url: ${validated.error}` };
    }
  }

  const clientIntegrityHashRaw = raw["client_integrity_hash"];
  if (
    clientIntegrityHashRaw !== undefined &&
    clientIntegrityHashRaw !== null &&
    typeof clientIntegrityHashRaw !== "string"
  ) {
    return { ok: false, error: "'client_integrity_hash' must be a string" };
  }

  if (
    typeof clientIntegrityHashRaw === "string" &&
    clientIntegrityHashRaw.trim().length > MAX_CLIENT_HASH_LEN
  ) {
    return {
      ok: false,
      error: `'client_integrity_hash' too long (max ${MAX_CLIENT_HASH_LEN})`,
    };
  }

  const loyaltyRedeemPoints = parseOptionalInteger(
    raw["loyalty_redeem_points"],
  );
  if (
    raw["loyalty_redeem_points"] !== undefined &&
    raw["loyalty_redeem_points"] !== null &&
    loyaltyRedeemPoints === null
  ) {
    return { ok: false, error: "'loyalty_redeem_points' must be an integer" };
  }

  if (loyaltyRedeemPoints !== null && loyaltyRedeemPoints < 0) {
    return {
      ok: false,
      error: "'loyalty_redeem_points' must be greater than or equal to 0",
    };
  }

  const loyaltyRewardIdRaw = raw["loyalty_reward_id"];
  if (
    loyaltyRewardIdRaw !== undefined &&
    loyaltyRewardIdRaw !== null &&
    !isNonEmptySafeId(loyaltyRewardIdRaw)
  ) {
    return {
      ok: false,
      error: "'loyalty_reward_id' must be a non-empty safe identifier",
    };
  }

  const loyaltyRedemptionIdRaw = raw["loyalty_redemption_id"];
  if (
    loyaltyRedemptionIdRaw !== undefined &&
    loyaltyRedemptionIdRaw !== null &&
    !isNonEmptySafeId(loyaltyRedemptionIdRaw)
  ) {
    return {
      ok: false,
      error: "'loyalty_redemption_id' must be a non-empty safe identifier",
    };
  }

  const loyaltyAccountIdRaw = raw["loyalty_account_id"];
  if (
    loyaltyAccountIdRaw !== undefined &&
    loyaltyAccountIdRaw !== null &&
    !isNonEmptySafeId(loyaltyAccountIdRaw)
  ) {
    return {
      ok: false,
      error: "'loyalty_account_id' must be a non-empty safe identifier",
    };
  }

  return {
    ok: true,
    value: {
      items,
      order_type: rawOrderType,
      notes,
      pickup_time: pickupTime ?? null,
      promo_code: promoCode ?? null,
      promo_id: typeof promoIdRaw === "string" ? promoIdRaw.trim() : null,
      credit_id: typeof creditIdRaw === "string" ? creditIdRaw.trim() : null,
      success_url: successUrlRaw,
      cancel_url: cancelUrlRaw,
      client_integrity_hash: typeof clientIntegrityHashRaw === "string"
        ? clientIntegrityHashRaw.trim() || null
        : null,
      loyalty_redeem_points: loyaltyRedeemPoints,
      loyalty_reward_id: typeof loyaltyRewardIdRaw === "string"
        ? loyaltyRewardIdRaw.trim()
        : null,
      loyalty_redemption_id: typeof loyaltyRedemptionIdRaw === "string"
        ? loyaltyRedemptionIdRaw.trim()
        : null,
      loyalty_account_id: typeof loyaltyAccountIdRaw === "string"
        ? loyaltyAccountIdRaw.trim()
        : null,
    },
  };
}