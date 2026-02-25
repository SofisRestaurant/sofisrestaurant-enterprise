-- =============================================================================
-- LOYALTY V2 — FILE 4: TIERS + VIEWS
-- =============================================================================
-- Tier resolution function (single authoritative definition for all RPCs).
-- Operational views for admin dashboard, leaderboard, and reconciliation.
-- =============================================================================


-- =============================================================================
-- Tier resolution
-- =============================================================================
-- IMMUTABLE — result depends only on the integer input, not on current data.
-- All RPCs call this function; no TypeScript code computes tiers.
-- Must stay in sync with src/domain/loyalty/tiers.ts.

CREATE OR REPLACE FUNCTION v2_resolve_tier(p_lifetime_earned integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_lifetime_earned >= 5000 THEN 'platinum'
    WHEN p_lifetime_earned >= 2000 THEN 'gold'
    WHEN p_lifetime_earned >= 500  THEN 'silver'
    ELSE                                'bronze'
  END;
$$;

COMMENT ON FUNCTION v2_resolve_tier IS
  'Authoritative tier resolver for v2 ledger. IMMUTABLE — safe to index. '
  'Mirror of src/domain/loyalty/tiers.ts thresholds: 500/2000/5000.';


-- =============================================================================
-- Points to next tier
-- =============================================================================

CREATE OR REPLACE FUNCTION v2_points_to_next_tier(p_lifetime_earned integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_lifetime_earned >= 5000 THEN 0           -- platinum: already max
    WHEN p_lifetime_earned >= 2000 THEN 5000 - p_lifetime_earned
    WHEN p_lifetime_earned >= 500  THEN 2000 - p_lifetime_earned
    ELSE                                500  - p_lifetime_earned
  END;
$$;


-- =============================================================================
-- v2_account_summary — full account state for API responses
-- =============================================================================
-- Used by verify-loyalty-qr and any admin view.
-- Single join replaces the scattered selects across the old Edge Functions.

CREATE OR REPLACE VIEW v2_account_summary AS
SELECT
  la.id                                      AS account_id,
  la.user_id,
  p.full_name,
  p.loyalty_public_id,
  la.balance,
  la.lifetime_earned,
  la.tier,
  la.streak,
  la.last_activity,
  la.status,
  v2_points_to_next_tier(la.lifetime_earned) AS points_to_next_tier,
  (
    SELECT COUNT(*)
    FROM loyalty_ledger ll
    WHERE ll.account_id = la.id
  )                                          AS transaction_count,
  (
    SELECT created_at
    FROM loyalty_ledger ll
    WHERE ll.account_id = la.id
    ORDER BY created_at DESC
    LIMIT 1
  )                                          AS last_transaction_at
FROM loyalty_accounts la
JOIN profiles p ON p.id = la.user_id
WHERE la.status = 'active';

COMMENT ON VIEW v2_account_summary IS
  'Full account state for API responses. Replaces scattered profile selects.';


-- =============================================================================
-- v2_leaderboard — top customers by balance and lifetime
-- =============================================================================

CREATE OR REPLACE VIEW v2_leaderboard AS
SELECT
  la.user_id,
  p.full_name,
  la.balance,
  la.lifetime_earned,
  la.tier,
  la.streak,
  la.last_activity,
  v2_points_to_next_tier(la.lifetime_earned) AS points_to_next_tier,
  RANK() OVER (ORDER BY la.balance DESC)     AS balance_rank,
  RANK() OVER (ORDER BY la.lifetime_earned DESC) AS lifetime_rank
FROM loyalty_accounts la
JOIN profiles p ON p.id = la.user_id
WHERE la.status = 'active'
  AND la.balance > 0;

COMMENT ON VIEW v2_leaderboard IS
  'Leaderboard for admin dashboard. Replaces loyalty_leaderboard v1 view.';


-- =============================================================================
-- v2_ledger_detail — full forensic view with account context
-- =============================================================================
-- Used for admin dispute resolution and audit export.

CREATE OR REPLACE VIEW v2_ledger_detail AS
SELECT
  ll.id,
  ll.account_id,
  la.user_id,
  p.full_name,
  p.loyalty_public_id,
  ll.amount,
  ll.balance_after,
  ll.entry_type,
  ll.source,
  ll.reference_id,
  ll.admin_id,
  admin_p.full_name                     AS admin_name,
  ll.idempotency_key,
  ll.tier_at_time,
  ll.streak_at_time,
  ll.metadata,
  ll.created_at
FROM loyalty_ledger ll
JOIN loyalty_accounts la ON la.id = ll.account_id
JOIN profiles p ON p.id = la.user_id
LEFT JOIN profiles admin_p ON admin_p.id = ll.admin_id
ORDER BY ll.created_at DESC;

COMMENT ON VIEW v2_ledger_detail IS
  'Full forensic view for admin audit. Joins account, profile, and admin context. '
  'Do not use for high-frequency queries — use loyalty_ledger directly with account_id.';