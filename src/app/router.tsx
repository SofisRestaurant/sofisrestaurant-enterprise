// src/app/router.tsx — 2026 Enterprise Router (production-hardened)
// =============================================================================
//
// Architecture:
//   • All public routes are lazy-loaded for optimal bundle splitting
//   • /menu is kept synchronous (no lazy) — it's the highest-traffic route
//   • Auth-protected routes use AuthGuard / RoleGuard wrappers
//   • lazyPick() handles modules with non-default exports gracefully
//   • Every load failure renders a visible RouteLoadError instead of blank page
//   • HydrateFallback covers the initial load state before React hydrates
//
// Route tree:
//   /                    → HomePage (lazy)
//   /menu                → MenuPage (sync — no lazy)
//   /about               → About (lazy)
//   /contact             → Contact (lazy)
//   /gallery             → Gallery (lazy)
//   /catering            → Catering (lazy)
//   /reservations        → Reservations (lazy)
//   /reviews             → Reviews (lazy)
//   /account/*           → AccountLayout (auth required, lazy)
//   /checkout            → CheckoutPage (public — page owns guest/auth mode switch)
//   /order-success       → OrderSuccess (lazy)
//   /order-canceled      → OrderCanceled (lazy)
//   /order-status/:id    → OrderStatus (lazy)
//   /update-password     → UpdatePassword (lazy)
//   /privacy-policy      → PrivacyPolicy (lazy)
//   /terms-of-service    → TermsOfService (lazy)
//   /refund-policy       → RefundPolicy (lazy)
//   /kitchen             → KitchenScreen (admin|staff role, lazy)
//   /expo                → ExpoCommandCenter (admin|staff role, lazy)
//   /admin/*             → AdminLayout (admin required, lazy)
//   /*                   → NotFound (lazy)

import React from 'react';
import { createBrowserRouter } from 'react-router-dom';

import RootLayout from '@/app/RootLayout';
import { Providers } from '@/app/Providers';
import { AuthGuard, RoleGuard } from '@/components/auth/AuthGuard';

// ✅ /menu kept synchronous — highest-traffic route, no lazy penalty
import MenuPage from '@/modules/menu/pages/MenuPage';

// ─────────────────────────────────────────────────────────────────────────────
// Auth / Role wrappers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Graceful lazy loader — surfaces missing exports as visible UI errors
// instead of blank pages or cryptic console noise.
// ─────────────────────────────────────────────────────────────────────────────

function RouteLoadError({ title, details }: { title: string; details: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-xl rounded-2xl border border-red-500/20 bg-[#0d0d10] p-6">
        <p className="font-mono text-10px uppercase tracking-[0.2em] text-zinc-600">
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
      const msg = error instanceof Error ? (error.stack ?? error.message) : String(error);
      return {
        Component: () => <RouteLoadError title={`Failed to load: ${label}`} details={msg} />,
      };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Providers>
        <RootLayout />
      </Providers>
    ),

    // Shown while React is hydrating on first paint
    HydrateFallback: () => (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--color-stone-900, #1c1915)' }}
      >
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{ borderColor: 'rgba(212,175,55,0.2)', borderTopColor: '#d4af37' }}
          aria-label="Loading…"
          role="status"
        />
      </div>
    ),

    errorElement: (
      <div
        className="flex min-h-screen items-center justify-center px-6 text-center"
        style={{ background: 'var(--color-cream-100, #faf6ef)' }}
      >
        <div>
          <h1
            className="font-display text-3xl"
            style={{ color: 'var(--color-ember-500, #a96840)' }}
          >
            Something went wrong
          </h1>
          <p className="mt-3 font-body text-sm" style={{ color: 'var(--color-ink-500, #8a7a6a)' }}>
            Please refresh the page or{' '}
            <a href="/" style={{ color: 'var(--color-gold-400, #d4af37)' }}>
              return home
            </a>
            .
          </p>
        </div>
      </div>
    ),

    children: [
      // ────────────────────────────────────────────────────────
      // PUBLIC ROUTES
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // ACCOUNT (auth required)
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // CHECKOUT — public route, CheckoutPage owns guest/auth mode
      //
      // withAuth() removed: guests need checkout access.
      // CheckoutPage renders guest experience (email + pay) OR the
      // enriched auth experience (loyalty, credits, rewards) based on
      // isAuthenticated internally. Blocking guests = 0% conversion.
      // ────────────────────────────────────────────────────────
      {
        path: 'checkout',
        lazy: async () => {
          const m = await import('@/modules/checkout/pages/CheckoutPage');
          return { Component: m.default };
        },
      },

      // ────────────────────────────────────────────────────────
      // STRIPE RESULTS
      // ────────────────────────────────────────────────────────
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
      {
        path: 'order-status/:orderId',
        lazy: async () => {
          const m = await import('@/modules/orders/pages/OrderStatus');
          return { Component: m.default };
        },
      },

      // ────────────────────────────────────────────────────────
      // PASSWORD
      // ────────────────────────────────────────────────────────
      {
        path: 'update-password',
        lazy: async () => {
          const m = await import('@/pages/UpdatePassword');
          return { Component: m.default };
        },
      },

      // ────────────────────────────────────────────────────────
      // LEGAL
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // KITCHEN + EXPO (role protected)
      // ────────────────────────────────────────────────────────
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

      // ────────────────────────────────────────────────────────
      // ADMIN (admin auth required)
      // ────────────────────────────────────────────────────────
      {
        path: 'admin',
        lazy: async () => {
          const layout = await import('@/pages/Admin/AdminLayout');
          return { Component: withAdmin(layout.default) };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const m = await import('@/features/admin/dashboard/Dashboard');
              return { Component: m.default };
            },
          },
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
          {
            path: 'marketing',
            children: [
              {
                index: true,
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/CampaignManager'),
                  ['default', 'CampaignManager'],
                  'CampaignManager (default|CampaignManager)',
                ),
              },
              {
                path: 'campaigns',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/CampaignManager'),
                  ['default', 'CampaignManager'],
                  'CampaignManager (default|CampaignManager)',
                ),
              },
              {
                path: 'promos',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/PromoManager'),
                  ['PromoManager', 'default'],
                  'PromoManager (PromoManager|default)',
                ),
              },
              {
                path: 'abandoned',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/AbandonedCartAnalytics'),
                  ['AbandonedCartAnalytics', 'default'],
                  'AbandonedCartAnalytics (AbandonedCartAnalytics|default)',
                ),
              },
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
          {
            path: 'finance',
            lazy: async () => {
              const m = await import('@/pages/Admin/Finance');
              return { Component: m.default };
            },
          },
          {
            path: 'taxes',
            lazy: lazyPick(
              () => import('@/modules/admin/pages/AdminTaxesPage'),
              ['default', 'AdminTaxesPage'],
              'AdminTaxesPage (default|AdminTaxesPage)',
            ),
          },
          {
            path: 'fraud',
            lazy: async () => {
              const m = await import('@/pages/Admin/FraudLog');
              return { Component: m.default };
            },
          },
          {
            path: 'notifications',
            lazy: async () => {
              const m = await import('@/pages/Admin/Notifications');
              return { Component: m.default };
            },
          },
          {
            path: 'orders-page',
            lazy: async () => {
              const m = await import('@/pages/Admin/Orders');
              return { Component: m.default };
            },
          },
          {
            path: 'menu-editor',
            lazy: async () => {
              const m = await import('@/pages/Admin/MenuEditor');
              return { Component: m.default };
            },
          },
        ],
      },

      // ────────────────────────────────────────────────────────
      // AUTH CALLBACK — MUST be before * or it hits NotFound
      // ────────────────────────────────────────────────────────
      // Supabase redirects here after Google OAuth with ?code=xxxx
      // AuthCallback shows a spinner while UserProvider exchanges
      // the code, then navigates to /account (or ?redirect= param).
      // Without this route, the * wildcard catches the URL and
      // renders NotFound — causing the 404 flash before Google auth.
      {
        path: 'auth/callback',
        lazy: async () => {
          const m = await import('@/features/auth/components/AuthCallback');
          return { Component: m.default };
        },
      },

      // ────────────────────────────────────────────────────────
      // FALLBACK
      // ────────────────────────────────────────────────────────
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