// supabase/functions/growth-orchestrator/index.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const THRESHOLD_MINUTES = 30;
const RECOVERY_WINDOW_HOURS = 12;
const RECOVERY_PERCENT = 10;

Deno.serve(async () => {
  try {
    const cutoff = new Date(
      Date.now() - THRESHOLD_MINUTES * 60_000
    ).toISOString();

    // ------------------------------------------------------------------
    // 1️⃣ Fetch stale carts that have NOT been processed
    // ------------------------------------------------------------------
    const { data: carts, error: cartError } = await supabase
      .from("pending_carts")
      .select("*")
      .lt("created_at", cutoff)
      .eq("recovery_processed", false);

    if (cartError) throw cartError;
    if (!carts || carts.length === 0) {
      return Response.json({ processed: 0 });
    }

    let processedCount = 0;

    for (const cart of carts) {
      // ------------------------------------------------------------------
      // 2️⃣ Ensure no paid order exists
      // ------------------------------------------------------------------
      const { count: paidOrdersRaw } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("customer_uid", cart.user_id)
        .eq("payment_status", "paid");

      const paidOrders = paidOrdersRaw ?? 0;

      if (paidOrders > 0) continue;

      // ------------------------------------------------------------------
      // 3️⃣ Prevent duplicate recovery for same cart
      // ------------------------------------------------------------------
      const { count: existingRecoveryRaw } = await supabase
        .from("abandoned_cart_sessions")
        .select("*", { count: "exact", head: true })
        .eq("user_id", cart.user_id)
        .eq("last_activity", cart.created_at);

      const existingRecovery = existingRecoveryRaw ?? 0;

      if (existingRecovery > 0) continue;

      // ------------------------------------------------------------------
      // 4️⃣ Create recovery code
      // ------------------------------------------------------------------
      const code =
        `RECOVER-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

      const start = new Date();
      const end = new Date(
        Date.now() + RECOVERY_WINDOW_HOURS * 60 * 60 * 1000
      );

      const { error: promoError } = await supabase
        .from("promotions")
        .insert({
          code,
          type: "percent",
          value: RECOVERY_PERCENT,
          min_order_cents: 1000,
          per_user_limit: 1,
          max_uses: 1,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          active: true,
          channel: "abandoned_cart",
        });

      if (promoError) {
        console.error("Promo creation failed:", promoError);
        continue;
      }

      // ------------------------------------------------------------------
      // 5️⃣ Log abandoned session
      // ------------------------------------------------------------------
      const { error: sessionError } = await supabase
        .from("abandoned_cart_sessions")
        .insert({
          user_id: cart.user_id,
          email: cart.email,
          cart_value_cents: cart.total_cents,
          cart_snapshot: cart.cart_json,
          last_activity: cart.created_at,
          recovery_code: code,
          recovery_sent: true,
        });

      if (sessionError) {
        console.error("Session insert failed:", sessionError);
        continue;
      }

      // ------------------------------------------------------------------
      // 6️⃣ Mark cart processed (idempotency lock)
      // ------------------------------------------------------------------
      await supabase
        .from("pending_carts")
        .update({ recovery_processed: true })
        .eq("id", cart.id);

      processedCount++;

      // ------------------------------------------------------------------
      // 7️⃣ External email/SMS dispatch
      // ------------------------------------------------------------------
      // call external provider here
      // DO NOT block execution on failure
    }

    return Response.json({ processed: processedCount });

  } catch (err) {
    console.error("Growth orchestrator error:", err);
    return Response.json(
      { error: "Internal automation failure" },
      { status: 500 }
    );
  }
});