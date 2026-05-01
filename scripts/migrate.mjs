#!/usr/bin/env node
/**
 * Idempotent migration runner. Applies every `*.sql` file under
 * `src/db/migrations` (in lexical order) that hasn't been run yet against the
 * `DATABASE_URL` Postgres. Records applied filenames in `__migrations`.
 *
 * Wired as Fly's `release_command` so every `fly deploy` brings the schema up
 * to date before traffic flips to new machines.
 *
 * Plain ESM so it can run inside the Next.js standalone runtime (no tsx, no
 * compile step). Imports `postgres` from the standalone-bundled node_modules.
 */

import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "src/db/migrations");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL not set; refusing to run migrations.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, idle_timeout: 5 });

try {
  await sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      filename   text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;

  const allFiles = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (allFiles.length === 0) {
    console.log("· no migrations found");
    process.exit(0);
  }

  const appliedRows = await sql`SELECT filename FROM __migrations`;
  const applied = new Set(appliedRows.map((r) => r.filename));

  let runCount = 0;
  for (const f of allFiles) {
    if (applied.has(f)) {
      console.log(`✓ ${f} (already applied)`);
      continue;
    }
    console.log(`▸ applying ${f}…`);
    const body = await fs.readFile(path.join(MIGRATIONS_DIR, f), "utf8");
    await sql.unsafe(body);
    await sql`INSERT INTO __migrations (filename) VALUES (${f})`;
    console.log(`✓ ${f}`);
    runCount += 1;
  }

  console.log(
    `\n${runCount} new migration${runCount === 1 ? "" : "s"} applied (${
      allFiles.length - runCount
    } already up to date).`,
  );
} catch (err) {
  console.error("✗ migration failed:", err);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
