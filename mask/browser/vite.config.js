import { defineConfig } from 'vite';
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
export default defineConfig({
  server: { headers }, preview: { headers },
  worker: { format: 'es' },
  build: { target: 'es2022', rollupOptions: {input: process.env.MASK_QA === '1' ? {main:'index.html',qa:'qa.html'} : 'index.html'} },
});
