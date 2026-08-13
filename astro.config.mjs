// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

/**
 * The CMS lives at public/admin/index.html. Real hosts serve a directory's
 * index.html automatically, but Astro's dev server does not do that for files
 * in public/, so /admin 404s during local development only. Rewrite it so the
 * dev URL matches the production one.
 */
/** @type {import('vite').Plugin} */
const serveAdminIndexInDev = {
  name: 'serve-admin-index-in-dev',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = (req.url ?? '').split('?')[0];
      if (path === '/admin' || path === '/admin/') req.url = '/admin/index.html';
      next();
    });
  },
};

// https://astro.build/config
export default defineConfig({
  // Canonical and OG URLs derive from this. Override per environment with
  // SITE_URL at build time; the fallback is the eventual production domain.
  site: process.env.SITE_URL ?? 'https://example.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss(), serveAdminIndexInDev],
  },
});
