// =============================================================================
// src/modules/orders/components/OrderTimeline.tsx
// =============================================================================

import React from 'react';
import {
  CreditCard, CheckCircle2, XCircle, RefreshCw, Truck,
  MapPin, ShieldAlert, FileText, MessageSquare, AlertTriangle,
  Flag, Clock, Package, ChevronDown,
} from 'lucide-react';
import type { TimelineEvent, TimelineEventKind, TimelineEventSeverity } from '../types/order-dispute.types';
import { nanoid } from 'nanoid';

// ---------------------------------------------------------------------------
// Icon + color maps
// ---------------------------------------------------------------------------

const KIND_ICON: Record<TimelineEventKind, React.ReactNode> = {
  order_created:        <Package   size={14} />,
  payment_captured:     <CreditCard size={14} />,
  payment_failed:       <XCircle   size={14} />,
  refund_issued:        <RefreshCw  size={14} />,
  order_fulfilled:      <Truck      size={14} />,
  pickup_verified:      <CheckCircle2 size={14} />,
  delivery_completed:   <MapPin    size={14} />,
  dispute_created:      <ShieldAlert size={14} />,
  dispute_updated:      <AlertTriangle size={14} />,
  dispute_closed:       <ShieldAlert size={14} />,
  evidence_submitted:   <FileText  size={14} />,
  admin_note:           <MessageSquare size={14} />,
  system_flag:          <Flag      size={14} />,
};

const SEVERITY_STYLES: Record<TimelineEventSeverity, {
  dot: string; icon: string; connector: string;
}> = {
  success: { dot: 'bg-emerald-500',    icon: 'text-emerald-400', connector: 'bg-emerald-500/20' },
  warning: { dot: 'bg-amber-500',      icon: 'text-amber-400',   connector: 'bg-amber-500/20'   },
  error:   { dot: 'bg-rose-500',       icon: 'text-rose-400',    connector: 'bg-rose-500/20'    },
  info:    { dot: 'bg-blue-500',       icon: 'text-blue-400',    connector: 'bg-blue-500/20'    },
  neutral: { dot: 'bg-slate-500',      icon: 'text-slate-400',   connector: 'bg-slate-500/20'   },
};

// ---------------------------------------------------------------------------
// Single event row
// ---------------------------------------------------------------------------

function TimelineRow({
  event,
  isLast,
}: {
  event:  TimelineEvent;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const s = SEVERITY_STYLES[event.severity];
  const hasExtras = Boolean(
    (event.evidenceUrls?.length ?? 0) > 0 || event.metadata || event.description,
  );

  return (
    <div className="relative flex gap-4">
      {/* Connector line */}
      {!isLast && <div className="absolute left-19px top-7 bottom-0 w-px bg-white/8" />}

      {/* Icon bubble */}
      <div
        className="shrink-0 w-10 h-10 rounded-xl border border-white/10 bg-slate-900
                      flex items-center justify-center z-10"
      >
        <span className={s.icon}>{KIND_ICON[event.kind] ?? <Clock size={14} />}</span>
      </div>

      {/* Content */}
      <div className="flex-1 pb-5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{event.title}</p>
            {event.actor && event.actor !== 'System' && (
              <p className="text-[11px] text-slate-500 mt-0.5">by {event.actor}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Severity dot */}
            <span className={['w-2 h-2 rounded-full mt-1', s.dot].join(' ')} />
            <span className="text-[11px] text-slate-500 whitespace-nowrap">{event.label}</span>
            {hasExtras && (
              <button
                type="button"
                onClick={() => setExpanded((p) => !p)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ChevronDown
                  size={14}
                  className={[
                    'transition-transform duration-150',
                    expanded ? 'rotate-180' : '',
                  ].join(' ')}
                />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        {event.description && (
          <p className="text-sm text-slate-400 mt-1 leading-relaxed">{event.description}</p>
        )}

        {/* Expanded extras */}
        {expanded && hasExtras && (
          <div className="mt-3 space-y-2">
            {/* Evidence links */}
            {event.evidenceUrls && event.evidenceUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.evidenceUrls.map((url, i) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs
                               bg-blue-500/10 border border-blue-500/20 text-blue-400
                               hover:bg-blue-500/20 transition-colors"
                  >
                    <FileText size={11} />
                    {event.evidenceLabels?.[i] ?? `Evidence ${i + 1}`}
                  </a>
                ))}
              </div>
            )}

            {/* Metadata */}
            {event.metadata && Object.keys(event.metadata).length > 0 && (
              <pre
                className="text-[11px] text-slate-500 font-mono bg-black/30
                              rounded-lg p-2 overflow-x-auto border border-white/6"
              >
                {JSON.stringify(event.metadata, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
const skeletonKeys = Array.from({ length: 5 }, () => nanoid());

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function OrderTimeline({
  events,
  isLoading,
  className = '',
}: {
  events:    TimelineEvent[];
  isLoading: boolean;
  className?: string;
}) {
  if (isLoading) {
    return (
      <div className={['space-y-4', className].join(' ')}>
        {skeletonKeys.map((key) => (
          <div key={key} className="flex gap-4 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-white/6 shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-3.5 w-40 rounded bg-white/6" />
              <div className="h-3 w-24 rounded bg-white/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className={['text-center py-10 text-slate-500 text-sm', className].join(' ')}>
        No events recorded yet.
      </div>
    );
  }

  return (
    <div className={['space-y-0', className].join(' ')}>
      {events.map((ev, i) => (
        <TimelineRow key={ev.id} event={ev} isLast={i === events.length - 1} />
      ))}
    </div>
  );
}

export default OrderTimeline;