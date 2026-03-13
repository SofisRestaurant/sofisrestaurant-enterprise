// =============================================================================
// src/modules/orders/components/OrderDisputePanel.tsx
// =============================================================================

import React from 'react';
import {
  AlertTriangle, Clock, DollarSign, FileText,
  CheckCircle2, XCircle, ShieldAlert, Timer,
  ExternalLink, Info,
} from 'lucide-react';

import type { OrderDisputeSummary } from '../types/order-dispute.types';
import { OrderTimeline } from './OrderTimeline';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date | null): string {
  if (!d) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(d);
}

function daysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  if (days > 0)   return `${days} days left`;
  if (days === -1) return 'Overdue by 1 day';
  return `Overdue by ${Math.abs(days)} days`;
}

// ---------------------------------------------------------------------------
// Urgency banner
// ---------------------------------------------------------------------------

function UrgencyBanner({ urgency, daysLeft }: {
  urgency:  OrderDisputeSummary['disputeUrgency'];
  daysLeft: number | null;
}) {
  if (urgency === 'closed') return null;

  const cfg: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    overdue:  { bg: 'bg-rose-900/30',   border: 'border-rose-500/50',   text: 'text-rose-300',   icon: <XCircle   size={15} /> },
    critical: { bg: 'bg-rose-500/15',   border: 'border-rose-500/40',   text: 'text-rose-300',   icon: <Timer     size={15} /> },
    warning:  { bg: 'bg-amber-500/15',  border: 'border-amber-500/35',  text: 'text-amber-300',  icon: <AlertTriangle size={15} /> },
    normal:   { bg: 'bg-blue-500/10',   border: 'border-blue-500/25',   text: 'text-blue-300',   icon: <Info      size={15} /> },
  };

  const { bg, border, text, icon } = cfg[urgency] ?? cfg.normal;

  return (
    <div className={[
      'flex items-center gap-3 px-4 py-3 rounded-xl border',
      bg, border,
    ].join(' ')}>
      <span className={text}>{icon}</span>
      <div>
        <p className={['text-sm font-semibold', text].join(' ')}>
          {urgency === 'overdue'  ? 'Response overdue'
           : urgency === 'critical' ? 'Response due very soon'
           : urgency === 'warning'  ? 'Response due soon'
           : 'Response pending'}
        </p>
        <p className="text-xs text-slate-400">{daysLabel(daysLeft)}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence status pill
// ---------------------------------------------------------------------------

function EvidenceStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, string> = {
    not_started: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    in_progress: 'bg-blue-500/20  text-blue-300  border-blue-500/30',
    submitted:   'bg-violet-500/20 text-violet-300 border-violet-500/30',
    past_due:    'bg-rose-500/20   text-rose-300  border-rose-500/30',
    won:         'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    lost:        'bg-slate-500/20  text-slate-400 border-slate-500/30',
  };
  return (
    <span className={[
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border',
      cfg[status] ?? cfg.not_started,
    ].join(' ')}>
      <FileText size={10} />
      {status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Info row
// ---------------------------------------------------------------------------

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-t border-white/5 first:border-0">
      <span className="text-[11px] text-slate-500 uppercase tracking-wider w-36 shrink-0 pt-0.5">
        {label}
      </span>
      <div className="text-sm text-slate-300 text-right">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DisputeSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-14 rounded-xl bg-white/6" />
      <div className="space-y-3 rounded-xl border border-white/8 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-3 w-28 rounded bg-white/6" />
            <div className="h-3 w-20 rounded bg-white/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// No-dispute state
// ---------------------------------------------------------------------------

function NoDispute() {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20
                      flex items-center justify-center">
        <ShieldAlert size={20} className="text-emerald-400" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-slate-300">No dispute on this order</p>
        <p className="text-xs text-slate-500 mt-1">Dispute events will appear here if Stripe notifies us.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface OrderDisputePanelProps {
  dispute:    OrderDisputeSummary | null;
  isLoading:  boolean;
  className?: string;
}

export function OrderDisputePanel({
  dispute,
  isLoading,
  className = '',
}: OrderDisputePanelProps) {
  if (isLoading) return <DisputeSkeleton />;
  if (!dispute)  return <NoDispute />;

  const stripeDisputeUrl = dispute.disputeId
    ? `https://dashboard.stripe.com/disputes/${dispute.disputeId}`
    : null;

  return (
    <div className={['space-y-5', className].join(' ')}>

      {/* Urgency banner */}
      <UrgencyBanner urgency={dispute.disputeUrgency} daysLeft={dispute.disputeDueDaysLeft} />

      {/* Dispute summary card */}
      <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-2">
        <InfoRow label="Dispute ID">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs">{dispute.disputeId}</span>
            {stripeDisputeUrl && (
              <a href={stripeDisputeUrl} target="_blank" rel="noopener noreferrer"
                 className="text-slate-500 hover:text-slate-300 transition-colors">
                <ExternalLink size={12} />
              </a>
            )}
          </div>
        </InfoRow>

        <InfoRow label="Reason">
          <span className="capitalize">{dispute.disputeReason?.replace(/_/g, ' ') || '—'}</span>
        </InfoRow>

        {dispute.networkReasonCode && (
          <InfoRow label="Network code">
            <span className="font-mono text-xs">{dispute.networkReasonCode}</span>
          </InfoRow>
        )}

        <InfoRow label="Disputed amount">
          <span className="font-semibold text-rose-300">
            {dispute.disputeAmountFormatted}
          </span>
        </InfoRow>

        <InfoRow label="Response due">
          <div className="flex flex-col items-end gap-1">
            <span>{formatDate(dispute.disputeDueBy)}</span>
            {dispute.disputeDueDaysLeft !== null && (
              <span className={[
                'text-[11px] font-medium',
                dispute.disputeUrgency === 'overdue'  ? 'text-rose-400'
                : dispute.disputeUrgency === 'critical' ? 'text-rose-400'
                : dispute.disputeUrgency === 'warning'  ? 'text-amber-400'
                : 'text-slate-500',
              ].join(' ')}>
                {daysLabel(dispute.disputeDueDaysLeft)}
              </span>
            )}
          </div>
        </InfoRow>

        <InfoRow label="Evidence status">
          <EvidenceStatusBadge status={dispute.evidenceStatus} />
        </InfoRow>

        <InfoRow label="Opened">
          <span>{formatDate(dispute.openedAt)}</span>
        </InfoRow>

        {dispute.closedAt && (
          <InfoRow label="Closed">
            <div className="flex flex-col items-end gap-1">
              <span>{formatDate(dispute.closedAt)}</span>
              {dispute.outcome && (
                <span className={[
                  'text-xs font-semibold capitalize',
                  dispute.outcome === 'won'  ? 'text-emerald-400'
                  : dispute.outcome === 'lost' ? 'text-rose-400'
                  : 'text-slate-400',
                ].join(' ')}>
                  Outcome: {dispute.outcome}
                </span>
              )}
            </div>
          </InfoRow>
        )}
      </div>

      {/* Refund info */}
      {dispute.refundIds.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Refunds
          </p>
          <div className="flex flex-wrap gap-2">
            {dispute.refundIds.map((id) => (
              <a
                key={id}
                href={`https://dashboard.stripe.com/refunds/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
                           bg-blue-500/10 border border-blue-500/20 text-blue-400
                           hover:bg-blue-500/15 transition-colors font-mono"
              >
                {id.slice(0, 16)}…
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
          {dispute.lastRefundReason && (
            <p className="text-xs text-slate-500">Reason: {dispute.lastRefundReason}</p>
          )}
        </div>
      )}

      {/* Event timeline */}
      {dispute.events.length > 0 && (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-4">
            Dispute Timeline
          </p>
          <OrderTimeline
            events={dispute.events.map((ev) => ({
              id:          ev.id,
              kind:        (ev.eventType.startsWith('dispute') ? ev.eventType : 'admin_note') as any,
              severity:
                ev.eventType === 'dispute_created'    ? 'error'
                : ev.eventType === 'dispute_closed' && ev.newStatus === 'won' ? 'success'
                : ev.eventType === 'evidence_submitted' ? 'info'
                : 'neutral',
              title:       ev.eventType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
              description: ev.note || '',
              actor:       ev.actorName || ev.actorRole,
              occurredAt:  ev.occurredAt,
              label:       ev.occurredAtLabel,
              evidenceUrls:   ev.evidenceUrls,
              evidenceLabels: ev.evidenceLabels,
            }))}
            isLoading={false}
          />
        </div>
      )}
    </div>
  );
}

export default OrderDisputePanel;