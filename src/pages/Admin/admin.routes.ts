// src/pages/Admin/admin.routes.ts
// =============================================================================
// Admin routes metadata — used for nav + RBAC-friendly route organization
// =============================================================================

import { ADMIN_PATHS } from './admin.constants';

export type AdminRouteKey =
  | 'dashboard'
  | 'orders'
  | 'kitchen'
  | 'menu'
  | 'fraud'
  | 'finance'
  | 'marketing'
  | 'loyalty'
  | 'notifications';

export type AdminRoute = {
  key: AdminRouteKey;
  label: string;
  path: string;
};

export const ADMIN_ROUTES: AdminRoute[] = [
  { key: 'dashboard', label: 'Dashboard', path: ADMIN_PATHS.dashboard },
  { key: 'orders', label: 'Orders', path: ADMIN_PATHS.orders },
  { key: 'kitchen', label: 'Kitchen', path: ADMIN_PATHS.kitchen },
  { key: 'menu', label: 'Menu', path: ADMIN_PATHS.menu },
  { key: 'fraud', label: 'Fraud', path: ADMIN_PATHS.fraud },
  { key: 'finance', label: 'Finance', path: ADMIN_PATHS.finance },
  { key: 'marketing', label: 'Marketing', path: ADMIN_PATHS.marketing },
  { key: 'loyalty', label: 'Loyalty', path: ADMIN_PATHS.loyalty },
  { key: 'notifications', label: 'Notifications', path: ADMIN_PATHS.notifications },
];
