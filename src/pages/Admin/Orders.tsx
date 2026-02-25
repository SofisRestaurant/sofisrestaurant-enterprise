import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/supabaseClient'
import { formatCurrency } from '@/utils/currency'
import type { Database } from '@/lib/supabase/database.types'

type OrderRow = Database['public']['Tables']['orders']['Row']

export default function AdminOrders() {

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)

 useEffect(() => {
  let isMounted = true

  async function loadOrders() {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('payment_status', { ascending: true })
      .order('created_at', { ascending: false })

    if (!isMounted) return

    if (error) {
      console.error('Failed to fetch orders:', error)
    } else {
      setOrders(data ?? [])
    }

    setLoading(false)
  }

  loadOrders()

  // 🔥 REALTIME LISTENER
  const channel = supabase
    .channel('admin-orders')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'orders' },
      () => {
        loadOrders()
      }
    )
    .subscribe()

  return () => {
    isMounted = false
    supabase.removeChannel(channel)
  }
}, [])

  if (loading) {
    return <div className="p-8">Loading orders...</div>
  }

  return (
    <div className="py-12">
      <div className="container">
        <h1 className="text-4xl font-bold mb-8">Orders</h1>

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">Order #</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => (
                <tr
                    key={order.id}
                    className={order.payment_status === 'disputed' ? 'bg-red-50' : ''}
                   >
                  <td className="px-6 py-4">
                    #{order.order_number}
                  </td>

                  <td className="px-6 py-4">
                    {order.customer_email}
                  </td>

                  <td className="px-6 py-4">
                    {formatCurrency(order.amount_total / 100)}
                  </td>

                  <td className="px-6 py-4 flex items-center gap-2">

  {/* Fulfillment Status */}
  <span
    className={`px-2 py-1 rounded text-xs font-semibold ${
      order.status === 'delivered'
        ? 'bg-green-100 text-green-800'
        : order.status === 'preparing'
        ? 'bg-yellow-100 text-yellow-800'
        : order.status === 'ready'
        ? 'bg-blue-100 text-blue-800'
        : order.status === 'cancelled'
        ? 'bg-gray-200 text-gray-700'
        : 'bg-gray-100 text-gray-700'
    }`}
  >
    {order.status}
  </span>

  {/* Payment Badges */}
  {order.payment_status === 'disputed' && (
    <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">
      ⚠ Disputed
    </span>
  )}

  {order.payment_status === 'refunded' && (
    <span className="bg-gray-800 text-white px-2 py-1 rounded text-xs">
      Refunded
    </span>
  )}

  {order.payment_status === 'failed' && (
    <span className="bg-yellow-600 text-white px-2 py-1 rounded text-xs">
      Failed
    </span>
  )}

</td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}