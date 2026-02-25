// src/status/ServiceStatus.tsx
import { useEffect, useState } from 'react'

interface ServiceHealth {
  api: 'operational' | 'degraded' | 'down'
  database: 'operational' | 'degraded' | 'down'
  payments: 'operational' | 'degraded' | 'down'
}

export default function ServiceStatus() {
  const [health, setHealth] = useState<ServiceHealth>({
    api: 'operational',
    database: 'operational',
    payments: 'operational',
  })

  useEffect(() => {
    // In production, this would call a health check endpoint
    const checkHealth = async () => {
      try {
        // Simulate health check
        setHealth({
          api: 'operational',
          database: 'operational',
          payments: 'operational',
        })
      } catch (error) {
        console.error('Health check failed:', error)
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 60000) // Check every minute

    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'operational':
        return 'bg-green-500'
      case 'degraded':
        return 'bg-yellow-500'
      case 'down':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4">System Status</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-700">API</span>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(health.api)}`} />
            <span className="text-sm capitalize">{health.api}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-700">Database</span>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(health.database)}`} />
            <span className="text-sm capitalize">{health.database}</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-700">Payments</span>
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(health.payments)}`} />
            <span className="text-sm capitalize">{health.payments}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
