#!/usr/bin/env node
// Dumps every table to a single JSON snapshot. Only needs read access (the
// anon key), since every table's SELECT policy is open — see DESIGN.md /
// the RLS migration history for why writes are gated but reads aren't.
//
// Uses curl rather than fetch()/supabase-js on purpose: curl honors
// HTTPS_PROXY the way most tooling does, so this behaves the same whether
// it's run behind a corporate/sandboxed proxy, in CI, or on a plain machine.
//
// Usage: node scripts/backup-db.mjs
// Requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (same as the app).

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in the environment.");
  process.exit(1);
}

const TABLES = [
  "supermarkets",
  "ingredients",
  "recipes",
  "weeks",
  "recipe_ingredients",
  "ingredient_prices",
  "ingredient_availability",
  "plan_days",
  "grocery_checked",
];

function fetchTable(table) {
  const out = execFileSync("curl", [
    "-sS", "-f",
    `${url}/rest/v1/${table}?select=*`,
    "-H", `apikey: ${key}`,
    "-H", `Authorization: Bearer ${key}`,
  ], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(out);
}

const dump = { takenAt: new Date().toISOString(), tables: {} };
for (const table of TABLES) {
  const rows = fetchTable(table);
  dump.tables[table] = rows;
  console.log(`${table}: ${rows.length} rows`);
  // Current tables are all well under PostgREST's 1000-row default page
  // size; if any grows past that, this needs Range-header pagination.
  if (rows.length >= 1000) {
    console.warn(`  warning: ${table} returned >=1000 rows — this may be truncated by PostgREST's default page size.`);
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "backups");
mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "latest.json");
writeFileSync(outPath, JSON.stringify(dump, null, 2) + "\n");
console.log(`\nWrote ${outPath}`);
