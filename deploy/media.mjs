/**
 * Media API behind the CMS image picker.
 *
 * Product photos live in an R2 bucket rather than in the repository, so the
 * admin panel needs somewhere to upload them to. This is that endpoint.
 *
 * Two things are worth knowing about the design:
 *
 * 1. No credentials. The bucket arrives as a binding (env.MEDIA) that
 *    Cloudflare wires up at the platform level, so there is no access key to
 *    store, rotate, or leak. That is the whole reason to prefer a binding over
 *    the S3-compatible API here.
 *
 * 2. Authorisation reuses what the CMS already holds. Whoever is signed in to
 *    /admin has a GitHub token that can write to the repository; we ask GitHub
 *    whether that token really can, and allow the upload if so. That means no
 *    second set of credentials and no session layer to get wrong -- and it
 *    fails closed, because a token that cannot commit content has no business
 *    adding media either.
 *
 * Without the check this would be an open write endpoint on a public site,
 * which is worth stating plainly: anyone could fill the bucket.
 */

/*
 * Generous on purpose: the client's product photography comes off the camera
 * at 18-28 MB a file, and the whole point of the bucket is that originals go
 * in untouched. The body is streamed straight to R2, so a large upload costs
 * no memory here. Well inside the Workers request-body ceiling.
 */
const MAX_UPLOAD_BYTES = 60 * 1024 * 1024;

/** Only formats Astro's image pipeline can actually process. */
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

/**
 * Confirms the bearer token can push to the content repository.
 *
 * Cached per token for the lifetime of the isolate: the picker lists, uploads
 * and deletes in quick succession, and re-asking GitHub every time would both
 * be slow and burn rate limit for no benefit.
 */
const verified = new Map();

async function canWrite(token, repo) {
  if (!token) return false;
  if (verified.has(token)) return verified.get(token);

  let ok = false;
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'amalia-utama-cms',
      },
    });
    if (response.ok) {
      const data = await response.json();
      ok = Boolean(data.permissions?.push);
    }
  } catch {
    ok = false;
  }

  verified.set(token, ok);
  return ok;
}

const bearer = (request) => {
  const header = request.headers.get('authorization') ?? '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
};

/**
 * Object keys are derived, never taken from the client: a name straight from
 * the browser could contain slashes or ".." and write outside the prefix.
 */
function toKey(filename) {
  const dot = filename.lastIndexOf('.');
  const stem = (dot === -1 ? filename : filename.slice(0, dot))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return stem || 'photo';
}

export async function handleMedia(request, env) {
  const bucket = env.MEDIA;
  if (!bucket) {
    return json({ error: 'No media bucket is bound to this deployment.' }, 500);
  }

  const base = (env.MEDIA_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base) {
    return json({ error: 'MEDIA_BASE_URL is not set on this deployment.' }, 500);
  }

  if (!(await canWrite(bearer(request), env.CMS_REPO ?? 'temuin/farel'))) {
    return json({ error: 'Sign in to the content manager first.' }, 401);
  }

  const url = new URL(request.url);
  const publicUrl = (key) => `${base}/${key}`;

  // ---- list -------------------------------------------------------------
  if (request.method === 'GET') {
    const listed = await bucket.list({ prefix: 'images/', limit: 1000 });
    const files = listed.objects
      .map((object) => ({
        key: object.key,
        name: object.key.replace(/^images\//, ''),
        url: publicUrl(object.key),
        size: object.size,
        uploaded: object.uploaded,
      }))
      .sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded)));
    return json({ files });
  }

  // ---- upload -----------------------------------------------------------
  if (request.method === 'POST') {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'Could not read the upload.' }, 400);
    }

    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: 'No file was attached.' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      return json(
        { error: `That photo is ${mb} MB. The limit is 60 MB — please resize it and try again.` },
        413,
      );
    }

    const extension = ALLOWED.get(file.type);
    if (!extension) {
      return json({ error: 'Photos must be JPEG, PNG, WebP or AVIF.' }, 415);
    }

    // Suffix on collision rather than overwrite: two products may legitimately
    // be photographed as "front.jpg", and silently replacing the first one
    // would change a live page nobody was editing.
    const stem = toKey(file.name || 'photo');
    let key = `images/${stem}.${extension}`;
    for (let n = 2; await bucket.head(key); n += 1) {
      key = `images/${stem}-${n}.${extension}`;
    }

    await bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        // Immutable because the key never gets reused; a changed photo is a
        // new key, so this can be cached hard at the edge.
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return json({ key, name: key.replace(/^images\//, ''), url: publicUrl(key), size: file.size });
  }

  // ---- delete -----------------------------------------------------------
  if (request.method === 'DELETE') {
    const key = url.searchParams.get('key') ?? '';
    if (!key.startsWith('images/')) {
      return json({ error: 'Refusing to delete outside the images prefix.' }, 400);
    }
    await bucket.delete(key);
    return json({ deleted: key });
  }

  return json({ error: `${request.method} is not supported here.` }, 405);
}
