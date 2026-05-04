
BEGIN;

ALTER TABLE public.modifier_groups
  ADD COLUMN IF NOT EXISTS description TEXT;

COMMENT ON COLUMN public.modifier_groups.description IS
  'Optional human-readable description shown in the admin modifier UI.';

COMMIT;