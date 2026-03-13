import {
  buildClientIntegrityHash,
  type CanonicalCartItem,
  type OrderType,
  type PricingSnapshot,
} from "../_shared/pricing.ts";
import type { Json } from "../_shared/database.types.ts";
import { asErr, log, nowIso, prefix } from "./logging.ts";
import { serializeToJson } from "./request-validation.ts";
import type { DbClient, FraudLogInsert, SecurityEventInsert } from "./types.ts";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  return Array.from(view).map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildCheckoutIdempotencyKey(args: {
  userId: string;
  orderType: OrderType;
  notes: string | null;
  pricingHash: string;
  promoId: string | null;
  creditId: string | null;
  loyaltyRedeemPoints: number | null;
  loyaltyRewardId: string | null;
  loyaltyRedemptionId: string | null;
}): Promise<string> {
  const payload = JSON.stringify({
    userId: args.userId,
    orderType: args.orderType,
    notes: args.notes,
    pricingHash: args.pricingHash,
    promoId: args.promoId,
    creditId: args.creditId,
    loyaltyRedeemPoints: args.loyaltyRedeemPoints,
    loyaltyRewardId: args.loyaltyRewardId,
    loyaltyRedemptionId: args.loyaltyRedemptionId,
  });

  return await sha256Hex(payload);
}

async function buildCartIntegrityHash(
  items: CanonicalCartItem[],
): Promise<string> {
  const payload = items
    .map((item) => {
      const itemHash = buildClientIntegrityHash(
        item.menuItemId,
        item.baseUnitPriceCents,
        item.modifiers,
        item.quantity,
      );

      return [
        item.menuItemId,
        item.name,
        String(item.quantity),
        item.notes ?? "",
        itemHash,
      ].join("|");
    })
    .join("\n");

  return await sha256Hex(payload);
}

async function logFraudEvent(args: {
  db: DbClient;
  userId: string;
  reason: string;
  metadata: Json;
  requestId: string;
  serverTotal?: number;
}): Promise<void> {
  const { db, userId, reason, metadata, requestId, serverTotal } = args;

  try {
    const insert: FraudLogInsert = {
      user_id: userId,
      reason,
      metadata,
      server_total: serverTotal,
      stripe_total: 0,
      created_at: nowIso(),
    };

    const { error } = await db.from("fraud_logs").insert(insert);

    if (error) {
      log("warn", "checkout_fraud_log_failed", {
        requestId,
        userId: prefix(userId),
        error: error.message,
      });
    }
  } catch (error) {
    log("warn", "checkout_fraud_log_exception", {
      requestId,
      userId: prefix(userId),
      error: asErr(error),
    });
  }
}

async function logSecurityEvent(
  db: DbClient,
  eventType: string,
  metadata: Json,
  requestId: string,
): Promise<void> {
  try {
    const insert: SecurityEventInsert = {
      event_type: eventType,
      metadata,
      created_at: nowIso(),
    };

    const { error } = await db.from("security_events").insert(insert);

    if (error) {
      log("warn", "checkout_security_event_failed", {
        requestId,
        eventType,
        error: error.message,
      });
    }
  } catch (error) {
    log("warn", "checkout_security_event_exception", {
      requestId,
      eventType,
      error: asErr(error),
    });
  }
}

export async function checkIntegrityHash(args: {
  db: DbClient;
  clientHash: string | null;
  canonicalItems: CanonicalCartItem[];
  snapshot: PricingSnapshot;
  userId: string;
  requestId: string;
}): Promise<void> {
  const { db, clientHash, canonicalItems, snapshot, userId, requestId } = args;

  if (!clientHash) {
    return;
  }

  try {
    const serverHash = await buildCartIntegrityHash(canonicalItems);
    if (serverHash === clientHash) {
      return;
    }

    log("warn", "checkout_integrity_hash_mismatch", {
      requestId,
      userId: prefix(userId),
      clientHash: clientHash.slice(0, 16),
      serverHash: serverHash.slice(0, 16),
    });

    const metadata = serializeToJson({
      request_id: requestId,
      client_hash: clientHash.slice(0, 64),
      server_hash: serverHash.slice(0, 64),
      total_cents: snapshot.totalCents,
    });

    await Promise.all([
      logFraudEvent({
        db,
        userId,
        reason: "pricing_integrity_mismatch",
        metadata,
        requestId,
        serverTotal: snapshot.totalCents,
      }),
      logSecurityEvent(
        db,
        "checkout_pricing_tamper_attempt",
        serializeToJson({
          user_id: userId,
          request_id: requestId,
          client_hash: clientHash.slice(0, 64),
        }),
        requestId,
      ),
    ]);
  } catch {
    // non-blocking
  }
}
