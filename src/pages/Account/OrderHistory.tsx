// src/pages/Account/OrderHistory.tsx
import { useEffect, useState } from 'react'
import { useUserContext } from '@/contexts/useUserContext'
import { Spinner } from '@/components/ui/Spinner'
import { fetchOrdersByCustomer } from '@/features/orders/orders.api'
import type { Order } from '@/domain/orders/order.types'

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

export default function OrderHistory() {
  const { user } = useUserContext()
  const userId = user?.id

  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const PAGE_SIZE = 10

  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    let mounted = true

    const run = async () => {
      if (!userId) return
      setLoading(true)
      setError(null)

      try {
        const { rows, count } = await fetchOrdersByCustomer(
          page,
          PAGE_SIZE
        )

        if (!mounted) return

        setOrders(rows)
        setTotalCount(count)
      } catch (e) {
        if (!mounted) return
        setError((e as Error).message)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    run()

    return () => {
      mounted = false
    }
  }, [userId, page])

  if (!userId) {
    return <div className="text-sm text-gray-600">Please sign in.</div>
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Order History</h1>
        <p className="mt-1 text-sm text-gray-600">
          Your recent orders and payment status.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-700">
          No orders yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((o) => (
                <tr key={o.id} className="bg-white">
                  <td className="px-4 py-3 text-gray-900">
                    {new Date(o.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{o.order_type}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {formatMoney(o.amount_total, o.currency)}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{o.payment_status}</td>
                  <td className="px-4 py-3 text-gray-700">{o.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <button
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                disabled={page === 0}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>

              <span className="text-sm text-gray-600">
                Page {page + 1} of {Math.ceil(totalCount / PAGE_SIZE)}
              </span>

              <button
                onClick={() =>
                  setPage((p) =>
                    p + 1 < Math.ceil(totalCount / PAGE_SIZE) ? p + 1 : p
                  )
                }
                disabled={(page + 1) * PAGE_SIZE >= totalCount}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}