import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  // O ELK (layout automático) é um arquivo grande, mas separado e carregado só ao clicar em Organizar.
  build: { chunkSizeWarningLimit: 1600 },
});
