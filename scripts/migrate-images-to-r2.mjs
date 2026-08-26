/**
 * Rewrites product photo references from repository paths to bucket URLs.
 *
 *   node scripts/migrate-images-to-r2.mjs <base-url> [--dry]
 *
 * e.g. node scripts/migrate-images-to-r2.mjs https://media.amaliautama.co.id
 *
 * Product photos moved out of the repository and into R2, so the frontmatter
 * that used to point at ../../assets/products/x.jpg now has to name the object
 * in the bucket. Astro downloads those at build time and generates the sized
 * variants it serves, so the URLs here are the full-resolution originals.
 *
 * Whole URLs rather than bare keys, because Decap uses the stored value
 * directly as the <img> src when previewing a photo in the admin panel.
 *
 * Re-runnable: entries that are already absolute URLs are left alone, so
 * pointing it at a different host later just rewrites the host.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const CONTENT_DIR = 'src/content/products';
/** Bucket prefix the media endpoint uploads into. Keep the two in step. */
const PREFIX = 'images';

const [rawBase, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');

if (!rawBase) {
  console.error('Usage: node scripts/migrate-images-to-r2.mjs <base-url> [--dry]');
  process.exit(1);
}

let base;
try {
  base = new URL(rawBase).toString().replace(/\/+$/, '');
} catch {
  console.error(`Not a valid URL: ${rawBase}`);
  process.exit(1);
}

/** Matches one "  - <path>" entry inside the images: block. */
const ENTRY = /^(\s*-\s*)(\S.*?)\s*$/;

let changed = 0;
let already = 0;

for (const file of readdirSync(CONTENT_DIR).filter((f) => f.endsWith('.md'))) {
  const path = `${CONTENT_DIR}/${file}`;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  let inImages = false;
  let touched = false;

  const out = lines.map((line) => {
    if (/^images:\s*$/.test(line)) {
      inImages = true;
      return line;
    }
    // Any non-indented line ends the block.
    if (inImages && line && !/^\s/.test(line)) inImages = false;
    if (!inImages) return line;

    const match = line.match(ENTRY);
    if (!match) return line;

    const [, bullet, value] = match;
    if (/^https?:\/\//i.test(value)) {
      const rewritten = `${base}/${PREFIX}/${value.split('/').pop()}`;
      if (rewritten === value) {
        already += 1;
        return line;
      }
      touched = true;
      return `${bullet}${rewritten}`;
    }

    touched = true;
    return `${bullet}${base}/${PREFIX}/${value.split('/').pop()}`;
  });

  if (touched) {
    changed += 1;
    if (!dry) writeFileSync(path, out.join('\n'), 'utf8');
    console.log(`  ${dry ? 'would rewrite' : 'rewrote'}  ${file}`);
  }
}

console.log(
  `\n${dry ? 'Would change' : 'Changed'} ${changed} file(s); ${already} already pointed at ${base}.`,
);
