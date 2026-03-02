# GW results data (raw → parsed)

This folder is for turning WhatsApp-style posts like:

> `GW 27 PREDICTIONS RESULT` + a list of players/points + `OVERALL TABLE`

…into structured JSON you can use for auditing, summaries, or importing elsewhere.

## 1) Save the raw text

Create a file at:

- `docs/data/gw-results/raw.txt`

Paste the full message(s) exactly as-is.

## 2) Parse it

Run:

- `node scripts/parse-gw-results.mjs --in docs/data/gw-results/raw.txt --out docs/data/gw-results/out --config docs/data/gw-results/config.json`

This writes:

- `docs/data/gw-results/out/parsed.json`
- `docs/data/gw-results/out/summary.md`

## 2b) Aliases / exclusions (optional)

If you have name variations (e.g. “Mr Chiggs” == “Cozy”) or want to remove a player, edit:

- `docs/data/gw-results/config.json`

## Notes on interpretation

- Lines like `23-1=22` or `22+10=32` are treated as **final points = the last number** (e.g. `22`, `32`).
- The parser also checks whether the left-hand arithmetic matches the right-hand value and flags mismatches.
- “Winner(s) … with X pts” lines are compared to computed winners from the points list (and mismatches are flagged).
