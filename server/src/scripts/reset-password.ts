/**
 * Reset someone's password, on the box.
 *
 * Not run directly: `bash scripts/box.sh reset-password <username>` from the
 * PC runs it through infra/box/remote/reset-password, as the app's own user
 * with the app's own settings. Built to `dist/reset-password.js` beside the
 * server by build.mjs.
 *
 *   node dist/reset-password.js <username> [--clear-2fa]
 *
 * Prints the temporary password once. What it does, and why it is by hand,
 * is on `resetPassword` in services/auth.ts.
 */

import { closeDatabase, initDatabase } from '../db/index.js';
import { resetPassword } from '../services/auth.js';

const args = process.argv.slice(2);
const clearTotp = args.includes('--clear-2fa');
const username = args.find((arg) => !arg.startsWith('--'));

if (!username) {
  console.error('Usage: reset-password <username> [--clear-2fa]');
  process.exit(2);
}

await initDatabase();
try {
  const { user, temporaryPassword } = await resetPassword(username, { clearTotp });
  console.log(`Account:            ${user.username} (${user.displayName})`);
  console.log(`Temporary password: ${temporaryPassword}`);
  console.log('Signed out everywhere. They choose a new password at the next sign-in.');
  if (clearTotp) console.log('Two-factor is off; they can turn it on again in settings.');
} catch (problem) {
  console.error(problem instanceof Error ? problem.message : problem);
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
