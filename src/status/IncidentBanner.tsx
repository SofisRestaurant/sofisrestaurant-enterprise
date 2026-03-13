// src/status/IncidentBanner.tsx
import { useEffect, useMemo, useState } from 'react';

interface Incident {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: string; // ISO
}

const STORAGE_KEY = 'sofis_incident_dismissed_id';

function isIncident(v: unknown): v is Incident {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    typeof r.title === 'string' &&
    typeof r.message === 'string' &&
    (r.severity === 'info' || r.severity === 'warning' || r.severity === 'critical') &&
    typeof r.timestamp === 'string'
  );
}

export default function IncidentBanner() {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const ac = new AbortController();

    async function fetchIncidents() {
      try {
        // In production: GET /status/incidents/active (or your own edge function)
        // const res = await fetch('/api/incidents/active', { signal: ac.signal, cache: 'no-store' })
        // const data = await res.json()

        // Simulated “no incident”
        const data: unknown = null;

        if (isIncident(data)) setIncident(data);
        else setIncident(null);
      } catch {
        // Do NOT console.error spam in prod; if you want, hook to Sentry
        setIncident(null);
      }
    }

    void fetchIncidents();
    return () => ac.abort();
  }, []);

  const isDismissed = useMemo(() => {
    if (!incident) return true;
    return dismissedId === incident.id;
  }, [incident, dismissedId]);

  if (!incident || isDismissed) return null;

  const severityColors: Record<Incident['severity'], string> = {
    info: 'bg-blue-50 border-blue-500 text-blue-900',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-900',
    critical: 'bg-red-50 border-red-500 text-red-900',
  };

  return (
    <div className={`border-l-4 p-4 mb-4 ${severityColors[incident.severity]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{incident.title}</h4>
          <p className="text-sm">{incident.message}</p>
          <p className="text-xs mt-2 opacity-75">{new Date(incident.timestamp).toLocaleString()}</p>
        </div>

        <button
          type="button"
          onClick={() => {
            setDismissedId(incident.id);
            try {
              localStorage.setItem(STORAGE_KEY, incident.id);
            } catch {
              // ignore
            }
          }}
          aria-label="Dismiss incident"
          className="text-current opacity-50 hover:opacity-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
