import { asErr, log, prefix } from "./logging.ts";
import type {
  DbClient,
  PromotionLookupRow,
  PromoValidationResult,
} from "./types.ts";

function promoStartsAt(promo: PromotionLookupRow): string | null {
  return promo.starts_at;
}

function promoEndsAt(promo: PromotionLookupRow): string | null {
  return promo.ends_at ?? promo.expires_at;
}

function computePromoDiscountCents(
  promo: PromotionLookupRow,
  subtotalCents: number,
): number | null {
  const normalizedType = promo.type.trim().toLowerCase();

  if (normalizedType === "percentage" || normalizedType === "percent") {
    return Math.max(0, Math.round(subtotalCents * (promo.value / 100)));
  }

  if (normalizedType === "fixed" || normalizedType === "amount") {
    return Math.max(0, Math.min(Math.round(promo.value), subtotalCents));
  }

  return null;
}

export async function validatePromo(args: {
  db: DbClient;
  promoCode: string | null;
  promoId: string | null;
  userId: string;
  subtotalCents: number;
  requestId: string;
}): Promise<PromoValidationResult> {
  const { db, promoCode, promoId, userId, subtotalCents, requestId } = args;

  if (!promoCode && !promoId) {
    return { valid: false, error: "No promo provided" };
  }

  try {
    let query = db
      .from("promotions")
      .select(
        "id, code, type, value, min_order_cents, max_uses, current_uses, starts_at, ends_at, expires_at, active, channel, per_user_limit",
      )
      .eq("active", true);

    if (promoId) {
      query = query.eq("id", promoId);
    } else if (promoCode) {
      query = query.ilike("code", promoCode);
    }

    const { data: promo, error } = await query.maybeSingle();

    if (error) {
      log("warn", "checkout_promo_lookup_failed", {
        requestId,
        promoId: prefix(promoId),
        error: error.message,
      });
      return { valid: false, error: "Unable to validate promo code" };
    }

    const promoRow = promo as PromotionLookupRow | null;
    if (!promoRow) {
      return { valid: false, error: "Promo code not found or inactive" };
    }

    const now = new Date();

    const startsAt = promoStartsAt(promoRow);
    if (startsAt && new Date(startsAt) > now) {
      return { valid: false, error: "Promo code is not yet valid" };
    }

    const endsAt = promoEndsAt(promoRow);
    if (endsAt && new Date(endsAt) < now) {
      return { valid: false, error: "Promo code has expired" };
    }

    if (
      promoRow.max_uses !== null && promoRow.current_uses >= promoRow.max_uses
    ) {
      return { valid: false, error: "Promo code has reached maximum uses" };
    }

    if (subtotalCents < promoRow.min_order_cents) {
      const minAmount = (promoRow.min_order_cents / 100).toFixed(2);
      return {
        valid: false,
        error: `Minimum order amount of $${minAmount} required`,
      };
    }

    if (promoRow.per_user_limit > 0) {
      const { count, error: countError } = await db
        .from("promo_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("promotion_id", promoRow.id)
        .eq("user_id", userId);

      if (countError) {
        log("warn", "checkout_promo_redemption_count_failed", {
          requestId,
          promoId: prefix(promoRow.id),
          userId: prefix(userId),
          error: countError.message,
        });
        return { valid: false, error: "Unable to validate promo code" };
      }

      if ((count ?? 0) >= promoRow.per_user_limit) {
        return { valid: false, error: "You have already used this promo code" };
      }
    }

    const discountCents = computePromoDiscountCents(promoRow, subtotalCents);
    if (discountCents === null) {
      return { valid: false, error: "Unknown promo discount type" };
    }

    return {
      valid: true,
      promoId: promoRow.id,
      discountCents,
    };
  } catch (error) {
    log("error", "checkout_promo_exception", {
      requestId,
      userId: prefix(userId),
      error: asErr(error),
    });
    return { valid: false, error: "Unable to validate promo code" };
  }
}
