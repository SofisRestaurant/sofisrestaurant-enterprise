import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

Deno.serve(async () => {

  const today = new Date()
  today.setHours(0,0,0,0)

  // Total revenue today
  const { data: revenueRows } = await supabase
    .from("orders")
    .select("amount_total")
    .gte("created_at", today.toISOString())
    .eq("payment_status", "paid")

  const revenue = revenueRows?.reduce(
    (sum, o) => sum + o.amount_total,
    0
  ) ?? 0

  // Disputes
  const { count: disputes } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("payment_status", "disputed")

  // Failed payments
  const { count: failed } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("payment_status", "failed")

  return new Response(
    JSON.stringify({
      revenue_today: revenue,
      disputes,
      failed,
    }),
    {
      headers: { "Content-Type": "application/json" },
    }
  )
})