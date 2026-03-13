// =============================================================================
// src/features/admin/fraud/fraud.types.ts
// =============================================================================

export type FraudEventType =
  | 'suspicious_login'
  | 'rate_limit_triggered'
  | 'device_trust_mismatch'
  | 'payment_declined'
  | 'velocity_check_failed'
  | 'ip_blocked';

export interface FraudEvent {
  id: string;
  createdAt: string;
  eventType: FraudEventType;
  riskScore: number; // 0–100
  userId: string | null;
  ipAddress: string | null;
  deviceFingerprint: string | null;
  metadata: Record<string, unknown>;
  resolved: boolean;
}

export interface FraudFilters {
  minRiskScore?: number;
  eventType?: FraudEventType;
  resolved?: boolean;
  from?: string; // ISO
  limit?: number;
}
