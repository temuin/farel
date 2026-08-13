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
│   ├── site.ts          Types + derives the values in data/settings.json
│   └── testimonials.ts  Types the entries in data/testimonials.json
├── data/                CMS-editable content (written by /admin)
│   ├── settings.json    Company name, tagline, contact details, address
│   └── testimonials.json  Client quotes and optional video links
├── content/products/    One markdown file per product
├── content.config.ts    Content collection schema
├── layouts/             BaseLayout: <head>, SEO meta, header + footer
├── lib/                 Data access (products) and WhatsApp link building
├── pages/               / · /about · /collections · /collections/[slug] · /contact
└── styles/global.css    Tailwind entry, theme tokens, .shell container
deploy/
├── server.mjs           Static server + CMS sign-in routes (Azure / VPS only)
├── auth.mjs             CMS sign-in: password + GitHub OAuth, shared with functions/
└── package.json         Hosting shim manifest — no dependencies by design
functions/api/           Same sign-in routes as Cloudflare Pages Functions
scripts/hash-password.mjs  Generates a CMS_USERS entry
public/
├── admin/index.html     Decap CMS panel
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
| Web3Forms access key                     | `/admin` → Company details (or `src/data/settings.json`) |
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

## Admin panel (/admin)

Client staff manage content at **`/admin`** — Decap CMS, loaded from a CDN on a single static
page. It is git-backed: every save is a commit to this repo, which triggers the deploy workflow,
so the live site updates a couple of minutes later. There is no database and no server to run.

What is editable:

| Section | Writes to | Covers |
| :------ | :-------- | :----- |
| Products | `src/content/products/*.md` | Name, brand, category, slug, description, photos, featured flag, full description |
| Testimonials | `src/data/testimonials.json` | Quote, role, organisation, optional video link |
| Company details | `src/data/settings.json` | Company name, tagline, contact details, address |

Product photos upload into `src/assets/products/`, so Astro still optimises them at build time —
the CMS writes the same relative path the content schema already expects.

Testimonial videos are **linked, not uploaded**: paste a YouTube or Vimeo URL. A git-backed CMS
commits every upload into the repo, and video files would bloat it and slow every clone and build.
Ordinary watch links are converted to embed URLs automatically; anything that is not YouTube or
Vimeo is ignored rather than framed into the page.

### Signing in

Decap only requires that the sign-in popup hand it a GitHub token; it does not care how that token
was obtained. `deploy/auth.mjs` uses that to offer two routes in, and it is shared by the Azure
Node server and the Cloudflare Pages Functions in `functions/api/`.

**Username and password (default).** Client staff who have no GitHub account sign in against
credentials held on the server, and the CMS is handed a GitHub token the server holds.

**Sign in with GitHub (optional).** Appears only when an OAuth app is configured. Better for
developers, because commits are attributed to the real person.

#### Setting up password sign-in

1. Create a **fine-grained personal access token** at Settings → Developer settings → Personal
   access tokens. Scope it to **this repository only**, with **Contents: read and write**. Nothing
   else.
2. Generate a hash for each person (the password is prompted for, never passed as an argument, so
   it stays out of your shell history):

```bash
node scripts/hash-password.mjs client
```

3. Set both values on the server:

```bash
az webapp config appsettings set -g rg-temuin -n amaliautama-preview \
  --settings CMS_GITHUB_TOKEN=<token> CMS_USERS='client:<hash>'
```

`CMS_USERS` takes comma-separated `user:hash` pairs, so several people can have their own login.

**Understand the trade-off before using this.** Decap runs in the browser and calls the GitHub API
directly, so on the password route the shared token does reach the signed-in user's browser. The
password is the only thing protecting write access to the repository — use a long one, and keep
the token scoped to this single repo so the blast radius stays small. Everyone shares one commit
identity. Per-user GitHub sign-in is genuinely more secure; this exists because requiring GitHub
accounts from non-technical staff is not realistic.

Failed sign-ins lock a username out for 15 minutes after 8 attempts. That counter lives in the
server process, so it protects a single App Service instance but would not survive a host that
spreads requests across many isolates.

#### Optional: also allow GitHub sign-in

1. Create an OAuth app at **Settings → Developer settings → OAuth Apps → New OAuth App**:
   - Homepage URL: `https://amaliautama-preview.azurewebsites.net`
   - Authorization callback URL: `https://amaliautama-preview.azurewebsites.net/api/callback`
2. Generate a client secret, then:

```bash
az webapp config appsettings set -g rg-temuin -n amaliautama-preview \
  --settings GITHUB_OAUTH_CLIENT_ID=<id> GITHUB_OAUTH_CLIENT_SECRET=<secret>
```

Anyone who can push to the repo can then sign in that way, committing as themselves.

When the site moves to Cloudflare Pages, set the same variables in the Pages project. For the
GitHub route the callback URL must match the origin the CMS is served from, so register the new
one on the OAuth app.

## Adding a product

Products are normally added through `/admin`. To add one by hand, create
`src/content/products/<slug>.md`:

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

Set the public origin at build time with `SITE_URL`, or canonical and Open Graph URLs fall back to
`example.com`:

```bash
SITE_URL="https://your-domain.com" npm run build
```

### Current preview deployment (temporary)

Live at **https://amaliautama-preview.azurewebsites.net** — an Azure App Service in `rg-temuin`
(subscription `Azure for Students`, Indonesia Central). It shares the existing `tse-web-plan`
B1 plan, so it costs nothing extra.

`deploy/` holds the hosting shim: App Service needs a process listening on `$PORT`, so
`server.mjs` serves `dist/` using only Node built-ins — no dependencies, therefore no install step
on the host. Vercel and Netlify serve `dist/` directly and do not need it; a plain VPS can run it
as-is.

### Continuous deployment

`.github/workflows/deploy.yml` redeploys the preview on every push to `main`, so any contributor's
merged work goes live automatically. It builds, asserts the package is complete, deploys, then
polls the live URL and fails the run if the site does not come back healthy.

Authentication uses **OIDC federation** — there is no password or publish profile stored anywhere.
Entra ID trusts a short-lived token that GitHub mints, and only for `repo:temuin/farel` on
`refs/heads/main`. This matters because the repo is public, and because App Service has SCM basic
auth disabled, which rules out publish-profile deployment entirely.

Three repository secrets are required (Settings → Secrets and variables → Actions). These are
identifiers, not passwords — on their own they grant nothing without a GitHub-issued token for
this exact repo:

| Secret | Value |
| :----- | :---- |
| `AZURE_CLIENT_ID` | `b5bc9cd2-8d61-4855-9b11-42678ac314cc` |
| `AZURE_TENANT_ID` | `7fe9e0ca-4f37-4bf5-8dc4-f052e6fe9e03` |
| `AZURE_SUBSCRIPTION_ID` | `5387361f-a1f4-4c8e-b950-9efddd8c3a80` |

The service principal holds **Contributor on the single web app only** — not the resource group —
so it cannot touch `tse-web` or anything else in the subscription.

Two federated credentials are registered on the app, because the subject claim GitHub sends
depends on the workflow:

| Subject | Applies when |
| :------ | :----------- |
| `repo:temuin/farel:environment:preview` | the job declares `environment:` (what `deploy.yml` does today) |
| `repo:temuin/farel:ref:refs/heads/main` | the job does **not** declare an environment |

Declaring an `environment:` swaps the subject from the branch ref to the environment name. If you
add, rename or remove the environment in the workflow, add the matching credential or the login
fails with `AADSTS700213: No matching federated identity record found`.

To point the build at a different domain later, add a repository variable `SITE_URL`; the workflow
prefers it over the Azure default.

### Manual redeploy

```bash
SITE_URL="https://amaliautama-preview.azurewebsites.net" npm run build
```

Then stage `deploy/server.mjs`, `deploy/package.json` and `dist/` into one folder, zip it (with
forward-slash paths — Windows PowerShell's `Compress-Archive` writes backslashes, which Linux
hosts cannot extract), and run:

```bash
az webapp deploy -g rg-temuin -n amaliautama-preview --src-path deploy.zip --type zip
```

To tear the whole preview down when the client moves to their own infrastructure:

```bash
az webapp delete -g rg-temuin -n amaliautama-preview
az ad app delete --id b5bc9cd2-8d61-4855-9b11-42678ac314cc
```

That removes the preview app and the deploy identity; `tse-web` and the shared plan are untouched.
Delete `.github/workflows/deploy.yml` too, or the workflow will start failing on every push.
