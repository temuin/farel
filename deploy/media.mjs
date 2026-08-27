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

/** Formats Astro's image pipeline can actually process. */
const IMAGE_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

/*
 * Video is served straight from the bucket to the browser -- nothing resizes
 * or transcodes it -- so the only formats worth accepting are the ones every
 * browser can actually play. QuickTime .mov is deliberately absent: phones
 * produce it constantly and Safari plays it, but Chrome and Firefox often
 * will not, so accepting it would mean silently shipping a video that plays
 * for whoever uploaded it and nobody else.
 */
const VIDEO_TYPES = new Map([
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
]);

/**
 * Images and video live under separate prefixes so each picker lists only its
 * own, and every image carries a small companion under thumbs/.
 *
 * The thumbnails exist because the picker grid was otherwise loading the
 * originals: ~171 MB of camera files fetched to draw a wall of 150px tiles,
 * every time somebody opened it. They are produced in the browser before
 * upload rather than here -- a Worker has no image library, and the file is
 * already in memory on the client at that moment.
 */
const PREFIX = { image: 'images/', video: 'videos/', thumb: 'thumbs/' };

/** Which kind of media a request is dealing with, from the file itself. */
const kindOf = (mimeType) => {
  if (IMAGE_TYPES.has(mimeType)) return 'image';
  if (VIDEO_TYPES.has(mimeType)) return 'video';
  return null;
};

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
    // Defaults to images: the picker asks for video explicitly, so an older
    // cached copy of the panel keeps behaving exactly as it did.
    const kind = url.searchParams.get('kind') === 'video' ? 'video' : 'image';
    const prefix = PREFIX[kind];
    const listed = await bucket.list({ prefix, limit: 1000 });
    /*
     * Which thumbnails exist is settled here against the bucket, not left for
     * the browser to discover by trying one and handling the failure.
     *
     * Letting it fail in the browser looked cheaper until the misses started
     * being cached: a request for a thumbnail that does not exist yet gets a
     * 404 held at the edge for four hours, so the tile keeps falling back to
     * the multi-megabyte original long after the thumbnail was created. A head
     * against R2 from inside the same network costs almost nothing and is
     * always current.
     */
    const thumbs =
      kind === 'image'
        ? new Set(
            (await bucket.list({ prefix: PREFIX.thumb, limit: 1000 })).objects.map((object) =>
              object.key.slice(PREFIX.thumb.length),
            ),
          )
        : new Set();

    const files = listed.objects
      .map((object) => {
        const name = object.key.slice(prefix.length);
        return {
          key: object.key,
          name,
          url: publicUrl(object.key),
          thumbUrl: thumbs.has(name) ? publicUrl(`${PREFIX.thumb}${name}`) : undefined,
          size: object.size,
          uploaded: object.uploaded,
        };
      })
      .sort((a, b) => String(b.uploaded).localeCompare(String(a.uploaded)));
    return json({ kind, files });
  }

  // ---- upload -----------------------------------------------------------
  if (request.method === 'POST') {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'Could not read the upload.' }, 400);
    }

    /*
     * Attach a thumbnail to an image that is already here, without touching
     * the original. Used by scripts/backfill-thumbnails.mjs for photos that
     * predate thumbnails; re-posting the original to carry one would trip the
     * collision-suffix rule below and quietly duplicate every file instead.
     */
    const thumbFor = url.searchParams.get('thumbFor');
    if (thumbFor) {
      const only = form.get('thumb');
      if (!only || typeof only === 'string') {
        return json({ error: 'No thumbnail was attached.' }, 400);
      }
      if (thumbFor.includes('/') || thumbFor.includes('..')) {
        return json({ error: 'Invalid thumbnail target.' }, 400);
      }
      if (!(await bucket.head(`${PREFIX.image}${thumbFor}`))) {
        return json({ error: `No image called ${thumbFor} to attach a thumbnail to.` }, 404);
      }
      const thumbKey = `${PREFIX.thumb}${thumbFor}`;
      await bucket.put(thumbKey, only.stream(), {
        httpMetadata: { contentType: only.type || 'image/webp', cacheControl: 'public, max-age=3600' },
      });
      return json({ thumb: thumbKey, url: publicUrl(thumbKey), size: only.size });
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

    /*
     * The destination follows from the file's own type rather than anything
     * the client says, so a picker cannot be talked into writing a video into
     * the image prefix or vice versa.
     */
    const kind = kindOf(file.type);
    if (!kind) {
      return json(
        {
          error:
            'Unsupported file type. Photos must be JPEG, PNG, WebP or AVIF; video must be MP4 or WebM. ' +
            'iPhone .mov files need converting to MP4 first — most browsers cannot play QuickTime.',
        },
        415,
      );
    }
    const extension = (kind === 'image' ? IMAGE_TYPES : VIDEO_TYPES).get(file.type);
    const prefix = PREFIX[kind];

    // Suffix on collision rather than overwrite: two products may legitimately
    // be photographed as "front.jpg", and silently replacing the first one
    // would change a live page nobody was editing.
    const stem = toKey(file.name || kind);
    let key = `${prefix}${stem}.${extension}`;
    for (let n = 2; await bucket.head(key); n += 1) {
      key = `${prefix}${stem}-${n}.${extension}`;
    }

    /*
     * Optional companion, sent by the picker in the same request so the pair
     * cannot half-succeed. Named to match the original exactly, which is what
     * lets listings derive the URL without a lookup.
     */
    const thumb = form.get('thumb');
    if (kind === 'image' && thumb && typeof thumb !== 'string') {
      await bucket.put(`${PREFIX.thumb}${key.slice(prefix.length)}`, thumb.stream(), {
        httpMetadata: {
          contentType: thumb.type || 'image/webp',
          cacheControl: 'public, max-age=3600',
        },
      });
    }

    await bucket.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        /*
         * An hour, and deliberately not `immutable`.
         *
         * The obvious choice is a year, on the reasoning that a key is never
         * reused -- an upload that collides gets a -2 suffix rather than
         * overwriting. But deleting frees the key again, and delete-then-
         * re-upload-under-the-same-name is a completely ordinary thing to do:
         * upload a photo, notice it is wrong, remove it, upload the corrected
         * one. With an immutable year the edge would keep serving the old
         * bytes, and because the build fetches these to generate its variants,
         * the wrong photo would be baked into the site with no obvious cause.
         *
         * An hour costs nothing here -- these are read through Cloudflare's
         * cache on a free-tier bucket with very little traffic -- and it means
         * a correction always lands.
         */
        cacheControl: 'public, max-age=3600',
      },
    });

    return json({ kind, key, name: key.slice(prefix.length), url: publicUrl(key), size: file.size });
  }

  // ---- delete -----------------------------------------------------------
  if (request.method === 'DELETE') {
    const key = url.searchParams.get('key') ?? '';
    if (!Object.values(PREFIX).some((prefix) => key.startsWith(prefix))) {
      return json({ error: 'Refusing to delete outside the media prefixes.' }, 400);
    }
    await bucket.delete(key);

    // An image's thumbnail is an implementation detail of the picker, so it
    // goes with the original rather than lingering as an orphan.
    if (key.startsWith(PREFIX.image)) {
      await bucket.delete(`${PREFIX.thumb}${key.slice(PREFIX.image.length)}`);
    }

    return json({ deleted: key });
  }

  return json({ error: `${request.method} is not supported here.` }, 405);
}
