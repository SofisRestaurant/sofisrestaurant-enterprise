// supabase/functions/promo-validate/index.ts

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  try {
    // ------------------------------------------------------------------
    // 1️⃣ Auth Required
    // ------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userId = user.id;

    // ------------------------------------------------------------------
    // 2️⃣ Parse Input
    // ------------------------------------------------------------------
    const body = await req.json();
    const code: string | undefined = body?.code;
    const cartTotalCents: number = body?.cartTotalCents ?? 0;

    if (!code) {
      return Response.json(
        { valid: false, reason: "Code required" },
        { status: 400 }
      );
    }

    const normalizedCode = code.trim().toUpperCase();

    // ------------------------------------------------------------------
    // 3️⃣ Load Promotion
    // ------------------------------------------------------------------
    const { data: promo, error: promoError } = await supabase
      .from("promotions")
      .select("*")
      .eq("code", normalizedCode)
      .eq("active", true)
      .single();

    if (promoError || !promo) {
      return Response.json({ valid: false, reason: "Invalid code" });
    }

    const now = new Date();

    // ------------------------------------------------------------------
    // 4️⃣ Date Validation
    // ------------------------------------------------------------------
    if (promo.starts_at && new Date(promo.starts_at) > now) {
      return Response.json({ valid: false, reason: "Not active yet" });
    }

    if (promo.ends_at && new Date(promo.ends_at) < now) {
      return Response.json({ valid: false, reason: "Expired" });
    }

    // ------------------------------------------------------------------
    // 5️⃣ Global Usage Check
    // ------------------------------------------------------------------
    const { count: totalUsesRaw } = await supabase
      .from("promo_redemptions")
      .select("*", { count: "exact", head: true })
      .eq("promotion_id", promo.id);

    const totalUses = totalUsesRaw ?? 0;

    if (promo.max_uses && totalUses >= promo.max_uses) {
      return Response.json({
        valid: false,
        reason: "Usage limit reached",
      });
    }

    // ------------------------------------------------------------------
    // 6️⃣ Per User Limit
    // ------------------------------------------------------------------
    if (promo.per_user_limit) {
      const { count: userUsesRaw } = await supabase
        .from("promo_redemptions")
        .select("*", { count: "exact", head: true })
        .eq("promotion_id", promo.id)
        .eq("user_id", userId);

      const userUses = userUsesRaw ?? 0;

      if (userUses >= promo.per_user_limit) {
        return Response.json({
          valid: false,
          reason: "User limit reached",
        });
      }
    }

    // ------------------------------------------------------------------
    // 7️⃣ Minimum Order Check
    // ------------------------------------------------------------------
    if (
      promo.min_order_cents &&
      cartTotalCents < promo.min_order_cents
    ) {
      return Response.json({
        valid: false,
        reason: "Minimum order not met",
      });
    }

    // ------------------------------------------------------------------
    // 8️⃣ Smart Dynamic Discounts
    // ------------------------------------------------------------------
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const { data: smart } = await supabase
      .from("smart_discounts")
      .select("*")
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
    // 9️⃣ Margin Protection Guard (CRITICAL)
    // ------------------------------------------------------------------
    if (discountType === "percent") {
      const maxSafePercent = 70; // hard safety cap
      if (discountValue > maxSafePercent) {
        return Response.json({
          valid: false,
          reason: "Discount exceeds margin protection",
        });
      }
    }

    if (discountType === "fixed") {
      if (discountValue > cartTotalCents) {
        return Response.json({
          valid: false,
          reason: "Invalid discount amount",
        });
      }
    }

    // ------------------------------------------------------------------
    // ✅ VALID PROMO
    // ------------------------------------------------------------------
    return Response.json({
      valid: true,
      promotionId: promo.id,
      type: discountType,
      value: discountValue,
    });

  } catch (err) {
    console.error("Promo validation error:", err);
    return Response.json(
      { valid: false, reason: "Internal error" },
      { status: 500 }
    );
  }
});