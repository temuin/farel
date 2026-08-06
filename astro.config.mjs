// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Canonical and OG URLs derive from this. Set it to the production domain.
  site: 'https://example.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
