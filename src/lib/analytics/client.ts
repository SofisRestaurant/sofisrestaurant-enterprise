// src/lib/analytics/client.ts
// =============================================================================
// ANALYTICS CLIENT — Production-grade React + TypeScript + Vite client (2026)
// =============================================================================
// Design goals
// - Preserve public API: AnalyticsEvent, analytics, track, page, identify, flush
// - SSR-safe and browser-guarded
// - Consent-aware and DNT-aware
// - Strongly typed GA4 / Meta dispatch
// - Non-blocking first-party transport with bounded queue + retry + beacon flush
// - Privacy-conscious sanitization with sensitive-field redaction
// - No unsafe console leakage in production
// Upgrades (2026):
// - VITE_ANALYTICS_ENDPOINT env var — configurable per environment, no code change needed
// - reset() method — clean state for tests; no-op in production
// - canDispatch() short-circuits on cheapest checks first (enabled → browser → DNT → consent)
// - Auto-includes campaign attribution data (UTM params) in every tracked event
// =============================================================================

import { getAttributionFlat } from './campaignTracking';

export enum AnalyticsEvent {
  PAGE_VIEW = 'page_view',
  ADD_TO_CART = 'add_to_cart',
  REMOVE_FROM_CART = 'remove_from_cart',
  BEGIN_CHECKOUT = 'begin_checkout',
  PURCHASE = 'purchase',
  VIEW_ITEM = 'view_item',
  SEARCH = 'search',
  CLICK = 'click',
  SCROLL = 'scroll',

  VIEW_MENU = 'view_menu',
  VIEW_CATEGORY = 'view_category',
  VIEW_DEAL = 'view_deal',
  APPLY_PROMO = 'apply_promo',
  REMOVE_PROMO = 'remove_promo',
  VIEW_CART = 'view_cart',
  UPDATE_CART_QTY = 'update_cart_qty',
  START_LOGIN = 'start_login',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  SIGNUP_STARTED = 'signup_started',
  SIGNUP_SUCCESS = 'signup_success',
  LOGOUT = 'logout',
  BEGIN_PAYMENT = 'begin_payment',
  PAYMENT_SUCCESS = 'payment_success',
  PAYMENT_FAILED = 'payment_failed',
  ORDER_STATUS_VIEW = 'order_status_view',
  VIEW_REWARDS = 'view_rewards',
  REDEEM_POINTS = 'redeem_points',
  CONTACT_SUBMIT = 'contact_submit',
  RESERVATION_SUBMIT = 'reservation_submit',
  ERROR_SHOWN = 'error_shown',
}

type Primitive = string | number | boolean | null;
type EventData = Record<string, unknown>;
type ConsentState = 'granted' | 'denied' | 'unknown';

interface SanitizedObject {
  [key: string]: SanitizedValue;
}
type SanitizedArray = SanitizedValue[];
type SanitizedValue = Primitive | SanitizedObject | SanitizedArray;

type ScalarMap = Record<string, Primitive>;

type AnalyticsTransportPayload = {
  event: string;
  data?: SanitizedObject;
  timestamp: number;
};

type QueuedEvent = {
  id: string;
  event: string;
  data?: SanitizedObject;
  timestamp: number;
  attempts: number;
  nextAttemptAt: number;
};

type IdentityState = {
  userId: string | null;
  traits: SanitizedObject | null;
};

type MetaStandardEventName =
  | 'PageView'
  | 'AddToCart'
  | 'InitiateCheckout'
  | 'Purchase'
  | 'ViewContent'
  | 'Search';

type MetaDispatch =
  | { mode: 'track'; name: MetaStandardEventName }
  | { mode: 'trackCustom'; name: string };

type GtagConfigParams = {
  user_id?: string;
  send_page_view?: boolean;
};

type GtagFn = {
  (command: 'event', eventName: string, params?: SanitizedObject): void;
  (command: 'config', measurementId: string, params?: GtagConfigParams): void;
  (command: 'set', target: 'user_properties', params: ScalarMap): void;
};

type MetaInitUserData = {
  external_id?: string;
};

type MetaPixelFn = {
  (command: 'track', eventName: MetaStandardEventName, data?: SanitizedObject): void;
  (command: 'trackCustom', eventName: string, data?: SanitizedObject): void;
  (command: 'init', pixelId: string, userData?: MetaInitUserData): void;
};

type AnalyticsConsentObject = {
  analytics?: boolean | null;
};

type LegacyNavigator = Navigator & {
  msDoNotTrack?: unknown;
};

declare global {
  interface Window {
    gtag?: GtagFn;
    fbq?: MetaPixelFn;
    __analyticsConsent?: boolean | AnalyticsConsentObject | null;
    doNotTrack?: string | null;
  }
}

const ANALYTICS_ENDPOINT: string = (() => {
  const raw = import.meta.env.VITE_ANALYTICS_ENDPOINT;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return '/api/analytics';
})();

const DEFAULT_MAX_QUEUE_SIZE = 200;
const DEFAULT_MAX_RETRY_ATTEMPTS = 5;
const DEFAULT_RETRY_BASE_MS = 500;
const DEFAULT_RETRY_CAP_MS = 30_000;

const MAX_STRING_LENGTH = 512;
const MAX_KEYS_PER_OBJECT = 64;
const MAX_ARRAY_LENGTH = 64;
const MAX_DEPTH = 6;

const PAGE_VIEW_TITLE_FALLBACK = 'Untitled';
const REDACTED_VALUE = '[REDACTED]';

const CONSENT_KEYS = [
  'analytics_consent',
  'cookie_consent',
  'cookieConsent',
  'consent_analytics',
  'consent.analytics',
] as const;

const SENSITIVE_KEY_PATTERN =
  /(^|_)(token|secret|password|passwd|passcode|cookie|authorization|auth|jwt|session|sessionid|access_token|refresh_token|api_key|apikey|card|card_number|cvv|cvc|iban|ssn|dob)(_|$)/i;

const IDENTIFY_REDACT_KEY_PATTERN =
  /(^|_)(email|phone|name|first_name|last_name|full_name|address|street|city|state|zip|postal|country)(_|$)/i;

const META_DISPATCH_MAP: Record<AnalyticsEvent, MetaDispatch> = {
  [AnalyticsEvent.PAGE_VIEW]: { mode: 'track', name: 'PageView' },
  [AnalyticsEvent.ADD_TO_CART]: { mode: 'track', name: 'AddToCart' },
  [AnalyticsEvent.REMOVE_FROM_CART]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.REMOVE_FROM_CART,
  },
  [AnalyticsEvent.BEGIN_CHECKOUT]: { mode: 'track', name: 'InitiateCheckout' },
  [AnalyticsEvent.PURCHASE]: { mode: 'track', name: 'Purchase' },
  [AnalyticsEvent.VIEW_ITEM]: { mode: 'track', name: 'ViewContent' },
  [AnalyticsEvent.SEARCH]: { mode: 'track', name: 'Search' },
  [AnalyticsEvent.CLICK]: { mode: 'trackCustom', name: AnalyticsEvent.CLICK },
  [AnalyticsEvent.SCROLL]: { mode: 'trackCustom', name: AnalyticsEvent.SCROLL },
  [AnalyticsEvent.VIEW_MENU]: { mode: 'trackCustom', name: AnalyticsEvent.VIEW_MENU },
  [AnalyticsEvent.VIEW_CATEGORY]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.VIEW_CATEGORY,
  },
  [AnalyticsEvent.VIEW_DEAL]: { mode: 'trackCustom', name: AnalyticsEvent.VIEW_DEAL },
  [AnalyticsEvent.APPLY_PROMO]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.APPLY_PROMO,
  },
  [AnalyticsEvent.REMOVE_PROMO]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.REMOVE_PROMO,
  },
  [AnalyticsEvent.VIEW_CART]: { mode: 'trackCustom', name: AnalyticsEvent.VIEW_CART },
  [AnalyticsEvent.UPDATE_CART_QTY]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.UPDATE_CART_QTY,
  },
  [AnalyticsEvent.START_LOGIN]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.START_LOGIN,
  },
  [AnalyticsEvent.LOGIN_SUCCESS]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.LOGIN_SUCCESS,
  },
  [AnalyticsEvent.LOGIN_FAILED]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.LOGIN_FAILED,
  },
  [AnalyticsEvent.SIGNUP_STARTED]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.SIGNUP_STARTED,
  },
  [AnalyticsEvent.SIGNUP_SUCCESS]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.SIGNUP_SUCCESS,
  },
  [AnalyticsEvent.LOGOUT]: { mode: 'trackCustom', name: AnalyticsEvent.LOGOUT },
  [AnalyticsEvent.BEGIN_PAYMENT]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.BEGIN_PAYMENT,
  },
  [AnalyticsEvent.PAYMENT_SUCCESS]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.PAYMENT_SUCCESS,
  },
  [AnalyticsEvent.PAYMENT_FAILED]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.PAYMENT_FAILED,
  },
  [AnalyticsEvent.ORDER_STATUS_VIEW]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.ORDER_STATUS_VIEW,
  },
  [AnalyticsEvent.VIEW_REWARDS]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.VIEW_REWARDS,
  },
  [AnalyticsEvent.REDEEM_POINTS]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.REDEEM_POINTS,
  },
  [AnalyticsEvent.CONTACT_SUBMIT]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.CONTACT_SUBMIT,
  },
  [AnalyticsEvent.RESERVATION_SUBMIT]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.RESERVATION_SUBMIT,
  },
  [AnalyticsEvent.ERROR_SHOWN]: {
    mode: 'trackCustom',
    name: AnalyticsEvent.ERROR_SHOWN,
  },
};

const ANALYTICS_EVENT_VALUES = new Set<string>(Object.values(AnalyticsEvent));

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function hasNavigator(): boolean {
  return typeof navigator !== 'undefined';
}

function now(): number {
  return Date.now();
}

function createEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `evt_${Math.random().toString(36).slice(2)}_${now()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnalyticsConsentObject(value: unknown): value is AnalyticsConsentObject {
  return (
    isRecord(value) &&
    ('analytics' in value
      ? typeof value.analytics === 'boolean' || value.analytics === null
      : true)
  );
}

function isSanitizedObject(value: SanitizedValue | undefined): value is SanitizedObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnalyticsEvent(value: string): value is AnalyticsEvent {
  return ANALYTICS_EVENT_VALUES.has(value);
}

function normalizeString(value: string, maxLength = MAX_STRING_LENGTH): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeEventName(event: AnalyticsEvent | string): string {
  const raw = typeof event === 'string' ? event : String(event);
  const normalized = normalizeString(raw, 80)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

  return normalized || 'unknown_event';
}

function parseBooleanString(value: string | null): boolean | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();

  if (
    [
      '1',
      'true',
      'yes',
      'y',
      'allow',
      'allowed',
      'grant',
      'granted',
      'accept',
      'accepted',
    ].includes(normalized)
  ) {
    return true;
  }

  if (
    ['0', 'false', 'no', 'n', 'deny', 'denied', 'reject', 'rejected', 'disallow'].includes(
      normalized,
    )
  ) {
    return false;
  }

  return null;
}

function parseEnvBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const parsed = parseBooleanString(value);
    if (parsed !== null) return parsed;
  }
  return fallback;
}

function normalizeEnvString(value: unknown, maxLength = 128): string {
  return typeof value === 'string' ? normalizeString(value, maxLength) : '';
}

function getCookie(name: string): string | null {
  if (!isBrowser()) return null;

  const cookieSource = document.cookie;
  if (!cookieSource) return null;

  const parts = cookieSource.split(';');
  for (const entry of parts) {
    const [rawKey, ...rest] = entry.split('=');
    if (rawKey?.trim() === name) {
      return decodeURIComponent(rest.join('=').trim());
    }
  }

  return null;
}

function getStorageValue(key: string): string | null {
  if (!isBrowser()) return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getNavigatorDoNotTrackValue(): string | null {
  if (!hasNavigator()) return null;

  if (typeof navigator.doNotTrack === 'string') {
    return navigator.doNotTrack;
  }

  const legacyNavigator: LegacyNavigator = navigator;
  return typeof legacyNavigator.msDoNotTrack === 'string'
    ? legacyNavigator.msDoNotTrack
    : null;
}

function getWindowDoNotTrackValue(): string | null {
  if (!isBrowser()) return null;
  return typeof window.doNotTrack === 'string' ? window.doNotTrack : null;
}

function getDoNotTrackEnabled(): boolean {
  const values = [getNavigatorDoNotTrackValue(), getWindowDoNotTrackValue()];

  return values.some((value) => value === '1' || value?.toLowerCase() === 'yes');
}

function safeDocumentTitle(): string {
  if (!isBrowser()) return PAGE_VIEW_TITLE_FALLBACK;
  const title = normalizeString(document.title, 200);
  return title || PAGE_VIEW_TITLE_FALLBACK;
}

function getPagePath(path?: string): string {
  if (typeof path === 'string') {
    const normalized = normalizeString(path, 400);
    if (normalized) return normalized;
  }

  if (!isBrowser()) return '/';

  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return normalizeString(current, 400) || '/';
}

function sanitizeUnknown(
  value: unknown,
  keyPath: readonly string[],
  depth: number,
  options: { redactIdentityFields: boolean },
): SanitizedValue | undefined {
  if (depth > MAX_DEPTH) {
    return undefined;
  }

  const currentKey = keyPath[keyPath.length - 1] ?? '';
  const shouldRedactSensitive = SENSITIVE_KEY_PATTERN.test(currentKey);
  const shouldRedactIdentity =
    options.redactIdentityFields && IDENTIFY_REDACT_KEY_PATTERN.test(currentKey);

  if (shouldRedactSensitive || shouldRedactIdentity) {
    return REDACTED_VALUE;
  }

  if (value === null) return null;

  if (typeof value === 'string') {
    return normalizeString(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    const next: SanitizedArray = [];
    const max = Math.min(value.length, MAX_ARRAY_LENGTH);

    for (let index = 0; index < max; index += 1) {
      const sanitized = sanitizeUnknown(
        value[index],
        [...keyPath, String(index)],
        depth + 1,
        options,
      );

      if (sanitized !== undefined) {
        next.push(sanitized);
      }
    }

    return next;
  }

  if (value instanceof Date) {
    return normalizeString(value.toISOString(), 64);
  }

  if (isRecord(value)) {
    const out: SanitizedObject = {};
    const entries = Object.entries(value).slice(0, MAX_KEYS_PER_OBJECT);

    for (const [key, entryValue] of entries) {
      const sanitized = sanitizeUnknown(entryValue, [...keyPath, key], depth + 1, options);

      if (sanitized !== undefined) {
        out[key] = sanitized;
      }
    }

    return out;
  }

  return undefined;
}

function sanitizeEventData(data?: EventData): SanitizedObject | undefined {
  if (!data) return undefined;
  const sanitized = sanitizeUnknown(data, [], 0, { redactIdentityFields: false });
  return isSanitizedObject(sanitized) ? sanitized : undefined;
}

function sanitizeIdentifyTraits(traits?: EventData): SanitizedObject | undefined {
  if (!traits) return undefined;
  const sanitized = sanitizeUnknown(traits, [], 0, { redactIdentityFields: true });
  return isSanitizedObject(sanitized) ? sanitized : undefined;
}

function sanitizeUserId(userId: string): string {
  return normalizeString(userId, 128);
}

function mapToMetaDispatch(eventName: string): MetaDispatch {
  return isAnalyticsEvent(eventName)
    ? META_DISPATCH_MAP[eventName]
    : { mode: 'trackCustom', name: eventName };
}

function toScalarMap(source?: SanitizedObject): ScalarMap | undefined {
  if (!source) return undefined;

  const out: ScalarMap = {};

  for (const [key, value] of Object.entries(source)) {
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[key] = value;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

class AnalyticsClient {
  private readonly endpointUrl = ANALYTICS_ENDPOINT;
  private readonly isEnabled =
    parseEnvBoolean(import.meta.env.VITE_ANALYTICS_ENABLED, import.meta.env.PROD) &&
    !parseEnvBoolean(import.meta.env.VITE_ANALYTICS_DISABLED, false);
  private readonly requireConsent = parseEnvBoolean(
    import.meta.env.VITE_ANALYTICS_REQUIRE_CONSENT,
    false,
  );
  private readonly maxQueueSize = DEFAULT_MAX_QUEUE_SIZE;
  private readonly maxRetryAttempts = DEFAULT_MAX_RETRY_ATTEMPTS;
  private readonly gaMeasurementId = normalizeEnvString(import.meta.env.VITE_GA_MEASUREMENT_ID);
  private readonly metaPixelId = normalizeEnvString(import.meta.env.VITE_META_PIXEL_ID);

  private queue: QueuedEvent[] = [];
  private currentIdentity: IdentityState = { userId: null, traits: null };
  private drainTimerId: number | null = null;
  private isDraining = false;
  private lifecycleBound = false;
  private metaInitializedForUserId: string | null = null;

  constructor() {
    if (isBrowser()) {
      this.bindBrowserLifecycle();
    }
  }

  track(event: AnalyticsEvent | string, data?: EventData): void {
    const eventName = normalizeEventName(event);

    // Merge campaign attribution data into event data automatically.
    // Attribution fields use attr_ prefix so they don't collide with event data.
    const attrFlat = getAttributionFlat();
    const mergedData: EventData | undefined =
      attrFlat !== null ? { ...(data ?? {}), ...attrFlat } : data;

    const sanitizedData = sanitizeEventData(mergedData);

    if (!this.canDispatch()) {
      return;
    }

    this.bindBrowserLifecycle();
    this.primeVendorIdentity();
    this.dispatchToVendors(eventName, sanitizedData);
    this.enqueue(eventName, sanitizedData);
    this.scheduleDrain(0);
  }

  page(path: string, data?: EventData): void {
    const pagePath = getPagePath(path);
    const mergedData: EventData = {
      ...(data ?? {}),
      page_path: pagePath,
      page_title: safeDocumentTitle(),
    };

    this.track(AnalyticsEvent.PAGE_VIEW, mergedData);
  }

  identify(userId: string, traits?: EventData): void {
    const safeUserId = sanitizeUserId(userId);
    if (!safeUserId) {
      return;
    }

    const sanitizedTraits = sanitizeIdentifyTraits(traits);

    this.currentIdentity = {
      userId: safeUserId,
      traits: sanitizedTraits ?? null,
    };

    if (!this.canDispatch()) {
      return;
    }

    this.bindBrowserLifecycle();
    this.dispatchIdentifyToGa(safeUserId, sanitizedTraits);
    this.dispatchIdentifyToMeta(safeUserId);
  }

  flush(): void {
    if (!isBrowser() || this.queue.length === 0) {
      return;
    }

    const beaconSent = this.trySendQueueWithBeacon();
    if (!beaconSent) {
      this.scheduleDrain(0);
    }
  }

  reset(): void {
    this.dropQueuedEvents();
    this.currentIdentity = { userId: null, traits: null };
    this.metaInitializedForUserId = null;
  }

  private canDispatch(): boolean {
    if (!this.isEnabled) return false;
    if (!isBrowser()) return false;

    if (getDoNotTrackEnabled()) {
      this.dropQueuedEvents();
      return false;
    }

    const consent = this.getConsentState();
    if (consent === 'denied') {
      this.dropQueuedEvents();
      return false;
    }

    if (consent === 'unknown' && this.requireConsent) {
      return false;
    }

    return true;
  }

  private getConsentState(): ConsentState {
    if (!isBrowser()) {
      return 'unknown';
    }

    const globalConsent = window.__analyticsConsent;
    if (typeof globalConsent === 'boolean') {
      return globalConsent ? 'granted' : 'denied';
    }

    if (isAnalyticsConsentObject(globalConsent) && typeof globalConsent.analytics === 'boolean') {
      return globalConsent.analytics ? 'granted' : 'denied';
    }

    for (const key of CONSENT_KEYS) {
      const storageValue = getStorageValue(key);
      const parsedStorage = parseBooleanString(storageValue);
      if (parsedStorage !== null) {
        return parsedStorage ? 'granted' : 'denied';
      }

      const cookieValue = getCookie(key);
      const parsedCookie = parseBooleanString(cookieValue);
      if (parsedCookie !== null) {
        return parsedCookie ? 'granted' : 'denied';
      }
    }

    return 'unknown';
  }

  private bindBrowserLifecycle(): void {
    if (!isBrowser() || this.lifecycleBound) {
      return;
    }

    this.lifecycleBound = true;

    const onVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    };

    const onPageHide = (): void => {
      this.flush();
    };

    const onOnline = (): void => {
      this.scheduleDrain(250);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('online', onOnline);
  }

  private primeVendorIdentity(): void {
    const identity = this.currentIdentity;
    if (!identity.userId) {
      return;
    }

    this.dispatchIdentifyToGa(identity.userId, identity.traits ?? undefined);
    this.dispatchIdentifyToMeta(identity.userId);
  }

  private dispatchToVendors(eventName: string, data?: SanitizedObject): void {
    this.dispatchToGa(eventName, data);
    this.dispatchToMeta(eventName, data);
  }

  private dispatchToGa(eventName: string, data?: SanitizedObject): void {
    if (!this.gaMeasurementId || !isBrowser() || typeof window.gtag !== 'function') {
      return;
    }

    try {
      window.gtag('event', eventName, data);
    } catch {
      // Vendor failures are intentionally isolated.
    }
  }

  private dispatchIdentifyToGa(userId: string, traits?: SanitizedObject): void {
    if (!this.gaMeasurementId || !isBrowser() || typeof window.gtag !== 'function') {
      return;
    }

    try {
      window.gtag('config', this.gaMeasurementId, {
        user_id: userId,
        send_page_view: false,
      });

      const userProperties = toScalarMap(traits);
      if (userProperties) {
        window.gtag('set', 'user_properties', userProperties);
      }
    } catch {
      // Vendor failures are intentionally isolated.
    }
  }

  private dispatchToMeta(eventName: string, data?: SanitizedObject): void {
    if (!isBrowser() || typeof window.fbq !== 'function') {
      return;
    }

    try {
      const dispatch = mapToMetaDispatch(eventName);

      if (dispatch.mode === 'track') {
        window.fbq('track', dispatch.name, data);
        return;
      }

      window.fbq('trackCustom', dispatch.name, data);
    } catch {
      // Vendor failures are intentionally isolated.
    }
  }

  private dispatchIdentifyToMeta(userId: string): void {
    if (!this.metaPixelId || !isBrowser() || typeof window.fbq !== 'function') {
      return;
    }

    if (this.metaInitializedForUserId === userId) {
      return;
    }

    try {
      window.fbq('init', this.metaPixelId, { external_id: userId });
      this.metaInitializedForUserId = userId;
    } catch {
      // Vendor failures are intentionally isolated.
    }
  }

  private enqueue(event: string, data?: SanitizedObject): void {
    const entry: QueuedEvent = {
      id: createEventId(),
      event,
      data,
      timestamp: now(),
      attempts: 0,
      nextAttemptAt: 0,
    };

    this.queue.push(entry);

    if (this.queue.length > this.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.maxQueueSize);
    }
  }

  private dropQueuedEvents(): void {
    this.queue = [];

    if (this.drainTimerId !== null && isBrowser()) {
      window.clearTimeout(this.drainTimerId);
      this.drainTimerId = null;
    }
  }

  private scheduleDrain(delayMs: number): void {
    if (!isBrowser()) return;

    if (this.drainTimerId !== null) {
      window.clearTimeout(this.drainTimerId);
      this.drainTimerId = null;
    }

    this.drainTimerId = window.setTimeout(() => {
      this.drainTimerId = null;
      void this.drainQueue();
    }, Math.max(0, delayMs));
  }

  private async drainQueue(): Promise<void> {
    if (this.isDraining || !this.canDispatch() || this.queue.length === 0) {
      return;
    }

    this.isDraining = true;

    try {
      while (this.queue.length > 0) {
        const next = this.queue[0];
        if (!next) {
          break;
        }

        const currentTime = now();
        if (next.nextAttemptAt > currentTime) {
          this.scheduleDrain(next.nextAttemptAt - currentTime);
          break;
        }

        const delivered = await this.sendQueuedEvent(next);
        if (delivered) {
          this.queue.shift();
          continue;
        }

        next.attempts += 1;

        if (next.attempts >= this.maxRetryAttempts) {
          this.queue.shift();
          continue;
        }

        next.nextAttemptAt = now() + this.getRetryDelayMs(next.attempts);
        this.scheduleDrain(next.nextAttemptAt - now());
        break;
      }
    } finally {
      this.isDraining = false;
    }
  }

  private getRetryDelayMs(attempt: number): number {
    const exponential = Math.min(DEFAULT_RETRY_CAP_MS, DEFAULT_RETRY_BASE_MS * 2 ** attempt);
    const jitter = Math.floor(Math.random() * 250);
    return exponential + jitter;
  }

  private async sendQueuedEvent(entry: QueuedEvent): Promise<boolean> {
    const payload = this.buildTransportPayload(entry);

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        keepalive: true,
        body: JSON.stringify(payload),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  private trySendQueueWithBeacon(): boolean {
    if (!isBrowser() || typeof navigator.sendBeacon !== 'function' || this.queue.length === 0) {
      return false;
    }

    let allSent = true;

    for (const entry of [...this.queue]) {
      try {
        const payload = this.buildTransportPayload(entry);
        const body = new Blob([JSON.stringify(payload)], {
          type: 'application/json; charset=UTF-8',
        });

        const sent = navigator.sendBeacon(this.endpointUrl, body);
        if (!sent) {
          allSent = false;
          break;
        }
      } catch {
        allSent = false;
        break;
      }
    }

    if (allSent) {
      this.queue = [];
    }

    return allSent;
  }

  private buildTransportPayload(entry: QueuedEvent): AnalyticsTransportPayload {
    return {
      event: entry.event,
      data: entry.data,
      timestamp: entry.timestamp,
    };
  }
}

export const analytics = new AnalyticsClient();

export function track(event: AnalyticsEvent | string, data?: EventData): void {
  analytics.track(event, data);
}

export function page(path: string, data?: EventData): void {
  analytics.page(path, data);
}

export function identify(userId: string, traits?: EventData): void {
  analytics.identify(userId, traits);
}

export function flush(): void {
  analytics.flush();
}

export function reset(): void {
  analytics.reset();
}

export default analytics;