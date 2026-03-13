import { isRecord } from "./utils.ts";
import type { DbClient, OrderLocated, PendingCartExtended } from "./types.ts";

const ORDER_LOCATED_SELECT =
  "id,amount_total,payment_status,status,customer_uid";

export const CART_SELECT =
  "id,user_id,items,subtotal_cents,discount_cents,tax_cents,total_cents,promo_id,credit_id,pricing_snapshot,pricing_hash,currency,consumed_at,stripe_session_id";

type ArbitraryRow = Record<string, unknown>;

export async function findOrderBySessionId(
  db: DbClient,
  sessionId: string,
): Promise<OrderLocated | null> {
  const { data } = await db
    .from("orders")
    .select(ORDER_LOCATED_SELECT)
    .eq("stripe_session_id", sessionId)
    .returns<OrderLocated[]>()
    .maybeSingle();

  return data;
}

export async function findOrderByPaymentIntentId(
  db: DbClient,
  paymentIntentId: string,
): Promise<OrderLocated | null> {
  const { data } = await db
    .from("orders")
    .select(ORDER_LOCATED_SELECT)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .returns<OrderLocated[]>()
    .maybeSingle();

  return data;
}

export async function loadPendingCart(
  db: DbClient,
  cartRef: string | null,
  sessionId: string,
  userId: string,
): Promise<PendingCartExtended | null> {
  if (cartRef !== null) {
    const { data } = await db
      .from("pending_carts")
      .select(CART_SELECT)
      .eq("id", cartRef)
      .returns<PendingCartExtended[]>()
      .maybeSingle();

    if (data !== null) {
      return data;
    }
  }

  const { data } = await db
    .from("pending_carts")
    .select(CART_SELECT)
    .eq("stripe_session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<PendingCartExtended[]>()
    .maybeSingle();

  return data;
}

export async function loadOrderPaymentDetails(
  db: DbClient,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await db
      .from("order_payment_details")
      .select("*")
      .eq("order_id", orderId)
      .returns<ArbitraryRow[]>()
      .maybeSingle();

    if (error !== null || data === null || !isRecord(data)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export async function loadOrderFulfillmentEvidence(
  db: DbClient,
  orderId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await db
      .from("order_fulfillment_evidence")
      .select("*")
      .eq("order_id", orderId)
      .returns<ArbitraryRow[]>()
      .maybeSingle();

    if (error !== null || data === null || !isRecord(data)) {
      return null;
    }

    return data;
  } catch {
    return null;
  }
}

export async function loadLatestOrderEvents(
  db: DbClient,
  orderId: string,
  limit = 10,
): Promise<Array<Record<string, unknown>>> {
  try {
    const { data, error } = await db
      .from("order_events")
      .select("event_type,event_data,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(limit)
      .returns<ArbitraryRow[]>();

    if (error !== null || data === null) {
      return [];
    }

    return data.filter(isRecord);
  } catch {
    return [];
  }
}
