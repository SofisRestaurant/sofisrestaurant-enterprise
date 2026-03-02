// supabase/functions/promo-validate/index.ts
// =============================================================================
// PROMO VALIDATE — PRODUCTION (RLS-SAFE AUTH + SERVICE READS)
// =============================================================================
// - Auth required (JWT)
// - Uses anon client for caller identity (RLS enforced)
// - Uses service client for promo/smart_discount reads (validation is server-only)
// =============================================================================

import { createAnonClient, createServiceClient } from "../_shared/supabase.ts";

type RawBody = {
  code?: unknown;
  cartTotalCents?: unknown;
};

function asString(v: unknown, max = 64): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.slice(0, max);
}

function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response(null, { status: 204 });
    if (req.method !== "POST") return json({ valid: false, reason: "Method not allowed" }, 405);

    // ------------------------------------------------------------------
    // 1) AUTH REQUIRED (JWT)
    // ------------------------------------------------------------------
    const authHeader =
      req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";

    if (!authHeader.startsWith("Bearer ")) {
      return json({ valid: false, reason: "Unauthorized" }, 401);
    }

    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) return json({ valid: false, reason: "Unauthorized" }, 401);

    const anon = createAnonClient(jwt);
    const { data: authData, error: authErr } = await anon.auth.getUser();

    if (authErr || !authData?.user) {
      return json({ valid: false, reason: "Unauthorized" }, 401);
    }

    const userId = authData.user.id;

    // ------------------------------------------------------------------
    // 2) PARSE INPUT
    // ------------------------------------------------------------------
    let body: RawBody;
    try {
      body = (await req.json()) as RawBody;
    } catch {
      return json({ valid: false, reason: "Invalid JSON" }, 400);
    }

    const codeRaw = asString(body.code, 50);
    const cartTotalCents = asInt(body.cartTotalCents, 0);

    if (!codeRaw) {
      return json({ valid: false, reason: "Code required" }, 400);
    }

    const normalizedCode = codeRaw.toUpperCase();

    // ------------------------------------------------------------------
    // 3) LOAD PROMO (SERVICE READ)
    // ------------------------------------------------------------------
    const svc = createServiceClient();

    const { data: promo, error: promoError } = await svc
      .from("promotions")
      .select(
        "id,type,value,active,starts_at,ends_at,expires_at,max_uses,per_user_limit,min_order_cents",
      )
      .eq("code", normalizedCode)
      .eq("active", true)
      .maybeSingle();

    if (promoError || !promo) {
      return json({ valid: false, reason: "Invalid code" }, 200);
    }

    const now = new Date();

    // ------------------------------------------------------------------
    // 4) DATE VALIDATION
    // ------------------------------------------------------------------
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return json({ valid: false, reason: "Not active yet" }, 200);
    }

    const expiry = promo.expires_at ?? promo.ends_at ?? null;
    if (expiry && new Date(expiry) < now) {
      return json({ valid: false, reason: "Expired" }, 200);
    }

    // ------------------------------------------------------------------
    // 5) GLOBAL USAGE CHECK (count redemptions)
    // ------------------------------------------------------------------
    const { count: totalUsesRaw, error: totalUsesErr } = await svc
      .from("promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promotion_id", promo.id);

    if (totalUsesErr) {
      return json({ valid: false, reason: "Unable to validate usage" }, 500);
    }

    const totalUses = totalUsesRaw ?? 0;

    if (promo.max_uses != null && totalUses >= promo.max_uses) {
      return json({ valid: false, reason: "Usage limit reached" }, 200);
    }

    // ------------------------------------------------------------------
    // 6) PER-USER LIMIT CHECK
    // ------------------------------------------------------------------
    if (promo.per_user_limit != null && promo.per_user_limit > 0) {
      const { count: userUsesRaw, error: userUsesErr } = await svc
        .from("promo_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("promotion_id", promo.id)
        .eq("user_id", userId);

      if (userUsesErr) {
        return json({ valid: false, reason: "Unable to validate user usage" }, 500);
      }

      const userUses = userUsesRaw ?? 0;
      if (userUses >= promo.per_user_limit) {
        return json({ valid: false, reason: "User limit reached" }, 200);
      }
    }

    // ------------------------------------------------------------------
    // 7) MINIMUM ORDER CHECK
    // ------------------------------------------------------------------
    if (promo.min_order_cents != null && cartTotalCents < promo.min_order_cents) {
      return json({ valid: false, reason: "Minimum order not met" }, 200);
    }

    // ------------------------------------------------------------------
    // 8) SMART DISCOUNTS (OPTIONAL OVERRIDE)
    // ------------------------------------------------------------------
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const { data: smart } = await svc
      .from("smart_discounts")
      .select("type,value")
      .eq("active", true)
      .eq("day_of_week", currentDay)
      .lte("start_hour", currentHour)
      .gte("end_hour", currentHour)
      .maybeSingle();

    let discountType = promo.type;
    let discountValue = promo.value;

    if (smart) {
      discountType = smart.type ?? discountType;
      discountValue = smart.value ?? discountValue;
    }

    // ------------------------------------------------------------------
    // 9) BASIC MARGIN SAFETY (LIGHTWEIGHT)
    // (Your real margin gate is in create-checkout; keep this as UI precheck.)
    // ------------------------------------------------------------------
    if (discountType === "percent") {
      const maxSafePercent = 70;
      if (discountValue > maxSafePercent) {
        return json({ valid: false, reason: "Discount exceeds safety cap" }, 200);
      }
    } else if (discountType === "fixed") {
      const fixedCents = Math.round(discountValue * 100); // if your DB stores dollars
      if (fixedCents > cartTotalCents) {
        return json({ valid: false, reason: "Invalid discount amount" }, 200);
      }
    }

    // ------------------------------------------------------------------
    // ✅ VALID
    // ------------------------------------------------------------------
    return json(
      {
        valid: true,
        promotionId: promo.id,
        type: discountType,
        value: discountValue,
      },
      200,
    );
  } catch (e) {
    console.error("Promo validation error:", e);
    return json({ valid: false, reason: "Internal error" }, 500);
  }
});