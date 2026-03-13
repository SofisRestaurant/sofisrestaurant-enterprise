-- ============================================================
-- Migration: 20260308000005_create_tax_reporting_views.sql
-- Purpose:   Live + materialized tax reporting views for AdminTaxesPage
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- Prerequisites: ensure orders has required columns
-- ----------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_tax'
  ) THEN
    RAISE EXCEPTION 'orders.amount_tax column missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_subtotal'
  ) THEN
    RAISE EXCEPTION 'orders.amount_subtotal column missing.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'amount_total'
  ) THEN
    RAISE EXCEPTION 'orders.amount_total column missing.';
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 1. Function: tax-eligible payment states
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION is_tax_eligible_status(payment_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT payment_status IN (
    'paid',
    'partially_refunded',
    'refunded'
  );
$$;

-- ----------------------------------------------------------------
-- 2. View: admin_tax_order_breakdown
--    One row per order
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW admin_tax_order_breakdown AS
SELECT
  o.id AS order_id,
  o.created_at AS order_created_at,
  DATE(o.charge_captured_at AT TIME ZONE 'UTC') AS captured_date,
  o.charge_captured_at,
  o.status,
  o.payment_status,
  o.order_type AS fulfillment_type,
  o.currency,

  -- Gross lines
  o.amount_subtotal AS subtotal_cents,
  0::INTEGER AS discount_cents,
  o.amount_subtotal AS taxable_sales_cents,
  o.amount_tax AS tax_collected_cents,
  0::INTEGER AS tip_cents,
  COALESCE(o.amount_shipping, 0) AS delivery_fee_cents,
  0::INTEGER AS service_fee_cents,
  o.amount_total AS gross_total_cents,

  -- Refund lines
  COALESCE(o.refunded_amount_cents, 0) AS refunded_amount_cents,
  CASE
    WHEN o.amount_total > 0 THEN
      ROUND(
        o.amount_tax::NUMERIC
        * (COALESCE(o.refunded_amount_cents, 0)::NUMERIC / o.amount_total::NUMERIC)
      )::INTEGER
    ELSE 0
  END AS refunded_tax_estimate_cents,

  -- Net lines
  (o.amount_total - COALESCE(o.refunded_amount_cents, 0)) AS net_total_cents,
  (
    o.amount_tax - CASE
      WHEN o.amount_total > 0 THEN
        ROUND(
          o.amount_tax::NUMERIC
          * (COALESCE(o.refunded_amount_cents, 0)::NUMERIC / o.amount_total::NUMERIC)
        )::INTEGER
      ELSE 0
    END
  ) AS net_tax_cents,

  -- Dispute flag
  COALESCE(o.dispute_status, 'none') AS dispute_status,
  (
    COALESCE(o.dispute_status, 'none')
      NOT IN ('none', 'won', 'lost', 'charge_refunded')
  ) AS is_disputed,

  -- Payment details
  opd.card_brand,
  opd.funding AS card_funding,
  COALESCE(opd.stripe_fee_cents, 0) AS stripe_fee_cents,

  -- Identifiers
  o.stripe_payment_intent_id,
  o.stripe_charge_id

FROM orders o
LEFT JOIN order_payment_details opd
  ON opd.order_id = o.id
WHERE is_tax_eligible_status(o.payment_status::TEXT)
  AND o.charge_captured_at IS NOT NULL;

-- ----------------------------------------------------------------
-- 3. View: admin_tax_daily_summary
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW admin_tax_daily_summary AS
SELECT
  captured_date AS report_date,
  currency,

  COUNT(*) AS orders_count,
  COUNT(*) FILTER (WHERE is_disputed) AS disputed_orders_count,
  COUNT(*) FILTER (WHERE refunded_amount_cents > 0) AS refunded_orders_count,

  SUM(subtotal_cents) AS gross_sales_cents,
  SUM(discount_cents) AS discount_cents,
  SUM(taxable_sales_cents) AS taxable_sales_cents,
  SUM(tax_collected_cents) AS tax_collected_cents,
  SUM(tip_cents) AS tip_cents,
  SUM(delivery_fee_cents) AS delivery_fee_cents,
  SUM(service_fee_cents) AS service_fee_cents,
  SUM(gross_total_cents) AS gross_total_cents,

  SUM(refunded_amount_cents) AS refunded_sales_cents,
  SUM(refunded_tax_estimate_cents) AS refunded_tax_cents,

  SUM(net_total_cents) AS net_sales_cents,
  SUM(net_tax_cents) AS net_tax_cents,

  SUM(stripe_fee_cents) AS total_stripe_fees_cents

FROM admin_tax_order_breakdown
GROUP BY captured_date, currency
ORDER BY captured_date DESC;

-- ----------------------------------------------------------------
-- 4. View: admin_tax_monthly_summary
-- ----------------------------------------------------------------

CREATE OR REPLACE VIEW admin_tax_monthly_summary AS
SELECT
  DATE_TRUNC('month', d.report_date)::DATE AS report_month,
  TO_CHAR(d.report_date, 'YYYY-MM') AS report_month_label,
  d.currency,

  COUNT(DISTINCT d.report_date) AS active_days,
  SUM(d.orders_count) AS orders_count,
  SUM(d.disputed_orders_count) AS disputed_orders_count,
  SUM(d.refunded_orders_count) AS refunded_orders_count,

  SUM(d.gross_sales_cents) AS gross_sales_cents,
  SUM(d.discount_cents) AS discount_cents,
  SUM(d.taxable_sales_cents) AS taxable_sales_cents,
  SUM(d.tax_collected_cents) AS tax_collected_cents,
  SUM(d.tip_cents) AS tip_cents,
  SUM(d.delivery_fee_cents) AS delivery_fee_cents,
  SUM(d.service_fee_cents) AS service_fee_cents,
  SUM(d.gross_total_cents) AS gross_total_cents,

  SUM(d.refunded_sales_cents) AS refunded_sales_cents,
  SUM(d.refunded_tax_cents) AS refunded_tax_cents,

  SUM(d.net_sales_cents) AS net_sales_cents,
  SUM(d.net_tax_cents) AS net_tax_cents,

  SUM(d.total_stripe_fees_cents) AS total_stripe_fees_cents,

  CASE
    WHEN SUM(d.taxable_sales_cents) > 0 THEN
      ROUND(
        (SUM(d.tax_collected_cents)::NUMERIC / SUM(d.taxable_sales_cents)::NUMERIC) * 100,
        4
      )
    ELSE 0
  END AS effective_tax_rate_pct

FROM admin_tax_daily_summary d
GROUP BY
  DATE_TRUNC('month', d.report_date)::DATE,
  TO_CHAR(d.report_date, 'YYYY-MM'),
  d.currency
ORDER BY report_month DESC;

-- ----------------------------------------------------------------
-- 5. Materialized view
-- ----------------------------------------------------------------

CREATE MATERIALIZED VIEW IF NOT EXISTS admin_tax_daily_summary_mat AS
SELECT * FROM admin_tax_daily_summary;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_daily_mat_date_currency
  ON admin_tax_daily_summary_mat (report_date, currency);

CREATE INDEX IF NOT EXISTS idx_tax_daily_mat_date
  ON admin_tax_daily_summary_mat (report_date DESC);

-- ----------------------------------------------------------------
-- 6. Refresh function
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION refresh_tax_daily_summary()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY admin_tax_daily_summary_mat;
$$;

-- ----------------------------------------------------------------
-- 7. Grants
-- ----------------------------------------------------------------

REVOKE ALL ON admin_tax_order_breakdown   FROM PUBLIC;
REVOKE ALL ON admin_tax_daily_summary     FROM PUBLIC;
REVOKE ALL ON admin_tax_monthly_summary   FROM PUBLIC;
REVOKE ALL ON admin_tax_daily_summary_mat FROM PUBLIC;

GRANT SELECT ON admin_tax_order_breakdown   TO service_role;
GRANT SELECT ON admin_tax_daily_summary     TO service_role;
GRANT SELECT ON admin_tax_monthly_summary   TO service_role;
GRANT SELECT ON admin_tax_daily_summary_mat TO service_role;

COMMIT;