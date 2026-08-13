/**
 * Minimal static file server for the built site, plus the two OAuth endpoints
 * the CMS at /admin needs.
 *
 * Astro emits a plain static `dist/`, but Azure App Service (Linux) needs a
 * process listening on $PORT. This uses only Node built-ins, so the deployment
 * package has no dependencies to install — and it moves to any VPS unchanged.
 * On Cloudflare Pages this file is not used; `functions/api/` serves the same
 * OAuth routes and Pages serves `dist/` itself.
 */
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeOAuth } from './oauth.mjs';

const ROOT = resolve(fileURLToPath(new URL('./dist', import.meta.url)));
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/**
 * Astro's asset filenames carry a content hash, so they can be cached
 * indefinitely. HTML must always revalidate or a redeploy goes unnoticed.
 */
function cacheControl(filePath) {
  if (filePath.includes(`${sep}_astro${sep}`)) return 'public, max-age=31536000, immutable';
  if (filePath.endsWith('.html')) return 'no-cache';
  return 'public, max-age=3600';
}

async function statFile(candidate) {
  try {
    const info = await stat(candidate);
    return info.isFile() ? info : null;
  } catch {
    return null;
  }
}

/**
 * Maps a URL path to a file, following Astro's directory build format where
 * `/about` is emitted as `about/index.html`.
 */
async function resolveTarget(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }

  const requested = resolve(join(ROOT, decoded));
  // Reject anything that escapes the site root.
  if (requested !== ROOT && !requested.startsWith(ROOT + sep)) return null;

  const direct = await statFile(requested);
  if (direct) return { path: requested, info: direct };

  const asIndex = resolve(join(requested, 'index.html'));
  if (asIndex !== ROOT && !asIndex.startsWith(ROOT + sep)) return null;
  const index = await statFile(asIndex);
  if (index) return { path: asIndex, info: index };

  return null;
}

/**
 * App Service terminates TLS in front of us, so the inbound request arrives
 * over http. The OAuth redirect_uri and cookies must still say https or GitHub
 * rejects the callback, hence trusting the proxy's forwarded-proto here.
 */
function externalUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto']?.split(',')[0]?.trim();
  const proto = forwardedProto || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return new URL(req.url || '/', `${proto}://${host}`);
}

/** Bridges node:http to the Web-standard handlers in oauth.mjs. */
async function sendWebResponse(res, response) {
  const headers = {};
  const setCookies = [];
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') setCookies.push(value);
    else headers[key] = value;
  });
  if (setCookies.length) headers['Set-Cookie'] = setCookies;

  res.writeHead(response.status, headers);
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  const url = externalUrl(req);
  if (url.pathname === '/api/auth' || url.pathname === '/api/callback') {
    // Only the cookie is read downstream, and node's raw header values can be
    // arrays, so copy across just what is needed rather than the whole bag.
    const headers = new Headers();
    if (typeof req.headers.cookie === 'string') headers.set('cookie', req.headers.cookie);

    const response = await routeOAuth(new Request(url, { method: 'GET', headers }), process.env);
    if (response) return sendWebResponse(res, response);
  }

  const target = await resolveTarget(req.url || '/');

  if (!target) {
    const notFound = await resolveTarget('/404.html');
    if (notFound) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      if (req.method === 'HEAD') return res.end();
      return createReadStream(notFound.path).pipe(res);
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': MIME[extname(target.path).toLowerCase()] ?? 'application/octet-stream',
    'Content-Length': target.info.size,
    'Cache-Control': cacheControl(target.path),
    'X-Content-Type-Options': 'nosniff',
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(target.path).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Serving ${ROOT} on port ${PORT}`);
});
