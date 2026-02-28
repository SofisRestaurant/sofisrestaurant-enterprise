import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

Deno.serve(async () => {

  const [
    revenueRes,
    topItemsRes,
    loyaltyRes,
    liabilityRes,
    riskRes,
    fraudRes,
    heatmapRes,
    executiveRes
  ] = await Promise.all([
    supabase.from("admin_revenue_summary").select("*").limit(30),
    supabase.from("admin_item_consumption").select("*").limit(10),
    supabase.from("admin_loyalty_summary").select("*").single(),
    supabase.from("admin_loyalty_liability").select("*").single(),
    supabase.from("admin_risk_snapshot").select("*").single(),
    supabase.from("admin_fraud_snapshot").select("*").single(),
    supabase.from("admin_hourly_heatmap").select("*"),
    supabase.from("admin_executive_snapshot").select("*").single()
  ])

  return new Response(
    JSON.stringify({
      revenue: revenueRes.data,
      topItems: topItemsRes.data,
      loyalty: loyaltyRes.data,
      liability: liabilityRes.data,
      risk: riskRes.data,
      fraud: fraudRes.data,
      heatmap: heatmapRes.data,
      executive: executiveRes.data
    }),
    {
      headers: { "Content-Type": "application/json" }
    }
  )
})