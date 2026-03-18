import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite'; // ✅ add this

export default defineConfig(({ mode }) => {
  const isProduction = mode === 'production';

  return {
    plugins: [
      react(),
      tailwindcss(), // ✅ include the Tailwind Vite plugin here
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