/**
 * Generates the picker's thumbnails for images already in the bucket.
 *
 *   node scripts/backfill-thumbnails.mjs <site-url> [--force]
 *
 * e.g. node scripts/backfill-thumbnails.mjs https://amaliautama.co.id
 *
 * New uploads get a thumbnail made in the browser before they are sent. Photos
 * that predate that have none, and the picker falls back to loading the
 * original — which for camera files means fetching tens of megabytes to draw a
 * 190px tile. This makes the missing ones once.
 *
 * Authenticates the same way the panel does: with a GitHub token that can push
 * to the content repository. Pass it in GITHUB_TOKEN, or let the script pick it
 * up from the gh CLI.
 */
import { execFileSync } from 'node:child_process';

const THUMB_MAX = 400;

const [siteUrl, ...flags] = process.argv.slice(2);
const force = flags.includes('--force');

if (!siteUrl) {
  console.error('Usage: node scripts/backfill-thumbnails.mjs <site-url> [--force]');
  process.exit(1);
}

const api = new URL('/api/media', siteUrl).toString();

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
  } catch {
    console.error('No token. Set GITHUB_TOKEN, or sign in with `gh auth login`.');
    process.exit(1);
  }
}

const auth = { Authorization: `Bearer ${token()}` };

const sharp = (await import('sharp')).default;

const listed = await fetch(api, { headers: auth });
if (!listed.ok) {
  console.error(`Could not list media (HTTP ${listed.status}). Is the token able to push to the repo?`);
  process.exit(1);
}
const { files } = await listed.json();
console.log(`${files.length} image(s) in the bucket.\n`);

let made = 0;
let skipped = 0;
let failed = 0;
let savedBytes = 0;

for (const file of files) {
  // A HEAD is far cheaper than regenerating, and most runs are re-runs.
  if (!force) {
    const existing = await fetch(file.thumbUrl, { method: 'HEAD' });
    if (existing.ok) {
      skipped += 1;
      continue;
    }
  }

  try {
    const source = await fetch(file.url);
    if (!source.ok) throw new Error(`HTTP ${source.status} fetching the original`);
    const original = Buffer.from(await source.arrayBuffer());

    const thumb = await sharp(original)
      .rotate()
      .resize({ width: THUMB_MAX, height: THUMB_MAX, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();

    /*
     * ?thumbFor attaches the thumbnail to the existing object. Posting the
     * original again to carry one would hit the endpoint's collision-suffix
     * rule and duplicate every photo in the bucket.
     */
    const form = new FormData();
    form.append('thumb', new Blob([thumb], { type: 'image/webp' }), 'thumb.webp');

    const response = await fetch(`${api}?thumbFor=${encodeURIComponent(file.name)}`, {
      method: 'POST',
      headers: auth,
      body: form,
    });
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? `HTTP ${response.status}`);

    made += 1;
    savedBytes += file.size - thumb.length;
    console.log(
      `  made  ${file.name.padEnd(44)} ${(file.size / 1048576).toFixed(1)} MB -> ${(thumb.length / 1024).toFixed(0)} KB`,
    );
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${file.name.padEnd(44)} ${error.message}`);
  }
}

console.log(
  `\n${made} made, ${skipped} already had one, ${failed} failed.` +
    (made ? ` The picker now loads ${(savedBytes / 1048576).toFixed(0)} MB less.` : ''),
);
