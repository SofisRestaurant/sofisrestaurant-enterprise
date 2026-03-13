// =============================================================================
// src/modules/orders/components/OrderEvidencePanel.tsx
// =============================================================================

import { useMemo, useState, type ReactElement } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Package,
  Phone,
  Shield,
  Truck,
  User,
  XCircle,
} from 'lucide-react';

import type {
  EvidenceCheckItem,
  FulfillmentType,
  OrderFulfillmentEvidence,
} from '../types/order-evidence.types';
import { buildEvidenceChecklist } from '../types/order-evidence.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FULFILLMENT_ICONS: Record<FulfillmentType, ReactElement> = {
  pickup: <Package size={14} aria-hidden="true" />,
  curbside: <Package size={14} aria-hidden="true" />,
  delivery: <Truck size={14} aria-hidden="true" />,
  dine_in: <User size={14} aria-hidden="true" />,
  drive_through: <Package size={14} aria-hidden="true" />,
  ship: <Truck size={14} aria-hidden="true" />,
};

const CHECKLIST_STATUS_META: Record<
  EvidenceCheckItem['status'],
  {
    icon: ReactElement;
    textClassName: string;
    rowClassName: string;
    srLabel: string;
  }
> = {
  complete: {
    icon: <CheckCircle2 size={14} className="text-emerald-400" aria-hidden="true" />,
    textClassName: 'text-slate-300',
    rowClassName: '',
    srLabel: 'Complete',
  },
  missing: {
    icon: <XCircle size={14} className="text-rose-400" aria-hidden="true" />,
    textClassName: 'text-rose-300',
    rowClassName: '',
    srLabel: 'Missing',
  },
  warning: {
    icon: <AlertTriangle size={14} className="text-amber-400" aria-hidden="true" />,
    textClassName: 'text-amber-300',
    rowClassName: '',
    srLabel: 'Warning',
  },
  n_a: {
    icon: <Clock size={14} className="text-slate-600" aria-hidden="true" />,
    textClassName: 'text-slate-600',
    rowClassName: 'opacity-50',
    srLabel: 'Not applicable',
  },
};

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}

function formatTs(value: Date | null): string {
  if (!value) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}

function formatFulfillmentLabel(value: FulfillmentType): string {
  return value.replace(/_/g, ' ');
}

function isDeliveryEvidence(evidence: OrderFulfillmentEvidence): boolean {
  return evidence.fulfillmentType === 'delivery' || evidence.fulfillmentType === 'ship';
}

function getEvidenceScoreColor(score: number): string {
  if (score >= 80) {
    return 'text-emerald-400';
  }

  if (score >= 50) {
    return 'text-amber-400';
  }

  return 'text-rose-400';
}

function formatAccuracyMeters(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `±${value.toFixed(0)}m`;
}

// ---------------------------------------------------------------------------
// Completeness ring
// ---------------------------------------------------------------------------

function CompletenessRing({ score }: { score: number }): ReactElement {
  const safeScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const dashLength = circumference * (safeScore / 100);

  const color =
    safeScore >= 80 ? '#10b981' : safeScore >= 50 ? '#f59e0b' : '#f43f5e';

  return (
    <div
      className="relative flex h-12 w-12 items-center justify-center"
      aria-label={`Evidence completeness score ${safeScore} out of 100`}
      role="img"
    >
      <svg width="48" height="48" viewBox="0 0 48 48" className="-rotate-90">
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="4"
        />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={`${dashLength} ${circumference}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.5s ease' }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-white">{safeScore}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Checklist item
// ---------------------------------------------------------------------------

function ChecklistItem({ item }: { item: EvidenceCheckItem }): ReactElement {
  const meta = CHECKLIST_STATUS_META[item.status];

  return (
    <div
      className={joinClassNames(
        'flex items-start gap-3 border-t border-white/5 py-2.5 first:border-0',
        meta.rowClassName,
      )}
    >
      <div className="mt-0.5 shrink-0">{meta.icon}</div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={joinClassNames('text-sm font-medium', meta.textClassName)}>
            {item.label}
          </span>

          {item.timestamp ? (
            <span className="shrink-0 text-[11px] text-slate-500">{formatTs(item.timestamp)}</span>
          ) : null}
        </div>

        <span className="sr-only">{meta.srLabel}</span>

        {item.value ? <p className="mt-0.5 text-xs text-slate-500">{item.value}</p> : null}

        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-xs text-blue-400 transition-colors hover:text-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:ring-offset-2 focus:ring-offset-slate-950 rounded-sm"
          >
            <ExternalLink size={11} aria-hidden="true" />
            View file
          </a>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo / signature preview
// ---------------------------------------------------------------------------

function ProofImage({
  url,
  label,
  timestamp,
}: {
  url: string;
  label: string;
  timestamp?: Date | null;
}): ReactElement {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/30">
      <div className="relative">
        {!loaded ? <div className="h-32 w-full animate-pulse bg-white/5" aria-hidden="true" /> : null}

        <img
          src={url}
          alt={label}
          onLoad={() => setLoaded(true)}
          className={joinClassNames('h-32 w-full object-cover', loaded ? '' : 'hidden')}
        />

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute right-2 top-2 rounded-lg bg-black/50 p-1.5 text-white transition-colors hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-transparent"
          aria-label={`Open ${label}`}
        >
          <ExternalLink size={12} aria-hidden="true" />
        </a>
      </div>

      <div className="px-3 py-2">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        {timestamp ? <p className="mt-0.5 text-[11px] text-slate-600">{formatTs(timestamp)}</p> : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GPS display
// ---------------------------------------------------------------------------

function GpsChip({ lat, lng }: { lat: number; lng: number }): ReactElement {
  const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-500/20 bg-blue-500/10 px-3 py-1.5 text-xs text-blue-400 transition-colors hover:bg-blue-500/15 focus:outline-none focus:ring-2 focus:ring-blue-400/60 focus:ring-offset-2 focus:ring-offset-slate-950"
      aria-label={`Open GPS location ${lat.toFixed(5)}, ${lng.toFixed(5)} in Google Maps`}
    >
      <MapPin size={12} aria-hidden="true" />
      {lat.toFixed(5)}, {lng.toFixed(5)}
      <ExternalLink size={10} aria-hidden="true" />
    </a>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function EvidenceSkeleton(): ReactElement {
  return (
    <div className="space-y-3 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-white/6" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-white/6" />
          <div className="h-3 w-24 rounded bg-white/4" />
        </div>
      </div>

      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <div className="mt-0.5 h-4 w-4 rounded-full bg-white/6" />
          <div className="h-3.5 flex-1 rounded bg-white/6" />
        </div>
      ))}

      <span className="sr-only">Loading fulfillment evidence</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface OrderEvidencePanelProps {
  evidence: OrderFulfillmentEvidence | null;
  isLoading: boolean;
  className?: string;
}

export function OrderEvidencePanel({
  evidence,
  isLoading,
  className = '',
}: OrderEvidencePanelProps): ReactElement {
  const checklist = useMemo<EvidenceCheckItem[]>(
    () => (evidence ? buildEvidenceChecklist(evidence) : []),
    [evidence],
  );

  if (isLoading) {
    return <EvidenceSkeleton />;
  }

  if (!evidence) {
    return (
      <div className="py-8 text-center text-sm text-slate-500" role="status">
        No fulfillment evidence recorded.
      </div>
    );
  }

  const deliveryEvidence = isDeliveryEvidence(evidence);
  const scoreColor = getEvidenceScoreColor(evidence.evidenceCompletenessScore);
  const gpsAccuracy = formatAccuracyMeters(evidence.gpsAccuracyMeters);

  return (
    <div className={joinClassNames('space-y-5', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400">
            {FULFILLMENT_ICONS[evidence.fulfillmentType]}
          </div>

          <div>
            <p className="text-sm font-semibold capitalize text-white">
              {formatFulfillmentLabel(evidence.fulfillmentType)}
            </p>
            <p className={joinClassNames('text-xs font-medium', scoreColor)}>
              Evidence score: {evidence.evidenceCompletenessScore}/100
            </p>
          </div>
        </div>

        <CompletenessRing score={evidence.evidenceCompletenessScore} />
      </div>

      {/* Flagged banner */}
      {evidence.isFlagged ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-400">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-semibold">Flagged: </span>
            {evidence.flaggedReason || 'Review required'}
            {evidence.flaggedAt ? ` · ${formatTs(evidence.flaggedAt)}` : ''}
          </span>
        </div>
      ) : null}

      {/* Checklist */}
      <section
        aria-labelledby="order-evidence-checklist-heading"
        className="rounded-xl border border-white/8 bg-white/3 px-4 py-2"
      >
        <h3 id="order-evidence-checklist-heading" className="sr-only">
          Evidence checklist
        </h3>

        {checklist.map((item) => (
          <ChecklistItem key={item.key} item={item} />
        ))}
      </section>

      {/* Pickup details */}
      {!deliveryEvidence &&
      (evidence.pickedUpByName || evidence.staffVerifiedBy || evidence.pickupStation || evidence.pickupNotes) ? (
        <section className="space-y-2 rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Pickup Details
          </p>

          {evidence.pickedUpByName ? (
            <div className="flex items-center gap-2 text-sm">
              <User size={13} className="text-slate-500" aria-hidden="true" />
              <span className="text-slate-300">{evidence.pickedUpByName}</span>

              {evidence.pickedUpByIdVerified ? (
                <span
                  className="ml-1 inline-flex items-center gap-1 text-emerald-400"
                  aria-label="ID verified"
                  title="ID verified"
                >
                  <Shield size={11} aria-hidden="true" />
                </span>
              ) : null}
            </div>
          ) : null}

          {evidence.pickupStation ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Package size={12} aria-hidden="true" />
              {evidence.pickupStation}
            </div>
          ) : null}

          {evidence.pickupNotes ? (
            <p className="text-xs italic text-slate-500">{evidence.pickupNotes}</p>
          ) : null}
        </section>
      ) : null}

      {/* Delivery details */}
      {deliveryEvidence &&
      (evidence.driverName ||
        evidence.driverPhone ||
        evidence.vehicleDescription ||
        evidence.safePlaceDescription) ? (
        <section className="space-y-2 rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Driver Details
          </p>

          {evidence.driverName ? (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <User size={13} className="text-slate-500" aria-hidden="true" />
              {evidence.driverName}
            </div>
          ) : null}

          {evidence.driverPhone ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Phone size={12} aria-hidden="true" />
              {evidence.driverPhone}
            </div>
          ) : null}

          {evidence.vehicleDescription ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Truck size={12} aria-hidden="true" />
              {evidence.vehicleDescription}
            </div>
          ) : null}

          {evidence.safePlaceDescription ? (
            <p className="mt-1 text-xs italic text-slate-500">
              Left at: {evidence.safePlaceDescription}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* Proof media */}
      {evidence.deliveryPhotoUrl || evidence.signatureUrl ? (
        <section
          aria-labelledby="order-evidence-proof-heading"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <h3 id="order-evidence-proof-heading" className="sr-only">
            Proof media
          </h3>

          {evidence.deliveryPhotoUrl ? (
            <ProofImage
              url={evidence.deliveryPhotoUrl}
              label="Delivery photo"
              timestamp={evidence.deliveryPhotoTakenAt}
            />
          ) : null}

          {evidence.signatureUrl ? (
            <ProofImage
              url={evidence.signatureUrl}
              label="Recipient signature"
              timestamp={evidence.signatureCapturedAt}
            />
          ) : null}
        </section>
      ) : null}

      {/* GPS */}
      {evidence.gpsLat !== null && evidence.gpsLng !== null ? (
        <section className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-500">GPS location</span>

          <GpsChip lat={evidence.gpsLat} lng={evidence.gpsLng} />

          {gpsAccuracy ? <span className="text-[11px] text-slate-600">{gpsAccuracy}</span> : null}

          {evidence.geofenceCheckPassed === false ? (
            <span className="flex items-center gap-1 text-[11px] text-rose-400">
              <AlertTriangle size={11} aria-hidden="true" />
              Outside geofence
            </span>
          ) : null}
        </section>
      ) : null}

      {/* Handoff notes */}
      {evidence.handoffNotes ? (
        <section className="rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            Handoff Notes
          </p>
          <p className="text-sm leading-relaxed text-slate-400">{evidence.handoffNotes}</p>
        </section>
      ) : null}
    </div>
  );
}

export default OrderEvidencePanel;