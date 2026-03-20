#!/usr/bin/env node

/**
 * postpone-mancity-gw31.mjs
 *
 * Marks the Man City fixture in GW31 as POSTPONED and sets
 * manually_overridden so it is excluded from predictions and scoring.
 *
 * Usage:
 *   node scripts/postpone-mancity-gw31.mjs             # live run
 *   node scripts/postpone-mancity-gw31.mjs --dry-run   # preview only
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

const DRY_RUN = process.argv.includes('--dry-run');

const { createClient } = await import('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const GAMEWEEK = 31;

async function main() {
  console.log(`\n⏸️  Man City GW${GAMEWEEK} Postponement ${DRY_RUN ? '(DRY RUN)' : ''}\n`);
  console.log('━'.repeat(60));

  // Fetch all GW31 fixtures
  const { data: gw31, error: gw31Error } = await supabase
    .from('fixtures')
    .select('id, home_team, away_team, gameweek, status, home_score, away_score, manually_overridden')
    .eq('gameweek', GAMEWEEK);

  if (gw31Error) {
    console.error('❌  Failed to fetch GW31 fixtures:', gw31Error.message);
    process.exit(1);
  }

  console.log(`\n📋 GW${GAMEWEEK} fixtures (${gw31.length} total):`);
  for (const f of gw31) {
    const score = f.home_score !== null ? `${f.home_score}-${f.away_score}` : 'vs';
    console.log(`  ${f.home_team} ${score} ${f.away_team} [${f.status}]`);
  }

  // Find the Man City fixture
  const fixture = gw31?.find(f =>
    f.home_team.toLowerCase().includes('manchester city') ||
    f.away_team.toLowerCase().includes('manchester city') ||
    f.home_team.toLowerCase().includes('man city') ||
    f.away_team.toLowerCase().includes('man city')
  );

  if (!fixture) {
    console.log(`\n❌ No Man City fixture found in GW${GAMEWEEK}. Nothing to do.`);
    return;
  }

  console.log(`\n🔍 Found: ${fixture.home_team} vs ${fixture.away_team}`);
  console.log(`   Current status: ${fixture.status}`);
  console.log(`   Manually overridden: ${fixture.manually_overridden}`);

  if (fixture.status === 'POSTPONED') {
    console.log('\n✅ Already marked as POSTPONED. No changes needed.');
    return;
  }

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN — would update fixture ${fixture.id}:`);
    console.log(`   status: ${fixture.status} → POSTPONED`);
    console.log('   manually_overridden: → true');
    console.log('\nRun without --dry-run to apply changes.');
    return;
  }

  // Apply the update
  const { error: updateError } = await supabase
    .from('fixtures')
    .update({
      status: 'POSTPONED',
      manually_overridden: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', fixture.id);

  if (updateError) {
    console.error('\n❌ Update failed:', updateError.message);
    process.exit(1);
  }

  console.log('\n✅ Fixture marked as POSTPONED and manually_overridden = true');

  // Verify
  const { data: updated } = await supabase
    .from('fixtures')
    .select('id, home_team, away_team, gameweek, status, manually_overridden')
    .eq('id', fixture.id)
    .single();

  if (updated) {
    console.log('\n📋 Updated fixture:');
    console.log(`   ${updated.home_team} vs ${updated.away_team}`);
    console.log(`   GW: ${updated.gameweek}`);
    console.log(`   Status: ${updated.status}`);
    console.log(`   Manually overridden: ${updated.manually_overridden}`);
  }

  console.log('\n━'.repeat(60));
  console.log('Done!\n');
}

main().catch((err) => {
  console.error('❌  Script failed:', err);
  process.exit(1);
});
