// src/features/orders/orders.api.ts
// ============================================================================
// ORDERS API — SECURE WITH RLS ENFORCEMENT
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'
import { mapOrderRowToDomain } from '@/domain/orders/order.mapper'
import type { Database } from '@/lib/supabase/database.types'
import { OrderStatus, type Order } from '@/domain/orders/order.types'

type OrderRow = Database['public']['Tables']['orders']['Row']
type OrderInsert = Database['public']['Tables']['orders']['Insert']
type OrderUpdate = Database['public']['Tables']['orders']['Update']

const now = () => new Date().toISOString()
// ============================================================================
// SECURITY LOGGING
// ============================================================================

async function logIllegalAttempt(
  orderId: string,
  newStatus: OrderStatus
) {
  const { data: { user } } = await supabase.auth.getUser()

if (!user?.id) return

  await supabase.from('staff_action_logs').insert({
    order_id: orderId,
    staff_id: user.id,
    old_status: null,
    new_status: newStatus,
    action: 'ILLEGAL_STATUS_ATTEMPT',
    ip_address: null,
    user_agent: navigator.userAgent,
    created_at: new Date().toISOString(),
  })
}
// ============================================================================
// AUTH HELPERS
// ============================================================================

async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id || null
}

async function requireAuth(): Promise<string> {
  const userId = await getCurrentUserId()
  if (!userId) {
    throw new Error('User not authenticated')
  }
  return userId
}

// ============================================================================
// CREATE ORDER
// ============================================================================

export async function createOrder(orderData: OrderInsert): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .insert(orderData)
    .select()
    .single()

  if (error) throw error
  return mapOrderRowToDomain(data as OrderRow)
}

// ============================================================================
// UPDATE ORDER
// ============================================================================

export async function updateOrder(
  orderId: string,
  updates: OrderUpdate
): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({
      ...updates,
      updated_at: now(),
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw error
  return mapOrderRowToDomain(data as OrderRow)
}

// ============================================================================
// UPDATE STATUS (SECURE RPC + AUDIT LOGGING)
// ============================================================================

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<Order> {

  const { data, error } = await supabase.rpc(
    'update_order_status_secure',
    {
      order_id: orderId,
      new_status: status,
    }
  )

  if (error) {

    await logIllegalAttempt(
      orderId,
      status,
    )

    throw new Error(error.message)
  }

  if (!data) {
    throw new Error('No order returned from secure update')
  }

  return mapOrderRowToDomain(data as OrderRow)
}
// ============================================================================
// ASSIGN STAFF
// ============================================================================


export async function assignOrderToStaff(
  orderId: string,
  staff: string
): Promise<Order> {

  const { data, error } = await supabase
    .from('orders')
    .update({
      assigned_to: staff,
      updated_at: now(),
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw error
  return mapOrderRowToDomain(data as OrderRow)
}
// ============================================================================
// ADD NOTE
// ============================================================================

export async function addOrderNote(
  orderId: string,
  note: string
): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({
      metadata: { note },
      updated_at: now(),
    })
    .eq('id', orderId)
    .select()
    .single()

  if (error) throw error
  return mapOrderRowToDomain(data as OrderRow)
}

// ============================================================================
// READ HELPERS (SECURE)
// ============================================================================

export async function getOrderById(id: string): Promise<Order | null> {
  // 🔒 RLS will also enforce access; we still query by id for efficiency
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!data) return null
  return mapOrderRowToDomain(data as OrderRow)
}

/**
 * 🔒 SECURE: Fetches orders for CURRENT authenticated user only
 * No userId parameter — we rely on auth + RLS
 *
 * page is 0-based (page=0 is first page)
 */
export async function fetchOrdersByCustomer(
  page = 0,
  pageSize = 20
): Promise<{ rows: Order[]; count: number }> {
  // ✅ Verify user is authenticated
  const currentUserId = await requireAuth()

  const safePage = Math.max(0, Math.floor(page))
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)))

  const from = safePage * safePageSize
  const to = from + safePageSize - 1

  // 🔒 RLS policy should also filter by auth.uid(); this is an extra safe filter
  const { data, count, error } = await supabase
    .from('orders')
    .select('*', { count: 'exact' })
    .eq('customer_uid', currentUserId)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) throw error

  return {
    rows: (data ?? []).map((row) => mapOrderRowToDomain(row as OrderRow)),
    count: count ?? 0,
  }
}

/**
 * 🔒 SECURE: Fetch a single order (RLS enforces ownership)
 */
export async function fetchOrderByIdSecure(
  orderId: string
): Promise<Order | null> {
  await requireAuth()

  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  return mapOrderRowToDomain(data as OrderRow)
}

// ============================================================================
// ADMIN METRICS (requires admin role)
// ============================================================================

export type AdminMetrics = {
  totalRevenue: number
  totalOrders: number
  todayRevenue: number
  todayOrders: number
  averageOrderValue: number
}

export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  // 🔒 RLS policy should restrict this to admin users
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Total revenue + total orders
  const { data: totals, error: totalsError } = await supabase
    .from('orders')
    .select('amount_total', { count: 'exact' })
    .eq('payment_status', 'paid')

  if (totalsError) throw totalsError

  const totalRevenue =
    totals?.reduce((sum, o) => sum + (o.amount_total ?? 0), 0) ?? 0

  const totalOrders = totals?.length ?? 0

  // Today's revenue + orders
  const { data: todayData, error: todayError } = await supabase
    .from('orders')
    .select('amount_total')
    .eq('payment_status', 'paid')
    .gte('created_at', today.toISOString())

  if (todayError) throw todayError

  const todayRevenue =
    todayData?.reduce((sum, o) => sum + (o.amount_total ?? 0), 0) ?? 0

  const todayOrders = todayData?.length ?? 0

  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

  return {
    totalRevenue,
    totalOrders,
    todayRevenue,
    todayOrders,
    averageOrderValue,
  }
}