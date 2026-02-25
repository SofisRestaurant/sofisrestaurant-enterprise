// src/router.tsx
import { createBrowserRouter } from 'react-router-dom';
import RootLayout from '@/app/RootLayout';
import { AuthGuard, RoleGuard } from '@/components/auth/AuthGuard';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,

    // ✅ REQUIRED in React Router v7 when using lazy routes
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
          const module = await import('@/pages/Home');
          return { Component: module.default };
        },
      },
      {
        path: 'menu',
        lazy: async () => {
          const module = await import('@/pages/Menu');
          return { Component: module.default };
        },
      },
      {
        path: 'about',
        lazy: async () => {
          const module = await import('@/pages/About/About');
          return { Component: module.default };
        },
      },
      {
        path: 'contact',
        lazy: async () => {
          const module = await import('@/pages/Contact/Contact');
          return { Component: module.default };
        },
      },
      {
        path: 'gallery',
        lazy: async () => {
          const module = await import('@/pages/Gallery/Gallery');
          return { Component: module.default };
        },
      },
      {
        path: 'catering',
        lazy: async () => {
          const module = await import('@/pages/Catering/Catering');
          return { Component: module.default };
        },
      },
      {
        path: 'reservations',
        lazy: async () => {
          const module = await import('@/pages/Reservations/Reservations');
          return { Component: module.default };
        },
      },
      {
        path: 'reviews',
        lazy: async () => {
          const module = await import('@/pages/Reviews/Reviews');
          return { Component: module.default };
        },
      },

      // ==================================================
      // ACCOUNT (AUTH REQUIRED)
      // ==================================================
      {
        path: 'account',
        lazy: async () => {
          const layoutModule = await import('@/pages/Account/AccountLayout');
          return {
            Component: () => (
              <AuthGuard requireAuth>
                <layoutModule.default />
              </AuthGuard>
            ),
          };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const module = await import('@/pages/Account/AccountHome');
              return { Component: module.default };
            },
          },
          {
            path: 'edit',
            lazy: async () => {
              const module = await import('@/pages/Account/EditProfile');
              return { Component: module.default };
            },
          },
          {
            path: 'orders',
            lazy: async () => {
              const module = await import('@/pages/Account/OrderHistory');
              return { Component: module.default };
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
          const module = await import('@/pages/Checkout');
          return {
            Component: () => (
              <AuthGuard requireAuth>
                <module.default />
              </AuthGuard>
            ),
          };
        },
      },

      // ==================================================
      // STRIPE RESULTS
      // ==================================================
      {
        path: 'order-success',
        lazy: async () => {
          const module = await import('@/pages/OrderSuccess');
          return { Component: module.default };
        },
      },
      {
        path: 'order-canceled',
        lazy: async () => {
          const module = await import('@/pages/OrderCanceled');
          return { Component: module.default };
        },
      },

      // ==================================================
      // ORDER TRACKING
      // ==================================================
      {
        path: 'order-status/:orderId',
        lazy: async () => {
          const module = await import('@/pages/OrderStatus');
          return { Component: module.default };
        },
      },

      // ==================================================
      // PASSWORD
      // ==================================================
      {
        path: 'update-password',
        lazy: async () => {
          const module = await import('@/pages/UpdatePassword');
          return { Component: module.default };
        },
      },

      // ==================================================
      // LEGAL
      // ==================================================
      {
        path: 'privacy-policy',
        lazy: async () => {
          const module = await import('@/pages/Legal/PrivacyPolicy');
          return { Component: module.default };
        },
      },
      {
        path: 'terms-of-service',
        lazy: async () => {
          const module = await import('@/pages/Legal/TermsOfService');
          return { Component: module.default };
        },
      },
      {
        path: 'refund-policy',
        lazy: async () => {
          const module = await import('@/pages/Legal/RefundPolicy');
          return { Component: module.default };
        },
      },

      // ==================================================
      // KITCHEN (ROLE PROTECTED)
      // ==================================================
      {
        path: 'kitchen',
        lazy: async () => {
          const module = await import('@/features/orders/KitchenScreen');
          return {
            Component: () => (
              <RoleGuard allowedRoles={['admin', 'staff']}>
                <module.default />
              </RoleGuard>
            ),
          };
        },
      },

      // ==================================================
      // EXPO (ROLE PROTECTED)
      // ==================================================
      {
        path: 'expo',
        lazy: async () => {
          const module = await import('@/features/orders/ExpoCommandCenter');
          return {
            Component: () => (
              <RoleGuard allowedRoles={['admin', 'staff']}>
                <module.default />
              </RoleGuard>
            ),
          };
        },
      },

      // ==================================================
      // ADMIN (AUTH + ADMIN REQUIRED)
      // ==================================================
      {
        path: 'admin',
        lazy: async () => {
          const layoutModule = await import('@/pages/Admin/AdminLayout');
          return {
            Component: () => (
              <AuthGuard requireAdmin>
                <layoutModule.default />
              </AuthGuard>
            ),
          };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const module = await import('@/pages/Admin/Dashboard');
              return { Component: module.default };
            },
          },
          {
            path: 'orders',
            lazy: async () => {
              const module = await import('@/pages/Admin/Orders');
              return { Component: module.default };
            },
          },
          {
            path: 'menu',
            lazy: async () => {
              const module = await import('@/pages/Admin/MenuEditor');
              return { Component: module.default };
            },
          },
          {
            path: 'loyalty-scan',
            lazy: async () => {
              const module = await import('@/pages/Admin/LoyaltyScan');
              return { Component: module.default };
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
          const module = await import('@/pages/NotFound');
          return { Component: module.default };
        },
      },
    ],
  },
]);