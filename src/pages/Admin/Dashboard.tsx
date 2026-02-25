import { useEffect, useState } from 'react'
import { fetchAdminMetrics, AdminMetrics } from '@/features/orders/orders.api'
import { formatCurrency } from '@/utils/currency'
import { Spinner } from '@/components/ui/Spinner'

export default function Dashboard() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchAdminMetrics()
        setMetrics(data)
      } catch (err) {
  console.error('[Admin Dashboard] Failed to load metrics:', err)
  setError('Failed to load metrics')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  if (loading) return <div className="p-8"><Spinner /></div>
  if (error) return <div className="p-8 text-red-600">{error}</div>
  if (!metrics) return null

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900">
        Admin Dashboard
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MetricCard
          title="Total Revenue"
          value={formatCurrency(metrics.totalRevenue / 100)}
        />
        <MetricCard
          title="Total Orders"
          value={metrics.totalOrders}
        />
        <MetricCard
          title="Average Order Value"
          value={formatCurrency(metrics.averageOrderValue / 100)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MetricCard
          title="Today's Revenue"
          value={formatCurrency(metrics.todayRevenue / 100)}
        />
        <MetricCard
          title="Today's Orders"
          value={metrics.todayOrders}
        />
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
}: {
  title: string
  value: string | number
}) {
  return (
    <div className="rounded-2xl bg-white shadow-md p-6 border border-gray-100">
      <h2 className="text-sm text-gray-500">{title}</h2>
      <p className="mt-2 text-2xl font-semibold text-orange-600">
        {value}
      </p>
    </div>
  )
}