#!/usr/bin/env node

/**
 * seed-historical-data.mjs
 *
 * Loads historical Grand Football data into Supabase:
 *   1. Creates auth users + profiles for all 14 players
 *   2. Imports WhatsApp GW point totals (GW 1-27) from parsed.json
 *      → as manually_edited score_records via one aggregate fixture per GW
 *      → this makes the leaderboard match the WhatsApp history exactly
 *   3. Imports GW 28 predictions from the XLSX spreadsheet
 *      → linked to the real DB fixtures (which are TIMED, not yet played)
 *      → these will be scored by the scoring engine when GW 28 finishes
 *
 * PREREQUISITES:
 *   - Fixtures for GW 1-38 exist in Supabase (from football-data.org API)
 *   - The 2025-2026 season exists
 *   - .env.local has NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   node scripts/seed-historical-data.mjs                # full run
 *   node scripts/seed-historical-data.mjs --dry-run      # preview only
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 0. Resolve paths & load env
// ---------------------------------------------------------------------------
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

const DRY_RUN = process.argv.includes('--dry-run');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const XLSX = (await import('xlsx')).default;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// 1. Canonical player list
// ---------------------------------------------------------------------------

const PLAYERS = [
  { code: 'A', name: 'Anu', display: 'Anu' },
  { code: 'CC', name: 'Chris', display: 'Chris' },
  { code: 'C', name: 'Cozy', display: 'Cozy' },
  { code: 'D', name: 'David', display: 'David' },
  { code: 'F', name: 'Fiyin', display: 'Fiyin' },
  { code: 'GD', name: 'Deon', display: 'Deon' },
  { code: 'KK', name: 'Kiki', display: 'Kiki' },
  { code: 'M', name: 'Michael', display: 'Michael' },
  { code: 'N', name: 'Nyema', display: 'Nyema' },
  { code: 'O', name: 'Osita', display: 'Osita' },
  { code: 'OK', name: 'Okey', display: 'Okey' },
  { code: 'T', name: 'Temmy', display: 'Temmy' },
  { code: 'TT', name: 'Temitayo', display: 'Temitayo' },
  { code: 'TZ', name: 'Temizack', display: 'Temizack' },
];

// XLSX player name → code
const NAME_MAP = new Map(
  [
    ['c', 'C'], ['cozy (c)', 'C'], ['cozy', 'C'],
    ['a', 'A'], ['anu', 'A'],
    ['chris', 'CC'],
    ['osita', 'O'],
    ['temi k', 'T'], ['temi king', 'T'], ['t king', 'T'], ['temi', 'T'], ['temmy', 'T'],
    ['temitayo', 'TT'],
    ['kiki', 'KK'],
    ['fiyin', 'F'],
    ['david', 'D'], ['david nwigwe', 'D'],
    ['nyema', 'N'], ['nyeam', 'N'], ['nyemahame', 'N'],
    ['okey', 'OK'], ['okey dorgu', 'OK'],
    ['deon', 'GD'],
    ['michael', 'M'],
    ['temizack', 'TZ'],
  ].map(([k, v]) => [k.toLowerCase(), v]),
);

function normalisePlayer(raw) {
  if (!raw) return null;
  return NAME_MAP.get(String(raw).trim().toLowerCase()) ?? null;
}

// XLSX team name → DB official name
const TEAM_MAP = new Map([
  ['arsenal', 'Arsenal FC'],
  ['aston villa', 'Aston Villa FC'],
  ['aston villa fc', 'Aston Villa FC'],
  ['bournemouth', 'AFC Bournemouth'],
  ['afc bournemouth', 'AFC Bournemouth'],
  ['brentford', 'Brentford FC'],
  ['brighton', 'Brighton & Hove Albion FC'],
  ['burnley', 'Burnley FC'],
  ['chelsea', 'Chelsea FC'],
  ['crystal palace', 'Crystal Palace FC'],
  ['crystal palace fc', 'Crystal Palace FC'],
  ['everton', 'Everton FC'],
  ['fulham', 'Fulham FC'],
  ['leeds', 'Leeds United FC'],
  ['liverpool', 'Liverpool FC'],
  ['man city', 'Manchester City FC'],
  ['manchester city', 'Manchester City FC'],
  ['man utd', 'Manchester United FC'],
  ['man united', 'Manchester United FC'],
  ['manchester united', 'Manchester United FC'],
  ['manchester utd', 'Manchester United FC'],
  ['newcastle', 'Newcastle United FC'],
  ['nottingham forest', 'Nottingham Forest FC'],
  ['nottingham forest fc', 'Nottingham Forest FC'],
  ['sunderland', 'Sunderland AFC'],
  ['sunderland afc', 'Sunderland AFC'],
  ['spurs', 'Tottenham Hotspur FC'],
  ['tottenham', 'Tottenham Hotspur FC'],
  ['west ham', 'West Ham United FC'],
  ['wolves', 'Wolverhampton Wanderers FC'],
]);

function normaliseTeam(raw) {
  if (!raw) return null;
  return TEAM_MAP.get(raw.trim().toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Deterministic UUID generation (v5-style)
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

const PLAYER_UUIDS = Object.fromEntries(
  PLAYERS.map((p) => [p.code, deterministicUUID(`grandfootball:player:${p.code}`)]),
);

// ---------------------------------------------------------------------------
// 3. Parse data sources
// ---------------------------------------------------------------------------

console.log('\n🔍  Parsing data sources …\n');

// 3a. parsed.json — WhatsApp GW point totals (GW 1-27)
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
console.log(`   parsed.json: ${parsedData.gameweeks.length} gameweeks (GW ${Math.min(...gwPointsMap.keys())}-${Math.max(...gwPointsMap.keys())})`);

// 3b. XLSX — GW 28 predictions only (sheet "Form Responses 29" → GW 28)
const xlsxPath = path.join(
  ROOT,
  'docs/data/gw-results/out/Grand football MASTER SHEET (Responses) 2.xlsx',
);
const workbook = XLSX.readFile(xlsxPath);

// Find the GW 28 sheet (labeled "Form Responses 29")
const gw28SheetName = workbook.SheetNames.find(
  (n) => n.trim().toLowerCase().includes('form responses 29'),
);

const gw28Fixtures = []; // { fixtureIndex, homeTeamDB, awayTeamDB }
const gw28Predictions = []; // { fixtureIndex, playerCode, homeScore, awayScore }

if (gw28SheetName) {
  const ws = workbook.Sheets[gw28SheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const headers = data[0];
  const fixtureHeaders = headers.slice(2);

  // Parse fixture columns
  for (let i = 0; i < fixtureHeaders.length; i++) {
    const raw = String(fixtureHeaders[i] || '').trim();
    if (!raw) continue;
    const parts = raw.split(/\s+vs\s+/i);
    if (parts.length !== 2) continue;
    const home = normaliseTeam(parts[0]);
    const away = normaliseTeam(parts[1]);
    if (!home || !away) {
      console.warn(`   ⚠️  GW28: unknown team in "${raw}"`);
      continue;
    }
    gw28Fixtures.push({ fixtureIndex: i, homeTeamDB: home, awayTeamDB: away });
  }

  // Parse player rows
  const seen = new Set();
  for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    const code = normalisePlayer(row[1]);
    if (!code) {
      if (row[1] && String(row[1]).trim()) {
        console.warn(`   ⚠️  GW28: unknown player "${row[1]}"`);
      }
      continue;
    }
    if (seen.has(code)) continue;
    seen.add(code);

    for (let i = 0; i < fixtureHeaders.length; i++) {
      const cell = row[i + 2];
      if (cell == null || String(cell).trim() === '') continue;
      const m = String(cell).trim().match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!m) continue;
      gw28Predictions.push({
        fixtureIndex: i,
        playerCode: code,
        homeScore: parseInt(m[1], 10),
        awayScore: parseInt(m[2], 10),
      });
    }
  }
  console.log(`   XLSX GW28 (sheet "${gw28SheetName}"): ${gw28Fixtures.length} fixtures, ${gw28Predictions.length} predictions`);
} else {
  console.warn('   ⚠️  No GW28 sheet found in XLSX');
}

// ---------------------------------------------------------------------------
// 4. Fetch season & fixtures from Supabase
// ---------------------------------------------------------------------------

console.log('\n🔗  Fetching from Supabase …');

const { data: season } = await supabase
  .from('seasons')
  .select('id, name')
  .eq('is_active', true)
  .single();

if (!season) { console.error('❌  No active season'); process.exit(1); }
console.log(`   Season: ${season.name} (${season.id})`);

// Fetch all fixtures
let dbFixtures = [];
let from = 0;
while (true) {
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, gameweek, home_team, away_team, status, home_score, away_score, is_star_game, api_fixture_id')
    .eq('season_id', season.id)
    .range(from, from + 999);
  if (error) { console.error('❌  Fixtures fetch error:', error); process.exit(1); }
  dbFixtures = dbFixtures.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`   ${dbFixtures.length} fixtures loaded`);

// Build DB fixture lookup
const dbLookup = new Map();
for (const f of dbFixtures) {
  dbLookup.set(`${f.gameweek}:${f.home_team}:${f.away_team}`, f);
}

// Match GW 28 XLSX fixtures to DB
const gw28FixtureMap = new Map(); // fixtureIndex → DB fixture
let gw28Matched = 0;
for (const xf of gw28Fixtures) {
  const key = `28:${xf.homeTeamDB}:${xf.awayTeamDB}`;
  const dbFx = dbLookup.get(key);
  if (dbFx) {
    gw28FixtureMap.set(xf.fixtureIndex, dbFx);
    gw28Matched++;
  } else {
    // Try swapped
    const skey = `28:${xf.awayTeamDB}:${xf.homeTeamDB}`;
    const sfx = dbLookup.get(skey);
    if (sfx) {
      gw28FixtureMap.set(xf.fixtureIndex, { ...sfx, _swapped: true });
      gw28Matched++;
      console.warn(`   🔀  GW28: "${xf.homeTeamDB}" vs "${xf.awayTeamDB}" swapped in DB`);
    } else {
      console.warn(`   ❌  GW28: no match for "${xf.homeTeamDB}" vs "${xf.awayTeamDB}"`);
    }
  }
}
console.log(`   GW28 fixtures matched: ${gw28Matched} / ${gw28Fixtures.length}`);

// Build GW 28 prediction rows
const gw28PredRows = [];
for (const pred of gw28Predictions) {
  const dbFx = gw28FixtureMap.get(pred.fixtureIndex);
  if (!dbFx) continue;
  const userId = PLAYER_UUIDS[pred.playerCode];
  if (!userId) continue;

  if (dbFx._swapped) {
    gw28PredRows.push({ user_id: userId, fixture_id: dbFx.id, home_score: pred.awayScore, away_score: pred.homeScore });
  } else {
    gw28PredRows.push({ user_id: userId, fixture_id: dbFx.id, home_score: pred.homeScore, away_score: pred.awayScore });
  }
}

// De-dup
const predDedup = new Map();
for (const r of gw28PredRows) predDedup.set(`${r.user_id}:${r.fixture_id}`, r);
const dedupedGw28 = [...predDedup.values()];

console.log(`   GW28 predictions to insert: ${dedupedGw28.length}`);

// ---------------------------------------------------------------------------
// 5. Compute aggregate fixture IDs for GW 1-27 points
// ---------------------------------------------------------------------------

// We'll create one "aggregate" fixture per GW for the WhatsApp point totals.
// These are separate from the real API fixtures.
// api_fixture_id: 90000 + gwNumber (high number to avoid collision)
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

// Score records from parsed.json
// Strategy: use per-GW points for GW 1-26; adjust GW 27 so cumulative totals
// match the overall_table from the latest GW exactly. This accounts for any
// mid-season corrections the WhatsApp group applied to the running standings.

const latestGw = Math.max(...gwPointsMap.keys());
const latestOverall = parsedData.gameweeks.find((g) => g.gameweek === latestGw)?.overall_table || [];

// Build target totals from overall_table
const targetTotals = new Map(); // code → final overall points
for (const entry of latestOverall) targetTotals.set(entry.label, entry.points);

// Sum GW 1-26 per-GW points
const gw1to26Sum = new Map(); // code → sum
for (const [gw, pointsMap] of gwPointsMap) {
  if (gw >= latestGw) continue; // skip the last GW for now
  for (const [code, pts] of pointsMap) {
    gw1to26Sum.set(code, (gw1to26Sum.get(code) || 0) + pts);
  }
}

const scoreRecords = [];
for (const [gw, pointsMap] of gwPointsMap) {
  for (const player of PLAYERS) {
    let pts;
    if (gw === latestGw) {
      // Adjust last-GW points so cumulative matches overall_table exactly
      const target = targetTotals.get(player.code) ?? 0;
      const priorSum = gw1to26Sum.get(player.code) ?? 0;
      pts = target - priorSum;
    } else {
      pts = pointsMap.get(player.code) ?? 0;
    }

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

// Log GW 27 adjustments
console.log(`\n   GW ${latestGw} point adjustments (overall_table - sum_GW1-${latestGw - 1}):`);
let adjustmentCount = 0;
for (const player of PLAYERS) {
  const target = targetTotals.get(player.code) ?? 0;
  const priorSum = gw1to26Sum.get(player.code) ?? 0;
  const rawGw27 = gwPointsMap.get(latestGw)?.get(player.code) ?? 0;
  const adjusted = target - priorSum;
  const delta = adjusted - rawGw27;
  if (delta !== 0) {
    adjustmentCount++;
    console.log(`      ${player.display.padEnd(12)} raw=${rawGw27}, adjusted=${adjusted} (Δ=${delta > 0 ? '+' : ''}${delta})`);
  }
}
if (adjustmentCount === 0) console.log('      (none — all totals already match)');

console.log(`\n   Aggregate fixtures to create: ${aggregateFixtures.length}`);
console.log(`   Score records to create: ${scoreRecords.length}`);

// ---------------------------------------------------------------------------
// DRY-RUN
// ---------------------------------------------------------------------------

if (DRY_RUN) {
  console.log('\n🏜️   DRY-RUN MODE\n');

  console.log('Players (14):');
  for (const p of PLAYERS) {
    console.log(`   ${p.code.padEnd(3)} ${p.display.padEnd(12)} → ${PLAYER_UUIDS[p.code]}`);
  }

  console.log(`\nSeason: ${season.name}`);
  console.log(`Aggregate fixtures: ${aggregateFixtures.length} (GW 1-27)`);
  console.log(`Score records (WhatsApp points): ${scoreRecords.length}`);
  console.log(`GW28 predictions: ${dedupedGw28.length}`);

  // Verify cumulative leaderboard matches parsed.json
  console.log('\n📊  Cumulative leaderboard check:\n');
  const latestGw = Math.max(...gwPointsMap.keys());
  const latestOverall = parsedData.gameweeks.find((g) => g.gameweek === latestGw)?.overall_table || [];

  const cumulative = new Map();
  for (const sr of scoreRecords) {
    const prev = cumulative.get(sr.user_id) || 0;
    cumulative.set(sr.user_id, prev + sr.points_awarded);
  }

  // Sort by points desc
  const sorted = [...cumulative.entries()].sort((a, b) => b[1] - a[1]);
  let allMatch = true;
  for (const [userId, totalPts] of sorted) {
    const player = PLAYERS.find((p) => PLAYER_UUIDS[p.code] === userId);
    const parsed = latestOverall.find((o) => o.label === player.code);
    const parsedPts = parsed?.points ?? '?';
    const ok = totalPts == parsedPts;
    if (!ok) allMatch = false;
    console.log(
      `   ${ok ? '✓' : '✗'} ${player.display.padEnd(12)} ${String(totalPts).padStart(4)} pts  (parsed: ${String(parsedPts).padStart(4)})`,
    );
  }
  if (allMatch) {
    console.log('\n   ✅  All cumulative totals match parsed.json!');
  } else {
    console.log('\n   ⚠️  Some totals differ — check the deltas in summary.md');
  }

  // Show GW28 prediction samples
  console.log('\nGW28 prediction samples (first 5):');
  for (const p of dedupedGw28.slice(0, 5)) {
    const player = PLAYERS.find((pl) => PLAYER_UUIDS[pl.code] === p.user_id);
    const fx = dbFixtures.find((f) => f.id === p.fixture_id);
    console.log(`   ${player?.display?.padEnd(12)} ${fx?.home_team} vs ${fx?.away_team} → ${p.home_score}-${p.away_score}`);
  }

  console.log('\n✅  Dry-run complete. Re-run without --dry-run to seed.\n');
  process.exit(0);
}

// ===========================================================================
// 6. SEED THE DATABASE
// ===========================================================================

console.log('\n🚀  Starting database seed …\n');

const stats = {
  usersCreated: 0,
  usersExisted: 0,
  profilesUpserted: 0,
  aggFixturesUpserted: 0,
  scoreRecordsUpserted: 0,
  gw28PredictionsUpserted: 0,
  errors: [],
};

// ---------------------------------------------------------------------------
// 6a. Create auth users + profiles
// ---------------------------------------------------------------------------

console.log('👤  Creating auth users & profiles …');

for (const player of PLAYERS) {
  const email = `${player.code.toLowerCase()}@grandfootball.local`;
  const userId = PLAYER_UUIDS[player.code];

  try {
    const { error: authErr } = await supabase.auth.admin.createUser({
      id: userId,
      email,
      email_confirm: true,
      user_metadata: { full_name: player.display },
    });

    if (authErr) {
      if (
        authErr.message?.includes('already been registered') ||
        authErr.message?.includes('already exists') ||
        authErr.status === 422
      ) {
        stats.usersExisted++;
        console.log(`   ✓ ${player.display} — exists`);
      } else {
        throw authErr;
      }
    } else {
      stats.usersCreated++;
      stats.profilesUpserted++; // trigger auto-creates the profile
      console.log(`   + ${player.display} — created (${userId})`);
    }
  } catch (err) {
    const msg = `Auth ${player.display}: ${err.message || err}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

// Brief pause to let triggers complete
await new Promise((r) => setTimeout(r, 2000));

console.log(`   → ${stats.usersCreated} created, ${stats.usersExisted} existed\n`);

// ---------------------------------------------------------------------------
// 6b. Upsert aggregate fixtures (GW 1-27)
// ---------------------------------------------------------------------------

console.log('⚽  Upserting aggregate fixtures (GW 1-27) …');

const BATCH = 50;

for (let i = 0; i < aggregateFixtures.length; i += BATCH) {
  const batch = aggregateFixtures.slice(i, i + BATCH);
  try {
    const { error } = await supabase.from('fixtures').upsert(batch, { onConflict: 'api_fixture_id' });
    if (error) throw error;
    stats.aggFixturesUpserted += batch.length;
  } catch (err) {
    const msg = `Agg fixtures batch ${i}: ${err.message || err}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

console.log(`   → ${stats.aggFixturesUpserted} aggregate fixtures\n`);

// ---------------------------------------------------------------------------
// 6c. Fetch aggregate fixture UUIDs back
// ---------------------------------------------------------------------------

console.log('🔗  Fetching aggregate fixture IDs …');

const aggIds = aggregateFixtures.map((f) => f.api_fixture_id);
const { data: aggFxData, error: aggFetchErr } = await supabase
  .from('fixtures')
  .select('id, api_fixture_id')
  .in('api_fixture_id', aggIds);

if (aggFetchErr) {
  console.error('❌  Failed to fetch aggregate fixtures:', aggFetchErr);
  process.exit(1);
}

const aggIdMap = new Map(); // api_fixture_id → uuid
for (const f of aggFxData) aggIdMap.set(f.api_fixture_id, f.id);
console.log(`   → ${aggIdMap.size} aggregate fixtures in lookup\n`);

// ---------------------------------------------------------------------------
// 6d. Upsert score records (WhatsApp point totals)
// ---------------------------------------------------------------------------

console.log('🏆  Upserting score records (WhatsApp point totals) …');

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
      console.log(`   … ${Math.min(i + BATCH, srRows.length)} / ${srRows.length}`);
    }
  } catch (err) {
    const msg = `Score records batch ${i}: ${err.message || err}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

console.log(`   → ${stats.scoreRecordsUpserted} score records\n`);

// ---------------------------------------------------------------------------
// 6e. Upsert GW 28 predictions
// ---------------------------------------------------------------------------

console.log('📝  Upserting GW 28 predictions …');

for (let i = 0; i < dedupedGw28.length; i += BATCH) {
  const batch = dedupedGw28.slice(i, i + BATCH);
  try {
    const { error } = await supabase
      .from('predictions')
      .upsert(batch, { onConflict: 'user_id,fixture_id' });
    if (error) throw error;
    stats.gw28PredictionsUpserted += batch.length;
  } catch (err) {
    const msg = `GW28 predictions batch ${i}: ${err.message || err}`;
    console.error(`   ✗ ${msg}`);
    stats.errors.push(msg);
  }
}

console.log(`   → ${stats.gw28PredictionsUpserted} GW28 predictions\n`);

// ---------------------------------------------------------------------------
// 6f. Validate leaderboard
// ---------------------------------------------------------------------------

console.log('📊  Validating leaderboard …\n');

try {
  const { data: lb, error: lbErr } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: season.id,
  });
  if (lbErr) throw lbErr;

  const latestGw = Math.max(...gwPointsMap.keys());
  const latestOverall = parsedData.gameweeks.find((g) => g.gameweek === latestGw)?.overall_table || [];

  console.log(`   DB Leaderboard               vs  parsed.json (GW ${latestGw})`);
  console.log('   ' + '-'.repeat(65));

  for (const entry of lb || []) {
    const player = PLAYERS.find((p) => PLAYER_UUIDS[p.code] === entry.user_id);
    if (!player) continue; // skip your admin profile
    const code = player.code;
    const parsedEntry = latestOverall.find((o) => o.label === code);
    const dbPts = entry.total_points;
    const parsedPts = parsedEntry?.points ?? '?';
    const ok = dbPts == parsedPts;
    const delta = !ok ? `  Δ=${dbPts - parsedPts}` : '';

    console.log(
      `   ${ok ? '✓' : '✗'} #${String(entry.rank).padStart(2)}  ${entry.display_name.padEnd(12)} ${String(dbPts).padStart(4)} pts   (parsed: ${String(parsedPts).padStart(4)}${delta})`,
    );
  }
} catch (err) {
  console.log(`   ⚠️  Could not validate: ${err.message}`);
}

// ===========================================================================
// 7. SUMMARY
// ===========================================================================

console.log('\n' + '═'.repeat(60));
console.log('  📋  SEED SUMMARY');
console.log('═'.repeat(60));
console.log(`  Auth users created:       ${stats.usersCreated}`);
console.log(`  Auth users existed:       ${stats.usersExisted}`);
console.log(`  Profiles upserted:        ${stats.profilesUpserted}`);
console.log(`  Aggregate fixtures:       ${stats.aggFixturesUpserted} (GW 1-27)`);
console.log(`  Score records:            ${stats.scoreRecordsUpserted} (WhatsApp pts)`);
console.log(`  GW28 predictions:         ${stats.gw28PredictionsUpserted}`);

if (stats.errors.length > 0) {
  console.log(`\n  ⚠️  Errors (${stats.errors.length}):`);
  for (const e of stats.errors) console.log(`     - ${e}`);
} else {
  console.log(`\n  ✅  No errors!`);
}

console.log('═'.repeat(60));
console.log();
