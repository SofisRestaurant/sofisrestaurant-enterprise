// =============================================================================
// supabase/functions/_shared/pricing.ts
// =============================================================================
// Production-grade authoritative pricing engine (2026 hardened)
//
// Goals:
// - Authoritative server pricing snapshot for Stripe + DB.
// - Zero "any".
// - Safe decoding for legacy Json payloads (Supabase Json union).
// - Deterministic hashing for auditability.
// - Never write empty {} pricing_snapshot.
// - Make money-unit intent explicit (cents vs dollars) to prevent drift.
// =============================================================================

import type { Database, Json } from './database.types.ts';
import type { DbClient } from './supabase.ts';

// ─── Local Stripe line item type ──────────────────────────────────────────────
// Stripe.Checkout.SessionCreateParams.LineItem is not reliably available in
// Deno with stripe@22. This local type covers exactly the fields we construct
// and read (quantity, price_data.unit_amount). It is structurally compatible
// with what stripe.checkout.sessions.create() accepts at runtime.

type StripeLineItem = {
  quantity: number;
  price_data?: {
    currency: string;
    unit_amount: number;
    product_data: {
      name: string;
      metadata?: Record<string, string>;
    };
  };
};

type MenuCategory = Database['public']['Enums']['menu_category'];

export type OrderType = 'pickup' | 'delivery' | 'dine_in';

// ─────────────────────────────────────────────────────────────────────────────
// Canonical cart types (server-side validated cart)
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalModifier = {
  id: string;
  groupId: string;
  name: string;
  priceAdjustmentCents: number;
};

export type CanonicalCartItem = {
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  category: MenuCategory;
  quantity: number;
  notes: string | null;
  baseUnitPriceCents: number;
  modifiers: CanonicalModifier[];
  basePricingHash: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Pricing campaign model (pricing semantics, NOT marketing)
// ─────────────────────────────────────────────────────────────────────────────

type PricingCampaign = {
  id: string;
  campaignName: string | null;
  menuItemId: string | null;
  appliesToCategory: MenuCategory | null;
  appliesToOrderType: OrderType | null;
  dealType: 'fixed_price' | 'percent_off' | 'amount_off' | 'bogo';
  dealPriceCents: number | null;
  discountPercent: number | null;
  discountCents: number | null;
  stackable: boolean;
  priority: number;
  pricingPriority: number;
  weight: number;
  startsAt: string | null;
  endsAt: string | null;
};

type PromotionRecord = {
  id: string;
  code: string;
  campaignId: string | null;
  channel: string | null;
  type: string;
  value: number;
  minOrderCents: number;
  maxUses: number | null;
  currentUses: number;
  perUserLimit: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  expiresAt: string | null;
};

type CreditRecord = {
  id: string;
  userId: string;
  amountCents: number;
  used: boolean;
  expiresAt: string | null;
  checkoutSessionId: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot types (what is charged, stored, audited)
// ─────────────────────────────────────────────────────────────────────────────

export type PricingSnapshotLine = {
  lineId: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  category: MenuCategory;
  quantity: number;
  notes: string | null;
  modifiers: Array<{
    id: string;
    groupId: string;
    name: string;
    priceAdjustmentCents: number;
  }>;
  baseUnitPriceCents: number;
  modifierUnitPriceCents: number;
  baseLineSubtotalCents: number;
  modifierLineSubtotalCents: number;
  campaignId: string | null;
  campaignName: string | null;
  campaignDealType: string | null;
  campaignStackable: boolean;
  campaignDiscountCents: number;
  promoEligible: boolean;
  promoDiscountCents: number;
  creditDiscountCents: number;
  finalPretaxLineTotalCents: number;
  unitAmountsCents: number[];
  basePricingHash: string;
};

export type PricingSnapshot = {
  version: '2026-03-06';
  currency: 'usd';
  orderType: OrderType;
  orderNotes: string | null;
  userId: string;
  createdAt: string;
  lines: PricingSnapshotLine[];
  subtotalCents: number;
  campaignDiscountCents: number;
  promoId: string | null;
  promoCode: string | null;
  promoDiscountCents: number;
  creditId: string | null;
  creditCents: number;
  taxCents: number;
  totalCents: number;
  appliedCampaignIds: string[];
};

export type PricingResolution = {
  snapshot: PricingSnapshot;
  pricingHash: string;
};

type ResolvePricingInput = {
  svc: DbClient;
  userId: string;
  items: CanonicalCartItem[];
  promoId: string | null;
  promoCode: string | null;
  creditId: string | null;
  orderType: OrderType;
  orderNotes: string | null;
  taxRate: number;
};

type LegacyPendingCartSnapshotInput = {
  userId: string;
  currency: string | null;
  orderType: OrderType;
  orderNotes: string | null;
  items: Json;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  totalCents: number;
  promoId: string | null;
  creditId: string | null;
};

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_PROMO_TYPES = new Set(['percent', 'fixed']);
const SUPPORTED_CURRENCIES = new Set(['usd']);
const STRIPE_MIN_CHARGEABLE_TOTAL_CENTS_USD = 50;

// Keep literal for strict validation + forward migration control
const PRICING_VERSION: PricingSnapshot['version'] = '2026-03-06';

export class PricingValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'PricingValidationError';
    this.code = code;
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Narrowing + primitives
// ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;
type JsonObject = { [key: string]: Json | undefined };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonObject(value: Json): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function normalizeCents(value: unknown): number {
  return Math.max(0, clampInt(asNumber(value, 0), 0, 50_000_000));
}

function normalizeSignedCents(value: unknown): number {
  return clampInt(asNumber(value, 0), -50_000_000, 50_000_000);
}

export function dollarsToCents(value: unknown): number {
  const amount = asNumber(value, 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.max(0, clampInt(Math.round(amount * 100), 0, 50_000_000));
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseIsoMs(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMenuCategory(value: string | null): value is MenuCategory {
  return (
    value === 'appetizers' ||
    value === 'entrees' ||
    value === 'desserts' ||
    value === 'drinks' ||
    value === 'lunch' ||
    value === 'breakfast' ||
    value === 'specials'
  );
}

function sanitizeOrderType(value: string | null): OrderType | null {
  if (value === 'pickup' || value === 'delivery' || value === 'dine_in') return value;
  return null;
}

function stableSortStrings(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function normalizeCurrency(value: unknown): PricingSnapshot['currency'] {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : 'usd';
  return SUPPORTED_CURRENCIES.has(candidate) ? 'usd' : 'usd';
}

// ─────────────────────────────────────────────────────────────────────────────
// Json decoding helpers
// ─────────────────────────────────────────────────────────────────────────────

type DecodeIssue = {
  path: string;
  message: string;
};

type DecodeResult<T> =
  | { ok: true; value: T; issues: DecodeIssue[] }
  | { ok: false; value: null; issues: DecodeIssue[] };

function issue(path: string, message: string): DecodeIssue {
  return { path, message };
}

function getJsonString(obj: JsonObject, key: string): string | null {
  const v = obj[key];
  return typeof v === 'string' ? v : null;
}

function getJsonNumber(obj: JsonObject, key: string): number | null {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function getJsonArray(obj: JsonObject, key: string): Json[] | null {
  const v = obj[key];
  return Array.isArray(v) ? v : null;
}

function _getJsonObject(obj: JsonObject, key: string): JsonObject | null {
  const v = obj[key];
  return v !== undefined && v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as JsonObject)
    : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Money helpers
// ─────────────────────────────────────────────────────────────────────────────

function assertCentsInvariant(label: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new PricingValidationError(
      'INVALID_MONEY_VALUE',
      `${label} is invalid.`,
      503,
    );
  }
}

function ensureMinimumStripeChargeableTotal(currency: string, totalCents: number): void {
  if (normalizeCurrency(currency) === 'usd' && totalCents < STRIPE_MIN_CHARGEABLE_TOTAL_CENTS_USD) {
    throw new PricingValidationError(
      'CREDIT_MINIMUM_ORDER_TOTAL',
      'Order total must be at least $0.50 USD after discounts and credits.',
      422,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier pricing + hashing (integrity tag; NOT security)
// ─────────────────────────────────────────────────────────────────────────────

function modifierUnitPriceCents(item: CanonicalCartItem): number {
  return item.modifiers.reduce(
    (sum, modifier) => sum + normalizeSignedCents(modifier.priceAdjustmentCents),
    0,
  );
}

function modifierLineSubtotalCents(item: CanonicalCartItem): number {
  return modifierUnitPriceCents(item) * item.quantity;
}

function baseLineSubtotalCents(item: CanonicalCartItem): number {
  return normalizeCents(item.baseUnitPriceCents) * item.quantity;
}

function canonicalizeModifierHash(modifiers: CanonicalModifier[]): string {
  return [...modifiers]
    .sort((left, right) => {
      if (left.groupId !== right.groupId) return left.groupId.localeCompare(right.groupId);
      if (left.id !== right.id) return left.id.localeCompare(right.id);
      return left.priceAdjustmentCents - right.priceAdjustmentCents;
    })
    .map((modifier) => `${modifier.groupId}:${modifier.id}:${modifier.priceAdjustmentCents}`)
    .join('|');
}

export function buildClientIntegrityHash(
  menuItemId: string,
  baseUnitPriceCents: number,
  modifiers: CanonicalModifier[],
  quantity: number,
): string {
  const payload = [
    menuItemId.trim(),
    String(normalizeCents(baseUnitPriceCents)),
    String(clampInt(quantity, 1, 99)),
    canonicalizeModifierHash(modifiers),
  ].join('|');

  let hash = 0x811c9dc5;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign evaluation
// ─────────────────────────────────────────────────────────────────────────────

function isCampaignActiveNow(campaign: PricingCampaign, nowMs: number): boolean {
  const startsAt = parseIsoMs(campaign.startsAt);
  const endsAt = parseIsoMs(campaign.endsAt);

  if (startsAt !== null && startsAt > nowMs) return false;
  if (endsAt !== null && endsAt <= nowMs) return false;
  return true;
}

function computeCampaignDiscount(item: CanonicalCartItem, campaign: PricingCampaign): number {
  const baseSubtotal = baseLineSubtotalCents(item);
  if (baseSubtotal <= 0) return 0;

  if (campaign.dealType === 'fixed_price') {
    const fixedPrice =
      campaign.dealPriceCents === null ? null : normalizeCents(campaign.dealPriceCents);
    if (fixedPrice === null) return 0;
    const desiredSubtotal = fixedPrice * item.quantity;
    return Math.max(0, Math.min(baseSubtotal, baseSubtotal - desiredSubtotal));
  }

  if (campaign.dealType === 'percent_off') {
    const percent =
      campaign.discountPercent === null ? null : clampInt(campaign.discountPercent, 0, 100);
    if (percent === null || percent <= 0) return 0;
    return Math.max(0, Math.min(baseSubtotal, Math.round(baseSubtotal * (percent / 100))));
  }

  if (campaign.dealType === 'amount_off') {
    const discount =
      campaign.discountCents === null ? null : normalizeCents(campaign.discountCents);
    if (discount === null || discount <= 0) return 0;
    return Math.max(0, Math.min(baseSubtotal, discount * item.quantity));
  }

  if (campaign.dealType === 'bogo') {
    const freeUnits = Math.floor(item.quantity / 2);
    return Math.max(0, Math.min(baseSubtotal, freeUnits * normalizeCents(item.baseUnitPriceCents)));
  }

  return 0;
}

function chooseBestCampaign(
  item: CanonicalCartItem,
  campaigns: PricingCampaign[],
  orderType: OrderType,
  nowMs: number,
): PricingCampaign | null {
  let best: PricingCampaign | null = null;
  let bestBenefit = 0;

  for (const campaign of campaigns) {
    if (!campaign.menuItemId && !campaign.appliesToCategory) continue;
    if (!isCampaignActiveNow(campaign, nowMs)) continue;
    if (campaign.appliesToOrderType !== null && campaign.appliesToOrderType !== orderType) continue;
    if (campaign.menuItemId !== null && campaign.menuItemId !== item.menuItemId) continue;
    if (campaign.appliesToCategory !== null && campaign.appliesToCategory !== item.category) continue;

    const benefit = computeCampaignDiscount(item, campaign);
    if (benefit <= 0) continue;

    if (best === null) {
      best = campaign;
      bestBenefit = benefit;
      continue;
    }

    if (benefit > bestBenefit) {
      best = campaign;
      bestBenefit = benefit;
      continue;
    }

    if (benefit === bestBenefit) {
      if (campaign.pricingPriority > best.pricingPriority) {
        best = campaign;
        bestBenefit = benefit;
        continue;
      }
      if (campaign.pricingPriority === best.pricingPriority && campaign.priority > best.priority) {
        best = campaign;
        bestBenefit = benefit;
        continue;
      }
      if (
        campaign.pricingPriority === best.pricingPriority &&
        campaign.priority === best.priority &&
        campaign.weight > best.weight
      ) {
        best = campaign;
        bestBenefit = benefit;
      }
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Allocation helpers
// ─────────────────────────────────────────────────────────────────────────────

function allocateCents(total: number, weights: number[]): number[] {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);

  const safeWeights = weights.map((weight) => Math.max(0, weight));
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    const baseShare = Math.floor(total / weights.length);
    const remainder = total - baseShare * weights.length;
    return safeWeights.map((_, index) => baseShare + (index < remainder ? 1 : 0));
  }

  const provisional = safeWeights.map((weight) => (total * weight) / weightSum);
  const floored = provisional.map((value) => Math.floor(value));
  let remainder = total - floored.reduce((sum, value) => sum + value, 0);

  const ranked = provisional
    .map((value, index) => ({
      index,
      fraction: value - Math.floor(value),
      weight: safeWeights[index],
    }))
    .sort((left, right) => {
      if (right.fraction !== left.fraction) return right.fraction - left.fraction;
      if (right.weight !== left.weight) return right.weight - left.weight;
      return left.index - right.index;
    });

  const out = [...floored];
  let cursor = 0;
  while (remainder > 0 && ranked.length > 0) {
    out[ranked[cursor % ranked.length].index] += 1;
    remainder -= 1;
    cursor += 1;
  }

  return out;
}

function splitAcrossUnits(totalCents: number, quantity: number): number[] {
  const qty = clampInt(quantity, 1, 99);
  const safeTotal = Math.max(0, totalCents);
  const base = Math.floor(safeTotal / qty);
  const remainder = safeTotal - base * qty;
  return Array.from({ length: qty }, (_, index) => base + (index < remainder ? 1 : 0));
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe helpers
// ─────────────────────────────────────────────────────────────────────────────

function compactStripeLineItems(
  rawItems: Array<{
    key: string;
    quantity: number;
    item: StripeLineItem;
  }>,
): StripeLineItem[] {
  const grouped = new Map<string, StripeLineItem>();

  for (const raw of rawItems) {
    const existing = grouped.get(raw.key);
    if (!existing) {
      grouped.set(raw.key, raw.item);
      continue;
    }

    const existingQty = typeof existing.quantity === 'number' ? existing.quantity : 0;
    const incomingQty = typeof raw.item.quantity === 'number' ? raw.item.quantity : 0;
    existing.quantity = existingQty + incomingQty;
  }

  return [...grouped.values()];
}

function buildStripeDescription(line: PricingSnapshotLine): string | undefined {
  const parts: string[] = [];

  if (line.modifiers.length > 0) {
    const modifierNames = line.modifiers
      .map((modifier) => modifier.name.trim())
      .filter((name) => name.length > 0);

    if (modifierNames.length > 0) {
      parts.push(`Modifiers: ${modifierNames.join(', ')}`);
    }
  }

  if (line.campaignName) {
    parts.push(`Deal: ${line.campaignName}`);
  }

  return parts.length > 0 ? parts.join(' • ') : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Row parsers (DB → typed records)
// ─────────────────────────────────────────────────────────────────────────────

function parseCampaignRow(value: unknown): PricingCampaign | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const dealTypeRaw = asString(value.deal_type);
  const orderTypeRaw = asNullableString(value.applies_to_order_type);
  const categoryRaw = asNullableString(value.applies_to_category);

  if (!id || !dealTypeRaw) return null;
  if (
    dealTypeRaw !== 'fixed_price' &&
    dealTypeRaw !== 'percent_off' &&
    dealTypeRaw !== 'amount_off' &&
    dealTypeRaw !== 'bogo'
  ) {
    return null;
  }

  const appliesToOrderType = sanitizeOrderType(orderTypeRaw);
  const appliesToCategory = categoryRaw && isMenuCategory(categoryRaw) ? categoryRaw : null;

  return {
    id,
    campaignName: asNullableString(value.campaign_name),
    menuItemId: asNullableString(value.menu_item_id),
    appliesToCategory,
    appliesToOrderType,
    dealType: dealTypeRaw,
    dealPriceCents:
      value.deal_price_cents === null || value.deal_price_cents === undefined
        ? null
        : normalizeCents(value.deal_price_cents),
    discountPercent:
      value.discount_percent === null || value.discount_percent === undefined
        ? null
        : clampInt(asNumber(value.discount_percent, 0), 0, 100),
    discountCents:
      value.discount_cents === null || value.discount_cents === undefined
        ? null
        : normalizeCents(value.discount_cents),
    stackable: asBoolean(value.stackable, false),
    priority: clampInt(asNumber(value.priority, 0), -10_000, 10_000),
    pricingPriority: clampInt(asNumber(value.pricing_priority, 0), -10_000, 10_000),
    weight: clampInt(asNumber(value.weight, 0), -10_000, 10_000),
    startsAt: asNullableString(value.starts_at),
    endsAt: asNullableString(value.ends_at),
  };
}

function parsePromotionRow(value: unknown): PromotionRecord | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const code = asString(value.code);
  const type = asString(value.type);

  if (!id || !code || !type) return null;

  return {
    id,
    code,
    campaignId: asNullableString(value.campaign_id),
    channel: asNullableString(value.channel),
    type,
    value: asNumber(value.value, 0),
    minOrderCents: normalizeCents(value.min_order_cents),
    maxUses:
      value.max_uses === null || value.max_uses === undefined
        ? null
        : clampInt(asNumber(value.max_uses, 0), 0, 10_000_000),
    currentUses: clampInt(asNumber(value.current_uses, 0), 0, 10_000_000),
    perUserLimit: clampInt(asNumber(value.per_user_limit, 0), 0, 10_000_000),
    active: asBoolean(value.active, false),
    startsAt: asNullableString(value.starts_at),
    endsAt: asNullableString(value.ends_at),
    expiresAt: asNullableString(value.expires_at),
  };
}

function parseCreditRow(value: unknown): CreditRecord | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id);
  const userId = asString(value.user_id);
  if (!id || !userId) return null;

  return {
    id,
    userId,
    amountCents: normalizeCents(value.amount_cents),
    used: asBoolean(value.used, false),
    expiresAt: asNullableString(value.expires_at),
    checkoutSessionId: asNullableString(value.checkout_session_id),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crypto
// ─────────────────────────────────────────────────────────────────────────────

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Loads (campaigns/promos/credits)
// ─────────────────────────────────────────────────────────────────────────────

async function loadActiveCampaigns(svc: DbClient): Promise<PricingCampaign[]> {
  const { data, error } = await svc
    .from('growth_campaigns')
    .select(
      'id,campaign_name,menu_item_id,priority,weight,starts_at,ends_at,deal_type,deal_price_cents,discount_percent,discount_cents,applies_to_category,applies_to_order_type,auto_apply,stackable,pricing_priority,active',
    )
    .eq('active', true)
    .eq('auto_apply', true)
    .order('pricing_priority', { ascending: false })
    .order('priority', { ascending: false })
    .order('weight', { ascending: false });

  if (error) {
    throw new PricingValidationError(
      'PRICING_LOOKUP_FAILED',
      'Unable to load pricing campaigns.',
      503,
    );
  }

  const rawData: unknown = data;
  if (!Array.isArray(rawData)) return [];

  const campaigns: PricingCampaign[] = [];
  for (const entry of rawData) {
    const parsed = parseCampaignRow(entry);
    if (parsed) campaigns.push(parsed);
  }

  return campaigns;
}

async function loadPromotion(
  svc: DbClient,
  userId: string,
  promoId: string | null,
  promoCode: string | null,
): Promise<PromotionRecord | null> {
  const requestedPromoId = promoId?.trim() ?? '';
  const requestedPromoCode = promoCode?.trim().toUpperCase() ?? '';

  if (!requestedPromoId && !requestedPromoCode) return null;

  const query = svc
    .from('promotions')
    .select(
      'id,code,campaign_id,channel,type,value,min_order_cents,max_uses,current_uses,per_user_limit,active,starts_at,ends_at,expires_at',
    );

  const { data, error } = requestedPromoId
    ? await query.eq('id', requestedPromoId).maybeSingle()
    : await query.ilike('code', requestedPromoCode).maybeSingle();

  if (error || !data) {
    throw new PricingValidationError('PROMO_INVALID', 'Promotion code is invalid.');
  }

  const promo = parsePromotionRow(data);
  if (!promo) {
    throw new PricingValidationError('PROMO_INVALID', 'Promotion code is invalid.');
  }

  const nowMs = Date.now();
  const startsAt = parseIsoMs(promo.startsAt);
  const endsAt = parseIsoMs(promo.endsAt);
  const expiresAt = parseIsoMs(promo.expiresAt);

  if (!promo.active) throw new PricingValidationError('PROMO_INACTIVE', 'Promotion is not active.');
  if (startsAt !== null && startsAt > nowMs) {
    throw new PricingValidationError('PROMO_INACTIVE', 'Promotion is not active yet.');
  }
  if ((expiresAt !== null && expiresAt < nowMs) || (endsAt !== null && endsAt < nowMs)) {
    throw new PricingValidationError('PROMO_EXPIRED', 'Promotion has expired.');
  }
  if (promo.maxUses !== null && promo.currentUses >= promo.maxUses) {
    throw new PricingValidationError('PROMO_EXHAUSTED', 'Promotion has reached its usage limit.');
  }
  if (!SUPPORTED_PROMO_TYPES.has(promo.type)) {
    throw new PricingValidationError('PROMO_INVALID', 'Promotion type is not supported.');
  }

  if (promo.perUserLimit > 0) {
    const { count, error: countError } = await svc
      .from('promo_redemptions')
      .select('id', { head: true, count: 'exact' })
      .eq('promotion_id', promo.id)
      .eq('user_id', userId);

    if (countError) {
      throw new PricingValidationError(
        'PROMO_LOOKUP_FAILED',
        'Unable to validate promotion.',
        503,
      );
    }

    const usedCount = typeof count === 'number' ? count : 0;
    if (usedCount >= promo.perUserLimit) {
      throw new PricingValidationError(
        'PROMO_LIMIT_REACHED',
        'Promotion usage limit reached for this user.',
      );
    }
  }

  return promo;
}

async function loadCredit(
  svc: DbClient,
  userId: string,
  creditId: string | null,
): Promise<CreditRecord | null> {
  const requestedCreditId = creditId?.trim() ?? '';
  if (!requestedCreditId) return null;

  const { data, error } = await svc
    .from('user_credits')
    .select('id,user_id,amount_cents,used,expires_at,checkout_session_id')
    .eq('id', requestedCreditId)
    .maybeSingle();

  if (error || !data) {
    throw new PricingValidationError('CREDIT_INVALID', 'Credit is invalid.');
  }

  const credit = parseCreditRow(data);
  if (!credit || credit.userId !== userId) {
    throw new PricingValidationError('CREDIT_INVALID', 'Credit is invalid.');
  }
  if (credit.used) {
    throw new PricingValidationError('CREDIT_USED', 'Credit has already been used.');
  }

  const expiresAt = parseIsoMs(credit.expiresAt);
  if (expiresAt !== null && expiresAt < Date.now()) {
    throw new PricingValidationError('CREDIT_EXPIRED', 'Credit has expired.');
  }

  return credit;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main resolver (authoritative pricing)
// ─────────────────────────────────────────────────────────────────────────────

export async function resolvePricingForCheckout(
  input: ResolvePricingInput,
): Promise<PricingResolution> {
  if (input.items.length === 0) {
    throw new PricingValidationError('EMPTY_CART', 'Cart is empty.');
  }

  for (const item of input.items) {
    if (item.quantity < 1) {
      throw new PricingValidationError('INVALID_CART_ITEM', 'Cart contains an invalid quantity.');
    }
    assertCentsInvariant('Base unit price', normalizeCents(item.baseUnitPriceCents));
  }

  const campaigns = await loadActiveCampaigns(input.svc);
  const nowMs = Date.now();

  const draftLines = input.items.map((item, index: number) => {
    const modifierSubtotal = modifierLineSubtotalCents(item);
    const baseSubtotal = baseLineSubtotalCents(item);
    const chosenCampaign = chooseBestCampaign(item, campaigns, input.orderType, nowMs);
    const campaignDiscount = chosenCampaign ? computeCampaignDiscount(item, chosenCampaign) : 0;
    const pretaxBeforePromo = Math.max(0, baseSubtotal - campaignDiscount + modifierSubtotal);

    return {
      index,
      item,
      chosenCampaign,
      modifierUnitPriceCents: modifierUnitPriceCents(item),
      baseSubtotal,
      modifierSubtotal,
      campaignDiscount,
      pretaxBeforePromo,
    };
  });

  const subtotalCents = draftLines.reduce(
    (sum, line) => sum + line.baseSubtotal + line.modifierSubtotal,
    0,
  );
  const campaignDiscountCents = draftLines.reduce((sum, line) => sum + line.campaignDiscount, 0);

  const promotion = await loadPromotion(input.svc, input.userId, input.promoId, input.promoCode);
  if (promotion && subtotalCents < promotion.minOrderCents) {
    throw new PricingValidationError(
      'PROMO_MIN_ORDER',
      'Cart does not meet the promotion minimum.',
    );
  }

  const eligiblePromoLines = draftLines.filter((line) => {
    if (line.pretaxBeforePromo <= 0) return false;
    if (line.chosenCampaign && line.chosenCampaign.stackable === false) return false;
    if (promotion?.campaignId && line.chosenCampaign?.id !== promotion.campaignId) return false;
    return true;
  });

  if (promotion?.campaignId && eligiblePromoLines.length === 0) {
    throw new PricingValidationError(
      'PROMO_NOT_APPLICABLE',
      'Promotion does not apply to the current cart.',
    );
  }

  const eligiblePromoSubtotal = eligiblePromoLines.reduce(
    (sum, line) => sum + line.pretaxBeforePromo,
    0,
  );

  let promoDiscountCents = 0;
  if (promotion !== null) {
    if (promotion.type === 'percent') {
      const percent = Math.max(0, Math.min(100, promotion.value));
      promoDiscountCents = Math.round(eligiblePromoSubtotal * (percent / 100));
    } else if (promotion.type === 'fixed') {
      promoDiscountCents = normalizeCents(promotion.value);
    }
    promoDiscountCents = Math.max(0, Math.min(eligiblePromoSubtotal, promoDiscountCents));
  }

  const promoSharesByIndex = new Map<number, number>();
  if (promoDiscountCents > 0 && eligiblePromoLines.length > 0) {
    const shares = allocateCents(
      promoDiscountCents,
      eligiblePromoLines.map((line) => line.pretaxBeforePromo),
    );
    eligiblePromoLines.forEach((line, idx) => {
      promoSharesByIndex.set(line.index, shares[idx] ?? 0);
    });
  }

  const pretaxAfterPromo = draftLines.reduce((sum, line) => {
    const promoShare = promoSharesByIndex.get(line.index) ?? 0;
    return sum + Math.max(0, line.pretaxBeforePromo - promoShare);
  }, 0);

  const credit = await loadCredit(input.svc, input.userId, input.creditId);
  let creditCents = 0;
  if (credit !== null) {
    creditCents = Math.max(0, Math.min(pretaxAfterPromo, credit.amountCents));
  }

  const creditShares = allocateCents(
    creditCents,
    draftLines.map((line) => {
      const promoShare = promoSharesByIndex.get(line.index) ?? 0;
      return Math.max(0, line.pretaxBeforePromo - promoShare);
    }),
  );

  const pretaxAfterCredit = draftLines.reduce((sum, line, idx) => {
    const promoShare = promoSharesByIndex.get(line.index) ?? 0;
    const creditShare = creditShares[idx] ?? 0;
    return sum + Math.max(0, line.pretaxBeforePromo - promoShare - creditShare);
  }, 0);

  const effectiveTaxRate = Number.isFinite(input.taxRate) && input.taxRate >= 0 ? input.taxRate : 0;
  const taxCents = Math.max(0, Math.round(pretaxAfterCredit * effectiveTaxRate));
  const totalCents = pretaxAfterCredit + taxCents;

  if (totalCents <= 0) {
    throw new PricingValidationError(
      'NO_CHARGEABLE_AMOUNT',
      'Cart total must be greater than zero.',
    );
  }

  ensureMinimumStripeChargeableTotal('usd', totalCents);

  const lines: PricingSnapshotLine[] = draftLines.map((line, idx: number) => {
    const promoDiscount = promoSharesByIndex.get(line.index) ?? 0;
    const creditDiscount = creditShares[idx] ?? 0;
    const finalPretaxLineTotalCents = Math.max(
      0,
      line.pretaxBeforePromo - promoDiscount - creditDiscount,
    );

    return {
      lineId: `${line.item.menuItemId}:${idx}`,
      menuItemId: line.item.menuItemId,
      name: line.item.name,
      imageUrl: line.item.imageUrl,
      category: line.item.category,
      quantity: line.item.quantity,
      notes: line.item.notes,
      modifiers: line.item.modifiers.map((modifier) => ({
        id: modifier.id,
        groupId: modifier.groupId,
        name: modifier.name,
        priceAdjustmentCents: normalizeSignedCents(modifier.priceAdjustmentCents),
      })),
      baseUnitPriceCents: normalizeCents(line.item.baseUnitPriceCents),
      modifierUnitPriceCents: normalizeSignedCents(line.modifierUnitPriceCents),
      baseLineSubtotalCents: line.baseSubtotal,
      modifierLineSubtotalCents: line.modifierSubtotal,
      campaignId: line.chosenCampaign?.id ?? null,
      campaignName: line.chosenCampaign?.campaignName ?? null,
      campaignDealType: line.chosenCampaign?.dealType ?? null,
      campaignStackable: line.chosenCampaign?.stackable ?? false,
      campaignDiscountCents: line.campaignDiscount,
      promoEligible: eligiblePromoLines.some((eligibleLine) => eligibleLine.index === line.index),
      promoDiscountCents: promoDiscount,
      creditDiscountCents: creditDiscount,
      finalPretaxLineTotalCents,
      unitAmountsCents: splitAcrossUnits(finalPretaxLineTotalCents, line.item.quantity),
      basePricingHash: line.item.basePricingHash,
    };
  });

  const appliedCampaignIds = stableSortStrings(
    lines
      .map((line) => line.campaignId)
      .filter((value): value is string => typeof value === 'string' && value.length > 0),
  );

  const snapshot: PricingSnapshot = {
    version: PRICING_VERSION,
    currency: 'usd',
    orderType: input.orderType,
    orderNotes: input.orderNotes,
    userId: input.userId,
    createdAt: nowIso(),
    lines,
    subtotalCents,
    campaignDiscountCents,
    promoId: promotion?.id ?? null,
    promoCode: promotion?.code ?? null,
    promoDiscountCents,
    creditId: credit?.id ?? null,
    creditCents,
    taxCents,
    totalCents,
    appliedCampaignIds,
  };

  const pricingHash = await hashPricingSnapshot(snapshot);
  if (!pricingHash || pricingHash.length < 16) {
    throw new PricingValidationError(
      'MISSING_PRICING_HASH',
      'Pricing hash generation failed.',
      503,
    );
  }

  return { snapshot, pricingHash };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stable canonical hash
// ─────────────────────────────────────────────────────────────────────────────

export async function hashPricingSnapshot(snapshot: PricingSnapshot): Promise<string> {
  const canonical: PricingSnapshot = {
    ...snapshot,
    appliedCampaignIds: stableSortStrings(snapshot.appliedCampaignIds),
    lines: [...snapshot.lines]
      .map((line) => ({
        ...line,
        modifiers: [...line.modifiers].sort((a, b) => {
          if (a.groupId !== b.groupId) return a.groupId.localeCompare(b.groupId);
          if (a.id !== b.id) return a.id.localeCompare(b.id);
          return a.priceAdjustmentCents - b.priceAdjustmentCents;
        }),
      }))
      .sort((a, b) => a.lineId.localeCompare(b.lineId)),
  };

  const stable = JSON.stringify(canonical);
  const digest = await sha256Hex(stable);
  return digest.slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot parsing (strict validation)
// ─────────────────────────────────────────────────────────────────────────────

export function parsePricingSnapshot(value: unknown): PricingSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.version !== PRICING_VERSION) return null;
  if (value.currency !== 'usd') return null;

  const orderType = sanitizeOrderType(asNullableString(value.orderType));
  const userId = asString(value.userId);
  const createdAt = asString(value.createdAt);

  if (!orderType || !userId || !createdAt) return null;

  const linesUnknown = value.lines;
  if (!Array.isArray(linesUnknown)) return null;

  const lines: PricingSnapshotLine[] = [];
  for (const rawLine of linesUnknown) {
    if (!isRecord(rawLine)) return null;

    const menuItemId = asString(rawLine.menuItemId);
    const name = asString(rawLine.name);
    const categoryRaw = asNullableString(rawLine.category);
    const quantity = clampInt(asNumber(rawLine.quantity, 0), 1, 99);
    const lineId = asString(rawLine.lineId);

    if (!menuItemId || !name || !lineId || !categoryRaw || !isMenuCategory(categoryRaw)) {
      return null;
    }

    const modifiersUnknown = rawLine.modifiers;
    if (!Array.isArray(modifiersUnknown)) return null;

    const modifiers: PricingSnapshotLine['modifiers'] = [];
    for (const rawModifier of modifiersUnknown) {
      if (!isRecord(rawModifier)) return null;

      const modifierId = asString(rawModifier.id);
      const groupId = asString(rawModifier.groupId);
      const modifierName = asString(rawModifier.name);

      if (!modifierId || !groupId || !modifierName) return null;

      modifiers.push({
        id: modifierId,
        groupId,
        name: modifierName,
        priceAdjustmentCents: normalizeSignedCents(rawModifier.priceAdjustmentCents),
      });
    }

    const unitAmountsUnknown = rawLine.unitAmountsCents;
    if (!Array.isArray(unitAmountsUnknown)) return null;

    const unitAmountsCents = unitAmountsUnknown.map((entry) => normalizeCents(entry));
    if (unitAmountsCents.length !== quantity) return null;

    lines.push({
      lineId,
      menuItemId,
      name,
      imageUrl: asNullableString(rawLine.imageUrl),
      category: categoryRaw,
      quantity,
      notes: asNullableString(rawLine.notes),
      modifiers,
      baseUnitPriceCents: normalizeCents(rawLine.baseUnitPriceCents),
      modifierUnitPriceCents: normalizeSignedCents(rawLine.modifierUnitPriceCents),
      baseLineSubtotalCents: normalizeCents(rawLine.baseLineSubtotalCents),
      modifierLineSubtotalCents: normalizeCents(rawLine.modifierLineSubtotalCents),
      campaignId: asNullableString(rawLine.campaignId),
      campaignName: asNullableString(rawLine.campaignName),
      campaignDealType: asNullableString(rawLine.campaignDealType),
      campaignStackable: asBoolean(rawLine.campaignStackable, false),
      campaignDiscountCents: normalizeCents(rawLine.campaignDiscountCents),
      promoEligible: asBoolean(rawLine.promoEligible, false),
      promoDiscountCents: normalizeCents(rawLine.promoDiscountCents),
      creditDiscountCents: normalizeCents(rawLine.creditDiscountCents),
      finalPretaxLineTotalCents: normalizeCents(rawLine.finalPretaxLineTotalCents),
      unitAmountsCents,
      basePricingHash: asString(rawLine.basePricingHash) ?? '',
    });
  }

  return {
    version: PRICING_VERSION,
    currency: 'usd',
    orderType,
    orderNotes: asNullableString(value.orderNotes),
    userId,
    createdAt,
    lines,
    subtotalCents: normalizeCents(value.subtotalCents),
    campaignDiscountCents: normalizeCents(value.campaignDiscountCents),
    promoId: asNullableString(value.promoId),
    promoCode: asNullableString(value.promoCode),
    promoDiscountCents: normalizeCents(value.promoDiscountCents),
    creditId: asNullableString(value.creditId),
    creditCents: normalizeCents(value.creditCents),
    taxCents: normalizeCents(value.taxCents),
    totalCents: normalizeCents(value.totalCents),
    appliedCampaignIds: Array.isArray(value.appliedCampaignIds)
      ? value.appliedCampaignIds
          .map((entry) => asString(entry))
          .filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
      : [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy cart decoder
// ─────────────────────────────────────────────────────────────────────────────

function decodeLegacyCartLines(inputItems: Json): DecodeResult<PricingSnapshotLine[]> {
  const issues: DecodeIssue[] = [];
  const itemsArray: Json[] = Array.isArray(inputItems) ? inputItems : [];

  const lines: PricingSnapshotLine[] = [];

  for (let index = 0; index < itemsArray.length; index += 1) {
    const rawItem = itemsArray[index];
    const pathBase = `items[${index}]`;

    if (!rawItem || !isJsonObject(rawItem)) {
      issues.push(issue(pathBase, 'Item is not an object; skipped.'));
      continue;
    }

    const itemObj = rawItem;

    const quantity = clampInt(
      getJsonNumber(itemObj, 'quantity') ?? getJsonNumber(itemObj, 'qty') ?? 1,
      1,
      99,
    );

    const menuItemId =
      getJsonString(itemObj, 'menuItemId') ??
      getJsonString(itemObj, 'menu_item_id') ??
      `legacy-${index}`;

    const name = getJsonString(itemObj, 'name') ?? `Item ${index + 1}`;

    const categoryRaw = getJsonString(itemObj, 'category');
    const category: MenuCategory =
      categoryRaw && isMenuCategory(categoryRaw) ? categoryRaw : 'specials';

    const imageUrl =
      getJsonString(itemObj, 'imageUrl') ?? getJsonString(itemObj, 'image_url') ?? null;

    const notes = getJsonString(itemObj, 'notes');

    const baseUnit = normalizeCents(
      getJsonNumber(itemObj, 'unitPriceCents') ?? getJsonNumber(itemObj, 'unit_price_cents') ?? 0,
    );

    const lineTotal = normalizeCents(
      getJsonNumber(itemObj, 'lineTotalCents') ??
        getJsonNumber(itemObj, 'line_total_cents') ??
        baseUnit * quantity,
    );

    const modifiersArray = getJsonArray(itemObj, 'modifiers') ?? [];

    const modifiers: PricingSnapshotLine['modifiers'] = [];

    for (let mIndex = 0; mIndex < modifiersArray.length; mIndex += 1) {
      const rawMod = modifiersArray[mIndex];
      const mPath = `${pathBase}.modifiers[${mIndex}]`;

      if (!rawMod || !isJsonObject(rawMod)) {
        issues.push(issue(mPath, 'Modifier is not an object; skipped.'));
        continue;
      }

      const modObj = rawMod;

      const id = getJsonString(modObj, 'id') ?? `${menuItemId}-modifier-${mIndex}`;

      const groupId =
        getJsonString(modObj, 'groupId') ??
        getJsonString(modObj, 'group_id') ??
        getJsonString(modObj, 'modifier_group_id') ??
        'legacy';

      const modName = getJsonString(modObj, 'name') ?? 'Modifier';

      const priceAdj = normalizeSignedCents(
        getJsonNumber(modObj, 'priceAdjustmentCents') ??
          getJsonNumber(modObj, 'priceAdjustment') ??
          getJsonNumber(modObj, 'price_adjustment') ??
          0,
      );

      modifiers.push({
        id,
        groupId,
        name: modName,
        priceAdjustmentCents: priceAdj,
      });
    }

    const modifierUnit = modifiers.reduce((sum, modifier) => sum + modifier.priceAdjustmentCents, 0);

    lines.push({
      lineId: `${menuItemId}:${index}`,
      menuItemId,
      name,
      imageUrl,
      category,
      quantity,
      notes,
      modifiers,
      baseUnitPriceCents: baseUnit,
      modifierUnitPriceCents: modifierUnit,
      baseLineSubtotalCents: Math.max(0, baseUnit * quantity),
      modifierLineSubtotalCents: Math.max(0, modifierUnit * quantity),
      campaignId: null,
      campaignName: null,
      campaignDealType: null,
      campaignStackable: false,
      campaignDiscountCents: 0,
      promoEligible: false,
      promoDiscountCents: 0,
      creditDiscountCents: 0,
      finalPretaxLineTotalCents: lineTotal,
      unitAmountsCents: splitAcrossUnits(lineTotal, quantity),
      basePricingHash: buildClientIntegrityHash(menuItemId, baseUnit, modifiers, quantity),
    });
  }

  return { ok: true, value: lines, issues };
}

export function buildLegacyPricingSnapshotFromPendingCart(
  input: LegacyPendingCartSnapshotInput,
): PricingSnapshot {
  const currency = normalizeCurrency(input.currency);

  const decoded = decodeLegacyCartLines(input.items);
  const lines = decoded.ok ? decoded.value : [];

  if (lines.length === 0 && normalizeCents(input.totalCents) > 0) {
    throw new PricingValidationError(
      'LEGACY_CART_INVALID',
      'Legacy cart data is invalid; cannot build pricing snapshot.',
      503,
    );
  }

  const snapshot: PricingSnapshot = {
    version: PRICING_VERSION,
    currency,
    orderType: input.orderType,
    orderNotes: input.orderNotes,
    userId: input.userId,
    createdAt: nowIso(),
    lines,
    subtotalCents: normalizeCents(input.subtotalCents),
    campaignDiscountCents: 0,
    promoId: input.promoId,
    promoCode: null,
    promoDiscountCents: normalizeCents(input.discountCents),
    creditId: input.creditId,
    creditCents: 0,
    taxCents: normalizeCents(input.taxCents),
    totalCents: normalizeCents(input.totalCents),
    appliedCampaignIds: [],
  };

  if (snapshot.totalCents > 0) {
    ensureMinimumStripeChargeableTotal(snapshot.currency, snapshot.totalCents);
  }

  return snapshot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe line items from pricing snapshot
// ─────────────────────────────────────────────────────────────────────────────

export function buildStripeLineItemsFromPricing(
  snapshot: PricingSnapshot,
): StripeLineItem[] {
  const rawItems: Array<{
    key: string;
    quantity: number;
    item: StripeLineItem;
  }> = [];

  for (const line of snapshot.lines) {
    const description = buildStripeDescription(line);

    for (const unitAmount of line.unitAmountsCents) {
      if (unitAmount <= 0) continue;

      const metadata: Record<string, string> = {
        menu_item_id: line.menuItemId,
        line_id: line.lineId,
        campaign_id: line.campaignId ?? '',
        pricing_hash_base: line.basePricingHash,
        ...(description ? { description } : {}),
        ...(line.imageUrl ? { image_url: line.imageUrl } : {}),
      };

      const lineItem: StripeLineItem = {
        quantity: 1,
        price_data: {
          currency: snapshot.currency,
          unit_amount: unitAmount,
          product_data: {
            name: line.name,
            metadata,
          },
        },
      };

      const key = [
        line.name,
        description ?? '',
        String(unitAmount),
        line.menuItemId,
        line.campaignId ?? '',
        line.imageUrl ?? '',
      ].join('|');

      rawItems.push({ key, quantity: 1, item: lineItem });
    }
  }

  if (snapshot.taxCents > 0) {
    rawItems.push({
      key: `sales-tax|${snapshot.taxCents}`,
      quantity: 1,
      item: {
        quantity: 1,
        price_data: {
          currency: snapshot.currency,
          unit_amount: snapshot.taxCents,
          product_data: {
            name: 'Sales Tax',
            metadata: { pricing_component: 'tax' },
          },
        },
      },
    });
  }

  const compacted = compactStripeLineItems(rawItems);

  const computedTotal = compacted.reduce((sum, line) => {
    const qty = typeof line.quantity === 'number' ? line.quantity : 0;
    const unitAmount =
      line.price_data && typeof line.price_data.unit_amount === 'number'
        ? line.price_data.unit_amount
        : 0;
    return sum + qty * unitAmount;
  }, 0);

  if (computedTotal !== snapshot.totalCents) {
    throw new PricingValidationError(
      'STRIPE_LINE_ITEMS_MISMATCH',
      'Stripe line items do not match pricing snapshot total.',
      503,
    );
  }

  return compacted;
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot → Json (HARD GUARANTEE: never {} / never undefined)
// ─────────────────────────────────────────────────────────────────────────────

export function pricingSnapshotToJson(snapshot: PricingSnapshot): Json {
  if (!snapshot) {
    throw new PricingValidationError(
      'MISSING_PRICING_SNAPSHOT',
      'Pricing snapshot is missing.',
      503,
    );
  }

  if (
    snapshot.version !== PRICING_VERSION ||
    snapshot.currency !== 'usd' ||
    !snapshot.userId ||
    !snapshot.createdAt ||
    !Array.isArray(snapshot.lines)
  ) {
    throw new PricingValidationError(
      'INVALID_PRICING_SNAPSHOT',
      'Pricing snapshot is invalid.',
      503,
    );
  }

  const stable = JSON.parse(JSON.stringify(snapshot)) as Json;
  if (!stable || !isJsonObject(stable) || Object.keys(stable).length === 0) {
    throw new PricingValidationError(
      'EMPTY_PRICING_SNAPSHOT',
      'Pricing snapshot is empty.',
      503,
    );
  }

  return stable;
}