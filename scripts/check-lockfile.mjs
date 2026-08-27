/**
 * Guards package-lock.json against the failure that broke the Cloudflare build
 * on 2026-08-27.
 *
 * Adding a dependency from a Windows machine made npm rewrite the lock and
 * silently drop `@emnapi/core` and `@emnapi/runtime` -- two entries that only
 * matter on other platforms -- while keeping `@img/sharp-wasm32` and
 * `@tailwindcss/oxide-wasm32-wasi`, which both declare them as hard
 * dependencies. Locally everything worked: those packages are never installed
 * here, so nothing ever looked for them. On the Linux builder `npm ci`
 * recomputed the tree, found two dependencies with no entry to install from,
 * and refused to install anything at all:
 *
 *     npm error `npm ci` can only install packages when your package.json and
 *     package-lock.json ... are in sync.
 *     npm error Missing: @emnapi/runtime@1.11.3 from lock file
 *
 * The build never started, so no amount of checking the site would have caught
 * it. Hence a check that runs before the build and needs no network.
 *
 * Walking every hard dependency of every entry, ignoring the os/cpu fields, is
 * deliberately stronger than checking this machine's platform: a lock that
 * passes here installs on all of them, which is the only property that matters
 * when the machine that writes the lock is never the machine that deploys it.
 *
 * peerDependencies are skipped. npm treats an unmet peer as optional when
 * peerDependenciesMeta says so, and this tree carries about thirty legitimately
 * absent optional peers -- unstorage's cloud drivers, mostly -- which would
 * bury the real signal in noise.
 */
import { readFileSync } from 'node:fs';

const FILE = 'package-lock.json';

const lock = JSON.parse(readFileSync(FILE, 'utf8'));
const packages = lock.packages ?? {};

/**
 * Resolves `name` from `fromPath` the way Node does: try the nearest
 * node_modules, then walk up one level at a time to the project root.
 */
function resolves(fromPath, name) {
  const parts = fromPath.split('/node_modules/');
  while (parts.length) {
    const candidate = `${parts.join('/node_modules/')}/node_modules/${name}`.replace(/^\/+/, '');
    if (candidate in packages) return true;
    parts.pop();
  }
  return `node_modules/${name}` in packages;
}

const missing = [];
for (const [path, meta] of Object.entries(packages)) {
  for (const field of ['dependencies', 'optionalDependencies']) {
    for (const dep of Object.keys(meta[field] ?? {})) {
      if (!resolves(path, dep)) missing.push({ path: path || '<root>', field, dep });
    }
  }
}

if (missing.length) {
  console.error(`\n${FILE} is internally inconsistent -- \`npm ci\` will fail on the builder.\n`);
  for (const { path, field, dep } of missing) {
    console.error(`  - ${path}\n      ${field} -> ${dep} has no entry to install from`);
  }
  console.error(
    '\n  This usually means npm pruned another platform\'s entries while rewriting the\n' +
      '  lock. Do not regenerate it from scratch -- a fresh `npm install` on Windows\n' +
      '  drops every non-Windows binary and makes things worse. Instead restore the\n' +
      '  last lock that deployed cleanly and re-add just what you needed:\n\n' +
      '      git checkout <good-commit> -- package-lock.json\n' +
      '      npm install --package-lock-only --ignore-scripts\n\n' +
      '  then copy any entry this check still reports back in from the good file.\n',
  );
  process.exit(1);
}

console.log(`${FILE}: ${Object.keys(packages).length} entries; every hard dependency resolves.`);
