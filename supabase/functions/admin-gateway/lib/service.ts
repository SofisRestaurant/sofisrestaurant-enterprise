// PATH: supabase/functions/admin-gateway/lib/service.ts
// =============================================================================
// MIGRATED: replaced direct createClient(SERVICE_ROLE_KEY) with supabaseAdmin()
// Behavior: identical — privileged RLS-bypass client for admin-gateway actions.
// =============================================================================

import { supabaseAdmin } from '../../_shared/supabaseAdmin.ts';

export const service = supabaseAdmin();