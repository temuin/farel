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

# Production deployment

Target: **Cloudflare Pages**, custom domain **amaliautama.co.id**, repository
`temuin/farel`, production branch `main`. Node is pinned to 22.12.0 by
`.nvmrc`, which Pages reads directly.

Work the phases in order — phase 5 depends on phase 1 having propagated.

## 1. Put the domain on Cloudflare

An apex domain can only serve a Pages project if it is a zone on the Cloudflare
account; a CNAME from an external DNS host works for subdomains only. This also
unlocks the rate-limiting rule in phase 7 and Access in phase 8, which are
per-zone features and unavailable on `*.pages.dev`. The registration stays with
the current registrar — only DNS is delegated.

1. Cloudflare -> Add a site -> `amaliautama.co.id` -> Free plan.
2. **Reconcile the imported DNS records before changing anything.** If the
   domain handles email, its MX and SPF/DKIM TXT records must exist in
   Cloudflare before delegation takes effect. The automatic scan misses records
   regularly, and anything absent stops resolving the moment nameservers flip.
3. Change the nameservers at the registrar to the two Cloudflare provides.
4. Wait for the zone to show Active. Usually under an hour.
5. SSL/TLS -> Overview -> **Full (strict)**. Weaker modes can cause redirect
   loops against Pages.

## 2. Create the two credentials

```
node scripts/hash-password.mjs admin
```

Prints the `admin:pbkdf2$100000$...` line for `CMS_USERS`. The password itself
is never stored, so record it in a password manager at the same time.

The iteration count is 100,000 because Cloudflare Workers refuses PBKDF2 above
that and returns an error rather than a slow answer. Node has no such limit, so
a hash minted at a higher count verifies perfectly on your machine and then
fails on the deployed site. If you ever see sign-in rejecting a password you
know is right, check the number after `pbkdf2$` first.

Then, signed in as **temuin**, create a **fine-grained** PAT:

| Field             | Value                                      |
| ----------------- | ------------------------------------------ |
| Resource owner    | `temuin`                                   |
| Repository access | Only select repositories -> `farel`        |
| Permissions       | Contents: **Read and write**, nothing else |
| Expiration        | Set one, with a reminder to rotate         |

Two constraints that are easy to get wrong. It must be fine-grained, not
classic: Decap hands this token to the browser of everyone who signs in, and a
classic token's `public_repo` scope would give each of them write access to
every public repository on the account. And it must be created by `temuin` —
fine-grained tokens only reach repositories owned by their creator, so one made
from a collaborator account 404s at sign-in.

## 3. Create the Pages project

Cloudflare steers new projects to Workers now, so Pages is no longer the
default path. Workers & Pages -> Create application -> the **Pages** tab ->
Connect to Git. Direct link if the tab is buried:

```
https://dash.cloudflare.com/?to=/:account/pages/new/provider/github
```

The Pages form asks for a build output directory and has no deploy command or
API token field; the Workers wizard has both and expects a `wrangler` config
this repo does not carry.

| Setting                | Value                 |
| ---------------------- | --------------------- |
| Project name           | `amaliautama-website` |
| Production branch      | `main`                |
| Framework preset       | Astro                 |
| Build command          | `npm run build`       |
| Build output directory | `dist`                |
| Root directory         | blank                 |

`functions/` is detected automatically and becomes `/api/auth` and
`/api/callback`. Run this first build with no environment variables and confirm
it goes green before adding secrets.

## 4. Add the secrets

Settings -> Environment variables -> **Production**, both marked **Secret**:

| Variable           | Value                       |
| ------------------ | --------------------------- |
| `CMS_USERS`        | the `admin:pbkdf2$...` line |
| `CMS_GITHUB_TOKEN` | the fine-grained PAT        |

Production only. Preview branches then report "sign-in is not configured",
which keeps the token off every preview URL.

**Then redeploy.** Environment variables do not apply to a build that has
already run.

## 5. Attach the custom domain

Once the zone is Active: project -> Custom domains -> Set up a domain ->
`amaliautama.co.id`, then again for `www.amaliautama.co.id`. Cloudflare creates
the records and flattens the CNAME at the apex. Add a redirect rule so one host
is canonical.

A 522 here usually means the domain was attached before the project had a
successful deployment.

## 6. Point the canonical URLs at the domain

Add `SITE_URL=https://amaliautama.co.id` to Production (a normal variable, not
a secret) and **redeploy**. Canonical and Open Graph URLs are baked in at build
time, so until a build runs with it set, every page still advertises the
`pages.dev` address. Do this only after the domain resolves.

## 7. Rate-limit the sign-in endpoint

Not optional. The failed-attempt counter in `deploy/auth.mjs` lives in memory in
one isolate; Pages spreads requests across many, so it resets constantly and is
trivially sidestepped. Without an edge rule, guessing is bounded only by
PBKDF2's cost.

Zone -> Security -> WAF -> Rate limiting rules -> Create:

- Expression: `http.request.uri.path eq "/api/auth" and http.request.method eq "POST"`
- Characteristic: IP
- Rate: 10 requests per 1 minute
- Action: Block, 10 minute timeout

One rule is included on the free plan.

## 8. Cloudflare Access on /admin (optional, recommended)

Free for up to 50 users. Zero Trust -> Access -> Applications -> Add a
self-hosted application, path `amaliautama.co.id/admin`, policy Allow -> Emails
-> the staff who edit the site. Add a second application for `/api/auth`.

Without it, one password is the only thing between the internet and a GitHub
write token. With it, an attacker has to clear an email one-time code or SSO
before the login form is even reachable.

## 9. Verify

```
curl -sI https://amaliautama.co.id/ | grep -i "x-frame-options\|strict-transport"
curl -s  https://amaliautama.co.id/ | grep -o '<link rel="canonical"[^>]*>'
```

Then in a browser: homepage marquees animate, contact map renders, no CSP
errors in the console, and `/admin` signs in and saves. That save commits to
`main`, triggers a build, and appears live in about a minute — confirm that loop
end to end, since it is the whole point of the setup.

## 10. After go-live

`.github/workflows/deploy.yml` still deploys to Azure App Service on every push.
Once Cloudflare is confirmed, delete the workflow, the App Service, and its
separate copy of the GitHub token together: a second public copy of the site
competes in search results and doubles the token's exposure.

Diarise the PAT expiry — when it lapses, /admin stops saving.

---

# Security posture

Reviewed and hardened before the production cutover.

- **No secrets in the repository.** Verified across the tracked tree and
  history; everything sensitive is a Pages environment variable.
- **Content Security Policy.** Astro generates a per-page policy with hashes for
  every inline script. `/admin` and the sign-in endpoints carry their own
  stricter policies.
- **Decap CMS pinned by content**, not just version. The `integrity` hash came
  from the npm registry tarball and was confirmed byte-identical to what unpkg
  serves, so a tampered CDN response cannot execute on the origin that stores
  the GitHub token.
- **Security headers** on every response: nosniff, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS. Note `public/_headers` reaches
  static assets only — Functions set their own, in code.
- **Sign-in**: PBKDF2-SHA256 at 210k iterations, constant-time comparison, and a
  dummy derivation for unknown users so a wrong username and a wrong password
  are indistinguishable in both message and timing.
- **Fixed during review**: a reflected XSS on `/api/callback`. `JSON.stringify`
  does not escape `</script>`, so an attacker-supplied `error_description`
  closed the script block early and injected live markup on the same origin that
  stores the GitHub token. Values are now escaped for script context and the
  inline script is hash-pinned.
- **Also fixed**: the OAuth popup echoed the token to whatever origin messaged
  it first; sender and target are now pinned to this site's own origin.

## Known and accepted

- **The CMS token reaches the browser.** Inherent to Decap on the password path,
  and the reason the token scoping in phase 2 matters. For per-person commit
  attribution, configure the GitHub OAuth app instead and each editor signs in
  as themselves.
- **Login rate limiting depends on the phase 7 rule**, not on application code.
