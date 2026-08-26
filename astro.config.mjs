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

/*
 * Public host of the R2 bucket holding product photos and videos, with no
 * trailing slash. Set on the Pages project; the fallback only applies to a
 * local build that has not been told otherwise.
 */
const MEDIA_BASE_URL = process.env.MEDIA_BASE_URL ?? 'https://media.amaliautama.co.id';

// https://astro.build/config
export default defineConfig({
  /*
   * Canonical and Open Graph URLs derive from this.
   *   SITE_URL      set this on the production Pages project to the real domain.
   *   CF_PAGES_URL  injected by Cloudflare Pages on every build. Using it as the
   *                 fallback means branch/preview deploys advertise their own
   *                 address instead of the production one, so a preview can
   *                 never outrank or be mistaken for the live site.
   * The literal only applies to a local build with neither variable set.
   */
  site: process.env.SITE_URL ?? process.env.CF_PAGES_URL ?? 'https://example.com',
  output: 'static',

  image: {
    /*
     * Product photos are full-resolution originals in the R2 bucket, not files
     * in this repository. Astro refuses to fetch a remote image unless its host
     * is named here, so this list is what makes the build able to optimise
     * them at all.
     *
     * Derived from MEDIA_BASE_URL so the allow-list and the URLs in the content
     * can never drift apart. The originals are downloaded during the build and
     * turned into the sized WebP variants under /_astro/; visitors are served
     * those, and never reach the bucket.
     */
    remotePatterns: [
      (() => {
        const { protocol, hostname } = new URL(MEDIA_BASE_URL);
        return { protocol: protocol.replace(':', ''), hostname };
      })(),
    ],
  },

  security: {
    /*
     * Astro emits a per-page <meta http-equiv="content-security-policy"> and
     * hashes every inline script and style it generates, so no 'unsafe-inline'
     * is needed for scripts. Directives listed here are merged with those
     * hashes. Anything not listed falls back to default-src 'self'.
     *
     * frame-ancestors is deliberately absent: browsers ignore it in a meta tag,
     * so clickjacking is covered by X-Frame-Options in public/_headers instead.
     */
    csp: {
      directives: [
        "default-src 'self'",
        /*
         * 'self' covers every product photo: those are downloaded at build
         * time and served from /_astro. The bucket is listed because images
         * the CMS stores as plain URLs -- testimonial logos -- are rendered as
         * ordinary <img> and do load from it at runtime. data: is for the
         * small assets Astro inlines.
         */
        `img-src 'self' data: ${MEDIA_BASE_URL}`,
        "font-src 'self' data:",
        // Testimonial videos and the office map on the contact page.
        'frame-src https://www.youtube.com https://player.vimeo.com https://www.google.com',
        // The site is static and calls nothing at runtime.
        "connect-src 'self'",
        // The enquiry form posts natively to Web3Forms.
        "form-action 'self' https://api.web3forms.com",
        "base-uri 'self'",
        "object-src 'none'",
      ],
      /*
       * The marquees and the logo backdrop set their per-item duration and
       * opacity as inline style attributes, and Shiki does the same for any
       * code block written in the CMS. Hashes cannot cover style attributes,
       * so they need 'unsafe-inline' — scoped with kind: 'attribute' to emit
       * style-src-attr, which relaxes attributes ONLY. Actual <style> elements
       * stay hash-locked, and script-src is untouched, so this costs nothing
       * against XSS; the worst it permits is restyling on a page that renders
       * no user-supplied markup anyway.
       */
      styleDirective: {
        resources: [{ resource: "'unsafe-inline'", kind: 'attribute' }],
      },
    },
  },

  vite: {
    plugins: [tailwindcss(), serveAdminIndexInDev],
  },
});
