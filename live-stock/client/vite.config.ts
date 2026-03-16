import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_HOST = process.env.VITE_API_HOST || '127.0.0.1';
const API_PORT = process.env.VITE_API_PORT || '3001';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '127.0.0.1',
    port: 5177,
    proxy: {
      '/api': {
        target: `http://${API_HOST}:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
