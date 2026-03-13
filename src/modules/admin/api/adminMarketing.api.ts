import { callAdminGateway, formatAdminGatewayError } from '@/features/admin/api/adminGateway.client';
import type {
  AdminCampaign,
  AdminCampaignStatus,
  AdminMarketingSnapshot,
  AdminPromo,
  AdminPromoStatus,
} from '../types/admin-common.types';

type UnknownRecord = Record<string, unknown>;

export interface AdminCampaignRotationResult {
  rotatedCount: number;
  requestId: string;
  asOf: string;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toNonNegativeInt(value: unknown): number | null {
  const n = asNumber(value);
  if (n === null) {
    return null;
  }

  return Math.max(0, Math.trunc(n));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `admin_marketing_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function parseDateMs(value: unknown): number | null {
  const str = asString(value);
  if (!str) {
    return null;
  }

  const ms = new Date(str).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function withMetadata(base: unknown): UnknownRecord {
  return isRecord(base) ? { ...base } : {};
}

function setIntMeta(meta: UnknownRecord, key: string, value: unknown): void {
  const n = toNonNegativeInt(value);
  if (n !== null) {
    meta[key] = n;
  }
}

function setStringMeta(meta: UnknownRecord, key: string, value: unknown): void {
  const s = asString(value);
  if (s !== null) {
    meta[key] = s;
  }
}

function setBooleanMeta(meta: UnknownRecord, key: string, value: boolean | undefined): void {
  if (typeof value === 'boolean') {
    meta[key] = value;
  }
}

function readFirstNumber(value: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const n = asNumber(value[key]);
    if (n !== null) {
      return n;
    }
  }

  return null;
}

function readFirstString(value: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const s = asString(value[key]);
    if (s !== null) {
      return s;
    }
  }

  return null;
}

function buildPromoStatus(value: UnknownRecord): AdminPromoStatus {
  const explicitStatus = asString(value.status);
  if (
    explicitStatus === 'active' ||
    explicitStatus === 'inactive' ||
    explicitStatus === 'draft' ||
    explicitStatus === 'scheduled' ||
    explicitStatus === 'expired'
  ) {
    return explicitStatus;
  }

  const active = asBoolean(value.active, false);
  if (!active) {
    return 'inactive';
  }

  const now = Date.now();
  const startsMs = parseDateMs(value.startsAt) ?? parseDateMs(value.starts_at);
  const endsMs =
    parseDateMs(value.endsAt) ?? parseDateMs(value.ends_at) ?? parseDateMs(value.expires_at);

  if (startsMs !== null && startsMs > now) {
    return 'scheduled';
  }

  if (endsMs !== null && endsMs < now) {
    return 'expired';
  }

  return 'active';
}

function parseCampaign(value: unknown): AdminCampaign | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const name = asString(value.name) ?? asString(value.title) ?? asString(value.campaign_name);

  if (!id || !name) {
    return null;
  }

  const metadata =
    isRecord(value.metadata) ? value.metadata : isRecord(value.meta) ? value.meta : {};

  return {
    id,
    name,
    placement: asString(value.placement),
    status: (asString(value.status) ?? 'draft') as AdminCampaignStatus,
    priority: Math.trunc(asNumber(value.priority) ?? 0),
    isActive: asBoolean(value.isActive ?? value.is_active ?? value.active, false),
    startAt: asString(value.startAt) ?? asString(value.start_at) ?? asString(value.starts_at),
    endAt: asString(value.endAt) ?? asString(value.end_at) ?? asString(value.ends_at),
    impressions: Math.max(0, Math.trunc(asNumber(value.impressions) ?? 0)),
    clicks: Math.max(0, Math.trunc(asNumber(value.clicks) ?? 0)),
    conversions: Math.max(0, Math.trunc(asNumber(value.conversions) ?? 0)),
    metadata,
  };
}

function parsePromo(value: unknown): AdminPromo | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id);
  const code = asString(value.code);

  if (!id || !code) {
    return null;
  }

  const startsAt = readFirstString(value, ['startsAt', 'starts_at']);
  const endsAt = readFirstString(value, ['endsAt', 'ends_at', 'expires_at']);
  const active = typeof value.active === 'boolean' ? value.active : undefined;

  const metadata: UnknownRecord = {
    ...withMetadata(value.metadata),
    ...withMetadata(value.meta),
  };

  const directCurrentUses = toNonNegativeInt(value.current_uses);
  const directRedemptions = toNonNegativeInt(value.redemptions);
  const aggregateRedemptionCount = toNonNegativeInt(value.redemption_count);

  const reconciledUses = Math.max(
    directCurrentUses ?? 0,
    directRedemptions ?? 0,
    aggregateRedemptionCount ?? 0,
  );

  const totalDiscountCents = toNonNegativeInt(value.total_discount_cents);
  const influencedRevenueCents = toNonNegativeInt(
    readFirstNumber(value, ['revenue_cents', 'influenced_revenue_cents']),
  );
  const channel = asString(value.channel);

  setIntMeta(metadata, 'min_order_cents', value.min_order_cents);
  setIntMeta(metadata, 'max_uses', value.max_uses);
  setIntMeta(metadata, 'per_user_limit', value.per_user_limit);
  setIntMeta(metadata, 'total_discount_cents', value.total_discount_cents);

  metadata.current_uses = reconciledUses;
  metadata.redemption_count = reconciledUses;

  if (influencedRevenueCents !== null) {
    metadata.revenue_cents = influencedRevenueCents;
    metadata.influenced_revenue_cents = influencedRevenueCents;
  } else if (totalDiscountCents !== null) {
    metadata.revenue_cents = totalDiscountCents;
  }

  setStringMeta(metadata, 'channel', channel);
  setBooleanMeta(metadata, 'active', active);
  setStringMeta(metadata, 'starts_at', startsAt);
  setStringMeta(metadata, 'ends_at', endsAt);

  return {
    id,
    code,
    name: asString(value.name) ?? asString(value.title) ?? code,
    status: buildPromoStatus(value),
    discountType:
      asString(value.discountType) ?? asString(value.discount_type) ?? asString(value.type),
    discountValue:
      asNumber(value.discountValue) ?? asNumber(value.discount_value) ?? asNumber(value.value),
    startsAt,
    endsAt,
    redemptions: reconciledUses,
    metadata,
  };
}

function extractArray(raw: unknown, keys: readonly string[]): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (!isRecord(raw)) {
    return [];
  }

  for (const key of keys) {
    const value = raw[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function extractRequestId(raw: unknown, fallback: string): string {
  if (!isRecord(raw)) {
    return fallback;
  }

  return asString(raw.requestId) ?? fallback;
}

function extractAsOf(raw: unknown): string {
  if (!isRecord(raw)) {
    return nowIso();
  }

  return asString(raw.asOf) ?? nowIso();
}

export async function listAdminCampaigns(): Promise<AdminCampaign[]> {
  const raw = await callAdminGateway('campaigns:list');
  const campaignsRaw = extractArray(raw, ['campaigns', 'items', 'rows']);

  return campaignsRaw
    .map(parseCampaign)
    .filter((entry): entry is AdminCampaign => entry !== null);
}

export async function listAdminPromos(): Promise<AdminPromo[]> {
  const raw = await callAdminGateway('promos:list');
  const promosRaw = extractArray(raw, ['promos', 'items', 'rows']);

  return promosRaw
    .map(parsePromo)
    .filter((entry): entry is AdminPromo => entry !== null);
}

export async function runAdminCampaignRotation(): Promise<AdminCampaignRotationResult> {
  const requestId = createRequestId();
  const raw = await callAdminGateway('campaigns:run-rotation', {
    requestId,
  });

  return {
    rotatedCount: Math.max(0, Math.trunc(asNumber(raw.rotatedCount) ?? 0)),
    requestId: extractRequestId(raw, requestId),
    asOf: extractAsOf(raw),
  };
}

export async function getAdminMarketingSnapshot(): Promise<AdminMarketingSnapshot> {
  const requestId = createRequestId();
  const [campaigns, promos] = await Promise.all([listAdminCampaigns(), listAdminPromos()]);

  return {
    campaigns,
    promos,
    asOf: nowIso(),
    requestId,
  };
}

export async function getAdminMarketingSummary(): Promise<{
  campaignCount: number;
  activeCampaignCount: number;
  promoCount: number;
}> {
  const snapshot = await getAdminMarketingSnapshot();

  return {
    campaignCount: snapshot.campaigns.length,
    activeCampaignCount: snapshot.campaigns.filter((campaign) => campaign.isActive).length,
    promoCount: snapshot.promos.length,
  };
}

export function formatAdminMarketingError(error: unknown): string {
  return formatAdminGatewayError(error);
}