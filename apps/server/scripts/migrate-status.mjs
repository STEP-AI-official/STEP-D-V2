/**
 * Show which migrations are applied vs pending.
 *
 *   pnpm migrate:status
 *
 * Compares the files in migrations/ against the pgmigrations tracking table.
 * Reads DATABASE_URL from the environment (the npm script loads .env if present).
 */
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const files = readdirSync(migrationsDir)
  .filter((f) => /^\d+_.*\.(cjs|js|mjs)$/.test(f))
  .map((f) => f.replace(/\.(cjs|js|mjs)$/, ""))
  .sort();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (put it in apps/server/.env or export it).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });

let applied = new Set();
try {
  const { rows } = await pool.query("SELECT name FROM pgmigrations");
  applied = new Set(rows.map((r) => r.name));
} catch (err) {
  // 42P01 = undefined_table → migrations have never been run against this DB.
  if (err.code !== "42P01") {
    console.error(err.message);
    await pool.end();
    process.exit(1);
  }
}

let pending = 0;
console.log("Migrations (migrations/ vs pgmigrations):\n");
for (const name of files) {
  const isApplied = applied.has(name);
  if (!isApplied) pending++;
  console.log(`  ${isApplied ? "[x] applied" : "[ ] pending"}  ${name}`);
}

// A row tracked in the DB but with no file on disk = drift worth surfacing.
for (const name of applied) {
  if (!files.includes(name)) console.log(`  [!] tracked-but-missing-file  ${name}`);
}

console.log(`\n${files.length} migration file(s), ${pending} pending.`);
await pool.end();
