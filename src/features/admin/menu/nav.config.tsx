// =============================================================================
// src/features/admin/nav/nav.config.tsx
// Modular, section-driven navigation config for AdminLayout.
// Import NavGroups from here — never hardcode in AdminLayout.
// =============================================================================

import type { ReactNode } from 'react';
import type { LiveMetrics } from '@/features/admin/nav/nav.types';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES (exported for AdminLayout consumption)
// ─────────────────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  to: string;
  end?: boolean;
  icon: ReactNode;
  badgeKey?: keyof LiveMetrics;
  badgeWarn?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────

export const NavIcons = {
  Dashboard: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="1" y="1" width="5" height="5" rx="1" />
      <rect x="8" y="1" width="5" height="5" rx="1" />
      <rect x="1" y="8" width="5" height="5" rx="1" />
      <rect x="8" y="8" width="5" height="5" rx="1" />
    </svg>
  ),
  Orders: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M1 1h12l-1.5 8H2.5L1 1z" />
      <circle cx="5" cy="13" r="1" />
      <circle cx="10" cy="13" r="1" />
    </svg>
  ),
  Kitchen: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="5.5" />
      <path d="M4 7h6M7 4v6" />
    </svg>
  ),
  Menu: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="5.5" />
      <path d="M4.5 7h5M7 4.5v5" />
    </svg>
  ),
  Loyalty: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M7 1.5l1.6 3.2 3.5.5-2.5 2.5.6 3.5L7 9.5l-3.2 1.7.6-3.5L1.9 5.2l3.5-.5z" />
    </svg>
  ),
  Campaigns: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <polyline points="1,11 4,8 7,10 13,3" />
      <path d="M9 3h4v4" />
    </svg>
  ),
  Promos: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="1" y="5" width="12" height="7" rx="1" />
      <path d="M5 5V3.5a2.5 2.5 0 015 0V5" />
      <circle cx="7" cy="9" r="1.2" />
    </svg>
  ),
  Abandoned: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M1 1l12 12M5.5 2H3l1.8 8H11l1-4" />
      <circle cx="6" cy="13" r="1" />
      <circle cx="11" cy="13" r="1" />
    </svg>
  ),
  Optimizer: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="7" cy="7" r="2.5" />
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.9 2.9l1.4 1.4M9.7 9.7l1.4 1.4M2.9 11.1l1.4-1.4M9.7 4.3l1.4-1.4" />
    </svg>
  ),
  Fraud: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M7 1L1 13h12L7 1z" />
      <path d="M7 5.5v3M7 10.5v.5" />
    </svg>
  ),
  Finance: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <rect x="1" y="3" width="12" height="9" rx="1" />
      <path d="M1 6h12M5 9h4" />
    </svg>
  ),
  Taxes: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M3 1.5h6l2 2V12a1 1 0 01-1 1H3a1 1 0 01-1-1v-9.5a1 1 0 011-1z" />
      <path d="M9 1.5V4h2" />
      <path d="M4.5 6.5h4M4.5 9h5" />
    </svg>
  ),
};

// ─────────────────────────────────────────────────────────────────────────────
// NAV GROUPS
// ─────────────────────────────────────────────────────────────────────────────

export const buildNavGroups = (): NavGroup[] => [
  {
    title: 'Operations',
    items: [
      { label: 'Dashboard', to: '/admin', end: true, icon: <NavIcons.Dashboard /> },
      {
        label: 'Orders',
        to: '/admin/orders',
        icon: <NavIcons.Orders />,
        badgeKey: 'pendingOrders',
      },
      { label: 'Kitchen', to: '/admin/kitchen', icon: <NavIcons.Kitchen /> },
      { label: 'Menu', to: '/admin/menu', icon: <NavIcons.Menu /> },
      { label: 'Loyalty Scan', to: '/admin/loyalty-scan', icon: <NavIcons.Loyalty /> },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { label: 'Campaigns', to: '/admin/marketing/campaigns', icon: <NavIcons.Campaigns /> },
      { label: 'Promo Codes', to: '/admin/marketing/promos', icon: <NavIcons.Promos /> },
      {
        label: 'Abandoned Carts',
        to: '/admin/marketing/abandoned',
        icon: <NavIcons.Abandoned />,
        badgeKey: 'abandonedCarts',
        badgeWarn: true,
      },
      { label: 'AI Optimizer', to: '/admin/marketing/optimizer', icon: <NavIcons.Optimizer /> },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Finance', to: '/admin/finance', icon: <NavIcons.Finance /> },
      { label: 'Taxes', to: '/admin/taxes', icon: <NavIcons.Taxes /> },
      {
        label: 'Fraud Log',
        to: '/admin/fraud',
        icon: <NavIcons.Fraud />,
        badgeKey: 'fraudEvents',
        badgeWarn: true,
      },
    ],
  },
];