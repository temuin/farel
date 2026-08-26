/**
 * Syntax-checks the inline JavaScript in public/admin/index.html.
 *
 * That file is hand-written and copied verbatim into the build. Astro never
 * parses it, `astro check` never sees it, and a static host will serve a
 * broken script as happily as a working one -- so a stray character in it
 * reaches production with nothing having complained.
 *
 * The failure that prompted this was not loud. A string literal accidentally
 * split across two lines threw a SyntaxError, which aborted the whole block
 * before the sign-in handler was attached. The form then fell back to the
 * browser default of a GET to the current URL, and the username and password
 * appeared in the address bar and browser history. The page looked completely
 * normal until someone tried to log in.
 *
 * So: parse every inline block at build time, and refuse to build if one is
 * broken. Also assert the few structural things the login form depends on,
 * since those failed silently too.
 *
 * Run by `npm run build` before Astro starts.
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const FILE = 'public/admin/index.html';
const html = readFileSync(FILE, 'utf8');

const problems = [];

/** Inline blocks only -- anything with a src= is somebody else's bundle. */
const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];

if (blocks.length === 0) {
  problems.push('No inline <script> blocks found. Has the file been restructured?');
}

blocks.forEach(([, code], index) => {
  try {
    // Compiles and throws on a syntax error without running anything.
    new vm.Script(code, { filename: `${FILE} (inline block ${index + 1})` });
  } catch (error) {
    problems.push(`Inline block ${index + 1} does not parse: ${error.message}`);
  }
});

/*
 * The login form must carry method and action. Without them the browser's
 * fallback for a submit is a GET to the current URL, which is how credentials
 * ended up in the address bar. Belt and braces alongside the parse check:
 * that fallback is only reachable when the script is broken, but this is the
 * line that stops it leaking anything when it is.
 */
const form = html.match(/<form[^>]*id="signin-form"[^>]*>/);
if (!form) {
  problems.push('The sign-in form (id="signin-form") is missing.');
} else {
  if (!/\bmethod="POST"/i.test(form[0])) {
    problems.push('The sign-in form has no method="POST"; a fallback submit would put the password in the URL.');
  }
  if (!/\baction="\/api\/auth"/.test(form[0])) {
    problems.push('The sign-in form has no action="/api/auth"; a fallback submit would post to the page itself.');
  }
}

/* The CDN bundle is pinned by content; an unpinned one must not slip back in. */
const cdn = html.match(/<script[^>]*\bsrc="https:\/\/[^"]*decap-cms[^"]*"[^>]*>/);
if (!cdn) {
  problems.push('The Decap bundle <script> tag is missing.');
} else if (!/\bintegrity="sha\d{3}-/.test(cdn[0])) {
  problems.push('The Decap bundle has no integrity hash. Recompute it before shipping.');
}


/*
 * The admin panel's dropdowns and the content schema have to agree.
 *
 * They are declared in two places -- a hand-written HTML file and a TypeScript
 * config -- with nothing connecting them, and they had silently drifted: the
 * CMS offered Jerseys/Tops/Bottoms while the schema only accepts
 * Apparel/Footwear/Accessories. Every one of the 23 products categorised
 * "Apparel" opened with an empty Category dropdown, and saving one would have
 * written frontmatter the site refuses to build.
 */
const catalog = readFileSync('src/config/catalog.ts', 'utf8');

/** Pulls the quoted strings out of `const NAME = [...]`, without regex escaping. */
const listFrom = (source, name) => {
  const at = source.indexOf(name + ' = [');
  if (at === -1) return null;
  const open = source.indexOf('[', at);
  const close = source.indexOf(']', open);
  if (open === -1 || close === -1) return null;
  return [...source.slice(open, close).matchAll(/'([^']+)'/g)].map((m) => m[1]);
};

for (const name of ['BRANDS', 'CATEGORIES', 'SPORTS']) {
  const truth = listFrom(catalog, name);
  const cms = listFrom(html, name);
  if (!truth) {
    problems.push(`Could not find ${name} in src/config/catalog.ts.`);
    continue;
  }
  if (!cms) {
    problems.push(`Could not find ${name} in ${FILE}.`);
    continue;
  }
  if (truth.join('|') !== cms.join('|')) {
    problems.push(
      `${name} differs from src/config/catalog.ts — ` +
        `schema has [${truth.join(', ')}], admin offers [${cms.join(', ')}]. ` +
        `A value the schema rejects breaks the build; one the admin omits shows as an empty dropdown.`,
    );
  }
}

/*
 * Every schema field must have a widget, or Decap drops it on save. That is
 * how `sport` was being deleted from all 30 products by any edit.
 */
const schema = readFileSync('src/content.config.ts', 'utf8');
const schemaFields = [...schema.matchAll(/^\s{6}([a-zA-Z]+):\s*z\./gm)].map((m) => m[1]);
const productsBlock = html.slice(
  html.indexOf("name: 'products'"),
  html.indexOf("name: 'content'"),
);
const cmsFields = [...productsBlock.matchAll(/\{\s*name: '([a-zA-Z]+)'/g)].map((m) => m[1]);
for (const field of schemaFields) {
  if (!cmsFields.includes(field)) {
    problems.push(
      `The content schema defines "${field}" but the CMS has no widget for it. ` +
        `Decap writes only its configured fields, so editing an entry would delete it.`,
    );
  }
}

if (problems.length) {
  console.error(`\n${FILE} failed its checks:\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log(`${FILE}: ${blocks.length} inline script block(s) parse; form and CDN pin look right.`);
