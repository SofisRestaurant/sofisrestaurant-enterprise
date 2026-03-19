import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'; // ✅ add this
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    plugins: [
      react(),
      tailwindcss(), // ✅ include the Tailwind Vite plugin here
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: "Sofi's Restaurant",
          short_name: "Sofi's",
          theme_color: "#1c1915",
          background_color: "#faf6ef",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png"
            }
          ]
        }
      })
    ],

    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },

    server: {
      port: 3000,
      open: true,
    },

    preview: {
      port: 3000,
    },

    define: {
      __DEV__: !isProduction,
    },

    css: {
      devSourcemap: true,
    },

    optimizeDeps: {
      include: ['react', 'react-dom', 'react-router-dom'],
    },

    esbuild: {
      drop: isProduction ? ['console', 'debugger'] : [],
    },

    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 900,

      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react')) return 'react';
              if (id.includes('@supabase')) return 'supabase';
              if (id.includes('framer-motion')) return 'motion';
            }
          },
        },
      },
    },
  };
});