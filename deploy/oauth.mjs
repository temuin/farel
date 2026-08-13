/**
 * GitHub OAuth broker for the Decap CMS panel at /admin.
 *
 * Decap's GitHub backend needs somewhere server-side to swap the OAuth code
 * for a token, because GitHub has no PKCE public-client flow — the exchange
 * requires a client secret that must never reach the browser. This is the
 * whole of that server-side part.
 *
 * Written against Web-standard Request/Response so the same logic runs on the
 * Azure Node server today and on Cloudflare Pages Functions later, with only a
 * thin adapter at each end.
 *
 * Requires two environment variables, neither of which belongs in the repo:
 *   GITHUB_OAUTH_CLIENT_ID
 *   GITHUB_OAUTH_CLIENT_SECRET
 */

const STATE_COOKIE = 'decap_oauth_state';
const PROVIDER = 'github';

const html = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request, name) {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

/**
 * The popup handshake Decap expects: announce ourselves to the opener, wait
 * for it to answer, then hand back the result addressed to the opener's own
 * origin rather than a wildcard.
 */
function popupResponse(status, content) {
  const payload = JSON.stringify(`authorization:${PROVIDER}:${status}:${JSON.stringify(content)}`);

  return html(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Signing in…</title></head>
  <body>
    <p>Completing sign-in…</p>
    <script>
      (function () {
        var message = ${payload};
        function receive(event) {
          if (!window.opener) return;
          window.opener.postMessage(message, event.origin);
          window.removeEventListener('message', receive, false);
        }
        window.addEventListener('message', receive, false);
        if (window.opener) {
          window.opener.postMessage('authorizing:${PROVIDER}', '*');
        } else {
          document.body.textContent = 'Open the CMS at /admin and sign in from there.';
        }
      })();
    </script>
  </body>
</html>`);
}

/** Step 1: bounce the user to GitHub, remembering a state value in a cookie. */
export function handleAuthorize(request, env) {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId) {
    return popupResponse('error', 'GITHUB_OAUTH_CLIENT_ID is not configured on the server.');
  }

  const origin = new URL(request.url).origin;
  const state = randomState();

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${origin}/api/callback`);
  // `repo` is the narrowest scope that still allows committing to a repo that
  // may be private later; Decap writes content as real commits.
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

/** Step 2: verify state, trade the code for a token, hand it to the CMS. */
export async function handleCallback(request, env) {
  const clientId = env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return popupResponse('error', 'GitHub OAuth is not configured on the server.');
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

  const result = popupResponse('success', { token, provider: PROVIDER });
  // The state cookie has done its job; do not leave it lying around.
  result.headers.append(
    'Set-Cookie',
    `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
  return result;
}

/** Routes the two OAuth paths; returns null so callers can fall through. */
export function routeOAuth(request, env) {
  const { pathname } = new URL(request.url);
  if (pathname === '/api/auth') return handleAuthorize(request, env);
  if (pathname === '/api/callback') return handleCallback(request, env);
  return null;
}
