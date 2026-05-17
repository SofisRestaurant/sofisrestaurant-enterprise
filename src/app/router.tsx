// src/app/router.tsx — 2026 Enterprise Router (production-hardened v2)
// =============================================================================
//
// PERFORMANCE FIX (2026):
//   AuthGuard and RoleGuard are NO LONGER eagerly imported at the top level.
//   They are co-loaded inside the lazy handlers of routes that need them
//   (/admin, /kitchen, /expo). A /menu visitor never pays for auth-guard JS.
//
// CHUNK STALENESS STRATEGY (unchanged):
//   resilientLazy() catches chunk-fetch 404s and triggers a hard reload once
//   per session. See handleStaleChunk() below.
// =============================================================================

import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import RootLayout from '@/app/RootLayout';
import { Providers } from '@/app/Providers';

// NOTE: AuthGuard and RoleGuard are intentionally NOT imported here.
// They are co-loaded inside the lazy route handlers that need them
// to keep them out of the initial bundle for public routes like /menu.

// ─────────────────────────────────────────────────────────────────────────────
// Chunk-staleness recovery
// ─────────────────────────────────────────────────────────────────────────────

const STALE_RELOAD_KEY = 'chunk_stale_reload';

function handleStaleChunk(err: unknown): boolean {
  const isChunkError =
    err instanceof Error &&
    (err.message.includes('Failed to fetch dynamically imported module') ||
      err.message.includes('Importing a module script failed') ||
      err.message.includes('error loading dynamically imported module'));

  if (!isChunkError) return false;

  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return false;
  }

  const alreadyReloaded = sessionStorage.getItem(STALE_RELOAD_KEY) === '1';
  if (alreadyReloaded) return false;

  sessionStorage.setItem(STALE_RELOAD_KEY, '1');
  window.location.reload();
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route error display
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
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:bg-zinc-700"
        >
          Reload page
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typed module helpers
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// Core lazy loader — used by ALL routes
// ─────────────────────────────────────────────────────────────────────────────

function lazyRoute(importer: () => Promise<{ default: React.ComponentType }>) {
  return async (): Promise<{ Component: React.ComponentType }> => {
    try {
      const mod = await importer();
      return { Component: mod.default };
    } catch (err) {
      if (handleStaleChunk(err)) {
        return { Component: () => null };
      }
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      return {
        Component: () => (
          <RouteLoadError title="Failed to load page" details={msg} />
        ),
      };
    }
  };
}

function lazyPick(
  importer: () => Promise<AnyModule>,
  prefer: string[],
  label: string,
) {
  return async (): Promise<{ Component: React.ComponentType }> => {
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
    } catch (err) {
      if (handleStaleChunk(err)) {
        return { Component: () => null };
      }
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      return {
        Component: () => <RouteLoadError title={`Failed to load: ${label}`} details={msg} />,
      };
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy auth wrappers — co-loaded with the routes that need them
// ─────────────────────────────────────────────────────────────────────────────
// AuthGuard and RoleGuard are imported INSIDE these functions, not at the
// module top level. This keeps them (and their Supabase auth dependency tree)
// out of the initial bundle. They only load when a user navigates to a
// protected route like /admin, /kitchen, or /expo.

function lazyWithAdmin(pageImporter: () => Promise<{ default: React.ComponentType }>) {
  return async (): Promise<{ Component: React.ComponentType }> => {
    try {
      const [pageMod, authMod] = await Promise.all([
        pageImporter(),
        import('@/components/auth/AuthGuard'),
      ]);

      const Page = pageMod.default;
      const { AuthGuard } = authMod;

      const Wrapped: React.FC = () => (
        <AuthGuard requireAdmin>
          <Page />
        </AuthGuard>
      );

      return { Component: Wrapped };
    } catch (err) {
      if (handleStaleChunk(err)) {
        return { Component: () => null };
      }
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      return {
        Component: () => <RouteLoadError title="Failed to load admin page" details={msg} />,
      };
    }
  };
}

function lazyWithRole(
  roles: Array<'admin' | 'staff' | 'customer'>,
  pageImporter: () => Promise<{ default: React.ComponentType }>,
) {
  return async (): Promise<{ Component: React.ComponentType }> => {
    try {
      const [pageMod, authMod] = await Promise.all([
        pageImporter(),
        import('@/components/auth/AuthGuard'),
      ]);

      const Page = pageMod.default;
      const { RoleGuard } = authMod;

      const Wrapped: React.FC = () => (
        <RoleGuard allowedRoles={roles}>
          <Page />
        </RoleGuard>
      );

      return { Component: Wrapped };
    } catch (err) {
      if (handleStaleChunk(err)) {
        return { Component: () => null };
      }
      const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
      return {
        Component: () => <RouteLoadError title="Failed to load page" details={msg} />,
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

    HydrateFallback: () => (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: 'var(--color-stone-900, #1c1915)' }}
      >
        <div
          className="h-6 w-6 animate-spin rounded-full border-2"
          style={{
            borderColor: 'rgba(212,175,55,0.2)',
            borderTopColor: '#d4af37',
          }}
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
      // ──────────────────────────────────────────────────────────
      // PUBLIC ROUTES
      // ──────────────────────────────────────────────────────────
      {
        index: true,
        lazy: lazyRoute(() => import('@/pages/Home')),
      },
      {
        path: 'menu',
        lazy: lazyRoute(() => import('@/modules/menu/pages/MenuPage')),
      },
      {
        path: 'deals',
        lazy: lazyRoute(() => import('@/pages/Deals/Deals')),
      },
      {
        path: 'about',
        lazy: lazyRoute(() => import('@/pages/About/About')),
      },
      {
        path: 'contact',
        lazy: lazyRoute(() => import('@/pages/Contact/Contact')),
      },
      {
        path: 'gallery',
        lazy: lazyRoute(() => import('@/pages/Gallery/Gallery')),
      },
      {
        path: 'catering',
        lazy: lazyRoute(() => import('@/pages/Catering/Catering')),
      },
      {
        path: 'reservations',
        lazy: lazyRoute(() => import('@/pages/Reservations/Reservations')),
      },
      {
        path: 'reviews',
        lazy: lazyRoute(() => import('@/pages/Reviews/Reviews')),
      },

      // ──────────────────────────────────────────────────────────
      // ACCOUNT
      // ──────────────────────────────────────────────────────────
      {
        path: 'account',
        lazy: lazyRoute(() => import('@/pages/Account/AccountLayout')),
        children: [
          {
            index: true,
            lazy: lazyRoute(() => import('@/pages/Account/AccountHome')),
          },
          {
            path: 'edit',
            lazy: lazyRoute(() => import('@/pages/Account/EditProfile')),
          },
          {
            path: 'orders',
            lazy: lazyRoute(() => import('@/pages/Account/OrderHistory')),
          },
        ],
      },

      // ──────────────────────────────────────────────────────────
      // CHECKOUT — public, CheckoutPage owns guest/auth mode
      // ──────────────────────────────────────────────────────────
      {
        path: 'checkout',
        lazy: lazyRoute(() => import('@/modules/checkout/pages/CheckoutPage')),
      },

      // ──────────────────────────────────────────────────────────
      // STRIPE RESULTS
      // ──────────────────────────────────────────────────────────
      {
        path: 'order-success',
        lazy: lazyRoute(() => import('@/modules/orders/pages/OrderSuccess')),
      },
      {
        path: 'order-canceled',
        lazy: lazyRoute(() => import('@/modules/orders/pages/OrderCanceled')),
      },
      {
        path: 'order-status/:orderId',
        lazy: lazyRoute(() => import('@/modules/orders/pages/OrderStatus')),
      },
      {
        path: 'find-order',
        lazy: lazyRoute(() => import('@/modules/orders/pages/FindOrder')),
      },

      // ──────────────────────────────────────────────────────────
      // LEGAL
      // ──────────────────────────────────────────────────────────
      {
        path: 'privacy-policy',
        lazy: lazyRoute(() => import('@/pages/Legal/PrivacyPolicy')),
      },
      {
        path: 'terms-of-service',
        lazy: lazyRoute(() => import('@/pages/Legal/TermsOfService')),
      },
      {
        path: 'refund-policy',
        lazy: lazyRoute(() => import('@/pages/Legal/RefundPolicy')),
      },

      // ──────────────────────────────────────────────────────────
      // KITCHEN + EXPO (role protected — AuthGuard co-loaded lazily)
      // ──────────────────────────────────────────────────────────
      {
        path: 'kitchen',
        lazy: lazyWithRole(
          ['admin', 'staff'],
          () => import('@/modules/orders/components/KitchenScreen'),
        ),
      },
      {
        path: 'expo',
        lazy: lazyWithRole(
          ['admin', 'staff'],
          () => import('@/modules/orders/components/ExpoCommandCenter'),
        ),
      },

      // ──────────────────────────────────────────────────────────
      // ADMIN (AuthGuard co-loaded lazily with AdminLayout)
      // ──────────────────────────────────────────────────────────
      {
        path: 'admin',
        lazy: lazyWithAdmin(() => import('@/pages/Admin/AdminLayout')),
        children: [
          {
            index: true,
            lazy: lazyRoute(() => import('@/features/admin/dashboard/Dashboard')),
          },
          {
            path: 'orders',
            lazy: lazyRoute(() => import('@/pages/Admin/Orders')),
          },
          {
            path: 'kitchen',
            lazy: lazyRoute(() => import('@/modules/orders/components/KitchenScreen')),
          },
          {
            path: 'menu',
            lazy: lazyRoute(() => import('@/pages/Admin/MenuEditor')),
          },
          {
            path: 'loyalty-scan',
            lazy: lazyRoute(() => import('@/pages/Admin/LoyaltyScan')),
          },
          {
            path: 'marketing',
            children: [
              {
                index: true,
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/CampaignManager'),
                  ['default', 'CampaignManager'],
                  'CampaignManager (marketing index)',
                ),
              },
              {
                path: 'campaigns',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/CampaignManager'),
                  ['default', 'CampaignManager'],
                  'CampaignManager',
                ),
              },
              {
                path: 'promos',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/PromoManager'),
                  ['PromoManager', 'default'],
                  'PromoManager',
                ),
              },
              {
                path: 'abandoned',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/AbandonedCartAnalytics'),
                  ['default', 'AbandonedCartAnalytics'],
                  'AbandonedCartAnalytics',
                ),
              },
              {
                path: 'optimizer',
                lazy: lazyPick(
                  () => import('@/pages/Admin/Marketing/AIOptimizerPanel'),
                  ['default', 'AIOptimizerPanel'],
                  'AIOptimizerPanel',
                ),
              },
            ],
          },
          {
            path: 'finance',
            lazy: lazyRoute(() => import('@/pages/Admin/Finance')),
          },
          {
            path: 'taxes',
            lazy: lazyPick(
              () => import('@/modules/admin/pages/AdminTaxesPage'),
              ['default', 'AdminTaxesPage'],
              'AdminTaxesPage',
            ),
          },
          {
            path: 'fraud',
            lazy: lazyRoute(() => import('@/pages/Admin/FraudLog')),
          },
          {
            path: 'notifications',
            lazy: lazyRoute(() => import('@/pages/Admin/Notifications')),
          },
          {
            path: 'orders-page',
            lazy: lazyRoute(() => import('@/pages/Admin/Orders')),
          },
          {
            path: 'menu-editor',
            lazy: lazyRoute(() => import('@/pages/Admin/MenuEditor')),
          },
        ],
      },

      // ──────────────────────────────────────────────────────────
      // AUTH CALLBACK
      // ──────────────────────────────────────────────────────────
      {
        path: 'auth/callback',
        lazy: lazyRoute(() => import('@/features/auth/components/AuthCallback')),
      },

      // ──────────────────────────────────────────────────────────
      // AUTH REDIRECT STUBS
      // ──────────────────────────────────────────────────────────
      {
        path: 'login',
        element: <Navigate to="/" replace />,
      },
      {
        path: 'unauthorized',
        element: <Navigate to="/" replace />,
      },

      // ──────────────────────────────────────────────────────────
      // FALLBACK
      // ──────────────────────────────────────────────────────────
      {
        path: '*',
        lazy: lazyRoute(() => import('@/pages/NotFound')),
      },
    ],
  },
]);