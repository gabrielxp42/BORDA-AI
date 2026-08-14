import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react', 'sonner', 'framer-motion'],
  },
  server: {
    port: 3000,
    host: true,
    strictPort: false,
    hmr: {
      overlay: true,
    },
  },
  clearScreen: false,
});
