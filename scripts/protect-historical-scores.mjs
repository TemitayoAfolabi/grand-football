#!/usr/bin/env node

/**
 * protect-historical-scores.mjs
 *
 * Marks ALL score_records for GW 1-28 as manually_edited = true,
 * so they are permanently protected from the "Recalculate Scores" admin action.
 *
 * Usage:
 *   node scripts/protect-historical-scores.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {}
}

loadEnvFile(path.join(ROOT, '.env.local'));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MAX_HISTORICAL_GW = 28;

console.log(`\n🔒  Marking all score_records for GW 1-${MAX_HISTORICAL_GW} as manually_edited = true …\n`);

// Get the active season
const { data: season, error: seasonErr } = await supabase
  .from('seasons')
  .select('id, name')
  .eq('is_active', true)
  .single();

if (seasonErr || !season) {
  console.error('❌  No active season found:', seasonErr?.message);
  process.exit(1);
}

console.log(`   Season: ${season.name} (${season.id})`);

// Get all fixture IDs for GW 1-28
const { data: fixtures, error: fxErr } = await supabase
  .from('fixtures')
  .select('id, gameweek')
  .eq('season_id', season.id)
  .gte('gameweek', 1)
  .lte('gameweek', MAX_HISTORICAL_GW);

if (fxErr) {
  console.error('❌  Error fetching fixtures:', fxErr.message);
  process.exit(1);
}

const fixtureIds = fixtures.map(f => f.id);
console.log(`   Found ${fixtureIds.length} fixtures in GW 1-${MAX_HISTORICAL_GW}`);

// Update in batches (Supabase filter limit)
const BATCH = 100;
let totalUpdated = 0;

for (let i = 0; i < fixtureIds.length; i += BATCH) {
  const batch = fixtureIds.slice(i, i + BATCH);
  const { data, error } = await supabase
    .from('score_records')
    .update({ manually_edited: true })
    .in('fixture_id', batch)
    .eq('manually_edited', false)
    .select('id');

  if (error) {
    console.error(`   ❌  Batch ${i}: ${error.message}`);
  } else {
    totalUpdated += (data?.length ?? 0);
    console.log(`   … batch ${Math.floor(i / BATCH) + 1}: ${data?.length ?? 0} records updated`);
  }
}

console.log(`\n✅  Done! ${totalUpdated} score_records marked as manually_edited = true.`);
console.log(`   These records are now protected from "Recalculate Scores".\n`);
