/**
 * Sign-in for the Decap CMS panel at /admin.
 *
 * Decap's contract is narrow: the popup it opens must eventually postMessage
 * `authorization:github:success:{"token":"…"}` back to the opener. It does not
 * care how that token was obtained. That lets us offer two ways in:
 *
 *   1. Username + password (default). Client staff who have no GitHub account
 *      sign in against credentials configured on the server, and we hand the
 *      CMS a GitHub token we hold. All commits are then authored by whoever
 *      owns that token.
 *   2. Sign in with GitHub (shown only when an OAuth app is configured).
 *      Better for developers: commits are attributed to the real person.
 *
 * TRADE-OFF, deliberately accepted and worth knowing: Decap is a browser app
 * and talks to the GitHub API directly, so on the password path the shared
 * token does reach the signed-in user's browser. The password is therefore the
 * real gate — use a strong one, and scope the token to this repository only
 * (fine-grained PAT, Contents: read and write). This is weaker than per-user
 * OAuth; it is the cost of not requiring GitHub accounts.
 *
 * Environment variables:
 *   CMS_USERS               user:hash,user2:hash   (see scripts/hash-password.mjs)
 *   CMS_GITHUB_TOKEN        fine-grained PAT scoped to this repo
 *   GITHUB_OAUTH_CLIENT_ID      optional, enables the GitHub button
 *   GITHUB_OAUTH_CLIENT_SECRET  optional, required with the above
 */

const STATE_COOKIE = 'decap_oauth_state';
const PROVIDER = 'github';
const PBKDF2_ITERATIONS = 210000;

/** Lockout after this many failures, per username, until the window passes. */
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 15 * 60 * 1000;

/*
 * Per-isolate only, and on Cloudflare Pages that barely holds: requests are
 * spread across many short-lived isolates, each getting its own copy of this
 * map, so the counter is trivially sidestepped and resets constantly. Treat it
 * as a speed bump against naive scripted bursts, nothing more. The defences
 * that actually carry weight here are a strong password, PBKDF2's per-attempt
 * cost, and a Cloudflare rate-limiting rule on /api/auth — see DEPLOYMENTS.md.
 */
const attempts = new Map();

/*
 * Every header these pages need has to be set right here. Cloudflare Pages
 * applies public/_headers to static assets only — a Function's response goes
 * out exactly as it is built, so nothing in that file reaches /api/*.
 * Framing is denied because these pages carry the sign-in form and, on the
 * OAuth leg, the token handoff; neither should ever render inside someone
 * else's page.
 */
const html = (body, status = 200, extraHeaders = {}) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      ...extraHeaders,
    },
  });

const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/**
 * JSON for embedding inside a <script> block, which is NOT the same as plain
 * JSON.stringify. An HTML parser looks for `</script` in the raw text before
 * any JavaScript runs, so a string containing one closes the block early and
 * everything after it becomes live markup. GitHub's error_description comes
 * straight off the query string, which made that reachable. Escaping the
 * angle brackets (plus & and the two Unicode line terminators JS treats as
 * newlines) keeps the value inert while staying valid JSON.
 */
const toScriptJson = (value) =>
  JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'),
  );

function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

const toBase64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const fromBase64 = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

/** PBKDF2-SHA256. Available on both Node and the Workers runtime. */
export async function derive(password, salt, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

/** Encoded as pbkdf2$<iterations>$<saltB64>$<hashB64>. */
export async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const hash = await derive(password, salt);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Compares without leaking how many leading bytes matched. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password, encoded) {
  const [scheme, iterations, saltB64, hashB64] = String(encoded).split('$');
  if (scheme !== 'pbkdf2' || !iterations || !saltB64 || !hashB64) return false;
  try {
    const expected = fromBase64(hashB64);
    const actual = await derive(password, fromBase64(saltB64), Number(iterations));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** CMS_USERS is `user:hash` pairs, comma or newline separated. */
function parseUsers(env) {
  const raw = env.CMS_USERS;
  if (!raw) return new Map();
  const users = new Map();
  for (const entry of raw.split(/[,\n]/)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(':');
    if (separator < 1) continue;
    users.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
  }
  return users;
}

/**
 * Whether a stored value is even shaped like a hash this code can check.
 *
 * pbkdf2$<iterations>$<salt b64>$<hash b64>. The usual way it stops being
 * that is shell interpolation: pasted into double quotes, a shell eats
 * everything from each $ onward and silently stores a truncated string.
 */
const HASH_SHAPE = /^pbkdf2\$\d+\$[A-Za-z0-9+/=]{20,}\$[A-Za-z0-9+/=]{40,}$/;
const looksLikeHash = (encoded) => HASH_SHAPE.test(String(encoded).trim());

function isLockedOut(username) {
  const record = attempts.get(username);
  if (!record) return false;
  if (Date.now() - record.first > LOCKOUT_MS) {
    attempts.delete(username);
    return false;
  }
  return record.count >= MAX_ATTEMPTS;
}

function recordFailure(username) {
  const record = attempts.get(username);
  if (!record || Date.now() - record.first > LOCKOUT_MS) {
    attempts.set(username, { count: 1, first: Date.now() });
  } else {
    record.count += 1;
  }
}

/**
 * The popup handshake Decap expects.
 *
 * Async because the inline script is pinned by hash in this response's own CSP
 * — belt and braces alongside toScriptJson, so that even a future escaping
 * slip cannot get injected markup to execute here. This origin also serves
 * /admin, whose localStorage holds the GitHub token, so script execution on it
 * is exactly what must not be possible.
 */
async function popupResponse(status, content, extraHeaders = {}) {
  const message = toScriptJson(
    `authorization:${PROVIDER}:${status}:${JSON.stringify(content)}`,
  );

  const script = `
    (function () {
      var message = ${message};
      /*
       * The token may only ever go back to this same site's /admin. Pinning
       * both the accepted sender and the postMessage target to our own origin
       * means a page on another origin that manages to open this popup cannot
       * coax the token out of it by messaging in first and having its own
       * origin echoed back as the target.
       */
      var origin = window.location.origin;
      function receive(event) {
        if (event.origin !== origin || !window.opener) return;
        window.opener.postMessage(message, origin);
        window.removeEventListener('message', receive, false);
      }
      window.addEventListener('message', receive, false);
      if (window.opener) {
        window.opener.postMessage('authorizing:${PROVIDER}', origin);
      } else {
        document.body.textContent = 'Open the CMS at /admin and sign in from there.';
      }
    })();
  `;

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script));

  return html(
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Signing in…</title></head>
<body style="font:15px system-ui;padding:24px">
  <p>Completing sign-in…</p>
  <script>${script}</script>
</body></html>`,
    200,
    {
      'Content-Security-Policy': [
        "default-src 'none'",
        `script-src 'sha256-${toBase64(digest)}'`,
        "style-src 'unsafe-inline'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
      ].join('; '),
      ...extraHeaders,
    },
  );
}

function loginPage(env, { error, username = '' } = {}) {
  const githubEnabled = Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);
  const nonce = randomHex();

  return html(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Sign in — Content Manager</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0; min-height: 100vh; display: grid; place-items: center;
      font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5; color: #202020;
    }
    .card {
      width: min(360px, calc(100vw - 32px)); background: #fff; padding: 28px;
      border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,.08);
    }
    h1 { margin: 0 0 4px; font-size: 18px; }
    p.sub { margin: 0 0 20px; color: #6b6b6b; font-size: 13px; }
    label { display: block; font-weight: 600; font-size: 13px; margin-bottom: 6px; }
    input {
      width: 100%; box-sizing: border-box; padding: 10px 12px; font-size: 14px;
      border: 1px solid #d4d4d4; border-radius: 10px; margin-bottom: 14px; background: #fff; color: inherit;
    }
    input:focus { outline: 2px solid #095d3e; outline-offset: 1px; border-color: #095d3e; }
    button {
      width: 100%; padding: 11px; font-size: 14px; font-weight: 600; cursor: pointer;
      border: 0; border-radius: 999px; background: #095d3e; color: #fff;
    }
    button:hover { background: #06462f; }
    .error {
      background: #fdecec; color: #8c1c1c; border: 1px solid #f5c2c2;
      padding: 10px 12px; border-radius: 10px; font-size: 13px; margin-bottom: 16px;
    }
    .divider { margin: 20px 0 14px; text-align: center; color: #9a9a9a; font-size: 12px; }
    a.github {
      display: block; text-align: center; padding: 10px; border-radius: 999px;
      border: 1px solid #d4d4d4; text-decoration: none; color: inherit; font-size: 14px; font-weight: 600;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #171717; color: #f5f5f5; }
      .card { background: #202020; box-shadow: none; }
      input { background: #171717; border-color: #3f3f3f; }
      a.github { border-color: #3f3f3f; }
      p.sub, .divider { color: #a3a3a3; }
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Content Manager</h1>
    <p class="sub">Sign in to edit the website.</p>
    ${error ? `<div class="error" role="alert">${escapeHtml(error)}</div>` : ''}
    <form method="POST" action="/api/auth">
      <input type="hidden" name="nonce" value="${nonce}" />
      <label for="username">Username</label>
      <input id="username" name="username" autocomplete="username" required autofocus value="${escapeHtml(username)}" />
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <button type="submit">Sign in</button>
    </form>
    ${
      githubEnabled
        ? `<div class="divider">or</div><a class="github" href="/api/auth?provider=github">Sign in with GitHub</a>`
        : ''
    }
  </main>
</body>
</html>`,
    error ? 401 : 200,
    {
      'Set-Cookie': `${STATE_COOKIE}=${nonce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=900`,
    },
  );
}

/** GET /api/auth — login form, or straight to GitHub when explicitly asked. */
export function handleAuthGet(request, env) {
  const url = new URL(request.url);
  const wantsGitHub = url.searchParams.get('provider') === 'github';
  const githubEnabled = Boolean(env.GITHUB_OAUTH_CLIENT_ID && env.GITHUB_OAUTH_CLIENT_SECRET);

  // Decap always appends provider=github, so only treat it as a GitHub sign-in
  // when there is no password login configured, or the user clicked through.
  const passwordEnabled = parseUsers(env).size > 0 && Boolean(env.CMS_GITHUB_TOKEN);

  if (wantsGitHub && githubEnabled && (!passwordEnabled || url.searchParams.has('force_github'))) {
    return redirectToGitHub(url, env);
  }
  if (!passwordEnabled && githubEnabled) return redirectToGitHub(url, env);
  if (!passwordEnabled) {
    return loginPage(env, {
      error: 'Sign-in is not configured yet. Set CMS_USERS and CMS_GITHUB_TOKEN on the server.',
    });
  }
  return loginPage(env);
}

function redirectToGitHub(url, env) {
  const state = randomHex();
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_OAUTH_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${url.origin}/api/callback`);
  authorize.searchParams.set('scope', 'repo,user');
  authorize.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Cache-Control': 'no-store',
      'Set-Cookie': `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

/**
 * Confirms the stored token can actually write to the repo, so a wrong or
 * expired token fails at sign-in with a clear message instead of surfacing
 * later as a confusing "not found" when someone tries to save.
 */
async function checkToken(token, repo) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'amalia-utama-cms',
  };

  try {
    const whoami = await fetch('https://api.github.com/user', { headers });
    if (whoami.status === 401) return 'The saved GitHub token is invalid or expired.';
    if (!whoami.ok) return `GitHub rejected the saved token (HTTP ${whoami.status}).`;

    if (!repo) return null;

    const repoResponse = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (repoResponse.status === 404) {
      return `The saved token cannot see ${repo}. A fine-grained token only works for repositories owned by the account that created it.`;
    }
    if (!repoResponse.ok) return `Could not check access to ${repo} (HTTP ${repoResponse.status}).`;

    const data = await repoResponse.json();
    if (!data.permissions?.push) {
      return `The saved token can read ${repo} but not write to it. It needs Contents: read and write.`;
    }
    return null;
  } catch {
    return 'Could not reach GitHub to check the saved token.';
  }
}

/** POST /api/auth — verify username + password, then issue the shared token. */
export async function handleAuthPost(request, env) {
  const users = parseUsers(env);
  const token = env.CMS_GITHUB_TOKEN;
  // The admin page asks for JSON so it can sign in without a popup.
  const wantsJson = (request.headers.get('accept') ?? '').includes('application/json');
  const fail = (message, username) =>
    wantsJson
      ? new Response(JSON.stringify({ error: message }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        })
      : loginPage(env, { error: message, username });

  if (users.size === 0 || !token) {
    return fail('Sign-in is not configured on the server.');
  }

  /*
   * A malformed hash is indistinguishable from a wrong password to whoever is
   * signing in, which makes a mangled CMS_USERS value maddening to diagnose --
   * the server insists the password is wrong when it is actually incapable of
   * checking it.
   *
   * Only reported when NOT ONE entry is usable. That is unambiguously a broken
   * deployment rather than a bad guess, and because it says nothing about which
   * usernames exist, it gives an attacker nothing either.
   */
  if (![...users.values()].some(looksLikeHash)) {
    return fail(
      'Sign-in is misconfigured: CMS_USERS contains no usable password hash. ' +
        'It must look like username:pbkdf2$210000$<salt>$<hash> — check the ' +
        'whole line was pasted, including every $ section, and redeploy.',
    );
  }

  let form;
  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return fail('Could not read the sign-in form.');
  }

  const username = (form.get('username') ?? '').trim();
  const password = form.get('password') ?? '';
  const nonce = form.get('nonce') ?? '';
  const expectedNonce = readCookie(request, STATE_COOKIE);

  // The inline sign-in on /admin posts with fetch and carries no nonce cookie,
  // so the check applies to the standalone HTML form only. Both are same-origin
  // POSTs whose response an attacker's page cannot read.
  if (!wantsJson && (!nonce || !expectedNonce || nonce !== expectedNonce)) {
    return fail('Your sign-in form expired. Please try again.', username);
  }

  if (isLockedOut(username)) {
    return fail('Too many failed attempts. Wait 15 minutes and try again.', username);
  }

  const stored = users.get(username);
  // Run the derivation even for an unknown user so a wrong username and a
  // wrong password take the same amount of time.
  const candidate = stored ?? `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(new Uint8Array(16))}$${toBase64(new Uint8Array(32))}`;
  const ok = (await verifyPassword(password, candidate)) && Boolean(stored);

  if (!ok) {
    recordFailure(username);
    return fail('Wrong username or password.', username);
  }

  attempts.delete(username);

  // Catch a bad token here, where the message can be specific, rather than
  // letting it surface as an opaque failure the first time someone saves.
  const tokenProblem = await checkToken(token, env.CMS_REPO ?? 'temuin/farel');
  if (tokenProblem) return fail(tokenProblem, username);

  const clearCookie = `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

  if (wantsJson) {
    return new Response(JSON.stringify({ token, provider: PROVIDER }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': clearCookie,
      },
    });
  }

  return popupResponse('success', { token, provider: PROVIDER }, { 'Set-Cookie': clearCookie });
}

/** GET /api/callback — GitHub OAuth return leg. */
export async function handleCallback(request, env) {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return popupResponse('error', 'GitHub sign-in is not configured on the server.');
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expectedState = readCookie(request, STATE_COOKIE);

  if (url.searchParams.get('error')) {
    return popupResponse('error', url.searchParams.get('error_description') || 'Access denied.');
  }
  if (!code) return popupResponse('error', 'GitHub did not return an authorization code.');
  if (!state || !expectedState || state !== expectedState) {
    return popupResponse('error', 'Sign-in state did not match. Please try again.');
  }

  let token;
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${url.origin}/api/callback`,
      }),
    });
    const data = await response.json();
    if (data.error) return popupResponse('error', data.error_description || data.error);
    token = data.access_token;
  } catch {
    return popupResponse('error', 'Could not reach GitHub to complete sign-in.');
  }

  if (!token) return popupResponse('error', 'GitHub did not return an access token.');

  return popupResponse('success', { token, provider: PROVIDER }, {
    'Set-Cookie': `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  });
}

/** Routes the auth paths; returns null so callers can fall through. */
export function routeAuth(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/auth') {
    return request.method === 'POST' ? handleAuthPost(request, env) : handleAuthGet(request, env);
  }
  if (pathname === '/api/callback') return handleCallback(request, env);
  return null;
}
