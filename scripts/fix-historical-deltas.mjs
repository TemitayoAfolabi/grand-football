#!/usr/bin/env node
/**
 * fix-historical-deltas.mjs
 *
 * Fixes the per-player overall total discrepancy by adjusting the GW27
 * manually_edited aggregate score_record for each affected player.
 *
 * GW27 was the last "adjustment" GW in the original historical seeding —
 * it already uses manually_edited = true aggregate records, so modifying
 * points_awarded there is safe and consistent with the established pattern.
 *
 * Usage:
 *   node scripts/fix-historical-deltas.mjs             # live
 *   node scripts/fix-historical-deltas.mjs --dry-run   # preview
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const ROOT       = path.resolve(__dirname, '..');

function loadEnvFile(f) {
  try {
    for (const line of fs.readFileSync(f,'utf8').split('\n')) {
      const t=line.trim(); if (!t||t.startsWith('#')) continue;
      const i=t.indexOf('='); if (i<0) continue;
      const k=t.slice(0,i).trim(), v=t.slice(i+1).trim().replace(/^["']|["']$/g,'');
      if (!process.env[k]) process.env[k]=v;
    }
  } catch {}
}
loadEnvFile(path.join(ROOT, '.env.local'));

const DRY_RUN      = process.argv.includes('--dry-run');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing env vars'); process.exit(1);
}
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {auth:{autoRefreshToken:false,persistSession:false}});

// ---------------------------------------------------------------------------
// Authoritative data
// ---------------------------------------------------------------------------
const PLAYERS = [
  { code:'A',  display:'Anu',      uid:'f22933c4-9b7e-5668-a698-e77df1782020', gw29:24, overall:611 },
  { code:'CC', display:'Chris',    uid:'c9456b31-d481-56dd-ba8e-19188636023e', gw29:14, overall:546 },
  { code:'C',  display:'Cozy',     uid:'0b92a57d-4fc5-5644-b6e3-e503a24797aa', gw29:21, overall:610 },
  { code:'D',  display:'David',    uid:'90630b39-9de1-5f4b-b471-e6ba6c39f2c0', gw29:10, overall:515 },
  { code:'F',  display:'Fiyin',    uid:'286af2bd-1c2d-54c3-ba3d-a48a26d2febf', gw29:13, overall:589 },
  { code:'GD', display:'Deon',     uid:'ca901b24-393b-5d20-9e96-cd3ea72d02fa', gw29:16, overall:611 },
  { code:'KK', display:'Kiki',     uid:'d4551b66-ae87-5e22-b21a-390323b9403c', gw29: 7, overall:595 },
  { code:'M',  display:'Michael',  uid:'e7cda50c-6078-5209-83a6-be99efdceec6', gw29:24, overall:594 },
  { code:'N',  display:'Nyema',    uid:'459958d6-a060-54c1-832a-809677fb0f8c', gw29: 7, overall:490 },
  { code:'O',  display:'Osita',    uid:'4995c0f4-ea7f-5ffe-b835-15e2d2f48ce3', gw29:14, overall:615 },
  { code:'OK', display:'Okey',     uid:'8694ba88-e26c-5a22-b822-b06cca31a0d9', gw29:13, overall:580 },
  { code:'T',  display:'Temmy',    uid:'0b9eda0e-3c42-5e03-9056-219811c3aaba', gw29:13, overall:493 },
  { code:'TT', display:'Temitayo', uid:'202af648-fa48-5497-928a-d8428c8fed15', gw29:12, overall:518 },
  { code:'TZ', display:'Temizack', uid:'9a6a5890-44cd-5081-a6d5-1a62d196ac1c', gw29:14, overall:655 },
];

// ---------------------------------------------------------------------------
// 1. Fetch active season
// ---------------------------------------------------------------------------
const { data: season } = await sb.from('seasons').select('id, name').eq('is_active', true).single();
console.log(`\n🏟️   Season: ${season.name}  (${season.id})\n`);

// ---------------------------------------------------------------------------
// 2. Fetch per-player totals from score_records (FINISHED only)
// ---------------------------------------------------------------------------
let all = [], from = 0;
while (true) {
  const { data, error } = await sb.from('score_records')
    .select('user_id, points_awarded, fixture:fixture_id(gameweek, status, season_id)')
    .range(from, from + 999);
  if (error) { console.error(error.message); break; }
  all = all.concat(data.filter(r => r.fixture && r.fixture.season_id === season.id && r.fixture.status === 'FINISHED'));
  if (data.length < 1000) break;
  from += 1000;
}

// Build totals per player
const currentTotals = {};
for (const p of PLAYERS) currentTotals[p.uid] = 0;
for (const r of all) currentTotals[r.user_id] = (currentTotals[r.user_id] || 0) + r.points_awarded;

// ---------------------------------------------------------------------------
// 3. Find players with deltas
// ---------------------------------------------------------------------------
const deltas = PLAYERS
  .map(p => ({ ...p, current: currentTotals[p.uid] || 0, delta: p.overall - (currentTotals[p.uid] || 0) }))
  .filter(p => p.delta !== 0);

if (deltas.length === 0) {
  console.log('✅  All overall totals already match. Nothing to do.\n');
  process.exit(0);
}

console.log('📊  Overall discrepancies found:\n');
console.log('   Player      Current  Expected  Delta');
console.log('   ----------  -------  --------  -----');
for (const p of deltas) {
  console.log(`   ${p.display.padEnd(10)}  ${String(p.current).padStart(7)}  ${String(p.overall).padStart(8)}  ${p.delta > 0 ? '+' : ''}${p.delta}`);
}

// ---------------------------------------------------------------------------
// 4. Find GW27 score_records for the affected players
//    GW27 = last manually_edited aggregate GW (from historical seeding)
//    These aggregate records sit on whatever fixture was used as the anchor.
// ---------------------------------------------------------------------------
// Find any GW27 fixture for this season
const { data: gw27Fixtures } = await sb.from('fixtures')
  .select('id, home_team, away_team')
  .eq('season_id', season.id)
  .eq('gameweek', 27)
  .limit(20);

if (!gw27Fixtures || gw27Fixtures.length === 0) {
  console.error('❌  No GW27 fixtures found'); process.exit(1);
}
const gw27FixtureIds = gw27Fixtures.map(f => f.id);
console.log(`\n📋  GW27 fixtures: ${gw27Fixtures.length} found`);

// Fetch GW27 score_records for affected players
const affectedUids = deltas.map(p => p.uid);
const { data: gw27Records, error: gw27Err } = await sb.from('score_records')
  .select('id, user_id, fixture_id, points_awarded, manually_edited')
  .in('fixture_id', gw27FixtureIds)
  .in('user_id', affectedUids);

if (gw27Err) { console.error('❌', gw27Err.message); process.exit(1); }
console.log(`📋  GW27 score_records for affected players: ${(gw27Records||[]).length}`);

// Group GW27 records by user (sum in case there are multiple per user)
const gw27ByUser = {};
for (const r of (gw27Records || [])) {
  if (!gw27ByUser[r.user_id]) gw27ByUser[r.user_id] = [];
  gw27ByUser[r.user_id].push(r);
}

// ---------------------------------------------------------------------------
// 5. Plan corrections
// ---------------------------------------------------------------------------
console.log('\n📝  Correction plan:\n');

for (const p of deltas) {
  const records = gw27ByUser[p.uid] || [];
  const currentGw27 = records.reduce((s, r) => s + r.points_awarded, 0);
  const newGw27 = currentGw27 + p.delta;
  console.log(`   ${p.display.padEnd(10)}  GW27: ${currentGw27} → ${newGw27}  (delta=${p.delta > 0 ? '+' : ''}${p.delta})`);
}

if (DRY_RUN) {
  console.log('\n🏜️   DRY-RUN — no changes written.\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 6. Apply corrections
// ---------------------------------------------------------------------------
console.log('\n🔧  Applying corrections …\n');

// For each affected player, find (or create) a single GW27 aggregate record
// and set it to the corrected value.
const GW27_ANCHOR = gw27Fixtures[0].id; // Use first GW27 fixture as anchor

let fixed = 0;
for (const p of deltas) {
  const records = gw27ByUser[p.uid] || [];
  const currentGw27 = records.reduce((s, r) => s + r.points_awarded, 0);
  const newGw27 = currentGw27 + p.delta;

  if (records.length === 0) {
    // No existing GW27 record — insert one on the anchor fixture
    const { error } = await sb.from('score_records').insert({
      user_id: p.uid,
      fixture_id: GW27_ANCHOR,
      predicted_home: null,
      predicted_away: null,
      actual_home: 0,
      actual_away: 0,
      is_star_game: false,
      points_awarded: newGw27,
      reason_code: 'OUTCOME',
      manually_edited: true,
    });
    if (error) { console.error(`❌  Insert failed for ${p.display}:`, error.message); continue; }
    console.log(`   ✅ ${p.display} — inserted GW27 record: ${newGw27} pts`);
    fixed++;
  } else if (records.length === 1) {
    // Exactly one record — update it
    const rec = records[0];
    const { error } = await sb.from('score_records')
      .update({ points_awarded: newGw27, manually_edited: true })
      .eq('id', rec.id);
    if (error) { console.error(`❌  Update failed for ${p.display}:`, error.message); continue; }
    console.log(`   ✅ ${p.display} — updated GW27 record: ${rec.points_awarded} → ${newGw27} pts`);
    fixed++;
  } else {
    // Multiple records across different GW27 fixtures — delete all and insert one aggregate
    const ids = records.map(r => r.id);
    const { error: delErr } = await sb.from('score_records').delete().in('id', ids);
    if (delErr) { console.error(`❌  Delete failed for ${p.display}:`, delErr.message); continue; }

    const { error: insErr } = await sb.from('score_records').insert({
      user_id: p.uid,
      fixture_id: GW27_ANCHOR,
      predicted_home: null,
      predicted_away: null,
      actual_home: 0,
      actual_away: 0,
      is_star_game: false,
      points_awarded: newGw27,
      reason_code: 'OUTCOME',
      manually_edited: true,
    });
    if (insErr) { console.error(`❌  Re-insert failed for ${p.display}:`, insErr.message); continue; }
    console.log(`   ✅ ${p.display} — consolidated ${records.length} GW27 records → ${newGw27} pts`);
    fixed++;
  }
}

// ---------------------------------------------------------------------------
// 7. Final verification via get_season_leaderboard RPC
// ---------------------------------------------------------------------------
console.log(`\n🔢  Fixed ${fixed}/${deltas.length} players. Running final verification …\n`);

const { data: lb, error: lbErr } = await sb.rpc('get_season_leaderboard', { p_season_id: season.id });
if (lbErr || !lb) {
  console.error('❌  Leaderboard RPC failed:', lbErr?.message);
  process.exit(1);
}

const expMap = new Map(PLAYERS.map(p => [p.uid, p.overall]));
console.log('📊  Final overall leaderboard:\n');
console.log('   Rank  Player      Total  Expected  Status');
console.log('   ----  ----------  -----  --------  ------');
let allOk = true;
for (const row of lb) {
  const exp = expMap.get(row.user_id);
  const ok  = exp !== undefined && Number(row.total_points) === exp;
  if (exp !== undefined && !ok) allOk = false;
  const st = exp === undefined ? '➖ N/A' : ok ? '✅' : `❌ (exp ${exp}, delta ${exp - Number(row.total_points)})`;
  console.log(`   ${String(row.rank).padStart(4)}  ${row.display_name.padEnd(10)}  ${String(row.total_points).padStart(5)}  ${String(exp ?? '?').padStart(8)}  ${st}`);
}

if (allOk) {
  console.log('\n🎉  All overall totals now match! Database is fully up to date.\n');
} else {
  console.log('\n⚠️   Some discrepancies remain — review output above.\n');
}
