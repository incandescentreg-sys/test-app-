import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': src('./src'),
    },
  },

  build: {
    target: 'es2020',
    // Агрессивный code splitting (п. 33): тяжёлые страницы не грузятся на старте.
    sourcemap: false,
    cssCodeSplit: true,
    chunkSizeWarningLimit: 200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-dom') || id.includes('react/')) return 'vendor-react';
          return 'vendor';
        },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: false,
  },

  // Мини-апп грузится внутри Telegram WebView; long-term caching + безопасные заголовки.
  preview: {
    port: 4173,
  },
});