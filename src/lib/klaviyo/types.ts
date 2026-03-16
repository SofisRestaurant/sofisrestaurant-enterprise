// src/lib/klaviyo/types.ts
// ─── Klaviyo TypeScript Types ─────────────────────────────────────────────────
//
// All request/response shapes follow the JSON:API spec used by Klaviyo.
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared primitives ─────────────────────────────────────────────────────────

/** ISO 8601 datetime string, e.g. "2026-03-15T12:00:00Z" */
export type ISODateString = string;

/** Klaviyo object type discriminators */
export type KlaviyoObjectType =
  | 'event'
  | 'profile'
  | 'metric'
  | 'list'
  | 'segment'
  | 'campaign'
  | 'flow'
  | 'profile-subscription-bulk-create-job';

// ── Profile ───────────────────────────────────────────────────────────────────

/**
 * Core profile attributes sent to Klaviyo.
 * All fields except `email` are optional but recommended for segmentation.
 */
export interface KlaviyoProfileAttributes {
  /** Primary identifier — required for most calls */
  email?: string;
  /** E.164 format, e.g. "+15555550123" */
  phone_number?: string;
  external_id?: string;
  first_name?: string;
  last_name?: string;
  organization?: string;
  title?: string;
  image?: string;
  /** Street address */
  location?: {
    address1?: string;
    address2?: string;
    city?: string;
    country?: string;
    latitude?: number | string;
    longitude?: number | string;
    region?: string;
    zip?: string;
    timezone?: string;
    ip?: string;
  };
  /** Any extra custom properties */
  properties?: Record<string, unknown>;
}

/** Full JSON:API profile object as returned by / sent to Klaviyo */
export interface KlaviyoProfile {
  type: 'profile';
  id?: string;
  attributes: KlaviyoProfileAttributes;
}

/** Convenience input type for the identifyUser helper */
export type IdentifyUserInput = KlaviyoProfileAttributes & {
  /** Required: at minimum an email or phone_number must be provided */
  email: string;
};

// ── Events ────────────────────────────────────────────────────────────────────

/**
 * Metric defines the event name in Klaviyo.
 * Using `name` directly is the simplest approach (Klaviyo auto-creates metrics).
 */
export interface KlaviyoMetricInput {
  /** Human-readable event name, e.g. "Placed Order" */
  name: string;
  /** Optional: Klaviyo service identifier (usually omitted) */
  service?: string;
}

/**
 * Full event payload for POST /api/events/
 * https://developers.klaviyo.com/en/reference/create_event
 */
export interface KlaviyoEventInput {
  /** The metric (event name) */
  metric: KlaviyoMetricInput;
  /** Profile to associate the event with — email or phone required */
  profile: KlaviyoProfileAttributes;
  /**
   * Arbitrary event-specific properties.
   * E.g. { order_id: "123", value: 49.99, items: [...] }
   */
  properties?: Record<string, unknown>;
  /**
   * Revenue value to attribute to the event (in dollars).
   * Used for Klaviyo's built-in revenue metrics.
   */
  value?: number;
  /**
   * Override event time. Defaults to now if omitted.
   * ISO 8601: "2026-03-15T12:00:00+00:00"
   */
  time?: ISODateString;
  /**
   * Deduplication key — if the same unique_id is sent twice within
   * a short window, Klaviyo ignores the duplicate.
   */
  unique_id?: string;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────

/** Channel a profile can subscribe to */
export type KlaviyoSubscriptionChannel = 'EMAIL' | 'SMS';

/**
 * Input for subscribing a profile to a Klaviyo list.
 * Uses POST /api/profile-subscription-bulk-create-jobs/
 */
export interface SubscribeToListInput {
  /** Klaviyo list ID, e.g. "ABC123" */
  listId: string;
  /** Email address to subscribe */
  email: string;
  /** Phone in E.164 format (required for SMS channel) */
  phone_number?: string;
  /** Which channels to subscribe to. Defaults to ['EMAIL'] */
  channels?: KlaviyoSubscriptionChannel[];
  /** Additional profile properties to upsert alongside the subscription */
  profileProperties?: KlaviyoProfileAttributes;
}

// ── API response ──────────────────────────────────────────────────────────────

/** JSON:API error object returned by Klaviyo on 4xx/5xx */
export interface KlaviyoApiError {
  id?: string;
  status: number;
  code: string;
  title: string;
  detail: string;
  source?: {
    pointer?: string;
    parameter?: string;
  };
  meta?: Record<string, unknown>;
}

/** Standard Klaviyo error response envelope */
export interface KlaviyoErrorResponse {
  errors: KlaviyoApiError[];
}

/**
 * Result type used by all Klaviyo helpers.
 * Callers can discriminate on `ok` without try/catch.
 */
export type KlaviyoResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; errors: KlaviyoApiError[]; status: number };

// ── Predefined event names ─────────────────────────────────────────────────────

/**
 * Strongly-typed catalogue of standard event names used across the app.
 * Import this enum instead of raw strings to prevent typos.
 */
export const KlaviyoEvents = {
  // Orders
  ORDER_PLACED:       'Placed Order',
  ORDER_CONFIRMED:    'Order Confirmed',
  ORDER_FULFILLED:    'Order Fulfilled',
  ORDER_CANCELLED:    'Order Cancelled',
  ORDER_REFUNDED:     'Order Refunded',

  // Cart
  CART_VIEWED:        'Viewed Cart',
  CHECKOUT_STARTED:   'Started Checkout',

  // Marketing
  PROMO_VIEWED:       'Viewed Promotion',
  PROMO_CLICKED:      'Clicked Promotion',
  NEWSLETTER_SIGNUP:  'Newsletter Signup',

  // Loyalty
  POINTS_EARNED:      'Earned Loyalty Points',
  TIER_UPGRADED:      'Loyalty Tier Upgraded',
  REWARD_REDEEMED:    'Redeemed Reward',

  // Engagement
  PAGE_VIEWED:        'Viewed Page',
  MENU_VIEWED:        'Viewed Menu',
  ITEM_VIEWED:        'Viewed Item',
} as const;

export type KlaviyoEventName = typeof KlaviyoEvents[keyof typeof KlaviyoEvents];