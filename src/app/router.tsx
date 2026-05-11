// src/app/router.tsx — 2026 Enterprise Router (production-hardened v2)
// =============================================================================
//
// CHUNK STALENESS STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
// Problem: Vite hashes chunk filenames on every build. Users with stale app
// shells (old HTML/JS in browser cache or CDN) try to fetch old chunk URLs
// that no longer exist on the CDN → "Failed to fetch dynamically imported module".
//
// Solution implemented here:
//   1. `resilientLazy()` — catches chunk-fetch 404s and triggers a hard reload
//      once per session (stored in sessionStorage). After reload the fresh HTML
//      shell references the new chunk hashes. Prevents infinite reload loops.
//
//   2. `lazyRoute()` — standard pattern replacing the ad-hoc inline `async()`
//      functions. Accepts a typed importer + optional named export key. All
//      routes go through this so the staleness recovery is universal.
//
//   3. `lazyPick()` retained for named-export pages that don't use default.
//
// DEPLOYMENT NOTE (Vercel)
// ─────────────────────────────────────────────────────────────────────────────
// Add to vercel.json:
//   { "headers": [{ "source": "/assets/(.*)", "headers": [
//       { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
//   ]}]}
//
// And ensure your HTML is NOT cached aggressively:
//   { "source": "/(.*).html", "headers": [
//       { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
//   ]}
//
// This combination means: HTML always fresh (so chunk references are current),
// but hashed JS/CSS assets are cached forever (immutable).
// =============================================================================

import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';

import RootLayout from '@/app/RootLayout';
import { Providers } from '@/app/Providers';
import { AuthGuard, RoleGuard } from '@/components/auth/AuthGuard';

// ✅ /menu kept synchronous — highest-traffic route, no lazy penalty
import MenuPage from '@/modules/menu/pages/MenuPage';

// ─────────────────────────────────────────────────────────────────────────────
// Chunk-staleness recovery
// ─────────────────────────────────────────────────────────────────────────────

const STALE_RELOAD_KEY = 'chunk_stale_reload';

/**
 * Detects a chunk-fetch failure (stale deployment) and performs a single
 * hard reload per session to pick up the fresh asset manifest.
 *
 * Returns true if a reload was triggered (caller should bail out).
 */
function handleStaleChunk(err: unknown): boolean {
  const isChunkError =
    err instanceof Error &&
    (err.message.includes('Failed to fetch dynamically imported module') ||
      err.message.includes('Importing a module script failed') ||
      // Safari phrasing
      err.message.includes('error loading dynamically imported module'));

  if (!isChunkError) return false;

  const alreadyReloaded = sessionStorage.getItem(STALE_RELOAD_KEY) === '1';
  if (alreadyReloaded) return false; // don't loop

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

/**
 * Standard route lazy loader.
 * - Handles default export (most pages)
 * - Recovers from stale-chunk 404s with a single session reload
 */
function lazyRoute(importer: () => Promise<{ default: React.ComponentType }>) {
  return async (): Promise<{ Component: React.ComponentType }> => {
    try {
      const mod = await importer();
      return { Component: mod.default };
    } catch (err) {
      if (handleStaleChunk(err)) {
        // Reload in flight — return a no-op component, browser will reload
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

/**
 * Named-export lazy loader — for pages that use named exports instead of default.
 * Maintains the staleness recovery + graceful error display.
 */
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

const withRole =
  (roles: Array<'admin' | 'staff' | 'customer'>, Cmp: React.ComponentType) =>
  () => (
    <RoleGuard allowedRoles={roles}>
      <Cmp />
    </RoleGuard>
  );

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
        element: <MenuPage />,
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
      // AccountLayout owns its own auth gate — it renders LoginGate
      // for unauthenticated users instead of redirecting away.
      // Do NOT wrap with withAuth() here.
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
        path: 'order-status/:orderId',

        lazy: lazyRoute(() => import('@/modules/orders/pages/OrderStatus')),
      },
      // ──────────────────────────────────────────────────────────
      // GUEST ORDER RECOVERY
      // Public — no auth required. Guest enters order number +
      // contact to receive a verification code and recover tracking
      // access after losing the original session.
      // ──────────────────────────────────────────────────────────
      {
        path: 'find-order',
        lazy: lazyRoute(() => import('@/modules/orders/pages/FindOrder')),
      },

      // ──────────────────────────────────────────────────────────
      // LEGAL
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
      // KITCHEN + EXPO (role protected)
      // ──────────────────────────────────────────────────────────
      {
        path: 'kitchen',
        lazy: async () => {
          const mod = await import('@/modules/orders/components/KitchenScreen').catch((err) => {
            if (handleStaleChunk(err)) return null;
            throw err;
          });
          if (!mod) return { Component: () => null };
          return { Component: withRole(['admin', 'staff'], mod.default) };
        },
      },
      {
        path: 'expo',
        lazy: async () => {
          const mod = await import('@/modules/orders/components/ExpoCommandCenter').catch((err) => {
            if (handleStaleChunk(err)) return null;
            throw err;
          });
          if (!mod) return { Component: () => null };
          return { Component: withRole(['admin', 'staff'], mod.default) };
        },
      },

      // ──────────────────────────────────────────────────────────
      // ADMIN (admin auth required)
      // All child routes go through withAdmin(AdminLayout) which
      // performs verifyAdminAccess() → is_admin() RPC before any
      // admin child renders.
      // ──────────────────────────────────────────────────────────
      {
        path: 'admin',
        lazy: async () => {
          const mod = await import('@/pages/Admin/AdminLayout').catch((err) => {
            if (handleStaleChunk(err)) return null;
            throw err;
          });
          if (!mod) return { Component: () => null };
          return { Component: withAdmin(mod.default) };
        },
        children: [
          // Dashboard — index route
          {
            index: true,
            lazy: lazyRoute(() => import('@/features/admin/dashboard/Dashboard')),
          },

          // Orders
          {
            path: 'orders',
            lazy: lazyRoute(() => import('@/pages/Admin/Orders')),
          },

          // Kitchen (admin view — no role wrapper needed, admin is already gated)
          {
            path: 'kitchen',
            lazy: lazyRoute(() => import('@/modules/orders/components/KitchenScreen')),
          },

          // Menu editor
          {
            path: 'menu',
            lazy: lazyRoute(() => import('@/pages/Admin/MenuEditor')),
          },

          // Loyalty scan
          {
            path: 'loyalty-scan',
            lazy: lazyRoute(() => import('@/pages/Admin/LoyaltyScan')),
          },

          // ── Marketing sub-tree ────────────────────────────────
          // AbandonedCartAnalytics uses memo() with a named function,
          // so it exports BOTH a named export AND no default. We use
          // lazyPick() to resolve the named export gracefully.
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
                // THE BROKEN ROUTE — fixed by:
                // 1. lazyPick handles named memo export correctly
                // 2. handleStaleChunk() inside lazyPick recovers from 404s
                // 3. AbandonedCartAnalytics.tsx now also has a `export default`
                //    (see the companion file fix) so both prefer keys work
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

          // Finance
          {
            path: 'finance',
            lazy: lazyRoute(() => import('@/pages/Admin/Finance')),
          },

          // Taxes
          {
            path: 'taxes',
            lazy: lazyPick(
              () => import('@/modules/admin/pages/AdminTaxesPage'),
              ['default', 'AdminTaxesPage'],
              'AdminTaxesPage',
            ),
          },

          // Fraud log
          {
            path: 'fraud',
            lazy: lazyRoute(() => import('@/pages/Admin/FraudLog')),
          },

          // Notifications
          {
            path: 'notifications',
            lazy: lazyRoute(() => import('@/pages/Admin/Notifications')),
          },

          // Legacy alias routes — kept for backward compat, remove when safe
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
      // MUST be before /login and * or it hits NotFound
      // ──────────────────────────────────────────────────────────
      {
        path: 'auth/callback',
        lazy: lazyRoute(() => import('@/features/auth/components/AuthCallback')),
      },

      // ──────────────────────────────────────────────────────────
      // AUTH REDIRECT STUBS
      // No /login or /unauthorized pages — auth is modal-based.
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