-- =============================================================================
-- LOYALTY V2 — FILE 4: TIERS + SAFE VIEWS
-- =============================================================================

-- =============================================================================
-- v2_account_summary — full account state for API responses
-- =============================================================================

CREATE OR REPLACE VIEW v2_account_summary AS
SELECT
  la.id                       AS account_id,
  la.user_id,
  p.full_name,
  la.balance,
  la.lifetime_earned,
  la.tier,
  la.streak,
  la.last_activity,
  la.updated_at
FROM loyalty_accounts la
JOIN profiles p ON p.id = la.user_id;


-- =============================================================================
-- reconcile_v2_accounts — integrity verification view
-- =============================================================================

CREATE OR REPLACE VIEW reconcile_v2_accounts AS
SELECT
  la.user_id,
  la.balance AS v2_balance,
  COALESCE(SUM(ll.amount), 0) AS ledger_sum,
  (la.balance - COALESCE(SUM(ll.amount),0)) AS drift
FROM loyalty_accounts la
LEFT JOIN loyalty_ledger ll
  ON ll.account_id = la.id
GROUP BY la.user_id, la.balance;