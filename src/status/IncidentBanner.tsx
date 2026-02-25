// src/status/IncidentBanner.tsx
import { useState, useEffect } from 'react'

interface Incident {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  timestamp: string
}

export default function IncidentBanner() {
  const [incident,] = useState<Incident | null>(null)
  const [isDismissed, setIsDismissed] = useState(false)

  useEffect(() => {
    // In production, fetch from an incidents API
    const fetchIncidents = async () => {
      try {
        // Simulate checking for active incidents
        // setIncident({ ... })
      } catch (error) {
        console.error('Failed to fetch incidents:', error)
      }
    }

    fetchIncidents()
  }, [])

  if (!incident || isDismissed) return null

  const severityColors = {
    info: 'bg-blue-50 border-blue-500 text-blue-900',
    warning: 'bg-yellow-50 border-yellow-500 text-yellow-900',
    critical: 'bg-red-50 border-red-500 text-red-900',
  }

  return (
    <div className={`border-l-4 p-4 mb-4 ${severityColors[incident.severity]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h4 className="font-semibold mb-1">{incident.title}</h4>
          <p className="text-sm">{incident.message}</p>
          <p className="text-xs mt-2 opacity-75">
            {new Date(incident.timestamp).toLocaleString()}
          </p>
        </div>
        <button
          onClick={() => setIsDismissed(true)}
          className="text-current opacity-50 hover:opacity-100"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}