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

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

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

function normalizeRequestModifier(
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

function normalizeRequestModifiers(
  value: unknown,
): ValidationResult<RequestCartModifierInput[]> {
  if (value === null || value === undefined) {
    return { ok: true, value: [] };
  }

  const out: RequestCartModifierInput[] = [];

  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeRequestModifier(entry, null);
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
        const normalized = normalizeRequestModifier(nested, fallbackGroupId);
        if (!normalized.ok) return { ok: false, error: normalized.error };
        if (normalized.value) out.push(normalized.value);
      }
      continue;
    }

    const normalized = normalizeRequestModifier(entry, fallbackGroupId);
    if (!normalized.ok) return { ok: false, error: normalized.error };
    if (normalized.value) out.push(normalized.value);
  }

  return { ok: true, value: out };
}

function normalizeRequestItem(
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

  const modifiers = normalizeRequestModifiers(value["modifiers"]);
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

export function validateBody(raw: unknown): ValidationResult<RequestBody> {
  if (!isRecord(raw)) {
    return { ok: false, error: "Request body must be a JSON object" };
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
    const normalized = normalizeRequestItem(rawItems[index], index);
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

  // loyalty_account_id: the loyalty_accounts.id UUID sent by the frontend.
  // Ownership is validated server-side in loyalty.ts against the JWT userId.
  // We accept any non-empty safe identifier string here.
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