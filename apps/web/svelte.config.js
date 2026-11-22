import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ out: 'build' }),
    csp: {
      mode: 'auto',
      directives: {
        'default-src': ['self'],
        'img-src': ['self', 'data:', 'https:'],
        'style-src': ['self', 'unsafe-inline'],
        'script-src': ['self'],
        'connect-src': ['self'],
        'frame-ancestors': ['none'],
        'form-action': ['self']
      }
    }
  }
};

export default config;
