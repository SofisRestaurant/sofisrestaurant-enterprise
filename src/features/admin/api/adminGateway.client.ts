// src/features/admin/api/adminGateway.client.ts
// =============================================================================
// Admin Gateway Client — typed wrapper around invoke('admin-gateway')
// =============================================================================

import type { AdminAction, GatewayRequest, AdminGatewayResponseMap } from './adminGateway.types'
import { invokeFn } from '@/lib/supabase/functions'
import {
  AdminGatewayBadRequestError,
  AdminGatewayError,
  AdminGatewayUnauthorizedError,
} from './adminGateway.errors'

export async function callAdminGateway<T extends AdminAction>(
  req: Extract<GatewayRequest, { action: T }>,
): Promise<AdminGatewayResponseMap[T]> {
  const res = await invokeFn<AdminGatewayResponseMap[T]>('admin-gateway', req)

  if (res.error) {
    // supabase edge errors often include status in message; keep it clean here
    const msg = res.error.message || 'Admin gateway failed'

    if (msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('invalid jwt')) {
      throw new AdminGatewayUnauthorizedError(msg, 401)
    }
    if (msg.toLowerCase().includes('invalid request') || msg.toLowerCase().includes('bad request')) {
      throw new AdminGatewayBadRequestError(msg, 400)
    }
    throw new AdminGatewayError(msg)
  }

  return res.data
}

export async function fetchAdminMetrics() {
  return callAdminGateway({ action: 'metrics' })
}

export async function fetchAdminOrders(page = 0) {
  return callAdminGateway({ action: 'orders:list', payload: { page } })
}