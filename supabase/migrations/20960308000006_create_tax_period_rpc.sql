-- ============================================================
-- Migration: 20260308000006_create_tax_period_rpc.sql
-- Purpose:   PostgREST-callable RPCs for the tax module.
--            admin_get_tax_summary    → summary cards + period rows
--            admin_get_tax_orders     → paginated order breakdown
--            admin_get_tax_export     → full date-range export rows
--            admin_get_tax_ytd        → year-to-date totals
-- Author:    Auto-generated 2026
-- ============================================================

BEGIN;

-- ----------------------------------------------------------------
-- 1. Type: tax summary response
-- ----------------------------------------------------------------

DROP TYPE IF EXISTS tax_summary_result CASCADE;
CREATE TYPE tax_summary_result AS (
  -- Period meta
  date_from               DATE,
  date_to                 DATE,
  currency                CHAR(3),
  period_days             INTEGER,

  -- Summary card values
  orders_count            BIGINT,
  disputed_orders_count   BIGINT,
  refunded_orders_count   BIGINT,

  gross_sales_cents       BIGINT,
  discount_cents          BIGINT,
  taxable_sales_cents     BIGINT,
  tax_collected_cents     BIGINT,
  tip_cents               BIGINT,
  delivery_fee_cents      BIGINT,
  service_fee_cents       BIGINT,
  gross_total_cents       BIGINT,

  refunded_sales_cents    BIGINT,
  refunded_tax_cents      BIGINT,

  net_sales_cents         BIGINT,
  net_tax_cents           BIGINT,
  total_stripe_fees_cents BIGINT,

  effective_tax_rate_pct  NUMERIC,

  -- Average per order
  avg_order_cents         NUMERIC,
  avg_tax_per_order_cents NUMERIC
);

-- ----------------------------------------------------------------
-- 2. RPC: admin_get_tax_summary
--    Returns a single summary row for any date range.
--    Called by useTaxReports hook for the summary cards.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_tax_summary(
  date_from   DATE        DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  date_to     DATE        DEFAULT CURRENT_DATE,
  p_currency  CHAR(3)     DEFAULT 'usd',
  use_cache   BOOLEAN     DEFAULT TRUE  -- use mat view when possible
)
RETURNS tax_summary_result
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result tax_summary_result;
BEGIN
  -- Permission guard: only admins
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'admin_get_tax_summary: insufficient privileges';
  END IF;

  -- Input validation
  IF date_to < date_from THEN
    RAISE EXCEPTION 'date_to must be >= date_from';
  END IF;
  IF (date_to - date_from) > 366 THEN
    RAISE EXCEPTION 'Date range cannot exceed 366 days. Use export for longer ranges.';
  END IF;

  result.date_from   := date_from;
  result.date_to     := date_to;
  result.currency    := LOWER(p_currency)::CHAR(3);
  result.period_days := (date_to - date_from) + 1;

  -- Aggregate from mat view if cache allowed and range is historical
  IF use_cache AND date_to < CURRENT_DATE THEN
    SELECT
      COALESCE(SUM(orders_count), 0),
      COALESCE(SUM(disputed_orders_count), 0),
      COALESCE(SUM(refunded_orders_count), 0),
      COALESCE(SUM(gross_sales_cents), 0),
      COALESCE(SUM(discount_cents), 0),
      COALESCE(SUM(taxable_sales_cents), 0),
      COALESCE(SUM(tax_collected_cents), 0),
      COALESCE(SUM(tip_cents), 0),
      COALESCE(SUM(delivery_fee_cents), 0),
      COALESCE(SUM(service_fee_cents), 0),
      COALESCE(SUM(gross_total_cents), 0),
      COALESCE(SUM(refunded_sales_cents), 0),
      COALESCE(SUM(refunded_tax_cents), 0),
      COALESCE(SUM(net_sales_cents), 0),
      COALESCE(SUM(net_tax_cents), 0),
      COALESCE(SUM(total_stripe_fees_cents), 0)
    INTO
      result.orders_count,
      result.disputed_orders_count,
      result.refunded_orders_count,
      result.gross_sales_cents,
      result.discount_cents,
      result.taxable_sales_cents,
      result.tax_collected_cents,
      result.tip_cents,
      result.delivery_fee_cents,
      result.service_fee_cents,
      result.gross_total_cents,
      result.refunded_sales_cents,
      result.refunded_tax_cents,
      result.net_sales_cents,
      result.net_tax_cents,
      result.total_stripe_fees_cents
    FROM admin_tax_daily_summary_mat
    WHERE report_date BETWEEN date_from AND date_to
      AND currency = result.currency;
  ELSE
    -- Live query for today's data or when cache disabled
    SELECT
      COALESCE(SUM(orders_count), 0),
      COALESCE(SUM(disputed_orders_count), 0),
      COALESCE(SUM(refunded_orders_count), 0),
      COALESCE(SUM(gross_sales_cents), 0),
      COALESCE(SUM(discount_cents), 0),
      COALESCE(SUM(taxable_sales_cents), 0),
      COALESCE(SUM(tax_collected_cents), 0),
      COALESCE(SUM(tip_cents), 0),
      COALESCE(SUM(delivery_fee_cents), 0),
      COALESCE(SUM(service_fee_cents), 0),
      COALESCE(SUM(gross_total_cents), 0),
      COALESCE(SUM(refunded_sales_cents), 0),
      COALESCE(SUM(refunded_tax_cents), 0),
      COALESCE(SUM(net_sales_cents), 0),
      COALESCE(SUM(net_tax_cents), 0),
      COALESCE(SUM(total_stripe_fees_cents), 0)
    INTO
      result.orders_count,
      result.disputed_orders_count,
      result.refunded_orders_count,
      result.gross_sales_cents,
      result.discount_cents,
      result.taxable_sales_cents,
      result.tax_collected_cents,
      result.tip_cents,
      result.delivery_fee_cents,
      result.service_fee_cents,
      result.gross_total_cents,
      result.refunded_sales_cents,
      result.refunded_tax_cents,
      result.net_sales_cents,
      result.net_tax_cents,
      result.total_stripe_fees_cents
    FROM admin_tax_daily_summary
    WHERE report_date BETWEEN date_from AND date_to
      AND currency = result.currency;
  END IF;

  -- Derived metrics
  result.effective_tax_rate_pct := CASE
    WHEN result.taxable_sales_cents > 0 THEN
      ROUND(
        (result.tax_collected_cents::NUMERIC / result.taxable_sales_cents::NUMERIC) * 100,
        4
      )
    ELSE 0
  END;

  result.avg_order_cents := CASE
    WHEN result.orders_count > 0 THEN
      ROUND(result.gross_total_cents::NUMERIC / result.orders_count::NUMERIC, 2)
    ELSE 0
  END;

  result.avg_tax_per_order_cents := CASE
    WHEN result.orders_count > 0 THEN
      ROUND(result.tax_collected_cents::NUMERIC / result.orders_count::NUMERIC, 2)
    ELSE 0
  END;

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------
-- 3. RPC: admin_get_tax_daily_rows
--    Returns day-by-day rows for the period table.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_tax_daily_rows(
  date_from   DATE    DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  date_to     DATE    DEFAULT CURRENT_DATE,
  p_currency  CHAR(3) DEFAULT 'usd',
  use_cache   BOOLEAN DEFAULT TRUE
)
RETURNS SETOF admin_tax_daily_summary
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'admin_get_tax_daily_rows: insufficient privileges';
  END IF;

  IF use_cache AND date_to < CURRENT_DATE THEN
    RETURN QUERY
      SELECT *
      FROM admin_tax_daily_summary_mat
      WHERE report_date BETWEEN date_from AND date_to
        AND currency = LOWER(p_currency)
      ORDER BY report_date DESC;
  ELSE
    RETURN QUERY
      SELECT *
      FROM admin_tax_daily_summary
      WHERE report_date BETWEEN date_from AND date_to
        AND currency = LOWER(p_currency)
      ORDER BY report_date DESC;
  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- 4. RPC: admin_get_tax_monthly_rows
--    Returns month-by-month rows for period dropdowns.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_tax_monthly_rows(
  month_from  DATE    DEFAULT DATE_TRUNC('year', CURRENT_DATE)::DATE,
  month_to    DATE    DEFAULT CURRENT_DATE,
  p_currency  CHAR(3) DEFAULT 'usd'
)
RETURNS SETOF admin_tax_monthly_summary
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'admin_get_tax_monthly_rows: insufficient privileges';
  END IF;

  RETURN QUERY
    SELECT *
    FROM admin_tax_monthly_summary
    WHERE report_month BETWEEN DATE_TRUNC('month', month_from)::DATE
                           AND DATE_TRUNC('month', month_to)::DATE
      AND currency = LOWER(p_currency)
    ORDER BY report_month DESC;
END;
$$;

-- ----------------------------------------------------------------
-- 5. RPC: admin_get_tax_orders
--    Paginated order-level breakdown for the tax detail table.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_tax_orders(
  date_from       DATE    DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  date_to         DATE    DEFAULT CURRENT_DATE,
  p_currency      CHAR(3) DEFAULT 'usd',
  fulfillment_filter TEXT  DEFAULT NULL,   -- 'delivery', 'pickup', etc.
  disputed_only   BOOLEAN DEFAULT FALSE,
  refunded_only   BOOLEAN DEFAULT FALSE,
  page_size       INTEGER DEFAULT 50,
  page_offset     INTEGER DEFAULT 0
)
RETURNS TABLE (
  order_id                UUID,
  captured_date           DATE,
  charge_captured_at      TIMESTAMPTZ,
  payment_status          TEXT,
  fulfillment_type        TEXT,
  subtotal_cents          INTEGER,
  discount_cents          INTEGER,
  taxable_sales_cents     INTEGER,
  tax_collected_cents     INTEGER,
  tip_cents               INTEGER,
  gross_total_cents       INTEGER,
  refunded_amount_cents   INTEGER,
  refunded_tax_estimate_cents INTEGER,
  net_total_cents         INTEGER,
  net_tax_cents           INTEGER,
  dispute_status          TEXT,
  is_disputed             BOOLEAN,
  card_brand              TEXT,
  stripe_payment_intent_id TEXT,
  total_rows              BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'admin_get_tax_orders: insufficient privileges';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      b.*,
      COUNT(*) OVER () AS total_rows
    FROM admin_tax_order_breakdown b
    WHERE b.captured_date BETWEEN date_from AND date_to
      AND b.currency = LOWER(p_currency)
      AND (fulfillment_filter IS NULL OR b.fulfillment_type = fulfillment_filter)
      AND (NOT disputed_only  OR b.is_disputed)
      AND (NOT refunded_only  OR b.refunded_amount_cents > 0)
  )
  SELECT
    f.order_id,
    f.captured_date,
    f.charge_captured_at,
    f.payment_status::TEXT,
    f.fulfillment_type::TEXT,
    f.subtotal_cents,
    f.discount_cents,
    f.taxable_sales_cents,
    f.tax_collected_cents,
    f.tip_cents,
    f.gross_total_cents,
    f.refunded_amount_cents,
    f.refunded_tax_estimate_cents,
    f.net_total_cents,
    f.net_tax_cents,
    f.dispute_status::TEXT,
    f.is_disputed,
    f.card_brand,
    f.stripe_payment_intent_id,
    f.total_rows
  FROM filtered f
  ORDER BY f.charge_captured_at DESC
  LIMIT page_size
  OFFSET page_offset;
END;
$$;

-- ----------------------------------------------------------------
-- 6. RPC: admin_get_tax_export
--    Returns full CSV-ready export for any date range.
--    No pagination — use for file downloads only.
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_tax_export(
  date_from   DATE    DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  date_to     DATE    DEFAULT CURRENT_DATE,
  p_currency  CHAR(3) DEFAULT 'usd',
  granularity TEXT    DEFAULT 'daily'   -- 'daily' | 'monthly' | 'orders'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  row_count INTEGER;
BEGIN
  IF (SELECT role FROM profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'admin_get_tax_export: insufficient privileges';
  END IF;

  IF granularity = 'daily' THEN
    SELECT
      jsonb_build_object(
        'granularity', 'daily',
        'date_from',   date_from,
        'date_to',     date_to,
        'currency',    p_currency,
        'rows', jsonb_agg(
          jsonb_build_object(
            'date',                  report_date,
            'orders_count',          orders_count,
            'gross_sales_cents',     gross_sales_cents,
            'discount_cents',        discount_cents,
            'taxable_sales_cents',   taxable_sales_cents,
            'tax_collected_cents',   tax_collected_cents,
            'refunded_sales_cents',  refunded_sales_cents,
            'refunded_tax_cents',    refunded_tax_cents,
            'net_sales_cents',       net_sales_cents,
            'net_tax_cents',         net_tax_cents,
            'stripe_fees_cents',     total_stripe_fees_cents
          ) ORDER BY report_date ASC
        )
      )
    INTO result
    FROM admin_tax_daily_summary
    WHERE report_date BETWEEN date_from AND date_to
      AND currency = LOWER(p_currency);

  ELSIF granularity = 'monthly' THEN
    SELECT
      jsonb_build_object(
        'granularity', 'monthly',
        'date_from',   date_from,
        'date_to',     date_to,
        'currency',    p_currency,
        'rows', jsonb_agg(
          jsonb_build_object(
            'month',                 report_month_label,
            'orders_count',          orders_count,
            'gross_sales_cents',     gross_sales_cents,
            'discount_cents',        discount_cents,
            'taxable_sales_cents',   taxable_sales_cents,
            'tax_collected_cents',   tax_collected_cents,
            'refunded_sales_cents',  refunded_sales_cents,
            'refunded_tax_cents',    refunded_tax_cents,
            'net_sales_cents',       net_sales_cents,
            'net_tax_cents',         net_tax_cents,
            'effective_tax_rate_pct', effective_tax_rate_pct
          ) ORDER BY report_month ASC
        )
      )
    INTO result
    FROM admin_tax_monthly_summary
    WHERE report_month BETWEEN DATE_TRUNC('month', date_from)::DATE
                           AND DATE_TRUNC('month', date_to)::DATE
      AND currency = LOWER(p_currency);

  ELSIF granularity = 'orders' THEN
    SELECT
      jsonb_build_object(
        'granularity', 'orders',
        'date_from',   date_from,
        'date_to',     date_to,
        'currency',    p_currency,
        'rows', jsonb_agg(
          jsonb_build_object(
            'order_id',              order_id,
            'date',                  captured_date,
            'subtotal_cents',        subtotal_cents,
            'discount_cents',        discount_cents,
            'taxable_sales_cents',   taxable_sales_cents,
            'tax_collected_cents',   tax_collected_cents,
            'refunded_amount_cents', refunded_amount_cents,
            'refunded_tax_estimate_cents', refunded_tax_estimate_cents,
            'net_tax_cents',         net_tax_cents,
            'dispute_status',        dispute_status,
            'payment_intent_id',     stripe_payment_intent_id
          ) ORDER BY charge_captured_at ASC
        )
      )
    INTO result
    FROM admin_tax_order_breakdown
    WHERE captured_date BETWEEN date_from AND date_to
      AND currency = LOWER(p_currency);
  ELSE
    RAISE EXCEPTION 'granularity must be daily, monthly, or orders';
  END IF;

  -- Inject generated timestamp
  result := result || jsonb_build_object(
    'generated_at', NOW(),
    'generated_by', auth.uid()
  );

  RETURN result;
END;
$$;

-- ----------------------------------------------------------------
-- 7. RPC: admin_get_tax_ytd
--    Quick year-to-date summary (used in top-level dashboard card).
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_get_tax_ytd(
  p_year      INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  p_currency  CHAR(3) DEFAULT 'usd'
)
RETURNS tax_summary_result
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM admin_get_tax_summary(
    date_from  := MAKE_DATE(p_year, 1, 1),
    date_to    := LEAST(CURRENT_DATE, MAKE_DATE(p_year, 12, 31)),
    p_currency := p_currency,
    use_cache  := TRUE
  );
$$;

-- ----------------------------------------------------------------
-- 8. Grant RPCs to service_role (PostgREST callable)
-- ----------------------------------------------------------------

GRANT EXECUTE ON FUNCTION admin_get_tax_summary         TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_tax_daily_rows      TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_tax_monthly_rows    TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_tax_orders          TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_tax_export          TO service_role;
GRANT EXECUTE ON FUNCTION admin_get_tax_ytd             TO service_role;
GRANT EXECUTE ON FUNCTION refresh_tax_daily_summary     TO service_role;

COMMIT;