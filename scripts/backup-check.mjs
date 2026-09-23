/**
 * Prove a backup restores.
 *
 *   node scripts/backup-check.mjs            the newest in ~/Scryproof-backups
 *   node scripts/backup-check.mjs <file>     a particular one
 *
 * Decrypts with the private key made by scripts/backup-key.sh, unpacks into a
 * temporary folder, loads db.sql into a fresh in-memory Postgres (PGlite, the
 * same one development uses), and then checks what a restore would need:
 * every table came back, and every file the database points at is
 * in uploads/. Prints the counts and the newest message time, so "this backup
 * is from last night" is something you can read, not assume.
 *
 * Nothing is written anywhere but a temp folder, which is deleted after.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

const backups = join(homedir(), 'Scryproof-backups');
const gnupg = join(homedir(), '.scryproof-backup', 'gnupg');

function newest() {
  if (!existsSync(backups)) throw new Error(`No ${backups}. Run bash scripts/backup-pull.sh first.`);
  const files = readdirSync(backups).filter((name) => /^scryproof-.*\.tar\.gpg$/.test(name)).sort();
  if (files.length === 0) throw new Error(`No backups in ${backups}.`);
  return join(backups, files.at(-1));
}

/** Git Bash's gpg reads C:\Users\... as a relative path; it wants /c/Users/.... */
function msys(path) {
  if (process.platform !== 'win32') return path;
  return path.replace(/^([A-Za-z]):[\\/]/, (_, drive) => `/${drive.toLowerCase()}/`).replaceAll('\\', '/');
}

/** gpg --decrypt file | tar -x, in dir, waiting for both. */
function unpack(file, dir) {
  return new Promise((resolve, reject) => {
    const gpg = spawn('gpg', ['--homedir', msys(gnupg), '--batch', '--quiet', '--decrypt', msys(file)], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    // cwd rather than -C: GNU tar reads "C:" in a path as a remote host.
    const tar = spawn('tar', ['-x', '-f', '-'], { cwd: dir, stdio: ['pipe', 'inherit', 'inherit'] });
    gpg.stdout.pipe(tar.stdin);
    let left = 2;
    const done = (name) => (code) => {
      if (code !== 0) return reject(new Error(`${name} exited ${code}`));
      if (--left === 0) resolve();
    };
    gpg.on('close', done('gpg'));
    tar.on('close', done('tar'));
    gpg.on('error', reject);
    tar.on('error', reject);
  });
}

const file = process.argv[2] ?? newest();
const work = mkdtempSync(join(tmpdir(), 'scryproof-restore-'));

try {
  console.log(`Backup:   ${file} (${(statSync(file).size / 1e6).toFixed(1)} MB)`);
  await unpack(file, work);

  // psql meta-commands (\restrict and friends) are for psql, not SQL.
  const sql = readFileSync(join(work, 'db.sql'), 'utf8')
    .split('\n')
    .filter((line) => !line.startsWith('\\'))
    .join('\n');

  const db = new PGlite();
  await db.exec(sql);

  const tables = (
    await db.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
    )
  ).rows.map((row) => row.table_name);

  console.log(`\nTables restored: ${tables.length}`);
  for (const table of tables) {
    const { rows } = await db.query(`select count(*)::int as n from public."${table}"`);
    console.log(`  ${table.padEnd(28)} ${rows[0].n}`);
  }

  const last = await db.query(`select max(created_at) as at from public.messages`);
  console.log(`\nNewest message: ${last.rows[0].at?.toISOString?.() ?? last.rows[0].at}`);

  const migrations = await db.query(`select count(*)::int as n from drizzle.__drizzle_migrations`);
  console.log(`Migrations recorded: ${migrations.rows[0].n}`);

  // Every storage_key column, in every table that has one.
  const keyed = (
    await db.query(
      `select table_name from information_schema.columns
       where table_schema = 'public' and column_name = 'storage_key'`,
    )
  ).rows.map((row) => row.table_name);
  let files = 0;
  const missing = [];
  for (const table of keyed) {
    const { rows } = await db.query(`select storage_key from public."${table}" where storage_key is not null`);
    for (const { storage_key: key } of rows) {
      files += 1;
      if (!existsSync(join(work, 'uploads', key))) missing.push(`${table}: ${key}`);
    }
  }
  console.log(`Files the database points at: ${files}, missing from uploads/: ${missing.length}`);
  for (const line of missing.slice(0, 20)) console.log(`  missing ${line}`);

  await db.close();
  console.log(missing.length === 0 ? '\nRESTORE OK' : '\nRESTORE INCOMPLETE: files missing (see above)');
  process.exitCode = missing.length === 0 ? 0 : 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
