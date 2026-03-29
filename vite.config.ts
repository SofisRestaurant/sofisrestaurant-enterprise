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

      // ✅ Use OXC properly (fixes warning)
      minify: 'oxc',

      cssCodeSplit: true,
      reportCompressedSize: false,
      chunkSizeWarningLimit: 800,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'react-vendor'
              if (id.includes('framer-motion')) return 'motion'
              if (id.includes('@tanstack')) return 'query'
              if (id.includes('lucide-react')) return 'icons'
              if (id.includes('stripe')) return 'payments'
              return 'vendor'
            }

            if (id.includes('Dashboard')) return 'dashboard'
            if (id.includes('LoyaltyScan')) return 'loyalty'
          },

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

    // ✅ Keep esbuild ONLY for console stripping
    esbuild: {
      drop: isDev ? [] : ['console', 'debugger'],
    },
  }
})