ALTER TABLE loyalty_ledger
ADD COLUMN IF NOT EXISTS prev_hash text,
ADD COLUMN IF NOT EXISTS row_hash text;
-- ── VERIFY LOYALTY LEDGER HASH CHAIN ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.verify_loyalty_hash_chain()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_hash text := NULL;
  v_rec RECORD;
BEGIN
  FOR v_rec IN
    SELECT *
    FROM public.loyalty_ledger
    ORDER BY created_at ASC
  LOOP
    IF v_rec.prev_hash IS DISTINCT FROM v_prev_hash THEN
      RAISE EXCEPTION
        'HASH CHAIN BROKEN at ledger id %', v_rec.id;
    END IF;

    v_prev_hash := v_rec.row_hash;
  END LOOP;

  RAISE NOTICE 'Loyalty ledger hash chain verified successfully';
END $$;