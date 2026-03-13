// =============================================================================
// src/app/router.tsx — 2026 Enterprise Router (production-hardened)
// =============================================================================
//
// Fixes:
// - ✅ Prevents "leaf route has no element" by ensuring every matched leaf returns a Component.
// - ✅ Handles modules that do NOT have a default export (e.g. PromoManager named export).
// - ✅ Fails loudly + visibly in UI if a route module is missing the expected export,
//      instead of silently rendering a blank page.
// - ✅ Keeps /menu deterministic (no lazy) per your prior fix.
//
// NOTE (from your console):
//   import("/src/pages/Admin/Marketing/CampaignManager.tsx") only exports ["PromoManager"].
//   That means CampaignManager.tsx currently does NOT export CampaignManager at all.
//   This router will now show a clear error page for /admin/marketing/campaigns until that file is corrected.
// =============================================================================

import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

import RootLayout from '@/app/RootLayout';
import { Providers } from '@/app/Providers';
import { AuthGuard, RoleGuard } from '@/components/auth/AuthGuard';

// ✅ /menu deterministic (no lazy)
import MenuPage from '@/modules/menu/pages/MenuPage';

// ─────────────────────────────────────────────────────────────
// Wrappers
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Lazy helpers (NO blank pages)
// ─────────────────────────────────────────────────────────────

function RouteLoadError({ title, details }: { title: string; details: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-2xl border border-red-500/20 bg-[#0d0d10] p-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">
          Route Load Error
        </p>
        <h1 className="mt-2 text-lg font-black text-red-300">{title}</h1>
        <pre className="mt-3 overflow-auto rounded-xl border border-zinc-800 bg-black/40 p-3 text-xs text-zinc-300">
          {details}
        </pre>
      </div>
    </div>
  );
}

type AnyModule = Record<string, unknown>;

function pickExport(mod: AnyModule, prefer: string[]): React.ComponentType | null {
  for (const key of prefer) {
    const v = mod[key];
    if (typeof v === 'function') return v as React.ComponentType;
    if (v && typeof v === 'object') {
      // React.memo / forwardRef components can appear as objects with $$typeof
      const maybe = v as { $$typeof?: unknown };
      if (maybe.$$typeof) return v as unknown as React.ComponentType;
    }
  }
  return null;
}

function lazyPick(importer: () => Promise<AnyModule>, prefer: string[], label: string) {
  return async () => {
    try {
      const mod = await importer();
      const Cmp = pickExport(mod, prefer);

      if (!Cmp) {
        const keys = Object.keys(mod);
        const msg =
          `Missing expected export for "${label}".\n` +
          `Tried: ${prefer.join(', ')}\n` +
          `Available exports: ${keys.length ? keys.join(', ') : '(none)'}`;

        return {
          Component: () => <RouteLoadError title={`Missing export: ${label}`} details={msg} />,
        };
      }

      return { Component: Cmp };
    } catch (error) {
      const msg = error instanceof Error ? error.stack || error.message : String(error);

      return {
        Component: () => <RouteLoadError title={`Failed to load: ${label}`} details={msg} />,
      };
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────

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
        element: <MenuPage />,
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
          const m = await import('@/modules/checkout/pages/CheckoutPage');
          return { Component: withAuth(m.default) };
        },
      },

      // ==================================================
      // STRIPE RESULTS
      // ==================================================
      {
        path: 'order-success',
        lazy: async () => {
          const m = await import('@/modules/orders/pages/OrderSuccess');
          return { Component: m.default };
        },
      },
      {
        path: 'order-canceled',
        lazy: async () => {
          const m = await import('@/modules/orders/pages/OrderCanceled');
          return { Component: m.default };
        },
      },

      // ==================================================
      // ORDER TRACKING
      // ==================================================
      {
        path: 'order-status/:orderId',
        lazy: async () => {
          const m = await import('@/modules/orders/pages/OrderStatus');
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
          const m = await import('@/modules/orders/components/KitchenScreen');
          return { Component: withRole(['admin', 'staff'], m.default) };
        },
      },
      {
        path: 'expo',
        lazy: async () => {
          const m = await import('@/modules/orders/components/ExpoCommandCenter');
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
              const m = await import('@/modules/orders/components/KitchenScreen');
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
              // /admin/marketing
              {
                index: true,
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/CampaignManager'),
                  ['default', 'CampaignManager'],
                  'CampaignManager (default|CampaignManager)',
                ),
              },
              // /admin/marketing/campaigns
              {
                path: 'campaigns',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/CampaignManager'),
                  ['default', 'CampaignManager'],
                  'CampaignManager (default|CampaignManager)',
                ),
              },
              // /admin/marketing/promos
              {
                path: 'promos',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/PromoManager'),
                  ['PromoManager', 'default'],
                  'PromoManager (PromoManager|default)',
                ),
              },
              // /admin/marketing/abandoned
              {
                path: 'abandoned',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/AbandonedCartAnalytics'),
                  ['AbandonedCartAnalytics', 'default'],
                  'AbandonedCartAnalytics (AbandonedCartAnalytics|default)',
                ),
              },
              // /admin/marketing/optimizer
              {
                path: 'optimizer',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/AIOptimizerPanel'),
                  ['default', 'AIOptimizerPanel'],
                  'AIOptimizerPanel (default|AIOptimizerPanel)',
                ),
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

          // Taxes
          {
            path: 'taxes',
            lazy: lazyPick(
              () => import('@/modules/admin/pages/AdminTaxesPage'),
              ['default', 'AdminTaxesPage'],
              'AdminTaxesPage (default|AdminTaxesPage)',
            ),
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

          // OPTIONAL: Admin Orders page
          {
            path: 'orders-page',
            lazy: async () => {
              const m = await import('@/pages/Admin/Orders');
              return { Component: m.default };
            },
          },

          // OPTIONAL: Admin menu editor alias
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