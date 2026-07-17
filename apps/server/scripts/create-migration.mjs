/**
 * Create a new, sequentially-numbered migration file.
 *
 *   pnpm migrate:create add-clip-status
 *   → migrations/0002_add-clip-status.cjs
 *
 * We number migrations 0001, 0002, 0003… (zero-padded, sortable) instead of
 * node-pg-migrate's default timestamp prefix, so the applied order reads as a
 * plain version sequence. node-pg-migrate orders by the numeric prefix, so this
 * sorts correctly. See docs/ops/migrations.md.
 */
import { readdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raw = process.argv.slice(2).join(" ").trim();
if (!raw) {
  console.error("Usage: pnpm migrate:create <name>   e.g. pnpm migrate:create add-clip-status");
  process.exit(1);
}

const slug = raw
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");
if (!slug) {
  console.error("Name must contain at least one letter or digit.");
  process.exit(1);
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const highest = readdirSync(migrationsDir)
  .map((f) => /^(\d+)_/.exec(f))
  .filter(Boolean)
  .reduce((max, m) => Math.max(max, parseInt(m[1], 10)), 0);

const next = String(highest + 1).padStart(4, "0");
const filename = `${next}_${slug}.cjs`;
const filepath = join(migrationsDir, filename);

if (existsSync(filepath)) {
  console.error(`Refusing to overwrite existing ${filename}`);
  process.exit(1);
}

const template = `/* eslint-disable camelcase */

/**
 * ${raw}
 *
 * Prefer ADDITIVE, non-destructive changes:
 *   pgm.sql(\`ALTER TABLE foo ADD COLUMN IF NOT EXISTS bar TEXT;\`);
 *   pgm.sql(\`CREATE TABLE IF NOT EXISTS baz (...);\`);
 * Avoid DROP / destructive changes on live tables. See docs/ops/migrations.md.
 *
 * @typedef {import('node-pg-migrate').MigrationBuilder} MigrationBuilder
 */

exports.shorthands = undefined;

/** @param {MigrationBuilder} pgm */
exports.up = (pgm) => {
  // TODO: write the forward change here.
};

/**
 * Reverse of \`up\`. Write the inverse, or set \`exports.down = false;\` to mark
 * this migration irreversible (\`migrate down\` will then refuse it).
 * @param {MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  // TODO: write the reverse change here, or replace this with: exports.down = false;
};
`;

writeFileSync(filepath, template);
console.log(`Created migrations/${filename}`);
