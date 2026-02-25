SELECT cron.schedule(
  'cleanup-abandoned-checkouts',
  '0 2 * * *', -- Run at 2 AM daily
  $$
  DELETE FROM orders
  WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '24 hours';
  $$
);
