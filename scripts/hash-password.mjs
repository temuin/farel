/**
 * Manage CMS sign-in credentials.
 *
 *   node scripts/hash-password.mjs <username>
 *       Prints the `user:hash` pair to put in CMS_USERS.
 *
 *   node scripts/hash-password.mjs --verify <username> <hash>
 *       Checks a password against an existing hash, so you can tell a wrong
 *       password apart from a server-side problem without guessing at /admin.
 *
 * The password is prompted for, never taken as an argument, so it stays out of
 * shell history and the process list.
 */
import { hashPassword, verifyPassword } from '../deploy/auth.mjs';

/**
 * Reads a line without echoing it. Uses raw mode where there is a terminal,
 * and falls back to a plain read when stdin is piped (CI, tests) rather than
 * crashing on the TTY-only cursor calls.
 */
function readPassword(prompt) {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let buffer = '';
      stdin.setEncoding('utf8');
      const onData = (chunk) => {
        buffer += chunk;
        const newline = buffer.indexOf('\n');
        if (newline !== -1) {
          stdin.removeListener('data', onData);
          stdin.pause();
          resolve(buffer.slice(0, newline).replace(/\r$/, ''));
        }
      };
      stdin.on('data', onData);
      stdin.on('end', () => resolve(buffer.replace(/\r?\n$/, '')));
    });
  }

  return new Promise((resolve) => {
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';
    const finish = (value) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
      resolve(value);
    };

    const onData = (chunk) => {
      // A paste arrives as one chunk, so walk it character by character.
      for (const char of chunk) {
        if (char === '\r' || char === '\n' || char === '\u0004') return finish(password);
        if (char === '\u0003') {
          stdin.setRawMode(false);
          stdout.write('\n');
          process.exit(130); // Ctrl-C
        }
        if (char === '\u007f' || char === '\b') {
          if (password.length > 0) {
            password = password.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        // Skip remaining control characters, e.g. arrow-key escape sequences.
        if (char < ' ') continue;
        password += char;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

const args = process.argv.slice(2);

/** Reads a visible line, used for the hash (which is not a secret to type). */
function readLine(prompt) {
  const { stdin, stdout } = process;
  stdout.write(prompt);
  return new Promise((resolve) => {
    let buffer = '';
    stdin.setEncoding('utf8');
    stdin.resume();
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline !== -1) {
        stdin.removeListener('data', onData);
        stdin.pause();
        resolve(buffer.slice(0, newline).replace(/\r$/, '').trim());
      }
    };
    stdin.on('data', onData);
  });
}

/** A healthy hash is pbkdf2$<iterations>$<24-char salt>$<44-char hash>. */
function describeHash(hash) {
  const parts = hash.split('$');
  if (
    parts.length === 4 &&
    parts[0] === 'pbkdf2' &&
    /^\d+$/.test(parts[1]) &&
    parts[2].length === 24 &&
    parts[3].length === 44
  ) {
    return null;
  }
  return [
    `That hash does not look complete (${hash.length} characters, expected 83).`,
    '',
    'The usual cause is shell quoting. In PowerShell a hash in DOUBLE quotes has',
    'its $... sections eaten as variable names:',
    '',
    '  wrong:  "pbkdf2$210000$abc..."   ->  pbkdf2abc...',
    "  right:  'pbkdf2$210000$abc...'",
    '',
    'Re-run and paste the hash at the prompt instead, which avoids quoting entirely.',
  ].join('\n');
}

if (args[0] === '--verify') {
  const [, username] = args;
  if (!username) {
    console.error('Usage: node scripts/hash-password.mjs --verify <username> [hash]');
    console.error('Omit the hash and you will be prompted for it, which avoids shell quoting.');
    process.exit(1);
  }

  // Prefer the prompt: an argument has already been through the shell.
  const hash = args[2] ?? (await readLine('Paste the hash (from CMS_USERS, after the colon): '));

  const problem = describeHash(hash);
  if (problem) {
    console.error('\n' + problem);
    process.exit(2);
  }

  const password = await readPassword(`Password for "${username}": `);
  const ok = await verifyPassword(password, hash);
  console.log(
    ok
      ? '\nMATCH — this password works with that hash.'
      : '\nNO MATCH — the hash is well-formed, so this is genuinely a different password.',
  );
  process.exit(ok ? 0 : 1);
}

const username = args[0];
if (!username) {
  console.error('Usage: node scripts/hash-password.mjs <username>');
  console.error('       node scripts/hash-password.mjs --verify <username> <hash>');
  process.exit(1);
}

const password = await readPassword('Password: ');
const confirm = await readPassword('Confirm password: ');

if (password !== confirm) {
  console.error('\nPasswords did not match.');
  process.exit(1);
}
if (password.length < 12) {
  console.error(
    '\nUse at least 12 characters. This password is the only thing protecting write access to the site.',
  );
  process.exit(1);
}

const hash = await hashPassword(password);
console.log('\nAdd this to CMS_USERS (comma-separate multiple users):\n');
console.log(`${username}:${hash}\n`);
