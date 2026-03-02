// src/pages/Admin/admin.constants.ts
// =============================================================================
// Admin constants — single source of truth for admin routes + behavior
// =============================================================================

export const ADMIN_PATHS = {
  root: '/admin',
  login: '/login',
  dashboard: '/admin',
  orders: '/admin/orders',
  kitchen: '/admin/kitchen',
  fraud: '/admin/fraud',
  menu: '/admin/menu',
  finance: '/admin/finance',
  marketing: '/admin/marketing',
  loyalty: '/admin/loyalty',
  notifications: '/admin/notifications',
} as const

export const ADMIN_APP = {
  metricsPollMs: 20_000,
  metricsCacheTtlMs: 15_000,
} as const

export const ADMIN_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant.netlify.app',
] as const