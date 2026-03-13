import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';

export type CampaignPublic = {
  id: string;
  campaign_name: string;
  placement: string;
  promo_id: string | null;
  badge: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  cta_label: string | null;
  deep_link: string | null;
  menu_item_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  weight: number;
  is_featured: boolean;
};

export type ActiveCampaignsResponse = {
  ok: true;
  placement: string;
  limit: number;
  count: number;
  featured: CampaignPublic | null;
  campaigns: CampaignPublic[];
  asOf: string;
  requestId: string;
};

export type UseActiveCampaignsOptions = {
  placement?: string;
  limit?: number;
  featured?: boolean;
  enabled?: boolean;
  ttlMs?: number;
  staleMs?: number;
  refreshOnWindowFocus?: boolean;
  refreshOnReconnect?: boolean;
  pollIntervalMs?: number;
};

export type UseActiveCampaignsState = {
  campaigns: CampaignPublic[];
  featured: CampaignPublic | null;
  placement: string;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  errorCode: string | null;
  asOf: string | null;
  requestId: string | null;
  fromCache: boolean;
  refresh: () => Promise<void>;
};

type UnknownRecord = Record<string, unknown>;

type CacheEntry = {
  campaigns: CampaignPublic[];
  featured: CampaignPublic | null;
  placement: string;
  asOf: string | null;
  requestId: string | null;
  error: string | null;
  errorCode: string | null;
  updatedAt: number;
  expiresAt: number;
  staleAt: number;
};

const DEFAULT_PLACEMENT = 'menu_deals_rail';
const DEFAULT_LIMIT = 12;
const DEFAULT_ENABLED = true;
const DEFAULT_FEATURED = true;
const DEFAULT_TTL_MS = 30_000;
const DEFAULT_STALE_MS = 5 * 60_000;
const ERROR_TTL_MS = 5_000;
const MAX_LIMIT = 50;

const CACHE = new Map<string, CacheEntry>();
const INFLIGHT = new Map<string, Promise<CacheEntry>>();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
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
  const normalized = Math.trunc(value);
  return Math.max(min, Math.min(max, normalized));
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutControls = trimmed
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!withoutControls) return null;
  return withoutControls.length <= maxLength
    ? withoutControls
    : withoutControls.slice(0, maxLength).trim();
}

function sanitizePlacement(value: unknown): string | null {
  const normalized = sanitizePlainText(value, 64);
  if (!normalized) return null;
  if (!/^[a-z0-9](?:[a-z0-9:_-]{0,63})$/i.test(normalized)) return null;
  return normalized;
}

function sanitizeDeepLink(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  if (/[\\\u0000-\u001F\u007F]/.test(trimmed)) return null;
  if (trimmed.startsWith('/')) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function parseCampaignPublic(value: unknown): CampaignPublic | null {
  if (!isRecord(value)) return null;

  const id = sanitizePlainText(value.id, 128);
  const campaignName = sanitizePlainText(value.campaign_name, 160);
  const placement = sanitizePlacement(value.placement);

  if (!id || !campaignName || !placement) return null;

  return {
    id,
    campaign_name: campaignName,
    placement,
    promo_id: sanitizePlainText(value.promo_id, 128),
    badge: sanitizePlainText(value.badge, 48),
    hero_title: sanitizePlainText(value.hero_title, 140),
    hero_subtitle: sanitizePlainText(value.hero_subtitle, 240),
    cta_label: sanitizePlainText(value.cta_label, 48),
    deep_link: sanitizeDeepLink(value.deep_link),
    menu_item_id: sanitizePlainText(value.menu_item_id, 128),
    starts_at: asNullableString(value.starts_at),
    ends_at: asNullableString(value.ends_at),
    priority: clampInt(asNumber(value.priority, 0), -10_000, 10_000),
    weight: clampInt(asNumber(value.weight, 1), -10_000, 10_000),
    is_featured: asBoolean(value.is_featured, false),
  };
}

function parseActiveCampaignsResponse(value: unknown): ActiveCampaignsResponse | null {
  if (!isRecord(value)) return null;
  if (value.ok !== true) return null;

  const placement = sanitizePlacement(value.placement);
  const asOf = asString(value.asOf);
  const requestId = sanitizePlainText(value.requestId, 64);
  const limit = clampInt(asNumber(value.limit, DEFAULT_LIMIT), 1, MAX_LIMIT);
  const count = clampInt(asNumber(value.count, 0), 0, MAX_LIMIT);

  if (!placement || !asOf || !requestId) return null;

  const campaignsRaw = value.campaigns;
  if (!Array.isArray(campaignsRaw)) return null;

  const campaigns: CampaignPublic[] = [];
  for (const campaignRaw of campaignsRaw) {
    const campaign = parseCampaignPublic(campaignRaw);
    if (campaign) campaigns.push(campaign);
  }

  const featured = value.featured === null ? null : parseCampaignPublic(value.featured);
  return {
    ok: true,
    placement,
    limit,
    count,
    featured,
    campaigns,
    asOf,
    requestId,
  };
}

function parseApiError(value: unknown): { error: string; code: string } | null {
  if (!isRecord(value)) return null;
  const error = sanitizePlainText(value.error, 160);
  const code = sanitizePlainText(value.code, 64);
  if (!error || !code) return null;
  return { error, code };
}

function getErrorMessage(error: unknown): string {
  if (isRecord(error)) {
    const message = sanitizePlainText(error.message, 160);
    if (message) return message;

    const context = sanitizePlainText(error.context, 160);
    if (context) return context;

    const name = sanitizePlainText(error.name, 160);
    if (name) return name;
  }

  return 'Unable to load active campaigns.';
}

function normalizeOptions(input?: string | UseActiveCampaignsOptions) {
  if (typeof input === 'string') {
    return {
      placement: sanitizePlacement(input) ?? DEFAULT_PLACEMENT,
      limit: DEFAULT_LIMIT,
      featured: DEFAULT_FEATURED,
      enabled: DEFAULT_ENABLED,
      ttlMs: DEFAULT_TTL_MS,
      staleMs: DEFAULT_STALE_MS,
      refreshOnWindowFocus: true,
      refreshOnReconnect: true,
      pollIntervalMs: 0,
    };
  }

  const options = input ?? {};
  return {
    placement: sanitizePlacement(options.placement) ?? DEFAULT_PLACEMENT,
    limit: clampInt(options.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT),
    featured: options.featured ?? DEFAULT_FEATURED,
    enabled: options.enabled ?? DEFAULT_ENABLED,
    ttlMs: clampInt(options.ttlMs ?? DEFAULT_TTL_MS, 1_000, 5 * 60_000),
    staleMs: clampInt(options.staleMs ?? DEFAULT_STALE_MS, 5_000, 30 * 60_000),
    refreshOnWindowFocus: options.refreshOnWindowFocus ?? true,
    refreshOnReconnect: options.refreshOnReconnect ?? true,
    pollIntervalMs: clampInt(options.pollIntervalMs ?? 0, 0, 30 * 60_000),
  };
}

function getCacheKey(placement: string, limit: number, featured: boolean): string {
  return `${placement}::${limit}::${featured ? 'featured' : 'all'}`;
}

function buildFunctionPath(placement: string, limit: number, featured: boolean): string {
  const params = new URLSearchParams();
  params.set('placement', placement);
  params.set('limit', String(limit));
  params.set('featured', featured ? 'true' : 'false');
  return `get-active-campaigns?${params.toString()}`;
}

function readCache(key: string): CacheEntry | null {
  return CACHE.get(key) ?? null;
}

function isFresh(entry: CacheEntry | null, now = Date.now()): boolean {
  return entry !== null && entry.expiresAt > now;
}

function isStale(entry: CacheEntry | null, now = Date.now()): boolean {
  return entry === null || entry.staleAt <= now;
}

function createEmptyEntry(
  placement: string,
  ttlMs: number,
  staleMs: number,
  error: string | null,
  errorCode: string | null,
): CacheEntry {
  const now = Date.now();
  return {
    campaigns: [],
    featured: null,
    placement,
    asOf: null,
    requestId: null,
    error,
    errorCode,
    updatedAt: now,
    expiresAt: now + ttlMs,
    staleAt: now + staleMs,
  };
}

async function fetchActiveCampaigns(
  placement: string,
  limit: number,
  featured: boolean,
  ttlMs: number,
  staleMs: number,
  force: boolean,
): Promise<CacheEntry> {
  const key = getCacheKey(placement, limit, featured);
  const now = Date.now();
  const cached = readCache(key);

  if (!force && isFresh(cached, now)) {
    return cached as CacheEntry;
  }

  const existingInflight = INFLIGHT.get(key);
  if (existingInflight) return existingInflight;

  const inflightPromise = (async (): Promise<CacheEntry> => {
    const previous = readCache(key);

    try {
      const response = await supabase.functions.invoke(
        buildFunctionPath(placement, limit, featured),
        {
          method: 'GET',
        },
      );

      if (response.error) {
        const fallback =
          previous ??
          createEmptyEntry(
            placement,
            ERROR_TTL_MS,
            ERROR_TTL_MS,
            getErrorMessage(response.error),
            'FETCH_FAILED',
          );

        const next: CacheEntry = {
          ...fallback,
          error: getErrorMessage(response.error),
          errorCode: 'FETCH_FAILED',
          updatedAt: Date.now(),
          expiresAt: Date.now() + ERROR_TTL_MS,
          staleAt: Date.now() + ERROR_TTL_MS,
        };

        CACHE.set(key, next);
        return next;
      }

      const apiError = parseApiError(response.data);
      if (apiError) {
        const fallback =
          previous ??
          createEmptyEntry(placement, ERROR_TTL_MS, ERROR_TTL_MS, apiError.error, apiError.code);

        const next: CacheEntry = {
          ...fallback,
          error: apiError.error,
          errorCode: apiError.code,
          updatedAt: Date.now(),
          expiresAt: Date.now() + ERROR_TTL_MS,
          staleAt: Date.now() + ERROR_TTL_MS,
        };

        CACHE.set(key, next);
        return next;
      }

      const parsed = parseActiveCampaignsResponse(response.data);
      if (!parsed) {
        const fallback =
          previous ??
          createEmptyEntry(
            placement,
            ERROR_TTL_MS,
            ERROR_TTL_MS,
            'Invalid active campaigns response.',
            'INVALID_RESPONSE',
          );

        const next: CacheEntry = {
          ...fallback,
          error: 'Invalid active campaigns response.',
          errorCode: 'INVALID_RESPONSE',
          updatedAt: Date.now(),
          expiresAt: Date.now() + ERROR_TTL_MS,
          staleAt: Date.now() + ERROR_TTL_MS,
        };

        CACHE.set(key, next);
        return next;
      }

      const next: CacheEntry = {
        campaigns: parsed.campaigns,
        featured: parsed.featured,
        placement: parsed.placement,
        asOf: parsed.asOf,
        requestId: parsed.requestId,
        error: null,
        errorCode: null,
        updatedAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
        staleAt: Date.now() + staleMs,
      };

      CACHE.set(key, next);
      return next;
    } catch (error: unknown) {
      const fallback =
        previous ??
        createEmptyEntry(
          placement,
          ERROR_TTL_MS,
          ERROR_TTL_MS,
          getErrorMessage(error),
          'FETCH_FAILED',
        );

      const next: CacheEntry = {
        ...fallback,
        error: getErrorMessage(error),
        errorCode: 'FETCH_FAILED',
        updatedAt: Date.now(),
        expiresAt: Date.now() + ERROR_TTL_MS,
        staleAt: Date.now() + ERROR_TTL_MS,
      };

      CACHE.set(key, next);
      return next;
    }
  })();

  INFLIGHT.set(key, inflightPromise);

  try {
    return await inflightPromise;
  } finally {
    INFLIGHT.delete(key);
  }
}

function toHookState(
  entry: CacheEntry | null,
  placement: string,
  loading: boolean,
  refreshing: boolean,
  fromCache: boolean,
  refresh: () => Promise<void>,
): UseActiveCampaignsState {
  return {
    campaigns: entry?.campaigns ?? [],
    featured: entry?.featured ?? null,
    placement: entry?.placement ?? placement,
    loading,
    refreshing,
    error: entry?.error ?? null,
    errorCode: entry?.errorCode ?? null,
    asOf: entry?.asOf ?? null,
    requestId: entry?.requestId ?? null,
    fromCache,
    refresh,
  };
}

export function invalidateActiveCampaignsCache(input?: string | UseActiveCampaignsOptions): void {
  if (!input) {
    CACHE.clear();
    return;
  }

  const normalized = normalizeOptions(input);
  CACHE.delete(getCacheKey(normalized.placement, normalized.limit, normalized.featured));
}

export function clearActiveCampaignsCache(): void {
  CACHE.clear();
}

export async function prefetchActiveCampaigns(
  input?: string | UseActiveCampaignsOptions,
): Promise<CampaignPublic[]> {
  const normalized = normalizeOptions(input);
  const entry = await fetchActiveCampaigns(
    normalized.placement,
    normalized.limit,
    normalized.featured,
    normalized.ttlMs,
    normalized.staleMs,
    false,
  );
  return entry.campaigns;
}

export function getCachedActiveCampaigns(
  input?: string | UseActiveCampaignsOptions,
): CampaignPublic[] {
  const normalized = normalizeOptions(input);
  return (
    readCache(getCacheKey(normalized.placement, normalized.limit, normalized.featured))
      ?.campaigns ?? []
  );
}

export function useActiveCampaignsState(
  input?: string | UseActiveCampaignsOptions,
): UseActiveCampaignsState {
  const normalized = normalizeOptions(input);
  const {
    placement,
    limit,
    featured,
    enabled,
    ttlMs,
    staleMs,
    refreshOnWindowFocus,
    refreshOnReconnect,
    pollIntervalMs,
  } = normalized;
  const key = useMemo(() => getCacheKey(placement, limit, featured), [placement, limit, featured]);

  const seqRef = useRef(0);

  // Stable wrapper so we can safely pass `refresh` into state without self-referencing
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const refreshFn: () => Promise<void> = useCallback(async () => {
    await refreshRef.current?.();
  }, []);

  const [state, setState] = useState<UseActiveCampaignsState>(() => {
    const cached = readCache(key);
    return toHookState(
      cached,
      placement,
      enabled && cached === null,
      false,
      cached !== null,
      refreshFn,
    );
  });

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      setState((current) => ({
        ...current,
        loading: false,
        refreshing: false,
      }));
      return;
    }

    const currentSeq = ++seqRef.current;
    const cached = readCache(key);
    const hasCachedData = (cached?.campaigns.length ?? 0) > 0;

    setState(
      toHookState(cached, placement, !hasCachedData, hasCachedData, cached !== null, refreshFn),
    );

    const next = await fetchActiveCampaigns(placement, limit, featured, ttlMs, staleMs, true);

    if (seqRef.current !== currentSeq) return;
    setState(toHookState(next, placement, false, false, false, refreshFn));
  }, [enabled, featured, key, limit, placement, staleMs, ttlMs, refreshFn]);

  // Always point the stable wrapper at the latest refresh implementation
  refreshRef.current = refresh;

  useEffect(() => {
    let active = true;
    const currentSeq = ++seqRef.current;
    const cached = readCache(key);

    if (!enabled) {
      setState(toHookState(cached, placement, false, false, cached !== null, refreshFn));
      return () => {
        active = false;
        seqRef.current = currentSeq + 1;
      };
    }

    const shouldRefetch = !isFresh(cached) || isStale(cached);
    setState(
      toHookState(
        cached,
        placement,
        cached === null,
        cached !== null && shouldRefetch,
        cached !== null,
        refreshFn,
      ),
    );

    if (shouldRefetch) {
      void fetchActiveCampaigns(placement, limit, featured, ttlMs, staleMs, false).then((next) => {
        if (!active || seqRef.current !== currentSeq) return;
        setState(toHookState(next, placement, false, false, false, refreshFn));
      });
    }

    return () => {
      active = false;
      seqRef.current = currentSeq + 1;
    };
  }, [enabled, featured, key, limit, placement, refreshFn, staleMs, ttlMs]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    const handleFocus = () => {
      if (!refreshOnWindowFocus) return;
      const cached = readCache(key);
      if (!isStale(cached)) return;
      void refreshFn();
    };

    const handleOnline = () => {
      if (!refreshOnReconnect) return;
      void refreshFn();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, key, refreshFn, refreshOnReconnect, refreshOnWindowFocus]);

  useEffect(() => {
    if (!enabled || pollIntervalMs <= 0 || typeof window === 'undefined') return undefined;

    const intervalId = window.setInterval(() => {
      void refreshFn();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, pollIntervalMs, refreshFn]);

  return {
    ...state,
    refresh: refreshFn,
  };
}

export function useActiveCampaigns(input?: string | UseActiveCampaignsOptions): CampaignPublic[] {
  return useActiveCampaignsState(input).campaigns;
}
