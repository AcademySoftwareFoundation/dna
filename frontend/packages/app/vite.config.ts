import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@dna/core': path.resolve(__dirname, '../core/src'),
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
      '/projects': 'http://localhost:8000',
      '/playlists': 'http://localhost:8000',
      '/users': 'http://localhost:8000',
      '/transcription': 'http://localhost:8000',
      '/generate-note': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
      '/find': 'http://localhost:8000',
      '/search': 'http://localhost:8000',
      '/version': 'http://localhost:8000',
      '/playlist': 'http://localhost:8000',
      '/shot': 'http://localhost:8000',
      '/asset': 'http://localhost:8000',
      '/task': 'http://localhost:8000',
      '/note': 'http://localhost:8000',
    },
  },
});
