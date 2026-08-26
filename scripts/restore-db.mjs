#!/usr/bin/env node
// Rebuilds every table from a backup-db.mjs snapshot. Safe to re-run: every
// insert is an upsert on the table's real primary key (via PostgREST's
// "merge-duplicates" resolution), so restoring twice — or restoring on top
// of a partially-intact database — won't duplicate or fail on existing rows.
//
// Uses curl for the same reason as backup-db.mjs: it honors HTTPS_PROXY
// automatically, unlike Node's fetch()/supabase-js.
//
// Usage: node scripts/restore-db.mjs [path/to/backup.json]
// Defaults to backups/latest.json. Requires VITE_SUPABASE_URL,
// VITE_SUPABASE_ANON_KEY, and VITE_HOUSEHOLD_SECRET (writes are gated).

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const secret = process.env.VITE_HOUSEHOLD_SECRET;
if (!url || !key || !secret) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_HOUSEHOLD_SECRET in the environment.");
  process.exit(1);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, "..", "backups", "latest.json");

const dump = JSON.parse(readFileSync(inPath, "utf8"));
console.log(`Restoring snapshot from ${dump.takenAt} (${inPath})`);

// Tier 1: no foreign keys into any other table in this dump.
// Tier 2: reference tier-1 rows, so must be inserted after them.
const TIER_1 = [
  { table: "supermarkets", onConflict: "id" },
  { table: "ingredients", onConflict: "id" },
  { table: "recipes", onConflict: "id" },
  { table: "weeks", onConflict: "week_start" },
];
const TIER_2 = [
  { table: "recipe_ingredients", onConflict: "recipe_id,ingredient_id" },
  { table: "ingredient_prices", onConflict: "ingredient_id,supermarket_id" },
  { table: "ingredient_availability", onConflict: "ingredient_id,supermarket_id" },
  { table: "plan_days", onConflict: "day" },
  { table: "grocery_checked", onConflict: "week_start,ingredient_id" },
];

const CHUNK_SIZE = 500;
const tmpDir = mkdtempSync(path.join(tmpdir(), "kookplan-restore-"));

function restoreChunk(table, onConflict, chunk) {
  const bodyPath = path.join(tmpDir, `${table}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(bodyPath, JSON.stringify(chunk));
  execFileSync("curl", [
    "-sS", "-f",
    `${url}/rest/v1/${table}?on_conflict=${onConflict}`,
    "-X", "POST",
    "-H", `apikey: ${key}`,
    "-H", `Authorization: Bearer ${key}`,
    "-H", `x-household-secret: ${secret}`,
    "-H", "Content-Type: application/json",
    "-H", "Prefer: resolution=merge-duplicates,return=minimal",
    "--data", `@${bodyPath}`,
  ], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
}

function restoreTable(table, onConflict) {
  const rows = dump.tables[table] || [];
  if (rows.length === 0) {
    console.log(`${table}: nothing to restore`);
    return;
  }
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    restoreChunk(table, onConflict, rows.slice(i, i + CHUNK_SIZE));
  }
  console.log(`${table}: restored ${rows.length} rows`);
}

for (const { table, onConflict } of TIER_1) restoreTable(table, onConflict);
for (const { table, onConflict } of TIER_2) restoreTable(table, onConflict);

console.log("\nDone.");
