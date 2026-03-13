#!/usr/bin/env node

/**
 * seed-gw29-scores.mjs
 *
 * Applies the official GW29 results to the database.
 *
 * Behaviour:
 *   1. Fetch the active season + all GW29 fixture IDs.
 *   2. Fetch the current per-player GW29 totals from score_records.
 *   3. Compare against the authoritative totals (from the WhatsApp results message).
 *   4. If totals match → leave untouched (idempotent).
 *      If totals differ or records are missing → delete all GW29 score_records
 *      for that player and insert a single manually_edited aggregate record on
 *      the anchor fixture (Bournemouth vs Brentford, GW29).
 *   5. Print a final cross-check table showing GW29 and overall totals.
 *
 * Usage:
 *   node scripts/seed-gw29-scores.mjs             # live run
 *   node scripts/seed-gw29-scores.mjs --dry-run   # preview only
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
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

const DRY_RUN      = process.argv.includes('--dry-run');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Authoritative GW29 results (net points — penalties already applied)
// ---------------------------------------------------------------------------
// Nyema: 10 raw − 3 late-penalty = 7 net
const GW29_EXPECTED = [
  { code: 'A',  display: 'Anu',      userId: 'f22933c4-9b7e-5668-a698-e77df1782020', gw29: 24, overall: 611 },
  { code: 'CC', display: 'Chris',    userId: 'c9456b31-d481-56dd-ba8e-19188636023e', gw29: 14, overall: 546 },
  { code: 'C',  display: 'Cozy',     userId: '0b92a57d-4fc5-5644-b6e3-e503a24797aa', gw29: 21, overall: 610 },
  { code: 'D',  display: 'David',    userId: '90630b39-9de1-5f4b-b471-e6ba6c39f2c0', gw29: 10, overall: 515 },
  { code: 'F',  display: 'Fiyin',    userId: '286af2bd-1c2d-54c3-ba3d-a48a26d2febf', gw29: 13, overall: 589 },
  { code: 'GD', display: 'Deon',     userId: 'ca901b24-393b-5d20-9e96-cd3ea72d02fa', gw29: 16, overall: 611 },
  { code: 'KK', display: 'Kiki',     userId: 'd4551b66-ae87-5e22-b21a-390323b9403c', gw29:  7, overall: 595 },
  { code: 'M',  display: 'Michael',  userId: 'e7cda50c-6078-5209-83a6-be99efdceec6', gw29: 24, overall: 594 },
  { code: 'N',  display: 'Nyema',    userId: '459958d6-a060-54c1-832a-809677fb0f8c', gw29:  7, overall: 490 },
  { code: 'O',  display: 'Osita',    userId: '4995c0f4-ea7f-5ffe-b835-15e2d2f48ce3', gw29: 14, overall: 615 },
  { code: 'OK', display: 'Okey',     userId: '8694ba88-e26c-5a22-b822-b06cca31a0d9', gw29: 13, overall: 580 },
  { code: 'T',  display: 'Temmy',    userId: '0b9eda0e-3c42-5e03-9056-219811c3aaba', gw29: 13, overall: 493 },
  { code: 'TT', display: 'Temitayo', userId: '202af648-fa48-5497-928a-d8428c8fed15', gw29: 12, overall: 518 },
  { code: 'TZ', display: 'Temizack', userId: '9a6a5890-44cd-5081-a6d5-1a62d196ac1c', gw29: 14, overall: 655 },
];

// GW29 anchor fixture — Bournemouth vs Brentford
const ANCHOR_FIXTURE_ID = '4f082ef7-7b58-4725-ada4-d54fd7789ad7';

// ---------------------------------------------------------------------------
// 1. Fetch active season
// ---------------------------------------------------------------------------
const { data: season, error: seasonErr } = await supabase
  .from('seasons')
  .select('id, name')
  .eq('is_active', true)
  .single();

if (seasonErr || !season) {
  console.error('❌  Could not fetch active season:', seasonErr?.message);
  process.exit(1);
}
console.log(`\n🏟️   Season: ${season.name}  (${season.id})\n`);

// ---------------------------------------------------------------------------
// 2. Fetch all GW29 fixture IDs (to scope the delete)
// ---------------------------------------------------------------------------
const { data: gw29Fixtures, error: fixturesErr } = await supabase
  .from('fixtures')
  .select('id, home_team, away_team, status')
  .eq('season_id', season.id)
  .eq('gameweek', 29);

if (fixturesErr || !gw29Fixtures) {
  console.error('❌  Could not fetch GW29 fixtures:', fixturesErr?.message);
  process.exit(1);
}
console.log(`📋  GW29 fixtures found: ${gw29Fixtures.length}`);
for (const f of gw29Fixtures) {
  console.log(`     ${f.id}  ${f.home_team} vs ${f.away_team}  [${f.status}]`);
}

// Confirm anchor fixture exists
const anchorExists = gw29Fixtures.some(f => f.id === ANCHOR_FIXTURE_ID);
if (!anchorExists) {
  console.error(`\n❌  Anchor fixture ${ANCHOR_FIXTURE_ID} (Bournemouth vs Brentford) not found in GW29!`);
  console.error('    Cannot continue — please check the fixture ID.');
  process.exit(1);
}
console.log(`\n✅  Anchor fixture confirmed: ${ANCHOR_FIXTURE_ID}`);

const gw29FixtureIds = gw29Fixtures.map(f => f.id);

// ---------------------------------------------------------------------------
// 3. Fetch current GW29 score_records (to detect what already exists)
// ---------------------------------------------------------------------------
const { data: existingRecords, error: recordsErr } = await supabase
  .from('score_records')
  .select('user_id, fixture_id, points_awarded, manually_edited')
  .in('fixture_id', gw29FixtureIds);

if (recordsErr) {
  console.error('❌  Could not fetch existing score_records:', recordsErr?.message);
  process.exit(1);
}

// Compute current GW29 total per user
const currentTotals = new Map();
for (const rec of existingRecords ?? []) {
  currentTotals.set(rec.user_id, (currentTotals.get(rec.user_id) ?? 0) + rec.points_awarded);
}

// ---------------------------------------------------------------------------
// 4. Compare and plan corrections
// ---------------------------------------------------------------------------
console.log('\n📊  GW29 comparison (current vs expected):\n');
console.log('   Player      Current  Expected  Status');
console.log('   ----------  -------  --------  ------');

const corrections = [];
for (const player of GW29_EXPECTED) {
  const current  = currentTotals.get(player.userId) ?? 0;
  const expected = player.gw29;
  const ok       = current === expected;
  console.log(
    `   ${player.display.padEnd(10)}  ${String(current).padStart(7)}  ${String(expected).padStart(8)}  ${ok ? '✅ OK' : '❌ MISMATCH'}`
  );
  if (!ok) corrections.push(player);
}

if (corrections.length === 0) {
  console.log('\n✅  All GW29 totals already match. No changes needed.\n');
  process.exit(0);
}

console.log(`\n⚠️   ${corrections.length} player(s) need correction: ${corrections.map(p => p.display).join(', ')}\n`);

if (DRY_RUN) {
  console.log('🏜️   DRY-RUN — no changes written to database.\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 5. Delete ALL existing GW29 score_records (for players that need correction)
// ---------------------------------------------------------------------------
console.log('🗑️   Deleting existing GW29 score_records for players needing correction …');
const userIdsToCorrect = corrections.map(p => p.userId);

// Find all score_record IDs for these users in GW29 fixture set
const { data: toDelete, error: fetchDeleteErr } = await supabase
  .from('score_records')
  .select('id')
  .in('fixture_id', gw29FixtureIds)
  .in('user_id', userIdsToCorrect);

if (fetchDeleteErr) {
  console.error('❌  Could not fetch records to delete:', fetchDeleteErr?.message);
  process.exit(1);
}

if (toDelete && toDelete.length > 0) {
  const idsToDelete = toDelete.map(r => r.id);
  const { error: deleteErr } = await supabase
    .from('score_records')
    .delete()
    .in('id', idsToDelete);

  if (deleteErr) {
    console.error('❌  Delete failed:', deleteErr?.message);
    process.exit(1);
  }
  console.log(`   Deleted ${idsToDelete.length} existing record(s).`);
} else {
  console.log('   No existing records to delete.');
}

// ---------------------------------------------------------------------------
// 6. Insert manually-edited aggregate records
// ---------------------------------------------------------------------------
console.log('\n📥  Inserting corrected manually_edited aggregate records …\n');

const inserts = corrections.map(player => ({
  user_id:        player.userId,
  fixture_id:     ANCHOR_FIXTURE_ID,
  predicted_home: null,
  predicted_away: null,
  actual_home:    0,
  actual_away:    0,
  is_star_game:   false,
  points_awarded: player.gw29,
  reason_code:    'OUTCOME',
  manually_edited: true,
}));

const { error: insertErr } = await supabase
  .from('score_records')
  .insert(inserts);

if (insertErr) {
  console.error('❌  Insert failed:', insertErr?.message);
  process.exit(1);
}
console.log(`✅  Inserted ${inserts.length} corrected record(s).`);

// ---------------------------------------------------------------------------
// 7. Final verification — GW29 totals
// ---------------------------------------------------------------------------
const { data: verifyRecords, error: verifyErr } = await supabase
  .from('score_records')
  .select('user_id, points_awarded')
  .in('fixture_id', gw29FixtureIds);

if (verifyErr) {
  console.error('❌  Verification fetch failed:', verifyErr?.message);
  process.exit(1);
}

const finalGw29 = new Map();
for (const rec of verifyRecords ?? []) {
  finalGw29.set(rec.user_id, (finalGw29.get(rec.user_id) ?? 0) + rec.points_awarded);
}

console.log('\n📊  GW29 final verification:\n');
console.log('   Player      GW29  Expected  Status');
console.log('   ----------  ----  --------  ------');
let allGw29Ok = true;
for (const player of GW29_EXPECTED) {
  const actual   = finalGw29.get(player.userId) ?? 0;
  const expected = player.gw29;
  const ok       = actual === expected;
  if (!ok) allGw29Ok = false;
  console.log(
    `   ${player.display.padEnd(10)}  ${String(actual).padStart(4)}  ${String(expected).padStart(8)}  ${ok ? '✅' : '❌'}`
  );
}

// ---------------------------------------------------------------------------
// 8. Fetch overall season totals for final cross-check
// ---------------------------------------------------------------------------
const { data: allRecords, error: allErr } = await supabase
  .from('score_records')
  .select('user_id, points_awarded, fixture:fixture_id(gameweek, status, season_id)')
  .eq('fixture.season_id', season.id)
  .eq('fixture.status', 'FINISHED');

// The nested filter via select doesn't work as expected with supabase-js.
// Fallback: fetch from the get_season_leaderboard RPC if available.
const { data: leaderboard, error: lbErr } = await supabase
  .rpc('get_season_leaderboard', { p_season_id: season.id });

if (lbErr || !leaderboard) {
  console.warn('\n⚠️   Could not fetch overall leaderboard via RPC:', lbErr?.message);
  console.log('    Run the SQL cross-check in supabase/seed-gw29-scores.sql manually to verify overall totals.\n');
} else {
  console.log('\n📊  Overall season leaderboard after update:\n');
  console.log('   Rank  Player      Total  Expected  Status');
  console.log('   ----  ----------  -----  --------  ------');

  const expectedMap = new Map(GW29_EXPECTED.map(p => [p.userId, p.overall]));
  let allOverallOk = true;

  for (const row of leaderboard) {
    const expected = expectedMap.get(row.user_id);
    const ok       = expected !== undefined && Number(row.total_points) === expected;
    if (expected !== undefined && !ok) allOverallOk = false;
    const statusStr = expected === undefined
      ? '➖ N/A'
      : ok ? '✅' : `❌ (exp ${expected})`;
    console.log(
      `   ${String(row.rank).padStart(4)}  ${row.display_name.padEnd(10)}  ${String(row.total_points).padStart(5)}  ${String(expected ?? '?').padStart(8)}  ${statusStr}`
    );
  }

  if (allGw29Ok && allOverallOk) {
    console.log('\n🎉  All GW29 and overall totals match. Database is up to date!\n');
  } else {
    console.log('\n⚠️   Some totals still differ — review the output above.\n');
  }
}
