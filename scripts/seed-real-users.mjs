#!/usr/bin/env node

/**
 * seed-real-users.mjs
 *
 * Complete re-seed with REAL player emails:
 *   1. Clears allowlist, auth users (except fixtures)
 *   2. Creates auth users with real emails + temp passwords
 *   3. Adds emails to allowlist
 *   4. Creates profiles
 *   5. Imports GW 1-27 point totals as score_records
 *   6. Validates leaderboard matches raw.txt data
 *
 * Usage:
 *   node scripts/seed-real-users.mjs                # full run
 *   node scripts/seed-real-users.mjs --dry-run      # preview only
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Load .env.local
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

const DRY_RUN = process.argv.includes('--dry-run');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// 1. Player definitions with REAL emails
// ---------------------------------------------------------------------------

const PLAYERS = [
  { code: 'A',  name: 'Anu',      display: 'Anu',      email: 'solankeanu@yahoo.com' },
  { code: 'CC', name: 'Chris',    display: 'Chris',    email: 'chijiokechuwa@gmail.com' },
  { code: 'C',  name: 'Cozy',     display: 'Cozy',     email: 'chiggscosy@yahoo.co.uk' },
  { code: 'D',  name: 'David',    display: 'David',    email: 'davidchiemmy@gmail.com' },
  { code: 'E',  name: 'Eddie-Great', display: 'Eddie-Great', email: 'efeeddiegreat@gmail.com' },
  { code: 'F',  name: 'Fiyin',    display: 'Fiyin',    email: 'foyefeko@gmail.com' },
  { code: 'GD', name: 'Deon',     display: 'Deon',     email: 'deonomics@gmail.com' },
  { code: 'KK', name: 'Kiki',     display: 'Kiki',     email: 'abimbolaadigun27@gmail.com' },
  { code: 'M',  name: 'Michael',  display: 'Michael',  email: 'eyitadeilesanmi@gmail.com' },
  { code: 'N',  name: 'Nyema',    display: 'Nyema',    email: 'nyemahameokwu@gmail.com' },
  { code: 'O',  name: 'Osita',    display: 'Osita',    email: 'o.nwokeocha20@yahoo.com' },
  { code: 'OK', name: 'Okey',     display: 'Okey',     email: 'azuokechukwu@gmail.com' },
  { code: 'T',  name: 'Temmy',    display: 'Temmy',    email: 'temmykin8@gmail.com' },
  { code: 'TT', name: 'Temitayo', display: 'Temitayo', email: 'temitayoafolabi97@yahoo.com' },
  { code: 'TZ', name: 'Temizack', display: 'Temizack', email: 'temizack@yahoo.co.uk' },
];

// Temp password for all users (they'll need to reset)
const TEMP_PASSWORD = 'GrandFootball2026!';

// ---------------------------------------------------------------------------
// 2. Deterministic UUID generation
// ---------------------------------------------------------------------------

const NS_UUID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

function deterministicUUID(name) {
  const ns = Buffer.from(NS_UUID.replace(/-/g, ''), 'hex');
  const hash = crypto.createHash('sha1').update(Buffer.concat([ns, Buffer.from(name, 'utf8')])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  return [
    hash.subarray(0, 4).toString('hex'),
    hash.subarray(4, 6).toString('hex'),
    hash.subarray(6, 8).toString('hex'),
    hash.subarray(8, 10).toString('hex'),
    hash.subarray(10, 16).toString('hex'),
  ].join('-');
}

// Use email as the UUID seed for deterministic IDs
const PLAYER_UUIDS = Object.fromEntries(
  PLAYERS.map((p) => [p.code, deterministicUUID(`grandfootball:player:${p.email}`)]),
);

// ---------------------------------------------------------------------------
// 3. Parse historical data
// ---------------------------------------------------------------------------

console.log('\n====== GRAND FOOTBALL — SEED REAL USERS ======\n');
console.log('Parsing historical data...');

const parsedData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/data/gw-results/out/parsed.json'), 'utf8'),
);

// gwNumber → { code → points }
const gwPointsMap = new Map();
for (const gw of parsedData.gameweeks) {
  const map = new Map();
  for (const p of gw.predictions) map.set(p.code, p.points);
  gwPointsMap.set(gw.gameweek, map);
}

console.log(`  Gameweeks parsed: ${parsedData.gameweeks.length} (GW ${Math.min(...gwPointsMap.keys())}-${Math.max(...gwPointsMap.keys())})`);

// ---------------------------------------------------------------------------
// 4. Compute leaderboard-aligned scores
// ---------------------------------------------------------------------------
// Use the overall_table from the latest GW to ensure cumulative totals match exactly.
// Sum GW 1-(N-1) raw points, then compute last GW as: target - priorSum

const latestGw = Math.max(...gwPointsMap.keys());
const latestOverall = parsedData.gameweeks.find((g) => g.gameweek === latestGw)?.overall_table || [];

const targetTotals = new Map();
for (const entry of latestOverall) targetTotals.set(entry.label, entry.points);

// Sum GW 1 to (latestGw-1) per-GW raw points
const priorSum = new Map();
for (const [gw, pointsMap] of gwPointsMap) {
  if (gw >= latestGw) continue;
  for (const [code, pts] of pointsMap) {
    priorSum.set(code, (priorSum.get(code) || 0) + pts);
  }
}

console.log('\n  GW adjustments (last GW adjusted to match overall table):');
let adjustCount = 0;
for (const player of PLAYERS) {
  const target = targetTotals.get(player.code) ?? 0;
  const prior = priorSum.get(player.code) ?? 0;
  const rawLast = gwPointsMap.get(latestGw)?.get(player.code) ?? 0;
  const adjusted = target - prior;
  const delta = adjusted - rawLast;
  if (delta !== 0) {
    adjustCount++;
    console.log(`    ${player.display.padEnd(14)} raw=${rawLast}, adjusted=${adjusted} (delta=${delta > 0 ? '+' : ''}${delta})`);
  }
}
if (adjustCount === 0) console.log('    (none — all totals already match)');

// ---------------------------------------------------------------------------
// 5. Fetch season & fixtures info
// ---------------------------------------------------------------------------

console.log('\nFetching season & fixture data from Supabase...');

const { data: season } = await supabase
  .from('seasons')
  .select('id, name')
  .eq('is_active', true)
  .single();

if (!season) {
  console.error('No active season found. Please create one first.');
  process.exit(1);
}

console.log(`  Season: ${season.name} (${season.id})`);

// Count existing fixtures
const { count: fixtureCount } = await supabase
  .from('fixtures')
  .select('id', { count: 'exact', head: true })
  .eq('season_id', season.id);

console.log(`  Existing fixtures: ${fixtureCount}`);

// ---------------------------------------------------------------------------
// 6. Build aggregate fixtures for GW 1-27
// ---------------------------------------------------------------------------

const SEASON_START = new Date('2025-08-16T15:00:00Z');

function aggApiId(gw) { return 90000 + gw; }
function aggKickoff(gw) {
  return new Date(SEASON_START.getTime() + (gw - 1) * 7 * 24 * 60 * 60 * 1000).toISOString();
}

const aggregateFixtures = [...gwPointsMap.keys()].sort((a, b) => a - b).map((gw) => ({
  season_id: season.id,
  api_fixture_id: aggApiId(gw),
  home_team: `GW ${gw} Import`,
  away_team: 'Aggregate',
  kickoff_time: aggKickoff(gw),
  status: 'FINISHED',
  home_score: 0,
  away_score: 0,
  gameweek: gw,
  is_star_game: false,
}));

// ---------------------------------------------------------------------------
// 7. Build score records
// ---------------------------------------------------------------------------

const scoreRecords = [];
for (const [gw, pointsMap] of gwPointsMap) {
  for (const player of PLAYERS) {
    let pts;
    if (gw === latestGw) {
      const target = targetTotals.get(player.code) ?? 0;
      const prior = priorSum.get(player.code) ?? 0;
      pts = target - prior;
    } else {
      pts = pointsMap.get(player.code) ?? 0;
    }

    // Skip players not in this GW (e.g., Eddie-Great only in GW1)
    if (pts === 0 && !pointsMap.has(player.code) && gw !== latestGw) continue;

    scoreRecords.push({
      _gw: gw,
      _apiFixtureId: aggApiId(gw),
      user_id: PLAYER_UUIDS[player.code],
      predicted_home: null,
      predicted_away: null,
      actual_home: 0,
      actual_away: 0,
      is_star_game: false,
      points_awarded: pts,
      reason_code: 'OUTCOME',
      manually_edited: true,
    });
  }
}

console.log(`  Aggregate fixtures to create: ${aggregateFixtures.length}`);
console.log(`  Score records to create: ${scoreRecords.length}`);

// ---------------------------------------------------------------------------
// SUMMARY
// ---------------------------------------------------------------------------

console.log('\n  Players:');
for (const p of PLAYERS) {
  console.log(`    ${p.code.padEnd(3)} ${p.display.padEnd(14)} ${p.email.padEnd(35)} ${PLAYER_UUIDS[p.code]}`);
}

// Verify cumulative totals
console.log('\n  Cumulative leaderboard check:');
const cumulative = new Map();
for (const sr of scoreRecords) {
  cumulative.set(sr.user_id, (cumulative.get(sr.user_id) || 0) + sr.points_awarded);
}
const sorted = [...cumulative.entries()].sort((a, b) => b[1] - a[1]);
let allMatch = true;
for (const [userId, totalPts] of sorted) {
  const player = PLAYERS.find((p) => PLAYER_UUIDS[p.code] === userId);
  if (!player) continue;
  const parsed = latestOverall.find((o) => o.label === player.code);
  const parsedPts = parsed?.points ?? '?';
  const ok = totalPts == parsedPts;
  if (!ok) allMatch = false;
  console.log(
    `    ${ok ? 'OK' : 'XX'} ${player.display.padEnd(14)} ${String(totalPts).padStart(4)} pts  (expected: ${String(parsedPts).padStart(4)})`,
  );
}
if (allMatch) {
  console.log('    All cumulative totals match!');
} else {
  console.log('    WARNING: Some totals differ!');
}

if (DRY_RUN) {
  console.log('\n=== DRY-RUN complete. Re-run without --dry-run to seed. ===\n');
  process.exit(0);
}

// ===========================================================================
// 8. SEED THE DATABASE
// ===========================================================================

console.log('\n====== SEEDING DATABASE ======\n');

const stats = {
  usersDeleted: 0,
  usersCreated: 0,
  allowlistAdded: 0,
  profilesUpdated: 0,
  aggFixturesUpserted: 0,
  scoreRecordsUpserted: 0,
  errors: [],
};

// ---------------------------------------------------------------------------
// 8a. Delete existing auth users (except fixtures stay)
// ---------------------------------------------------------------------------

console.log('Step 1: Cleaning up existing auth users...');

const { data: existingUsers } = await supabase.auth.admin.listUsers();
if (existingUsers?.users?.length) {
  for (const u of existingUsers.users) {
    try {
      const { error } = await supabase.auth.admin.deleteUser(u.id);
      if (error) throw error;
      stats.usersDeleted++;
      console.log(`  Deleted: ${u.email}`);
    } catch (err) {
      console.log(`  Warning deleting ${u.email}: ${err.message}`);
    }
  }
}
console.log(`  ${stats.usersDeleted} users deleted\n`);

// ---------------------------------------------------------------------------
// 8b. Clear allowlist, score_records, predictions, monthly_bonuses, etc.
// ---------------------------------------------------------------------------

console.log('Step 2: Clearing data tables...');

// Delete score_records
const { error: srDel } = await supabase.from('score_records').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (srDel) console.log(`  score_records delete warning: ${srDel.message}`);
else console.log('  score_records cleared');

// Delete predictions
const { error: predDel } = await supabase.from('predictions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (predDel) console.log(`  predictions delete warning: ${predDel.message}`);
else console.log('  predictions cleared');

// Delete prediction_history
const { error: phDel } = await supabase.from('prediction_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (phDel) console.log(`  prediction_history delete warning: ${phDel.message}`);
else console.log('  prediction_history cleared');

// Delete monthly_bonuses
const { error: mbDel } = await supabase.from('monthly_bonuses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (mbDel) console.log(`  monthly_bonuses delete warning: ${mbDel.message}`);
else console.log('  monthly_bonuses cleared');

// Delete admin_audit_log
const { error: alDel } = await supabase.from('admin_audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (alDel) console.log(`  admin_audit_log delete warning: ${alDel.message}`);
else console.log('  admin_audit_log cleared');

// Delete allowlist
const { error: awDel } = await supabase.from('allowlist').delete().neq('id', '00000000-0000-0000-0000-000000000000');
if (awDel) console.log(`  allowlist delete warning: ${awDel.message}`);
else console.log('  allowlist cleared');

// Delete aggregate fixtures (api_fixture_id >= 90000)
const { error: aggDel } = await supabase.from('fixtures').delete().gte('api_fixture_id', 90000);
if (aggDel) console.log(`  aggregate fixtures delete warning: ${aggDel.message}`);
else console.log('  aggregate fixtures cleared');

console.log();

// ---------------------------------------------------------------------------
// 8c. Create auth users with real emails
// ---------------------------------------------------------------------------

console.log('Step 3: Creating auth users...');

for (const player of PLAYERS) {
  const email = player.email.toLowerCase().trim();
  const userId = PLAYER_UUIDS[player.code];
  const isAdmin = (email === 'temitayoafolabi97@yahoo.com');

  try {
    const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
      id: userId,
      email,
      password: TEMP_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: player.display },
    });

    if (authErr) {
      if (authErr.message?.includes('already been registered') || authErr.message?.includes('already exists')) {
        console.log(`  Exists: ${player.display} (${email})`);
      } else {
        throw authErr;
      }
    } else {
      stats.usersCreated++;
      console.log(`  Created: ${player.display} (${email}) -> ${userId}`);
    }
  } catch (err) {
    const msg = `Auth ${player.display}: ${err.message || err}`;
    console.error(`  ERROR: ${msg}`);
    stats.errors.push(msg);
  }
}

// Wait for triggers to create profiles
await new Promise((r) => setTimeout(r, 3000));

console.log(`  ${stats.usersCreated} users created\n`);

// ---------------------------------------------------------------------------
// 8d. Update profiles (display names, admin flag)
// ---------------------------------------------------------------------------

console.log('Step 4: Updating profiles...');

for (const player of PLAYERS) {
  const email = player.email.toLowerCase().trim();
  const userId = PLAYER_UUIDS[player.code];
  const isAdmin = (email === 'temitayoafolabi97@yahoo.com');

  try {
    const { error: profileErr } = await supabase
      .from('profiles')
      .update({
        display_name: player.display,
        is_admin: isAdmin,
        force_password_change: true,
      })
      .eq('id', userId);

    if (profileErr) throw profileErr;
    stats.profilesUpdated++;
    console.log(`  Updated: ${player.display}${isAdmin ? ' (ADMIN)' : ''}`);
  } catch (err) {
    console.log(`  Profile warning ${player.display}: ${err.message}`);
  }
}

console.log(`  ${stats.profilesUpdated} profiles updated\n`);

// ---------------------------------------------------------------------------
// 8e. Add emails to allowlist
// ---------------------------------------------------------------------------

console.log('Step 5: Adding to allowlist...');

const adminUserId = PLAYER_UUIDS['TT']; // Temitayo is admin
const allowlistRows = PLAYERS.map((p) => ({
  email: p.email.toLowerCase().trim(),
  added_by: adminUserId,
}));

for (const row of allowlistRows) {
  try {
    const { error } = await supabase.from('allowlist').insert(row);
    if (error) {
      if (error.message?.includes('duplicate')) {
        console.log(`  Exists: ${row.email}`);
      } else {
        throw error;
      }
    } else {
      stats.allowlistAdded++;
      console.log(`  Added: ${row.email}`);
    }
  } catch (err) {
    console.log(`  Allowlist warning ${row.email}: ${err.message}`);
  }
}

console.log(`  ${stats.allowlistAdded} emails added\n`);

// ---------------------------------------------------------------------------
// 8f. Upsert aggregate fixtures (GW 1-27)
// ---------------------------------------------------------------------------

console.log('Step 6: Upserting aggregate fixtures...');

const BATCH = 50;
for (let i = 0; i < aggregateFixtures.length; i += BATCH) {
  const batch = aggregateFixtures.slice(i, i + BATCH);
  try {
    const { error } = await supabase.from('fixtures').upsert(batch, { onConflict: 'api_fixture_id' });
    if (error) throw error;
    stats.aggFixturesUpserted += batch.length;
  } catch (err) {
    const msg = `Fixtures batch ${i}: ${err.message || err}`;
    console.error(`  ERROR: ${msg}`);
    stats.errors.push(msg);
  }
}

console.log(`  ${stats.aggFixturesUpserted} aggregate fixtures upserted\n`);

// ---------------------------------------------------------------------------
// 8g. Fetch aggregate fixture UUIDs
// ---------------------------------------------------------------------------

console.log('Step 7: Fetching aggregate fixture IDs...');

const aggIds = aggregateFixtures.map((f) => f.api_fixture_id);
const { data: aggFxData, error: aggFetchErr } = await supabase
  .from('fixtures')
  .select('id, api_fixture_id')
  .in('api_fixture_id', aggIds);

if (aggFetchErr) {
  console.error('Failed to fetch aggregate fixtures:', aggFetchErr);
  process.exit(1);
}

const aggIdMap = new Map();
for (const f of aggFxData) aggIdMap.set(f.api_fixture_id, f.id);
console.log(`  ${aggIdMap.size} fixture IDs in lookup\n`);

// ---------------------------------------------------------------------------
// 8h. Upsert score records
// ---------------------------------------------------------------------------

console.log('Step 8: Upserting score records...');

const srRows = scoreRecords.map((sr) => {
  const fixtureId = aggIdMap.get(sr._apiFixtureId);
  if (!fixtureId) return null;
  return {
    user_id: sr.user_id,
    fixture_id: fixtureId,
    predicted_home: sr.predicted_home,
    predicted_away: sr.predicted_away,
    actual_home: sr.actual_home,
    actual_away: sr.actual_away,
    is_star_game: sr.is_star_game,
    points_awarded: sr.points_awarded,
    reason_code: sr.reason_code,
    manually_edited: sr.manually_edited,
  };
}).filter(Boolean);

for (let i = 0; i < srRows.length; i += BATCH) {
  const batch = srRows.slice(i, i + BATCH);
  try {
    const { error } = await supabase
      .from('score_records')
      .upsert(batch, { onConflict: 'user_id,fixture_id' });
    if (error) throw error;
    stats.scoreRecordsUpserted += batch.length;

    if ((i + BATCH) % 200 < BATCH) {
      console.log(`  ${Math.min(i + BATCH, srRows.length)} / ${srRows.length}`);
    }
  } catch (err) {
    const msg = `Score records batch ${i}: ${err.message || err}`;
    console.error(`  ERROR: ${msg}`);
    stats.errors.push(msg);
  }
}

console.log(`  ${stats.scoreRecordsUpserted} score records upserted\n`);

// ---------------------------------------------------------------------------
// 8i. Validate leaderboard via RPC
// ---------------------------------------------------------------------------

console.log('Step 9: Validating leaderboard...\n');

try {
  const { data: lb, error: lbErr } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: season.id,
  });
  if (lbErr) throw lbErr;

  console.log('  Rank  Name            DB Pts   Expected');
  console.log('  ' + '-'.repeat(50));

  let leaderboardMatch = true;
  for (const entry of lb || []) {
    const player = PLAYERS.find((p) => PLAYER_UUIDS[p.code] === entry.user_id);
    if (!player) continue;
    const parsed = latestOverall.find((o) => o.label === player.code);
    const dbPts = entry.total_points;
    const parsedPts = parsed?.points ?? '?';
    const ok = dbPts == parsedPts;
    if (!ok) leaderboardMatch = false;

    console.log(
      `  ${ok ? 'OK' : 'XX'}  #${String(entry.rank).padStart(2)}  ${entry.display_name.padEnd(14)} ${String(dbPts).padStart(4)}     ${String(parsedPts).padStart(4)}`,
    );
  }

  if (leaderboardMatch) {
    console.log('\n  All leaderboard totals match!');
  } else {
    console.log('\n  WARNING: Some leaderboard totals differ!');
  }
} catch (err) {
  console.log(`  Could not validate leaderboard: ${err.message}`);
}

// ===========================================================================
// FINAL SUMMARY
// ===========================================================================

console.log('\n' + '='.repeat(60));
console.log('  SEED SUMMARY');
console.log('='.repeat(60));
console.log(`  Auth users deleted:     ${stats.usersDeleted}`);
console.log(`  Auth users created:     ${stats.usersCreated}`);
console.log(`  Allowlist entries:      ${stats.allowlistAdded}`);
console.log(`  Profiles updated:       ${stats.profilesUpdated}`);
console.log(`  Aggregate fixtures:     ${stats.aggFixturesUpserted}`);
console.log(`  Score records:          ${stats.scoreRecordsUpserted}`);

if (stats.errors.length > 0) {
  console.log(`\n  ERRORS (${stats.errors.length}):`);
  for (const e of stats.errors) console.log(`    - ${e}`);
} else {
  console.log(`\n  No errors!`);
}

console.log('='.repeat(60));
console.log('\n  All users can log in with:');
console.log(`  Password: ${TEMP_PASSWORD}`);
console.log('  They will be prompted to change it on first login.\n');
