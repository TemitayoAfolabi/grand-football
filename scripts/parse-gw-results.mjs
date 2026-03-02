/**
 * Parse WhatsApp-style "GW X PREDICTIONS RESULT" blocks into structured JSON.
 *
 * Usage:
 *   node scripts/parse-gw-results.mjs --in docs/data/gw-results-raw.txt --out docs/data/gw-results
 *
 * Output:
 *   <out>/parsed.json     - structured gameweek data
 *   <out>/summary.md     - human-readable summary + issues
 */

import fs from 'node:fs/promises';
import path from 'node:path';

async function readJsonIfExists(filePath) {
  if (!filePath) return null;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
}

function toInt(value) {
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function cleanLine(line) {
  return String(line)
    .replace(/\r/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

function stripStars(s) {
  return s.replace(/^\*+|\*+$/g, '').trim();
}

function parseArithmetic(exprRaw) {
  const expr = cleanLine(exprRaw).replace(/\s+/g, '');
  if (!expr) return { points: null, lhsValue: null, rhsValue: null, raw: exprRaw };

  // Take the last integer as the canonical points.
  const matches = expr.match(/-?\d+/g) ?? [];
  const points = matches.length ? toInt(matches[matches.length - 1]) : null;

  if (!expr.includes('=')) return { points, lhsValue: null, rhsValue: null, raw: exprRaw };

  const [lhs, rhs] = expr.split('=', 2);
  const rhsValue = toInt(rhs);

  // Evaluate lhs with a tiny + / - interpreter (no eval).
  // Supports: "22+10-5" etc.
  const tokens = lhs.match(/[+-]?\d+/g) ?? [];
  let lhsValue = 0;
  for (const t of tokens) {
    const n = toInt(t);
    if (n === null) {
      lhsValue = null;
      break;
    }
    lhsValue += n;
  }

  return { points, lhsValue, rhsValue, raw: exprRaw };
}

function parseWinnerLine(line) {
  const cleaned = stripStars(cleanLine(line));
  if (!/winner/i.test(cleaned)) return null;

  // Examples:
  // "Winner of GW 26 is Okey with 24pts"
  // "Winners of GW 23 are Temizack and Temitayo with 21pts"
  // "Winners of GW 27 are Nyema & Mr Chiggs with 23pts"
  const gwMatch = cleaned.match(/\bGW\s*(\d+)\b/i);
  const gw = gwMatch ? toInt(gwMatch[1]) : null;

  const pointsMatch = cleaned.match(/\bwith\s+(-?\d+)\s*pts?\b/i);
  const points = pointsMatch ? toInt(pointsMatch[1]) : null;

  const namesPart =
    cleaned.match(/\b(?:Winner|Winners)\s+of\s+GW\s*\d+\s+(?:is|are)\s+(.+?)\s+with\b/i)?.[1] ??
    cleaned.match(/\b(?:Winner|Winners)\b.*?\b(?:is|are)\s+(.+?)\s+with\b/i)?.[1];

  const winners = namesPart
    ? namesPart
        .replace(/\s*&\s*/g, ' and ')
        .split(/\s+and\s+|,\s*/i)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  return { gw, winners, points, raw: line };
}

function normalizeKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normalizeConfig(config) {
  const aliasesRaw = config?.aliases ?? {};
  const aliases = new Map();

  // Support both:
  // { "mr chiggs": { code, name } } and { "C": { code, name } }
  for (const [k, v] of Object.entries(aliasesRaw)) {
    if (!v) continue;
    const code = String(v.code ?? '').trim().toUpperCase() || null;
    const name = String(v.name ?? '').trim().replace(/\s+/g, ' ') || null;
    if (!code && !name) continue;
    aliases.set(normalizeKey(k), { code, name });
  }

  const excludeRaw = Array.isArray(config?.exclude) ? config.exclude : [];
  const excludeCodes = new Set();
  const excludeNames = new Set();
  for (const item of excludeRaw) {
    if (!item) continue;
    if (item.code) excludeCodes.add(String(item.code).trim().toUpperCase());
    if (item.name) excludeNames.add(normalizeKey(item.name));
  }

  return { aliases, excludeCodes, excludeNames };
}

function applyAliasToIdentity({ name, code }, normalizedConfig) {
  const cfg = normalizedConfig;
  const nameKey = normalizeKey(name);
  const codeKey = String(code ?? '').trim().toUpperCase();

  const byName = cfg.aliases.get(nameKey);
  const byCode = codeKey ? cfg.aliases.get(codeKey) : null;
  const alias = byName ?? byCode;
  if (!alias) return { name, code };

  return {
    name: alias.name ?? name,
    code: alias.code ?? code,
  };
}

function shouldExcludeIdentity({ name, code }, normalizedConfig) {
  const cfg = normalizedConfig;
  const codeKey = String(code ?? '').trim().toUpperCase();
  const nameKey = normalizeKey(name);
  const nameAsCode = String(name ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();
  return (
    (codeKey && cfg.excludeCodes.has(codeKey)) ||
    (nameAsCode && cfg.excludeCodes.has(nameAsCode)) ||
    (nameKey && cfg.excludeNames.has(nameKey))
  );
}

function parsePredictionsLine(line) {
  // "1 Anu(A)= 14"
  // "5 Fiyin (F)= 23-1=22"
  // "11 Okey  (OK)= -5"
  const cleaned = cleanLine(stripStars(line));
  // Some lines omit the space after the numeric rank, e.g. "13Temitayo (TT)= 9"
  const m = cleaned.match(/^\s*(\d+)\s*(.+?)\s*\(\s*([^)]+?)\s*\)\s*=\s*(.+)\s*$/);
  if (!m) return null;

  const rank = toInt(m[1]);
  const name = m[2].trim().replace(/\s+/g, ' ');
  const code = m[3].trim().replace(/\s+/g, '');
  const expr = m[4].trim();
  const { points, lhsValue, rhsValue, raw } = parseArithmetic(expr);

  return {
    rank,
    name,
    code,
    points,
    expression: raw,
    expression_lhs_value: lhsValue,
    expression_rhs_value: rhsValue,
  };
}

function parseOverallLine(line) {
  // "1 TZ=612PTS"
  // "3 Osita=539"
  // "10 CC= 285"
  const cleaned = stripStars(cleanLine(line));
  const m = cleaned.match(/^\s*(\d+)\s+(.+?)\s*=\s*([0-9]+)\s*(?:PTS?)?\s*$/i);
  if (!m) return null;

  return {
    rank: toInt(m[1]),
    label: m[2].trim().replace(/\s+/g, ' '),
    points: toInt(m[3]),
  };
}

function computeWinnersFromPredictions(predictions) {
  const valid = predictions.filter((p) => typeof p.points === 'number');
  if (valid.length === 0) return { winners: [], points: null };
  const max = Math.max(...valid.map((p) => p.points));
  const winners = valid.filter((p) => p.points === max).map((p) => p.name);
  return { winners, points: max };
}

function toCanonicalKey({ code, name }) {
  const c = (code ?? '').trim().toUpperCase();
  if (c) return c;
  return (name ?? '').trim().toLowerCase();
}

function parseGameweeks(text, normalizedConfig) {
  const lines = text.split('\n').map(cleanLine);
  const blocks = [];

  let current = null;
  let mode = null; // 'predictions' | 'overall'

  for (const rawLine of lines) {
    const line = cleanLine(rawLine);
    if (!line) continue;

    const header = stripStars(line);
    const gwHeader = header.match(/\bGW\s*(\d+)\s*PREDICTIONS\s*RESULT\b/i);
    if (gwHeader) {
      if (current) blocks.push(current);
      current = {
        gameweek: toInt(gwHeader[1]),
        predictions: [],
        overall_table: [],
        stated_winner: null,
        raw_lines: [],
      };
      mode = 'predictions';
      continue;
    }

    if (!current) continue;
    current.raw_lines.push(line);

    const isOverall = /OVERALL\s+TABLE/i.test(stripStars(line));
    if (isOverall) {
      mode = 'overall';
      continue;
    }

    const winnerParsed = parseWinnerLine(line);
    if (winnerParsed && (winnerParsed.gw === null || winnerParsed.gw === current.gameweek)) {
      if (winnerParsed.winners?.length) {
        const normalizedWinners = winnerParsed.winners
          .map((w) => applyAliasToIdentity({ name: w, code: null }, normalizedConfig).name ?? w)
          .filter((w) => !shouldExcludeIdentity({ name: w, code: null }, normalizedConfig));
        current.stated_winner = { ...winnerParsed, winners: normalizedWinners };
      } else {
        current.stated_winner = winnerParsed;
      }
      continue;
    }

    if (mode === 'predictions') {
      const p = parsePredictionsLine(line);
      if (p) {
        const aliased = applyAliasToIdentity(p, normalizedConfig);
        const normalized = { ...p, ...aliased };
        if (!shouldExcludeIdentity(normalized, normalizedConfig)) current.predictions.push(normalized);
      }
      continue;
    }

    if (mode === 'overall') {
      const o = parseOverallLine(line);
      if (o) {
        const aliased = applyAliasToIdentity({ name: o.label, code: null }, normalizedConfig);
        const normalized = { ...o, label: aliased.name ?? o.label };
        if (!shouldExcludeIdentity({ name: normalized.label, code: null }, normalizedConfig))
          current.overall_table.push(normalized);
      }
      continue;
    }
  }

  if (current) blocks.push(current);
  return blocks.filter((b) => typeof b.gameweek === 'number').sort((a, b) => a.gameweek - b.gameweek);
}

function buildNameToCodeMap(gameweeks) {
  const map = new Map();
  for (const gw of gameweeks) {
    for (const p of gw.predictions) {
      const nameKey = String(p.name ?? '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
      const codeKey = String(p.code ?? '').trim().toUpperCase();
      if (nameKey && codeKey && !map.has(nameKey)) map.set(nameKey, codeKey);
    }
  }
  return map;
}

function normalizeLabel(label) {
  return String(label ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\u00a0/g, ' ');
}

function resolveOverallRowToCode(rowLabel, nameToCode) {
  const label = normalizeLabel(rowLabel);
  const asCode = label.replace(/\s+/g, '').toUpperCase();
  if (asCode) return nameToCode.get(label.toLowerCase()) ?? asCode;
  return null;
}

function buildIssues(gameweeks) {
  const issues = [];

  for (const gw of gameweeks) {
    for (const p of gw.predictions) {
      if (p.expression_rhs_value !== null && p.expression_lhs_value !== null) {
        if (p.expression_lhs_value !== p.expression_rhs_value) {
          issues.push({
            kind: 'expression_mismatch',
            gameweek: gw.gameweek,
            player: { name: p.name, code: p.code },
            expression: p.expression,
            lhsValue: p.expression_lhs_value,
            rhsValue: p.expression_rhs_value,
          });
        }
      }
      if (typeof p.points !== 'number') {
        issues.push({
          kind: 'missing_points',
          gameweek: gw.gameweek,
          player: { name: p.name, code: p.code },
          expression: p.expression,
        });
      }
    }

    const computed = computeWinnersFromPredictions(gw.predictions);
    if (gw.stated_winner) {
      if (typeof gw.stated_winner.points === 'number' && typeof computed.points === 'number') {
        if (gw.stated_winner.points !== computed.points) {
          issues.push({
            kind: 'winner_points_mismatch',
            gameweek: gw.gameweek,
            stated: gw.stated_winner,
            computed,
          });
        }
      }

      const statedNames = new Set((gw.stated_winner.winners ?? []).map((w) => w.toLowerCase()));
      const computedNames = new Set((computed.winners ?? []).map((w) => w.toLowerCase()));
      for (const name of statedNames) {
        if (!computedNames.has(name)) {
          issues.push({
            kind: 'winner_name_not_in_computed',
            gameweek: gw.gameweek,
            name,
            stated: gw.stated_winner,
            computed,
          });
        }
      }
    }
  }

  // Track labels that appear in overall tables but never in predictions
  const nameToCode = buildNameToCodeMap(gameweeks);
  const allPredictionKeys = new Set();
  const allPredictionNames = new Set();
  for (const gw of gameweeks) {
    for (const p of gw.predictions) {
      allPredictionKeys.add(toCanonicalKey(p));
      allPredictionNames.add(
        String(p.name ?? '')
          .trim()
          .toLowerCase()
          .replace(/\s+/g, ' '),
      );
    }
  }
  for (const gw of gameweeks) {
    for (const row of gw.overall_table) {
      const label = normalizeLabel(row.label);
      const key = label.replace(/\s+/g, '').toUpperCase();
      const lower = label.toLowerCase();
      const appears =
        allPredictionKeys.has(key) ||
        allPredictionNames.has(lower) ||
        (nameToCode.has(lower) && allPredictionKeys.has(nameToCode.get(lower)));
      if (!appears) {
        issues.push({
          kind: 'overall_label_not_in_predictions',
          gameweek: gw.gameweek,
          label: row.label,
        });
      }
    }
  }

  return issues;
}

function computeCumulativeTotals(gameweeks) {
  const totals = new Map(); // key -> { name, code, points }
  for (const gw of gameweeks) {
    for (const p of gw.predictions) {
      const key = toCanonicalKey(p);
      if (!totals.has(key)) totals.set(key, { name: p.name, code: p.code, points: 0 });
      const entry = totals.get(key);
      if (typeof p.points === 'number') entry.points += p.points;
    }
  }
  return [...totals.values()].sort((a, b) => b.points - a.points);
}

function computeOverallVsPredictedAdjustments(gameweeks) {
  const nameToCode = buildNameToCodeMap(gameweeks);
  const codes = new Set();
  for (const gw of gameweeks) for (const p of gw.predictions) codes.add(p.code);

  const cumulativeByCode = new Map();
  const lastDeltaByCode = new Map();
  const adjustments = new Map(); // code -> [{gameweek, deltaChange, deltaAfter}]

  for (const gw of gameweeks) {
    for (const p of gw.predictions) {
      const prev = cumulativeByCode.get(p.code) ?? 0;
      cumulativeByCode.set(p.code, prev + (p.points ?? 0));
    }

    for (const row of gw.overall_table) {
      const code = resolveOverallRowToCode(row.label, nameToCode);
      if (!code || !codes.has(code)) continue;

      const predicted = cumulativeByCode.get(code) ?? 0;
      const delta = row.points - predicted;
      const prevDelta = lastDeltaByCode.get(code) ?? 0;

      if (delta !== prevDelta) {
        if (!adjustments.has(code)) adjustments.set(code, []);
        adjustments.get(code).push({
          gameweek: gw.gameweek,
          deltaChange: delta - prevDelta,
          deltaAfter: delta,
          overallPoints: row.points,
          predictedPoints: predicted,
        });
      }

      lastDeltaByCode.set(code, delta);
    }
  }

  return { adjustments: Object.fromEntries(adjustments), finalDeltaByCode: Object.fromEntries(lastDeltaByCode) };
}

function renderSummaryMd({ gameweeks, issues, cumulative }) {
  const latest = gameweeks[gameweeks.length - 1];
  const { adjustments, finalDeltaByCode } = computeOverallVsPredictedAdjustments(gameweeks);
  const parts = [];

  parts.push(`# GW Predictions Summary`);
  parts.push(``);
  parts.push(`- Parsed gameweeks: ${gameweeks.length}`);
  parts.push(`- Latest gameweek: ${latest?.gameweek ?? 'n/a'}`);
  parts.push(`- Unique players (from predictions): ${cumulative.length}`);
  parts.push(`- Issues detected: ${issues.length}`);
  parts.push(``);

  parts.push(`## Latest Cumulative (Computed)`);
  parts.push(``);
  parts.push(`| Rank | Code | Name | Points |`);
  parts.push(`|---:|:---:|---|---:|`);
  cumulative.slice(0, 20).forEach((p, idx) => {
    parts.push(`| ${idx + 1} | ${p.code ?? ''} | ${p.name ?? ''} | ${p.points} |`);
  });
  parts.push(``);

  parts.push(`## Winners By Gameweek (Computed)`);
  parts.push(``);
  parts.push(`| GW | Points | Winners |`);
  parts.push(`|---:|---:|---|`);
  for (const gw of gameweeks) {
    const computed = computeWinnersFromPredictions(gw.predictions);
    parts.push(`| ${gw.gameweek} | ${computed.points ?? ''} | ${(computed.winners ?? []).join(', ')} |`);
  }
  parts.push(``);

  const adjustmentCodes = Object.keys(adjustments).sort();
  if (adjustmentCodes.length) {
    parts.push(`## Overall vs Weekly (Adjustments Needed)`);
    parts.push(``);
    parts.push(
      `Your text contains *two* sources of truth: the per-GW points list, and the cumulative OVERALL TABLE. When they disagree, the delta stays constant until another correction appears.`,
    );
    parts.push(``);
    parts.push(`| Code | Final Delta | First Adjustment(s) |`);
    parts.push(`|:---:|---:|---|`);
    for (const code of adjustmentCodes) {
      const list = adjustments[code] ?? [];
      const finalDelta = finalDeltaByCode[code] ?? 0;
      const pretty = list
        .slice(0, 3)
        .map((a) => `GW${a.gameweek}: ${a.deltaChange >= 0 ? '+' : ''}${a.deltaChange}`)
        .join(', ');
      parts.push(`| ${code} | ${finalDelta >= 0 ? '+' : ''}${finalDelta} | ${pretty}${list.length > 3 ? '…' : ''} |`);
    }
    parts.push(``);
  }

  if (issues.length) {
    parts.push(`## Issues`);
    parts.push(``);
    parts.push(`\`\`\`json`);
    parts.push(JSON.stringify(issues.slice(0, 200), null, 2));
    parts.push(`\`\`\``);
    parts.push(``);
    if (issues.length > 200) parts.push(`(Truncated to first 200 issues.)`);
  }

  return parts.join('\n');
}

function parseArgs(argv) {
  const args = { inFile: null, outDir: null, configFile: null, jsonToStdout: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in' && argv[i + 1]) args.inFile = argv[++i];
    else if (a === '--out' && argv[i + 1]) args.outDir = argv[++i];
    else if (a === '--config' && argv[i + 1]) args.configFile = argv[++i];
    else if (a === '--json') args.jsonToStdout = true;
  }
  return args;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const { inFile, outDir, configFile, jsonToStdout } = parseArgs(process.argv);

  const text = inFile ? await fs.readFile(inFile, 'utf8') : await readStdin();
  if (!text.trim()) {
    console.error('No input provided. Use --in <file> or pipe text via stdin.');
    process.exit(1);
  }

  const config = await readJsonIfExists(configFile);
  const normalizedConfig = normalizeConfig(config);
  const gameweeks = parseGameweeks(text, normalizedConfig);
  const cumulative = computeCumulativeTotals(gameweeks);
  const issues = buildIssues(gameweeks);

  const payload = { gameweeks, cumulative, issues };

  if (outDir) {
    const outPath = path.resolve(outDir);
    await fs.mkdir(outPath, { recursive: true });
    await fs.writeFile(path.join(outPath, 'parsed.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
    await fs.writeFile(path.join(outPath, 'summary.md'), renderSummaryMd(payload) + '\n', 'utf8');
    console.log(`Wrote ${path.join(outPath, 'parsed.json')}`);
    console.log(`Wrote ${path.join(outPath, 'summary.md')}`);
  }

  if (jsonToStdout || !outDir) {
    if (jsonToStdout) {
      process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    } else {
      const latest = gameweeks[gameweeks.length - 1];
      console.log(`Parsed ${gameweeks.length} gameweeks. Latest: GW ${latest?.gameweek ?? 'n/a'}.`);
      console.log(`Players (from predictions): ${cumulative.length}. Issues: ${issues.length}.`);
      console.log(`Top 5 (computed):`);
      cumulative.slice(0, 5).forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.code ?? ''} ${p.name} — ${p.points} pts`);
      });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
