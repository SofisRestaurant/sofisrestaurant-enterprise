// src/modules/marketing/hooks/useNotifications.ts
// ─── useNotifications ─────────────────────────────────────────────────────────
//
// Higher-level hook that wraps KlaviyoContext with domain-specific helpers.
// Each function maps a business event to a typed Klaviyo event payload.
//
// Why this layer exists:
//   • Keeps business logic (what data to send per event) out of UI components
//   • All event names come from KlaviyoEvents enum — no raw strings scattered
//   • Profile data is assembled in one place and stays consistent
//   • Easy to add server-side event mirroring later (replace the body here)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback } from 'react';
import { useKlaviyoContext } from '@/providers/KlaviyoProvider';
import { KlaviyoEvents }    from '@/lib/klaviyo';
import type { KlaviyoResult } from '@/lib/klaviyo';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OrderNotificationInput {
  email:        string;
  orderId:      string;
  orderNumber?: number;
  /** Order total in dollars (not cents) */
  total?:       number;
  serviceType?: 'pickup' | 'delivery' | 'dine_in';
  items?:       Array<{ name: string; quantity: number; price?: number }>;
}

export interface PromoNotificationInput {
  email:      string;
  promoCode:  string;
  promoName?: string;
  /** Discount value in dollars */
  discount?:  number;
}

export interface LoyaltyNotificationInput {
  email:       string;
  pointsDelta: number;
  newBalance:  number;
  tier?:       string;
  /** For tier upgrade events — the tier before the upgrade */
  previousTier?: string;
}

export interface PageViewInput {
  email?:    string;
  pageName:  string;
  pageUrl?:  string;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseNotificationsReturn {
  /** Fired when an order is placed (post-payment confirmation) */
  sendOrderPlaced:     (input: OrderNotificationInput)  => Promise<KlaviyoResult<void>>;
  /** Fired when an order transitions to "confirmed" status */
  sendOrderConfirmed:  (input: OrderNotificationInput)  => Promise<KlaviyoResult<void>>;
  /** Fired when an order is fulfilled / delivered */
  sendOrderFulfilled:  (input: OrderNotificationInput)  => Promise<KlaviyoResult<void>>;
  /** Fired when a promo code is displayed or applied */
  sendPromoViewed:     (input: PromoNotificationInput)  => Promise<KlaviyoResult<void>>;
  /** Fired when loyalty points are earned */
  sendPointsEarned:    (input: LoyaltyNotificationInput) => Promise<KlaviyoResult<void>>;
  /** Fired when a user reaches a new loyalty tier */
  sendTierUpgraded:    (input: LoyaltyNotificationInput) => Promise<KlaviyoResult<void>>;
  /** Tracks a page view for segmentation */
  sendPageView:        (input: PageViewInput)            => Promise<KlaviyoResult<void>>;
}

export function useNotifications(): UseNotificationsReturn {
  const { track } = useKlaviyoContext();

  // ── Orders ──────────────────────────────────────────────────────────────────

  const sendOrderPlaced = useCallback(
    async (input: OrderNotificationInput): Promise<KlaviyoResult<void>> =>
      track({
        metric:     { name: KlaviyoEvents.ORDER_PLACED },
        profile:    { email: input.email },
        value:      input.total,
        unique_id:  input.orderId,
        properties: {
          order_id:     input.orderId,
          order_number: input.orderNumber,
          total:        input.total,
          service_type: input.serviceType,
          items:        input.items,
        },
      }),
    [track],
  );

  const sendOrderConfirmed = useCallback(
    async (input: OrderNotificationInput): Promise<KlaviyoResult<void>> =>
      track({
        metric:     { name: KlaviyoEvents.ORDER_CONFIRMED },
        profile:    { email: input.email },
        value:      input.total,
        unique_id:  `confirmed-${input.orderId}`,
        properties: {
          order_id:     input.orderId,
          order_number: input.orderNumber,
          total:        input.total,
          service_type: input.serviceType,
        },
      }),
    [track],
  );

  const sendOrderFulfilled = useCallback(
    async (input: OrderNotificationInput): Promise<KlaviyoResult<void>> =>
      track({
        metric:     { name: KlaviyoEvents.ORDER_FULFILLED },
        profile:    { email: input.email },
        value:      input.total,
        unique_id:  `fulfilled-${input.orderId}`,
        properties: {
          order_id:     input.orderId,
          order_number: input.orderNumber,
          service_type: input.serviceType,
        },
      }),
    [track],
  );

  // ── Promos ──────────────────────────────────────────────────────────────────

  const sendPromoViewed = useCallback(
    async (input: PromoNotificationInput): Promise<KlaviyoResult<void>> =>
      track({
        metric:     { name: KlaviyoEvents.PROMO_VIEWED },
        profile:    { email: input.email },
        properties: {
          promo_code: input.promoCode,
          promo_name: input.promoName,
          discount:   input.discount,
        },
      }),
    [track],
  );

  // ── Loyalty ─────────────────────────────────────────────────────────────────

  const sendPointsEarned = useCallback(
    async (input: LoyaltyNotificationInput): Promise<KlaviyoResult<void>> =>
      track({
        metric:     { name: KlaviyoEvents.POINTS_EARNED },
        profile:    { email: input.email },
        value:      input.pointsDelta,
        properties: {
          points_earned: input.pointsDelta,
          new_balance:   input.newBalance,
          tier:          input.tier,
        },
      }),
    [track],
  );

  const sendTierUpgraded = useCallback(
    async (input: LoyaltyNotificationInput): Promise<KlaviyoResult<void>> =>
      track({
        metric:     { name: KlaviyoEvents.TIER_UPGRADED },
        profile:    { email: input.email },
        properties: {
          new_tier:      input.tier,
          previous_tier: input.previousTier,
          new_balance:   input.newBalance,
        },
      }),
    [track],
  );

  // ── Engagement ──────────────────────────────────────────────────────────────

  const sendPageView = useCallback(
    async (input: PageViewInput): Promise<KlaviyoResult<void>> => {
      // Skip anonymous page views unless an email is known
      if (!input.email) return { ok: true, data: undefined };
      return track({
        metric:     { name: KlaviyoEvents.PAGE_VIEWED },
        profile:    { email: input.email },
        properties: {
          page_name: input.pageName,
          page_url:  input.pageUrl ?? (typeof window !== 'undefined' ? window.location.href : ''),
        },
      });
    },
    [track],
  );

  return {
    sendOrderPlaced,
    sendOrderConfirmed,
    sendOrderFulfilled,
    sendPromoViewed,
    sendPointsEarned,
    sendTierUpgraded,
    sendPageView,
  };
}