import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: { port: 5173 },
  // bundle workspace + typebox into the server build so the runtime image needs no node_modules
  ssr: { noExternal: ['@affiliate/shared', '@sinclair/typebox'] }
});
