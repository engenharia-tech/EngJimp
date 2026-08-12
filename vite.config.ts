import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  // A GEMINI_API_KEY NAO e injetada no bundle de proposito.
  // Ela e lida apenas no servidor (api/index.ts); o cliente fala com o Gemini
  // somente pelo proxy /api/gemini/generate (src/lib/gemini.ts). Qualquer
  // `define` de chave aqui a publicaria no JavaScript que vai ao navegador —
  // e a propria Vercel ja sinaliza essa variavel como "Needs Attention".
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
