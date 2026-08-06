# Sportswear Catalogue

Static marketing and catalogue site for an Indonesian distributor of Kelme and Adidas team
sportswear. Showcase only — there is no cart, checkout or user account anywhere in the site.
Enquiries go out through WhatsApp or a Web3Forms-backed contact form.

Built with **Astro** (static output) and **Tailwind CSS v4**. No database, no SSR, no API routes.

## Commands

| Command           | Action                                          |
| :---------------- | :---------------------------------------------- |
| `npm install`     | Install dependencies                            |
| `npm run dev`     | Dev server at `localhost:4321`                  |
| `npm run check`   | Type-check `.astro` and `.ts` files             |
| `npm run build`   | Type-check, then build to `./dist/`             |
| `npm run preview` | Serve the built site locally                    |

## Project structure

```text
src/
├── assets/
│   ├── brand/logo-icon.png  The real logo mark, cropped from design/logo-icon.jpeg
│   └── products/            Product photography (optimised at build time)
├── components/          Presentational components
├── config/
│   ├── catalog.ts       Brand + category vocabulary — the source of truth
│   ├── clients.ts       Logos for the "trusted by" marquee — all placeholder
│   └── site.ts          Company details, contact info, nav — all placeholder
├── content/products/    One markdown file per product
├── content.config.ts    Content collection schema
├── layouts/             BaseLayout: <head>, SEO meta, header + footer
├── lib/                 Data access (products) and WhatsApp link building
├── pages/               / · /about · /collections · /collections/[slug] · /contact
└── styles/global.css    Tailwind entry, theme tokens, .shell container
public/
├── brands/              Kelme/Adidas partner logos (placeholders)
├── clients/             Client logos (placeholders)
├── favicon.ico, favicon.png  Generated from the real logo icon
└── og-default.png       Default social preview image (placeholder)
design/
├── logo.jpeg            Original company lockup, as supplied
└── logo-icon.jpeg       Original company icon, as supplied
```

`design/` holds the original client-supplied artwork, unprocessed. Everything under `src/assets`
and `public` derived from it was cropped and resized locally — see "The logo" below.

The landing page is company introduction only: hero, who-we-are, partner brands, an auto-scrolling
photo strip with a Kelme/Adidas toggle, the client logo wall and a closing CTA. The photo strip is
deliberately just images — no names or links — because the browsable catalogue lives on
`/collections`.

The hero fills exactly one screen — `100svh` minus the sticky header — behind columns of product
photos drifting in alternating directions. Those photos are decorative and hidden from assistive
technology; the hero copy carries the meaning.

All three moving strips share one implementation: the `.marquee` classes in
`src/styles/global.css`. A caller renders its list twice inside `.marquee__track` and picks a
direction with `.marquee--left`, `.marquee--up` or `.marquee--down`. Speed and height are set per
instance through the `--marquee-duration` and `--marquee-height` custom properties. Under
`prefers-reduced-motion` every strip stops and drops its duplicate copy.

Pages never call `getCollection` directly — they go through `src/lib/products.ts`, so query and
sort rules live in one place. Likewise every `wa.me` link is built by `src/lib/whatsapp.ts`.

## Replace before launch

Everything below is placeholder content.

| What                                    | Where                                        |
| :-------------------------------------- | :------------------------------------------- |
| Address, phone, email                    | `src/config/site.ts`                          |
| Legal entity name + distributor wording  | `src/config/site.ts` (both marked `TODO`)     |
| Web3Forms access key                     | `src/config/site.ts` → `WEB3FORMS_ACCESS_KEY` |
| Production domain                        | `src/config/site.ts` → `site.url` **and** `astro.config.mjs` → `site` |
| Company story + distributor statement    | `src/pages/about.astro`                       |
| Brand logos                              | `public/brands/kelme.svg`, `public/brands/adidas.svg` |
| Client logos and names                   | `src/config/clients.ts`, `public/clients/`    |
| Social preview image (1200×630)          | `public/og-default.png`                       |
| Product data and photography             | `src/content/products/`, `src/assets/products/` |

### The logo

`src/components/Logo.astro` uses the real company icon — a Vite-imported PNG cropped from
`design/logo-icon.jpeg` (the raw file the client supplied over WhatsApp). The wordmark and tagline
next to it are live text, not baked into the image: the source photo's tagline goes illegible if
scaled down to logo-in-a-header size, while real text stays crisp at any size.

The icon is dark-on-white, so it can't sit directly on the dark footer. On `tone="light"` it gets a
small white chip behind it — the same treatment already used for the Kelme/Adidas logos in the
footer.

`public/favicon.ico` and `public/favicon.png` were generated from the same source icon (cropped,
padded to a square, resized). If the client provides real vector artwork (AI/EPS/SVG) later, it's a
straight swap: replace `src/assets/brand/logo-icon.png` and regenerate the two favicon files.

### Colours

The palette is sampled directly from `src/assets/brand/logo-icon.png`: charcoal `#202020` (the
`ink` token) and green `#095D3E` (the `accent` ramp), both defined in the `@theme` block of
`src/styles/global.css`. Neutrals use Tailwind's `neutral` scale rather than `zinc`, since `zinc`'s
blue cast fights the untinted charcoal. Re-sample both if the logo is ever replaced with sharper
source artwork.

The Google Maps embed is keyless and built from the address in `src/config/site.ts`, so it starts
working as soon as the real address is in place.

The client logos are invented companies with generated marks. Only replace them with organisations
that have agreed to have their logo shown.

## Adding a product

Create `src/content/products/<slug>.md`:

```markdown
---
name: Kelme Match Jersey
brand: Kelme # must be one of BRANDS in src/config/catalog.ts
category: Jerseys # must be one of CATEGORIES in src/config/catalog.ts
slug: kelme-match-jersey # URL segment; keep it matching the filename
featured: true # optional — sorts the product first in the landing page carousel
description: One line, also used as the meta description on the detail page.
images:
  - ../../assets/products/jerseys-01.png
---

Markdown body. Renders as the long description on the detail page.
```

The build fails on an unknown brand, an unknown category, a malformed slug or a missing image, so
a typo cannot reach production. Adding a brand or category is a one-line change in
`src/config/catalog.ts` — the schema, the filter controls and the TypeScript types all follow.

## Deploying

`npm run build` produces a fully static `dist/`. Vercel and Netlify both detect Astro
automatically; no adapter or platform config file is needed.

- **Build command:** `npm run build`
- **Output directory:** `dist`

Set `site` in `astro.config.mjs` to the production domain first, or canonical and Open Graph URLs
will point at `example.com`.
