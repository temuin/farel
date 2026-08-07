// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Canonical and OG URLs derive from this. Override per environment with
  // SITE_URL at build time; the fallback is the eventual production domain.
  site: process.env.SITE_URL ?? 'https://example.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});
