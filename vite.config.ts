import { defineConfig, loadEnv, UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteCompression from 'vite-plugin-compression'
import { imagetools } from 'vite-imagetools'

// Example async function for feature flags or remote config
async function getAsyncData() {
  return { featureFlag: true }
}

export default defineConfig(async ({ command, mode, isSsrBuild, isPreview }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '')

  // Fetch async initialization data
  const asyncData = await getAsyncData()

  // Base Vite config
  const config: UserConfig = {
    plugins: [
      react(),
      viteCompression(),     // Gzip/ Brotli for production
      imagetools()           // Optimize images on import
    ],
    define: {
      __APP_ENV__: JSON.stringify(env.APP_ENV || 'development'),
      __FEATURE_FLAG__: JSON.stringify(asyncData.featureFlag),
    },
    server: {
      port: env.APP_PORT ? Number(env.APP_PORT) : 5173,
      open: true,
      strictPort: command === 'serve',
    },
    resolve: {
      alias: {
        '@': `${process.cwd()}/src`,
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,       // Disable sourcemaps in production
      minify: 'esbuild',
      chunkSizeWarningLimit: 1000, // Adjust warning for large chunks
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor'
            if (id.includes('Dashboard')) return 'dashboard'
            if (id.includes('LoyaltyScan')) return 'loyalty'
          },
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]'
        }
      }
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'clsx'], // pre-bundle critical deps
    }
  }

  // Dev-specific overrides
  if (command === 'serve') {
    config.server!.strictPort = true
  } else {
    // Production-specific overrides
    config.build!.sourcemap = false
  }

  return config
})