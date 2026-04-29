import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import { imagetools } from 'vite-imagetools'
import path from 'path'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isDev = command === 'serve'

  return {
    plugins: [
      react(),

      // Production compression (Brotli + Gzip)
      !isDev &&
        viteCompression({
          algorithm: 'brotliCompress',
          ext: '.br',
        }),
      !isDev &&
        viteCompression({
          algorithm: 'gzip',
          ext: '.gz',
        }),

      imagetools(),
    ].filter(Boolean),

    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || 'development'),
      __FEATURE_FLAG__: JSON.stringify(true),
    },

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    server: {
      port: env.APP_PORT ? Number(env.APP_PORT) : 5173,
      open: true,
      strictPort: true,
    },

    preview: {
      port: 4173,
      strictPort: true,
    },

    build: {
      target: 'esnext',
      outDir: 'dist',
      sourcemap: false,
      minify: 'oxc',
      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 800,

      rollupOptions: {
        output: {
          /**
           * manualChunks strategy
           * ─────────────────────────────────────────────────────────────────
           * IMPORTANT: Do NOT put admin page components into shared chunks.
           * Each admin page should be its own chunk so that:
           *   1. A stale hash for one page doesn't break others
           *   2. Bundle analysis is per-page (easier to spot regressions)
           *   3. The reload-on-stale-chunk strategy only triggers for the
           *      specific page being navigated to, not the whole admin
           *
           * Vendor splitting is safe because vendor chunk contents change
           * rarely (only on dep upgrades), and the HTML always references
           * the correct hashed vendor chunk URLs.
           */
          manualChunks(id) {
            // ── Vendor splitting ──────────────────────────────────────────
            if (id.includes('node_modules')) {
              if (id.includes('react-dom')) return 'react-dom'
              if (id.includes('react')) return 'react-vendor'
              if (id.includes('framer-motion')) return 'motion'
              if (id.includes('@tanstack')) return 'query'
              if (id.includes('lucide-react')) return 'icons'
              if (id.includes('stripe')) return 'payments'
              if (id.includes('@supabase')) return 'supabase'
              return 'vendor'
            }

            // ── App feature splitting ─────────────────────────────────────
            // Each named chunk here maps to one or more related files.
            // Admin pages are NOT chunked here — they are split automatically
            // by Vite's dynamic import boundaries in the router.
            if (id.includes('/features/admin/ui')) return 'admin-ui'
            if (id.includes('/features/admin/dashboard')) return 'dashboard'
            if (id.includes('LoyaltyScan')) return 'loyalty'
            if (id.includes('/modules/menu')) return 'menu'
            if (id.includes('/modules/checkout')) return 'checkout'
          },

          // Stable filename pattern — hash is content-based (Rollup default)
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'framer-motion',
        '@tanstack/react-query',
        'zustand',
      ],
    },

    // esbuild only used for console stripping in production
    esbuild: {
      drop: isDev ? [] : ['console', 'debugger'],
    },
  }
})