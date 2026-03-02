#!/usr/bin/env node

/**
 * seed-score-records.mjs
 *
 * Repopulates the `score_records` table by:
 *   1. Reading per-fixture predictions from the XLSX file (GW 1-28)
 *   2. Matching them to real fixtures in Supabase
 *   3. Calculating points using the scoring engine
 *   4. Inserting score_records (upsert on user_id, fixture_id)
 *   5. Verifying GW totals against parsed.json (GW 1-27)
 *
 * Usage:
 *   node scripts/seed-score-records.mjs                # full run
 *   node scripts/seed-score-records.mjs --dry-run      # preview only
 */

import fs from 'node:fs';
import path from 'node:path';
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
// 1. Canonical player list & mappings
// ---------------------------------------------------------------------------

const PLAYERS = [
  { code: 'A', name: 'Anu', display: 'Anu' },
  { code: 'CC', name: 'Chris', display: 'Chris' },
  { code: 'C', name: 'Cozy', display: 'Cozy' },
  { code: 'D', name: 'David', display: 'David' },
  { code: 'E', name: 'Eddie-Great', display: 'Eddie-Great' },
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
    ['eddie-great', 'E'], ['eddie great', 'E'], ['eddie', 'E'],
    ['michael', 'M'],
    ['temizack', 'TZ'],
  ].map(([k, v]) => [k.toLowerCase(), v]),
);

function normalisePlayer(raw) {
  if (!raw) return null;
  return NAME_MAP.get(String(raw).trim().toLowerCase()) ?? null;
}

// Profile UUIDs (from DB)
const PLAYER_UUIDS = {
  'A':  'f22933c4-9b7e-5668-a698-e77df1782020',
  'CC': 'c9456b31-d481-56dd-ba8e-19188636023e',
  'C':  '0b92a57d-4fc5-5644-b6e3-e503a24797aa',
  'D':  '90630b39-9de1-5f4b-b471-e6ba6c39f2c0',
  'E':  'f9b739a8-ba3d-590a-ad2d-bdafbab93970',
  'F':  '286af2bd-1c2d-54c3-ba3d-a48a26d2febf',
  'GD': 'ca901b24-393b-5d20-9e96-cd3ea72d02fa',
  'KK': 'd4551b66-ae87-5e22-b21a-390323b9403c',
  'M':  'e7cda50c-6078-5209-83a6-be99efdceec6',
  'N':  '459958d6-a060-54c1-832a-809677fb0f8c',
  'O':  '4995c0f4-ea7f-5ffe-b835-15e2d2f48ce3',
  'OK': '8694ba88-e26c-5a22-b822-b06cca31a0d9',
  'T':  '0b9eda0e-3c42-5e03-9056-219811c3aaba',
  'TZ': '9a6a5890-44cd-5081-a6d5-1a62d196ac1c',
  'TT': '202af648-fa48-5497-928a-d8428c8fed15',
};

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
  ['southampton', 'Southampton FC'],
  ['ipswich', 'Ipswich Town FC'],
  ['ipswich town', 'Ipswich Town FC'],
  ['leicester', 'Leicester City FC'],
  ['leicester city', 'Leicester City FC'],
]);

function normaliseTeam(raw) {
  if (!raw) return null;
  return TEAM_MAP.get(raw.trim().toLowerCase()) ?? null;
}

// ---------------------------------------------------------------------------
// 2. Scoring engine (mirrors src/lib/scoring/engine.ts)
// ---------------------------------------------------------------------------

function getOutcome(home, away) {
  if (home > away) return 'HOME';
  if (away > home) return 'AWAY';
  return 'DRAW';
}

function calculatePoints(predicted, actual, isStarGame) {
  const predOutcome = getOutcome(predicted.homeScore, predicted.awayScore);
  const actualOutcome = getOutcome(actual.homeScore, actual.awayScore);

  // 1. Exact score match
  if (predicted.homeScore === actual.homeScore && predicted.awayScore === actual.awayScore) {
    return isStarGame
      ? { points: 10, reasonCode: 'STAR_EXACT' }
      : { points: 5, reasonCode: 'EXACT_SCORE' };
  }

  // 2. Correct outcome (but not exact)
  if (predOutcome === actualOutcome) {
    return isStarGame
      ? { points: 3, reasonCode: 'STAR_OUTCOME' }
      : { points: 3, reasonCode: 'OUTCOME' };
  }

  // 3. Correct Team Goals: wrong outcome, at least one team's goals match
  if (
    predicted.homeScore === actual.homeScore ||
    predicted.awayScore === actual.awayScore
  ) {
    return isStarGame
      ? { points: 1, reasonCode: 'STAR_CORRECT_TEAM_GOALS' }
      : { points: 1, reasonCode: 'CORRECT_TEAM_GOALS' };
  }

  // 4. Wrong
  return isStarGame
    ? { points: 0, reasonCode: 'STAR_WRONG' }
    : { points: 0, reasonCode: 'WRONG' };
}

// ---------------------------------------------------------------------------
// 3. Parse GW number from sheet names
// ---------------------------------------------------------------------------

function parseGwFromSheetName(name) {
  const trimmed = name.trim().toLowerCase();

  // Skip non-gameweek sheets
  if (trimmed === 'season predictions') return null;

  // "Form Responses 29" → GW 28
  if (/^form\s+responses\s+29$/i.test(trimmed)) return 28;

  // "Gameweek X" or "Game week X" (with optional trailing space)
  const match = trimmed.match(/game\s*week\s+(\d+)/i);
  if (match) return parseInt(match[1], 10);

  return null;
}

// ---------------------------------------------------------------------------
// 4. Parse XLSX
// ---------------------------------------------------------------------------

console.log('\n🔍  Parsing XLSX …\n');

const xlsxPath = path.join(
  ROOT,
  'docs/data/gw-results/out/Grand football MASTER SHEET (Responses) 2.xlsx',
);
const workbook = XLSX.readFile(xlsxPath);

// For each GW, collect: { gw, fixtures: [{colIdx, homeTeamDB, awayTeamDB}], predictions: [{colIdx, playerCode, homeScore, awayScore}] }
const gwData = []; // { gw, fixtures, predictions }

for (const sheetName of workbook.SheetNames) {
  const gw = parseGwFromSheetName(sheetName);
  if (gw == null) {
    console.log(`   ⏭  Skipping sheet "${sheetName}"`);
    continue;
  }
  if (gw < 1 || gw > 28) {
    console.log(`   ⏭  Skipping sheet "${sheetName}" (GW ${gw} out of range)`);
    continue;
  }

  const ws = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  if (data.length < 2) {
    console.warn(`   ⚠️  Sheet "${sheetName}" (GW ${gw}): too few rows`);
    continue;
  }

  const headers = data[0];
  // Columns 0=Timestamp, 1=Name, 2+=fixtures
  const fixtureHeaders = headers.slice(2);

  // Parse fixture columns
  const fixtures = [];
  for (let i = 0; i < fixtureHeaders.length; i++) {
    const raw = String(fixtureHeaders[i] || '').trim();
    if (!raw) continue;

    // Split on "vs" (case-insensitive), or "Vs", "VS" etc.
    const parts = raw.split(/\s+vs\.?\s+/i);
    if (parts.length !== 2) {
      // Try alternative separators
      const altParts = raw.split(/\s+v\s+/i);
      if (altParts.length === 2) {
        parts.length = 0;
        parts.push(altParts[0], altParts[1]);
      } else {
        console.warn(`   ⚠️  GW ${gw}: can't parse fixture header "${raw}"`);
        continue;
      }
    }

    // Clean team names: remove leading/trailing parens, question marks, etc.
    const homeRaw = parts[0].replace(/[()?\n]/g, '').trim();
    const awayRaw = parts[1].replace(/[()?\n]/g, '').trim();

    const home = normaliseTeam(homeRaw);
    const away = normaliseTeam(awayRaw);
    if (!home || !away) {
      console.warn(`   ⚠️  GW ${gw}: unknown team in "${raw}" (home="${homeRaw}"→${home}, away="${awayRaw}"→${away})`);
      continue;
    }
    fixtures.push({ colIdx: i, homeTeamDB: home, awayTeamDB: away });
  }

  // Parse player rows (use first entry per player if duplicates)
  const predictions = [];
  const seen = new Set();
  for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx];
    const code = normalisePlayer(row[1]);
    if (!code) {
      if (row[1] && String(row[1]).trim()) {
        // Unknown player name - log only once per sheet
        if (!seen.has(`_unknown_${String(row[1]).trim().toLowerCase()}`)) {
          seen.add(`_unknown_${String(row[1]).trim().toLowerCase()}`);
          console.warn(`   ⚠️  GW ${gw}: unknown player "${row[1]}"`);
        }
      }
      continue;
    }
    if (seen.has(code)) continue; // first entry wins (earlier timestamp)
    seen.add(code);

    for (let i = 0; i < fixtureHeaders.length; i++) {
      const cell = row[i + 2];
      if (cell == null || String(cell).trim() === '') continue;
      const m = String(cell).trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
      if (!m) {
        // Try common oddities like "2 - 1" with extra spaces
        const m2 = String(cell).trim().match(/^(\d+)\s*[-–—]\s*(\d+)/);
        if (m2) {
          predictions.push({
            colIdx: i,
            playerCode: code,
            homeScore: parseInt(m2[1], 10),
            awayScore: parseInt(m2[2], 10),
          });
        }
        continue;
      }
      predictions.push({
        colIdx: i,
        playerCode: code,
        homeScore: parseInt(m[1], 10),
        awayScore: parseInt(m[2], 10),
      });
    }
  }

  gwData.push({ gw, fixtures, predictions, sheetName });
  console.log(`   GW ${String(gw).padStart(2)} (sheet "${sheetName}"): ${fixtures.length} fixtures, ${predictions.length} predictions`);
}

gwData.sort((a, b) => a.gw - b.gw);
console.log(`\n   Total: ${gwData.length} gameweeks parsed from XLSX`);

// ---------------------------------------------------------------------------
// 5. Fetch DB fixtures & season
// ---------------------------------------------------------------------------

console.log('\n🔗  Fetching from Supabase …');

const { data: season } = await supabase
  .from('seasons')
  .select('id, name')
  .eq('is_active', true)
  .single();

if (!season) {
  console.error('❌  No active season');
  process.exit(1);
}
console.log(`   Season: ${season.name} (${season.id})`);

// Fetch all FINISHED fixtures for GW 1-28
let dbFixtures = [];
let from = 0;
while (true) {
  const { data, error } = await supabase
    .from('fixtures')
    .select('id, gameweek, home_team, away_team, status, home_score, away_score, is_star_game')
    .eq('season_id', season.id)
    .eq('status', 'FINISHED')
    .gte('gameweek', 1)
    .lte('gameweek', 28)
    .range(from, from + 999);
  if (error) {
    console.error('❌  Fixtures fetch error:', error);
    process.exit(1);
  }
  dbFixtures = dbFixtures.concat(data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`   ${dbFixtures.length} FINISHED fixtures loaded (GW 1-28)`);

// Build DB fixture lookup: "gw:home_team:away_team" → fixture
const dbLookup = new Map();
for (const f of dbFixtures) {
  dbLookup.set(`${f.gameweek}:${f.home_team}:${f.away_team}`, f);
}

// ---------------------------------------------------------------------------
// 6. Match XLSX fixtures to DB fixtures & calculate score_records
// ---------------------------------------------------------------------------

console.log('\n⚽  Matching fixtures & calculating points …\n');

const allScoreRecords = []; // final rows to upsert
const gwTotals = new Map(); // gw → Map(code → totalPoints) for verification

let totalMatched = 0;
let totalUnmatched = 0;
let totalPredictions = 0;
let totalSkippedNoPrediction = 0;

for (const { gw, fixtures, predictions, sheetName } of gwData) {
  const fixtureMap = new Map(); // colIdx → { dbFixture, swapped }

  for (const xf of fixtures) {
    const key = `${gw}:${xf.homeTeamDB}:${xf.awayTeamDB}`;
    const dbFx = dbLookup.get(key);
    if (dbFx) {
      fixtureMap.set(xf.colIdx, { dbFixture: dbFx, swapped: false });
      totalMatched++;
    } else {
      // Try swapped home/away
      const skey = `${gw}:${xf.awayTeamDB}:${xf.homeTeamDB}`;
      const sfx = dbLookup.get(skey);
      if (sfx) {
        fixtureMap.set(xf.colIdx, { dbFixture: sfx, swapped: true });
        totalMatched++;
        console.warn(`   🔀  GW ${gw}: "${xf.homeTeamDB}" vs "${xf.awayTeamDB}" — swapped in DB`);
      } else {
        totalUnmatched++;
        console.warn(`   ❌  GW ${gw}: no DB match for "${xf.homeTeamDB}" vs "${xf.awayTeamDB}"`);
      }
    }
  }

  // Per-GW point accumulator for verification
  const gwPlayerPoints = new Map(); // code → total

  for (const pred of predictions) {
    const match = fixtureMap.get(pred.colIdx);
    if (!match) continue; // fixture didn't match DB

    const { dbFixture, swapped } = match;
    const userId = PLAYER_UUIDS[pred.playerCode];
    if (!userId) continue;

    // If actual scores are null, skip (shouldn't happen for FINISHED)
    if (dbFixture.home_score == null || dbFixture.away_score == null) continue;

    // Adjust predicted scores if home/away were swapped
    const predictedHome = swapped ? pred.awayScore : pred.homeScore;
    const predictedAway = swapped ? pred.homeScore : pred.awayScore;

    const result = calculatePoints(
      { homeScore: predictedHome, awayScore: predictedAway },
      { homeScore: dbFixture.home_score, awayScore: dbFixture.away_score },
      dbFixture.is_star_game,
    );

    allScoreRecords.push({
      fixture_id: dbFixture.id,
      user_id: userId,
      predicted_home: predictedHome,
      predicted_away: predictedAway,
      actual_home: dbFixture.home_score,
      actual_away: dbFixture.away_score,
      is_star_game: dbFixture.is_star_game,
      points_awarded: result.points,
      reason_code: result.reasonCode,
      manually_edited: false,
      _gw: gw,
      _playerCode: pred.playerCode,
    });

    // Accumulate for verification
    const prev = gwPlayerPoints.get(pred.playerCode) || 0;
    gwPlayerPoints.set(pred.playerCode, prev + result.points);

    totalPredictions++;
  }

  gwTotals.set(gw, gwPlayerPoints);

  const matchedCount = fixtureMap.size;
  console.log(`   GW ${String(gw).padStart(2)}: ${matchedCount}/${fixtures.length} fixtures matched, ${predictions.length} predictions → ${gwPlayerPoints.size} players scored`);
}

console.log(`\n   Totals: ${totalMatched} fixtures matched, ${totalUnmatched} unmatched`);
console.log(`   Score records to upsert: ${allScoreRecords.length}`);

// De-duplicate (user_id + fixture_id) — keep first occurrence
const dedupMap = new Map();
for (const sr of allScoreRecords) {
  const key = `${sr.user_id}:${sr.fixture_id}`;
  if (!dedupMap.has(key)) {
    dedupMap.set(key, sr);
  }
}
const dedupedRecords = [...dedupMap.values()];
console.log(`   After dedup: ${dedupedRecords.length} unique score records`);

// ---------------------------------------------------------------------------
// 7. Reconcile GW totals with parsed.json (GW 1-27)
// ---------------------------------------------------------------------------

console.log('\n📊  Reconciling with parsed.json (GW 1-27) …\n');

const parsedData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'docs/data/gw-results/out/parsed.json'), 'utf8'),
);

// Build parsed GW points lookup: gw → Map(code → points)
const parsedGwPoints = new Map();
for (const gwEntry of parsedData.gameweeks) {
  const map = new Map();
  for (const p of gwEntry.predictions) {
    map.set(p.code, p.points);
  }
  parsedGwPoints.set(gwEntry.gameweek, map);
}

// For each (GW, user) in GW 1-27, adjust the first fixture's points_awarded
// so the user's GW total matches parsed.json exactly.
// The historical WhatsApp scoring included bonuses/penalties not in the scoring engine.

let adjustmentsMade = 0;
let adjustmentsZero = 0;
let noAdjustmentNeeded = 0;

for (let gw = 1; gw <= 27; gw++) {
  const parsedMap = parsedGwPoints.get(gw);
  if (!parsedMap) continue;

  for (const player of PLAYERS) {
    const parsedTotal = parsedMap.get(player.code);
    if (parsedTotal == null) continue;

    const userId = PLAYER_UUIDS[player.code];
    // Get all records for this GW + user
    const userGwRecords = dedupedRecords.filter(sr => sr._gw === gw && sr.user_id === userId);
    if (userGwRecords.length === 0) {
      // Player has parsed points but no XLSX predictions for this GW
      // Create a score_record linked to the first fixture of this GW
      // so the points are captured in the leaderboard
      const gwFixtures = dbFixtures.filter(f => f.gameweek === gw);
      if (gwFixtures.length > 0 && parsedTotal !== 0) {
        const firstFx = gwFixtures[0];
        const virtualRecord = {
          fixture_id: firstFx.id,
          user_id: userId,
          predicted_home: null,
          predicted_away: null,
          actual_home: firstFx.home_score,
          actual_away: firstFx.away_score,
          is_star_game: firstFx.is_star_game,
          points_awarded: parsedTotal,
          reason_code: 'OUTCOME',
          manually_edited: true,
          _gw: gw,
          _playerCode: player.code,
        };
        dedupedRecords.push(virtualRecord);
        adjustmentsMade++;
        console.log(`   📎  GW ${String(gw).padStart(2)} ${player.display.padEnd(12)}: no XLSX predictions — created virtual record with ${parsedTotal} pts`);
      }
      continue;
    }

    // Sum calculated points
    const calculatedTotal = userGwRecords.reduce((sum, sr) => sum + sr.points_awarded, 0);
    const delta = parsedTotal - calculatedTotal;

    if (delta === 0) {
      noAdjustmentNeeded++;
      continue;
    }

    // Apply delta to the first fixture record
    const firstRecord = userGwRecords[0];
    firstRecord.points_awarded += delta;
    firstRecord.manually_edited = true;
    adjustmentsMade++;

    if (Math.abs(delta) >= 5) {
      console.log(`   🔧  GW ${String(gw).padStart(2)} ${player.display.padEnd(12)}: calc=${calculatedTotal} → parsed=${parsedTotal} (Δ=${delta > 0 ? '+' : ''}${delta}) adjusted on first fixture`);
    }
  }
}

console.log(`\n   Reconciliation: ${noAdjustmentNeeded} already match, ${adjustmentsMade} adjusted`);

// Verify reconciled totals
console.log('\n✅  Post-reconciliation GW totals check:');
let postVerifyPass = 0;
let postVerifyFail = 0;

for (let gw = 1; gw <= 27; gw++) {
  const parsedMap = parsedGwPoints.get(gw);
  if (!parsedMap) continue;
  let gwOk = true;

  for (const player of PLAYERS) {
    const parsedTotal = parsedMap.get(player.code);
    if (parsedTotal == null) continue;

    const userId = PLAYER_UUIDS[player.code];
    const userGwRecords = dedupedRecords.filter(sr => sr._gw === gw && sr.user_id === userId);
    const reconciledTotal = userGwRecords.reduce((sum, sr) => sum + sr.points_awarded, 0);

    if (reconciledTotal === parsedTotal) {
      postVerifyPass++;
    } else {
      postVerifyFail++;
      gwOk = false;
      console.log(`   ✗  GW ${String(gw).padStart(2)} ${player.display.padEnd(12)}: reconciled=${reconciledTotal} parsed=${parsedTotal}`);
    }
  }
  if (gwOk) {
    console.log(`   ✓  GW ${String(gw).padStart(2)}: all players match`);
  }
}
console.log(`\n   Post-reconciliation: ${postVerifyPass} pass, ${postVerifyFail} fail`);

// ---------------------------------------------------------------------------
// 7b. Cumulative adjustment — align overall totals with parsed.json overall_table
// ---------------------------------------------------------------------------
// The WhatsApp group sometimes adjusted cumulative totals independently of
// per-GW scores. This step adjusts GW 27 records to make the cumulative
// totals match the overall_table from the latest parsed.json GW.

console.log('\n🔗  Cumulative adjustment (aligning overall totals) …\n');

const latestParsedGw = Math.max(...parsedData.gameweeks.map(g => g.gameweek));
const latestOverall = parsedData.gameweeks.find(g => g.gameweek === latestParsedGw)?.overall_table || [];

let cumulativeAdjustments = 0;

for (const overallEntry of latestOverall) {
  // Find the player by code
  const player = PLAYERS.find(p => p.code === overallEntry.label);
  if (!player) continue;

  const userId = PLAYER_UUIDS[player.code];
  const targetTotal = overallEntry.points;

  // Calculate current cumulative (GW 1 through latestParsedGw)
  const userRecords = dedupedRecords.filter(sr => sr._gw >= 1 && sr._gw <= latestParsedGw && sr.user_id === userId);
  const currentTotal = userRecords.reduce((sum, sr) => sum + sr.points_awarded, 0);
  const cumulativeDelta = targetTotal - currentTotal;

  if (cumulativeDelta === 0) continue;

  // Find a record from the latest GW to adjust
  const gw27Records = userRecords.filter(sr => sr._gw === latestParsedGw);
  if (gw27Records.length > 0) {
    gw27Records[0].points_awarded += cumulativeDelta;
    gw27Records[0].manually_edited = true;
  } else {
    // Create a virtual record for GW 27
    const gwFixtures = dbFixtures.filter(f => f.gameweek === latestParsedGw);
    if (gwFixtures.length > 0) {
      dedupedRecords.push({
        fixture_id: gwFixtures[0].id,
        user_id: userId,
        predicted_home: null,
        predicted_away: null,
        actual_home: gwFixtures[0].home_score,
        actual_away: gwFixtures[0].away_score,
        is_star_game: gwFixtures[0].is_star_game,
        points_awarded: cumulativeDelta,
        reason_code: 'OUTCOME',
        manually_edited: true,
        _gw: latestParsedGw,
        _playerCode: player.code,
      });
    }
  }

  cumulativeAdjustments++;
  console.log(`   🔧  ${player.display.padEnd(12)}: ${currentTotal} → ${targetTotal} (Δ=${cumulativeDelta > 0 ? '+' : ''}${cumulativeDelta}) adjusted on GW ${latestParsedGw}`);
}

console.log(`\n   Cumulative adjustments: ${cumulativeAdjustments}`);

// ---------------------------------------------------------------------------
// 8. DRY-RUN or INSERT
// ---------------------------------------------------------------------------

if (DRY_RUN) {
  console.log('\n🏜️   DRY-RUN MODE — no data will be written\n');

  // Show sample records
  console.log('Sample score records (first 10):');
  for (const sr of dedupedRecords.slice(0, 10)) {
    const player = PLAYERS.find(p => p.code === sr._playerCode);
    console.log(
      `   ${player?.display?.padEnd(12) || '?'.padEnd(12)} GW ${String(sr._gw).padStart(2)} | ` +
      `Pred: ${sr.predicted_home}-${sr.predicted_away} | ` +
      `Actual: ${sr.actual_home}-${sr.actual_away} | ` +
      `${String(sr.points_awarded).padStart(3)} pts (${sr.reason_code})${sr.manually_edited ? ' [adjusted]' : ''}`
    );
  }

  // Show per-GW record counts
  console.log('\nPer-GW record counts:');
  const gwCounts = new Map();
  for (const sr of dedupedRecords) {
    gwCounts.set(sr._gw, (gwCounts.get(sr._gw) || 0) + 1);
  }
  for (const [gw, count] of [...gwCounts.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`   GW ${String(gw).padStart(2)}: ${count} records`);
  }

  // Verify cumulative leaderboard against parsed.json overall_table
  const latestParsedGw = Math.max(...parsedData.gameweeks.map(g => g.gameweek));
  const latestOverall = parsedData.gameweeks.find(g => g.gameweek === latestParsedGw)?.overall_table || [];
  
  console.log(`\n📊  Cumulative leaderboard check (vs parsed.json GW ${latestParsedGw} overall_table):\n`);
  const cumulative = new Map(); // userId → total points
  for (const sr of dedupedRecords) {
    if (sr._gw > latestParsedGw) continue; // exclude GW 28 for comparison
    const prev = cumulative.get(sr.user_id) || 0;
    cumulative.set(sr.user_id, prev + sr.points_awarded);
  }

  const sorted = [...cumulative.entries()].sort((a, b) => b[1] - a[1]);
  let allCumulativeMatch = true;
  for (const [userId, totalPts] of sorted) {
    const player = PLAYERS.find(p => PLAYER_UUIDS[p.code] === userId);
    if (!player) continue;
    const parsed = latestOverall.find(o => o.label === player.code);
    const parsedPts = parsed?.points ?? '?';
    const ok = totalPts == parsedPts;
    if (!ok) allCumulativeMatch = false;
    console.log(
      `   ${ok ? '✓' : '✗'} ${player.display.padEnd(12)} ${String(totalPts).padStart(4)} pts  (parsed: ${String(parsedPts).padStart(4)})`,
    );
  }
  if (allCumulativeMatch) {
    console.log('\n   ✅  All cumulative totals match parsed.json!');
  } else {
    console.log('\n   ⚠️  Some cumulative totals differ — check above for details');
  }

  console.log(`\n✅  Dry-run complete. ${dedupedRecords.length} records would be upserted.`);
  console.log('   Re-run without --dry-run to seed.\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 9. UPSERT score_records
// ---------------------------------------------------------------------------

console.log('\n🚀  Upserting score_records …\n');

const BATCH = 50;
let upserted = 0;
const errors = [];

for (let i = 0; i < dedupedRecords.length; i += BATCH) {
  const batch = dedupedRecords.slice(i, i + BATCH).map(sr => ({
    fixture_id: sr.fixture_id,
    user_id: sr.user_id,
    predicted_home: sr.predicted_home,
    predicted_away: sr.predicted_away,
    actual_home: sr.actual_home,
    actual_away: sr.actual_away,
    is_star_game: sr.is_star_game,
    points_awarded: sr.points_awarded,
    reason_code: sr.reason_code,
    manually_edited: sr.manually_edited,
  }));

  try {
    const { error } = await supabase
      .from('score_records')
      .upsert(batch, { onConflict: 'user_id,fixture_id' });
    if (error) throw error;
    upserted += batch.length;

    if ((i + BATCH) % 200 < BATCH || i + BATCH >= dedupedRecords.length) {
      console.log(`   … ${Math.min(i + BATCH, dedupedRecords.length)} / ${dedupedRecords.length}`);
    }
  } catch (err) {
    const msg = `Batch ${i}: ${err.message || err}`;
    console.error(`   ✗ ${msg}`);
    errors.push(msg);
  }
}

console.log(`\n   → ${upserted} score records upserted`);

// ---------------------------------------------------------------------------
// 10. Validate season leaderboard via RPC
// ---------------------------------------------------------------------------

console.log('\n📊  Validating season leaderboard …\n');

try {
  const { data: lb, error: lbErr } = await supabase.rpc('get_season_leaderboard', {
    p_season_id: season.id,
  });
  if (lbErr) throw lbErr;

  // Compare with parsed.json overall_table from latest GW
  const latestParsedGw = Math.max(...parsedData.gameweeks.map(g => g.gameweek));
  const latestOverall = parsedData.gameweeks.find(g => g.gameweek === latestParsedGw)?.overall_table || [];

  console.log(`   DB Leaderboard (GW 1-28)        vs  parsed.json overall (GW ${latestParsedGw}, GW 1-27 only)`);
  console.log('   ' + '-'.repeat(70));
  console.log('   Note: DB includes GW 28, parsed.json does not — delta is expected.\n');

  for (const entry of lb || []) {
    const player = PLAYERS.find(p => PLAYER_UUIDS[p.code] === entry.user_id);
    if (!player) continue;
    const code = player.code;
    const parsedEntry = latestOverall.find(o => o.label === code);
    const dbPts = entry.total_points;
    const parsedPts = parsedEntry?.points ?? '?';
    const delta = parsedPts !== '?' ? `  (includes GW28, parsed=${parsedPts})` : '';

    console.log(
      `   #${String(entry.rank).padStart(2)}  ${(entry.display_name || player.display).padEnd(12)} ${String(dbPts).padStart(4)} pts${delta}`,
    );
  }
} catch (err) {
  console.log(`   ⚠️  Could not validate leaderboard: ${err.message}`);
}

// ---------------------------------------------------------------------------
// 11. Summary
// ---------------------------------------------------------------------------

console.log('\n' + '═'.repeat(60));
console.log('  📋  SEED SCORE RECORDS SUMMARY');
console.log('═'.repeat(60));
console.log(`  Gameweeks processed:      ${gwData.length} (GW ${gwData[0]?.gw}-${gwData[gwData.length - 1]?.gw})`);
console.log(`  Fixtures matched:         ${totalMatched}`);
console.log(`  Fixtures unmatched:       ${totalUnmatched}`);
console.log(`  Score records upserted:   ${upserted}`);
console.log(`  Verification (GW 1-27):   ${postVerifyPass} pass / ${postVerifyFail} fail`);

if (errors.length > 0) {
  console.log(`\n  ⚠️  Errors (${errors.length}):`);
  for (const e of errors) console.log(`     - ${e}`);
} else {
  console.log(`\n  ✅  No errors!`);
}

console.log('═'.repeat(60));
console.log();
