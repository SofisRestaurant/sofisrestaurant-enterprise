// =============================================================================
// vite.config.ts — Sofi's Restaurant (production 2026)
// =============================================================================
//
// CHUNK SPLITTING STRATEGY:
//   vendor-react    — react, react-dom, react-router-dom, scheduler
//                     Changes rarely. Cached across deploys.
//   vendor-motion   — framer-motion
//                     ~33 KB min. Used on menu page. Separate so pages
//                     that don't animate can skip it.
//   vendor-supabase — @supabase/supabase-js and sub-packages
//                     Auth + realtime + storage client.
//   vendor-stripe   — @stripe/stripe-js, @stripe/react-stripe-js
//                     Only loaded on checkout. Separate chunk.
//   vendor-i18n     — i18next, react-i18next, i18next-browser-languagedetector
//                     Internationalization runtime.
//   vendor-icons    — lucide-react
//                     Icon library, tree-shaken but still significant.
//
//   All other node_modules → vendor (default bucket).
//   App code → split per route by React Router lazy loading.
//
// IMPORTANT:
//   Do not add more than ~8 manual chunks. Over-splitting creates too many
//   HTTP/2 requests and hurts cold-load performance.
// =============================================================================

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  build: {
    // Target modern browsers — drops legacy polyfills
    target: 'es2020',

    // Generate source maps for production debugging (Vercel serves them
    // only when the request includes the sourcemap header)
    sourcemap: true,

    rollupOptions: {
      output: {
        manualChunks(id) {
          // ── React core ────────────────────────────────────────────
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router-dom/') ||
            id.includes('node_modules/react-router/') ||
            id.includes('node_modules/scheduler/') ||
            id.includes('node_modules/@remix-run/')
          ) {
            return 'vendor-react';
          }

          // ── Framer Motion ─────────────────────────────────────────
          if (id.includes('node_modules/framer-motion/')) {
            return 'vendor-motion';
          }

          // ── Supabase ──────────────────────────────────────────────
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase';
          }

          // ── Stripe ────────────────────────────────────────────────
          if (
            id.includes('node_modules/@stripe/') ||
            id.includes('node_modules/stripe/')
          ) {
            return 'vendor-stripe';
          }

          // ── i18n ──────────────────────────────────────────────────
          if (
            id.includes('node_modules/i18next') ||
            id.includes('node_modules/react-i18next')
          ) {
            return 'vendor-i18n';
          }

          // ── Icons ─────────────────────────────────────────────────
          if (id.includes('node_modules/lucide-react/')) {
            return 'vendor-icons';
          }

          // ── Everything else from node_modules ─────────────────────
          if (id.includes('node_modules/')) {
            return 'vendor';
          }

          // App code: let Vite split by route (dynamic imports)
          return undefined;
        },
      },
    },

    // Warn if any chunk exceeds 350 KB (gzipped is usually ~30% of this)
    chunkSizeWarningLimit: 350,
  },

  // ── Dev server ────────────────────────────────────────────────────────────
  server: {
    port: 5173,
    strictPort: false,
  },

  // ── Preview server (npm run preview) ──────────────────────────────────────
  preview: {
    port: 4173,
  },
});