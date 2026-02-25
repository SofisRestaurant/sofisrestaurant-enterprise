SELECT cron.schedule(
  'daily-sales-rollup',
  '0 1 * * *', -- Run at 1 AM daily
  $$
  INSERT INTO analytics.daily_sales (date, total_orders, total_revenue)
  SELECT
    DATE(created_at),
    COUNT(*),
    SUM(amount)
  FROM orders
  WHERE status = 'paid'
  AND DATE(created_at) = CURRENT_DATE - 1
  GROUP BY DATE(created_at)
  ON CONFLICT (date) DO UPDATE
  SET total_orders = EXCLUDED.total_orders,
      total_revenue = EXCLUDED.total_revenue;
  $$
);
