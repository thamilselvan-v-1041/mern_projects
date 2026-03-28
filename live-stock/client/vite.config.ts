import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, repoRoot, '');
  const clientEnv = loadEnv(mode, __dirname, '');
  const env = { ...rootEnv, ...clientEnv };

  const API_HOST = env.VITE_API_HOST || '127.0.0.1';
  const API_PORT = env.VITE_API_PORT || env.PORT || '3001';
  const devPort = Number(env.VITE_DEV_PORT || 5177);

  const listenAll =
    env.VITE_DEV_HOST === '0.0.0.0' ||
    env.VITE_DEV_HOST === 'true' ||
    env.VITE_DEV_HOST === '1';

  return {
    plugins: [react()],
    base: '/',
    server: {
      host: listenAll ? true : env.VITE_DEV_HOST || '127.0.0.1',
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://${API_HOST}:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: Number(env.VITE_PREVIEW_PORT || 4177),
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://${API_HOST}:${API_PORT}`,
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
