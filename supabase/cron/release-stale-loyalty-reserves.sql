SELECT cron.schedule(
  'release-stale-loyalty-reserves',   -- job name (unique)
  '*/30 * * * *',                      -- every 30 minutes
  $$
  DO $$
  DECLARE
    v_ledger_row  loyalty_ledger%ROWTYPE;
    v_session_id  text;
    v_count       integer := 0;
    v_errors      integer := 0;
  BEGIN
    FOR v_ledger_row IN
      SELECT l.*
      FROM loyalty_ledger l
      WHERE
        l.entry_type = 'checkout_reserve'
        AND l.created_at < now() - interval '2 hours'
        AND (l.metadata->>'stripe_session_id') IS NOT NULL
        -- No matching release entry
        AND NOT EXISTS (
          SELECT 1
          FROM loyalty_ledger r
          WHERE r.idempotency_key = 'release:' || (l.metadata->>'stripe_session_id')
        )
        -- Not already flipped to redeemed by the completed webhook
        AND l.entry_type != 'redeemed'
    LOOP
      v_session_id := v_ledger_row.metadata->>'stripe_session_id';

      BEGIN
        PERFORM v2_release_loyalty_reserve(
          v_session_id,
          'cron_stale_reserve_cleanup'
        );
        v_count := v_count + 1;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors + 1;
        RAISE WARNING 'Cron: failed to release loyalty reserve for ledger row %, session %: %',
          v_ledger_row.id, v_session_id, SQLERRM;
      END;
    END LOOP;

    IF v_count > 0 OR v_errors > 0 THEN
      RAISE NOTICE 'Loyalty reserve cron: released %, errors %', v_count, v_errors;
    END IF;
  END;
  $$;
  $$
);