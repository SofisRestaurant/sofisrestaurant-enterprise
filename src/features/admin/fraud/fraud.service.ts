// =============================================================================
// src/features/admin/fraud/fraud.service.ts
// =============================================================================
// Fraud log data access layer
//
// Backed by table: public.fraud_logs
// Schema (from database.types):
//   id            text (PK)
//   created_at    timestamptz | null
//   frontend_total int | null
//   server_total   int | null
//   stripe_total   int
//   reason         text
//   metadata       jsonb | null
//   user_id        text | null
//
// We adapt this to FraudEvent/FraudFilters by:
//   • Deriving riskScore from numeric mismatches
//   • Using `reason` (and/or metadata) as eventType
//   • Reading ip/device/resolved from metadata JSON
//   • Writing `resolved` back into metadata
// =============================================================================

import type { Json, Tables } from '@/types/supabase'
import { supabase } from '@/lib/supabase/supabaseClient';
import type { FraudEvent, FraudFilters } from './fraud.types';

type FraudLogRow = Tables<'fraud_logs'>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function assertNoError(
  error: { message: string } | null,
  context: string,
): asserts error is null {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

/**
 * Compute a 0–100 risk score based on mismatch between totals.
 * 0   → no mismatch
 * 100 → extreme mismatch
 */
function computeRiskScore(row: FraudLogRow): number {
  const stripe   = row.stripe_total ?? 0;
  const server   = row.server_total ?? stripe;
  const frontend = row.frontend_total ?? server;

  const diffStripeServer   = Math.abs(stripe - server);
  const diffServerFrontend = Math.abs(server - frontend);
  const diffStripeFrontend = Math.abs(stripe - frontend);

  const maxDiff = Math.max(diffStripeServer, diffServerFrontend, diffStripeFrontend);

  if (stripe <= 0 && server <= 0 && frontend <= 0) {
    return 0;
  }

  const denom = Math.max(stripe, server, frontend, 1);
  const ratio = Math.min(1, maxDiff / denom);

  return Math.round(ratio * 100);
}

/**
 * Map a DB row into FraudEvent used by the UI.
 * We treat metadata as an extension bag for ip/device/resolved/etc.
 */
function mapRowToFraudEvent(row: FraudLogRow): FraudEvent {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;

  const ipAddress =
    (meta.ipAddress as string | undefined) ??
    (meta.ip_address as string | undefined) ??
    null;

  const deviceFingerprint =
    (meta.deviceFingerprint as string | undefined) ??
    (meta.device_fingerprint as string | undefined) ??
    null;

  const resolved = (meta.resolved as boolean | undefined) ?? false;

  const eventType =
    (meta.eventType as FraudEvent['eventType'] | undefined) ??
    (row.reason as FraudEvent['eventType']) ??
    ('unknown' as FraudEvent['eventType']);

  return {
    id: row.id,
    createdAt: row.created_at ?? '',
    eventType,
    riskScore: computeRiskScore(row),
    userId: row.user_id ?? null,
    ipAddress,
    deviceFingerprint,
    metadata: meta,
    resolved,
  };
}

// ── Queries ──────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 100;

/**
 * Fetch fraud events with optional filters.
 *
 * NOTE:
 *   • `minRiskScore` and `resolved` are filtered in memory
 *   • `eventType` is matched against `reason` and/or metadata.eventType
 */
export async function fetchFraudEvents(filters: FraudFilters): Promise<FraudEvent[]> {
  const limit = filters.limit ?? DEFAULT_LIMIT;

  let query = supabase
    .from('fraud_logs')
    .select('id, created_at, reason, stripe_total, server_total, frontend_total, metadata, user_id')
    .order('created_at', { ascending: false });

  if (filters.from) {
    query = query.gte('created_at', filters.from);
  }

  // Event type maps to "reason" or metadata.eventType.
  if (filters.eventType) {
    query = query.eq('reason', filters.eventType);
  }

  // We can't filter by risk_score / resolved in SQL (no such columns),
  // so we fetch a bit extra then post-filter.
  query = query.limit(limit * 2);

  const { data, error } = await query;
  assertNoError(error, 'Failed to fetch fraud logs');

  const rows: FraudLogRow[] = data ?? [];
  let events = rows.map(mapRowToFraudEvent);

  if (filters.minRiskScore !== undefined) {
    events = events.filter((e) => e.riskScore >= filters.minRiskScore!);
  }

  if (filters.resolved !== undefined) {
    events = events.filter((e) => e.resolved === filters.resolved);
  }

  if (filters.eventType) {
    events = events.filter((e) => e.eventType === filters.eventType);
  }

  return events.slice(0, limit);
}

/**
 * Marks a fraud event as resolved by setting metadata.resolved = true.
 * Also stamps metadata.resolved_at with an ISO timestamp.
 */
export async function resolveFraudEvent(id: string): Promise<void> {
  // 1) Get existing metadata
  const { data, error } = await supabase
    .from('fraud_logs')
    .select('metadata')
    .eq('id', id)
    .single();

  assertNoError(error, 'Failed to fetch fraud event for resolve');

  const currentMeta = (data?.metadata ?? {}) as Record<string, unknown>;

  const updatedMeta: Record<string, unknown> = {
    ...currentMeta,
    resolved: true,
    resolved_at: new Date().toISOString(),
  };

  // 2) Update metadata
  const { error: updateError } = await supabase
    .from('fraud_logs')
    .update({ metadata: updatedMeta as unknown as Json })
    .eq('id', id);

  assertNoError(updateError, 'Failed to resolve fraud event');
}