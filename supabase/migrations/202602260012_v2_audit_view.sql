CREATE OR REPLACE VIEW v2_loyalty_audit AS
SELECT
  la.user_id,
  ll.amount,
  ll.balance_after,
  ll.entry_type,
  ll.source,
  ll.admin_id,
  ll.idempotency_key,
  ll.tier_at_time,
  ll.created_at
FROM loyalty_ledger ll
JOIN loyalty_accounts la ON la.id = ll.account_id;