# Project: Indonesian Sports Apparel Catalog Site (farel)

## What this is
Marketing/catalog website for an Indonesian company that distributes Kelme and
Adidas sports apparel. NOT e-commerce — no cart, no checkout, no user accounts.
Reference for tone/structure: https://ark.sg/

## Core requirement
Keep this simple and easy to maintain. Do not add complexity beyond what's
listed below. This is a small catalog site, not a platform.

## Stack
- Astro + Tailwind CSS
- Fully static output (no SSR, no API routes, no traditional database)
- Products as Astro content collections (markdown files with frontmatter)
- Deploy target: Cloudflare Pages (free tier)

## Admin panel / content management
- Decap CMS mounted at `/admin`
- Client's employee logs in (GitHub-backed auth) to add/edit products, photos,
  and page content without touching code
- All content and images are committed directly to the GitHub repo — no
  separate object storage, no external database. This keeps hosting at
  effectively zero cost and avoids a second service to maintain.
- If the product catalog grows very large (hundreds of items, frequent photo
  churn) later, consider Cloudflare R2 for images at that point — not before.

## Deployment / domain
- Hosting: Cloudflare Pages (free), auto-deploy on push to main
- Domain: purchased separately (considering IDCloudHost bundle for a free
  .co.id domain — note .co.id typically requires business registration docs),
  pointed at Cloudflare Pages

## Explicit non-goals (don't add these)
- No CMS beyond Decap CMS
- No auth system beyond what Decap CMS needs
- No analytics, i18n, or animation libraries unless specifically requested
- No traditional backend/server, no database
- No e-commerce functionality (cart, checkout, payments)

---

# Production deployment (Cloudflare Pages)

## 1. Create the Pages project

Cloudflare's Git integration has to be connected from the dashboard -- there is
no API for linking a repository, so this step is manual and one-off.

Workers & Pages -> Create -> Pages -> Connect to Git -> `temuin/farel`.

Build settings:

| Setting              | Value           |
| -------------------- | --------------- |
| Framework preset     | Astro           |
| Build command        | `npm run build` |
| Build output         | `dist`          |
| Production branch    | `main`          |

Nothing else needs changing. `functions/` is picked up automatically and
becomes `/api/auth` and `/api/callback`.

## 2. Environment variables

Set these on the **Production** environment (Settings -> Environment
variables). Mark the two CMS ones as **Secret** so they are write-only
afterwards.

| Variable           | Value                                                     |
| ------------------ | --------------------------------------------------------- |
| `SITE_URL`         | The real domain, e.g. `https://amaliautama.co.id`          |
| `CMS_USERS`        | `username:hash` pairs -- generate with the script below     |
| `CMS_GITHUB_TOKEN` | Fine-grained PAT, see scoping rules below                  |

`SITE_URL` matters more than it looks: it drives every canonical and Open
Graph URL. Without it a production build falls back to `CF_PAGES_URL`, so the
site would advertise its `*.pages.dev` address to Google instead of the real
domain. Preview branches are meant to fall back that way; production is not.

Generate a password hash:

```
node scripts/hash-password.mjs
```

## 3. Scope the GitHub token tightly

This is the single most important control on the whole deployment. Decap runs
in the browser and talks to the GitHub API directly, so on the password path
**the token is handed to the signed-in user's browser**. Anyone who can log in
to /admin can read it out of localStorage and use it directly against the API
until it expires.

Create it as a **fine-grained** PAT (Settings -> Developer settings ->
Fine-grained tokens):

- Resource owner: the account that owns `temuin/farel`
- Repository access: **Only select repositories** -> `temuin/farel`
- Permissions: **Contents: Read and write** -- and nothing else
- Expiration: set one, and put a calendar reminder to rotate it

A classic PAT must not be used here: classic tokens carry access to every
repository the account can reach.

## 4. Add a rate-limiting rule on /api/auth

The per-process login throttle in `deploy/auth.mjs` does **not** work on
Cloudflare. Pages spreads requests across many short-lived isolates, each with
its own copy of the counter, so it resets constantly and is trivially
sidestepped. Password guessing is therefore only bounded by PBKDF2's cost
unless a rule is added at the edge.

Security -> WAF -> Rate limiting rules -> Create:

- **Expression:** `http.request.uri.path eq "/api/auth" and http.request.method eq "POST"`
- **Characteristics:** IP
- **Rate:** 10 requests per 1 minute
- **Action:** Block, 10-minute timeout

One rate-limiting rule is included on the free plan.

## 5. Custom domain

Pages project -> Custom domains -> Set up a domain. Then update `SITE_URL` to
match and redeploy, or canonical URLs will keep pointing at the old address.

## 6. Retire the Azure preview

`.github/workflows/deploy.yml` still deploys to Azure App Service on every
push to `main`. Once Cloudflare is live this should go, for two reasons: a
second public copy of the site competes with the real one in search results,
and it holds a second live copy of the same GitHub write token. Delete the
workflow, the App Service, and the token's Azure-side configuration together.

---

# Security posture

Reviewed and hardened before the production cutover. What is in place:

- **No secrets in the repository.** Verified across the tracked tree and
  history; everything sensitive is a Pages environment variable.
- **Content Security Policy.** Astro generates a per-page policy with hashes
  for every inline script, so the marketing pages run no un-hashed script.
  `/admin` and the sign-in endpoints carry their own stricter policies.
- **Decap CMS pinned by content**, not just by version. The `integrity` hash on
  the CDN script was taken from the npm registry tarball and confirmed
  byte-identical to what unpkg serves, so a tampered CDN response cannot
  execute on the origin that stores the GitHub token.
- **Security headers** on every response: `nosniff`, `X-Frame-Options: DENY`,
  a strict `Referrer-Policy`, `Permissions-Policy`, and HSTS. Note that
  `public/_headers` reaches static assets only; the Functions set their own.
- **Sign-in**: PBKDF2-SHA256 at 210k iterations, constant-time comparison, a
  dummy derivation for unknown users so wrong-user and wrong-password are
  indistinguishable in both message and timing.
- **Fixed during this review**: a reflected XSS on `/api/callback`.
  `JSON.stringify` does not escape `</script>`, so an attacker-supplied
  `error_description` closed the script block early and injected live markup
  on the same origin that stores the GitHub token in localStorage. The value
  is now escaped for script context and the inline script is hash-pinned.
- **Also fixed**: the OAuth popup echoed the token to whatever origin messaged
  it first; sender and target are now both pinned to this site's own origin.

## Known and accepted

- **The CMS token reaches the browser.** Inherent to Decap's architecture on
  the password path, and the reason step 3 matters. If commit attribution per
  person or tighter blast radius is wanted later, configure the GitHub OAuth
  app instead and each editor signs in as themselves.
- **Login rate limiting depends on the Cloudflare rule** from step 4, not on
  application code.
