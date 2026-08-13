/**
 * Generates a password hash for a CMS user.
 *
 *   node scripts/hash-password.mjs <username>
 *
 * Prompts for the password rather than taking it as an argument, so it does
 * not end up in your shell history or in the process list. Prints the
 * `user:hash` pair to append to the CMS_USERS environment variable.
 */
import { createInterface } from 'node:readline';
import { hashPassword } from '../deploy/auth.mjs';

const username = process.argv[2];
if (!username) {
  console.error('Usage: node scripts/hash-password.mjs <username>');
  process.exit(1);
}

/** Reads a line without echoing it back to the terminal. */
function readPassword(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const onData = (char) => {
      // Redraw the prompt without the typed characters.
      if (!['\n', '\r', ''].includes(String(char))) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(prompt);
      }
    };
    process.stdin.on('data', onData);
    rl.question(prompt, (answer) => {
      process.stdin.removeListener('data', onData);
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
  });
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
