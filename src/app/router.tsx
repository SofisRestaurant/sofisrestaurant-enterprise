// =============================================================================
// src/app/router.tsx — 2026 Enterprise Router (fixed)
// =============================================================================
//
// ROUTE MAP:
//   /admin                         → Dashboard (index)
//   /admin/orders                  → Orders
//   /admin/kitchen                 → Kitchen
//   /admin/menu                    → Menu Editor
//   /admin/loyalty-scan            → Loyalty Scan
//   /admin/marketing               → CampaignManager (index)
//   /admin/marketing/campaigns     → CampaignManager
//   /admin/marketing/promos        → PromoManager
//   /admin/marketing/abandoned     → AbandonedCartAnalytics
//   /admin/marketing/optimizer     → AIOptimizerPanel
//   /admin/finance                 → Finance
//   /admin/fraud                   → FraudLog
//   /admin/notifications           → Notifications
// =============================================================================

import { createBrowserRouter } from 'react-router-dom';
import RootLayout from '@/app/RootLayout';
import { Providers } from '@/app/Providers';
import { AuthGuard, RoleGuard } from '@/components/auth/AuthGuard';

// Small helpers to avoid repeating wrappers everywhere
const withAuth = (Cmp: React.ComponentType) => () => (
  <AuthGuard requireAuth>
    <Cmp />
  </AuthGuard>
);

const withAdmin = (Cmp: React.ComponentType) => () => (
  <AuthGuard requireAdmin>
    <Cmp />
  </AuthGuard>
);

const withRole = (roles: Array<'admin' | 'staff' | 'customer'>, Cmp: React.ComponentType) => () => (
  <RoleGuard allowedRoles={roles}>
    <Cmp />
  </RoleGuard>
);

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Providers>
        <RootLayout />
      </Providers>
    ),

    HydrateFallback: () => (
      <div className="flex min-h-screen items-center justify-center bg-gray-950">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-700 border-t-amber-500" />
      </div>
    ),

    errorElement: <div>Loading...</div>,

    children: [
      // ==================================================
      // PUBLIC ROUTES
      // ==================================================
      {
        index: true,
        lazy: async () => {
          const m = await import('@/pages/Home');
          return { Component: m.default };
        },
      },
      {
        path: 'menu',
        lazy: async () => {
          const m = await import('@/pages/Menu');
          return { Component: m.default };
        },
      },
      {
        path: 'about',
        lazy: async () => {
          const m = await import('@/pages/About/About');
          return { Component: m.default };
        },
      },
      {
        path: 'contact',
        lazy: async () => {
          const m = await import('@/pages/Contact/Contact');
          return { Component: m.default };
        },
      },
      {
        path: 'gallery',
        lazy: async () => {
          const m = await import('@/pages/Gallery/Gallery');
          return { Component: m.default };
        },
      },
      {
        path: 'catering',
        lazy: async () => {
          const m = await import('@/pages/Catering/Catering');
          return { Component: m.default };
        },
      },
      {
        path: 'reservations',
        lazy: async () => {
          const m = await import('@/pages/Reservations/Reservations');
          return { Component: m.default };
        },
      },
      {
        path: 'reviews',
        lazy: async () => {
          const m = await import('@/pages/Reviews/Reviews');
          return { Component: m.default };
        },
      },

      // ==================================================
      // ACCOUNT (AUTH REQUIRED)
      // ==================================================
      {
        path: 'account',
        lazy: async () => {
          const layout = await import('@/pages/Account/AccountLayout');
          return { Component: withAuth(layout.default) };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const m = await import('@/pages/Account/AccountHome');
              return { Component: m.default };
            },
          },
          {
            path: 'edit',
            lazy: async () => {
              const m = await import('@/pages/Account/EditProfile');
              return { Component: m.default };
            },
          },
          {
            path: 'orders',
            lazy: async () => {
              const m = await import('@/pages/Account/OrderHistory');
              return { Component: m.default };
            },
          },
        ],
      },

      // ==================================================
      // CHECKOUT (AUTH REQUIRED)
      // ==================================================
      {
        path: 'checkout',
        lazy: async () => {
          const m = await import('@/pages/Checkout');
          return { Component: withAuth(m.default) };
        },
      },

      // ==================================================
      // STRIPE RESULTS
      // ==================================================
      {
        path: 'order-success',
        lazy: async () => {
          const m = await import('@/pages/OrderSuccess');
          return { Component: m.default };
        },
      },
      {
        path: 'order-canceled',
        lazy: async () => {
          const m = await import('@/pages/OrderCanceled');
          return { Component: m.default };
        },
      },

      // ==================================================
      // ORDER TRACKING
      // ==================================================
      {
        path: 'order-status/:orderId',
        lazy: async () => {
          const m = await import('@/pages/OrderStatus');
          return { Component: m.default };
        },
      },

      // ==================================================
      // PASSWORD
      // ==================================================
      {
        path: 'update-password',
        lazy: async () => {
          const m = await import('@/pages/UpdatePassword');
          return { Component: m.default };
        },
      },

      // ==================================================
      // LEGAL
      // ==================================================
      {
        path: 'privacy-policy',
        lazy: async () => {
          const m = await import('@/pages/Legal/PrivacyPolicy');
          return { Component: m.default };
        },
      },
      {
        path: 'terms-of-service',
        lazy: async () => {
          const m = await import('@/pages/Legal/TermsOfService');
          return { Component: m.default };
        },
      },
      {
        path: 'refund-policy',
        lazy: async () => {
          const m = await import('@/pages/Legal/RefundPolicy');
          return { Component: m.default };
        },
      },

      // ==================================================
      // KITCHEN + EXPO (ROLE PROTECTED)
      // ==================================================
      {
        path: 'kitchen',
        lazy: async () => {
          const m = await import('@/features/orders/KitchenScreen');
          return { Component: withRole(['admin', 'staff'], m.default) };
        },
      },
      {
        path: 'expo',
        lazy: async () => {
          const m = await import('@/features/orders/ExpoCommandCenter');
          return { Component: withRole(['admin', 'staff'], m.default) };
        },
      },

      // ==================================================
      // ADMIN (AUTH + ADMIN REQUIRED)
      // ==================================================
      {
        path: 'admin',
        lazy: async () => {
          const layout = await import('@/pages/Admin/AdminLayout');
          return { Component: withAdmin(layout.default) };
        },
        children: [
          // Dashboard
          {
            index: true,
            lazy: async () => {
              const m = await import('@/features/admin/dashboard/Dashboard');
              return { Component: m.default };
            },
          },

          // Operations
          {
            path: 'orders',
            lazy: async () => {
              const m = await import('@/pages/Admin/Orders');
              return { Component: m.default };
            },
          },
          {
            path: 'kitchen',
            lazy: async () => {
              const m = await import('@/features/orders/KitchenScreen');
              return { Component: m.default };
            },
          },
          {
            path: 'menu',
            lazy: async () => {
              const m = await import('@/pages/Admin/MenuEditor');
              return { Component: m.default };
            },
          },
          {
            path: 'loyalty-scan',
            lazy: async () => {
              const m = await import('@/pages/Admin/LoyaltyScan');
              return { Component: m.default };
            },
          },

          // Marketing
          {
            path: 'marketing',
            children: [
              {
                index: true,
                lazy: async () => {
                  const m = await import('@/pages/Admin/Marketing/CampaignManager');
                  return { Component: m.default };
                },
              },
              {
                path: 'campaigns',
                lazy: async () => {
                  const m = await import('@/pages/Admin/Marketing/CampaignManager');
                  return { Component: m.default };
                },
              },
              {
                path: 'promos',
                lazy: async () => {
                  const m = await import('@/pages/Admin/Marketing/PromoManager');
                  // PromoManager file exports `export const PromoManager = memo(...)`
                  return { Component: m.PromoManager };
                },
              },
              {
                path: 'abandoned',
                lazy: async () => {
                  const m = await import('@/pages/Admin/Marketing/AbandonedCartAnalytics');
                  // AbandonedCartAnalytics file exports `export const AbandonedCartAnalytics = memo(...)`
                  return { Component: m.AbandonedCartAnalytics };
                },
              },
              {
                // FIXED: leaf route now has a Component (no element + lazy combo)
                path: 'optimizer',
                lazy: async () => {
                  const m = await import('@/pages/Admin/Marketing/AIOptimizerPanel');
                  return { Component: m.default };
                },
              },
            ],
          },

          // Finance
          {
            path: 'finance',
            lazy: async () => {
              const m = await import('@/pages/Admin/Finance');
              return { Component: m.default };
            },
          },

          // Fraud
          {
            path: 'fraud',
            lazy: async () => {
              const m = await import('@/pages/Admin/FraudLog');
              return { Component: m.default };
            },
          },

          // Notifications
          {
            path: 'notifications',
            lazy: async () => {
              const m = await import('@/pages/Admin/Notifications');
              return { Component: m.default };
            },
          },

          // OPTIONAL (exists in your tree): Admin Kitchen route page (if you use it)
          {
            path: 'kitchen-page',
            lazy: async () => {
              const m = await import('@/pages/Admin/Kitchen');
              return { Component: m.default };
            },
          },

          // OPTIONAL (exists in your tree): Admin Orders page (if you use it)
          {
            path: 'orders-page',
            lazy: async () => {
              const m = await import('@/pages/Admin/Orders');
              return { Component: m.default };
            },
          },

          // OPTIONAL (exists in your tree): Admin menu editor alias
          {
            path: 'menu-editor',
            lazy: async () => {
              const m = await import('@/pages/Admin/MenuEditor');
              return { Component: m.default };
            },
          },
        ],
      },

      // ==================================================
      // FALLBACK
      // ==================================================
      {
        path: '*',
        lazy: async () => {
          const m = await import('@/pages/NotFound');
          return { Component: m.default };
        },
      },
    ],
  },
]);
