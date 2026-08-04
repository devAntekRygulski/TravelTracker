import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeDevPortPlugin } from './vite.writeDevPort';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), writeDevPortPlugin()],
  optimizeDeps: {
    include: ['qrcode'],
  },
  server: {
    // Phone QR uploads need to reach this machine over the LAN / tunnel.
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 120_000,
        proxyTimeout: 120_000,
      },
    },
  },
});
