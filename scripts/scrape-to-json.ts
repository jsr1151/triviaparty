#!/usr/bin/env ts-node
/**
 * scripts/scrape-to-json.ts
 *
 * Scrape J-Archive games and save static JSON files under:
 *   - public/data/jeopardy/
 *   - docs/data/jeopardy/ (if docs/ exists)
 *
 * This script supports:
 *   - single game IDs
 *   - game ID ranges
 *   - one season
 *   - season ranges (e.g., 1..40)
 *
 * It is resilient for long-running scrapes:
 *   - retries + exponential backoff
 *   - resume via existing JSON files (skips already scraped games)
 *   - failure report file with failed game IDs
 *
 * Usage:
 *   # Scrape individual games by J-Archive game_id:
 *   npm run scrape -- 8000 8001 8002
 *
 *   # Scrape all games in a season:
 *   npm run scrape -- --season 40
 *
 *   # Scrape season range (recommended for full historical scrape):
 *   npm run scrape -- --season-from 1 --season-to 40
 *
 *   # Scrape a range of game IDs:
 *   npm run scrape -- --from 7990 --to 8010
 *
 * Options:
 *   --delay-ms <n>          Delay between games in ms (default: 500)
 *   --retries <n>           Retries per game/season-list fetch (default: 2)
 *   --retry-backoff-ms <n>  Base backoff ms (default: 1000)
 *   --max-games <n>         Limit total games for a run (useful for testing)
 *
 * Output:
 *   public/data/jeopardy/game-<id>.json  — one file per game
 *   public/data/jeopardy/index.json      — updated list of all scraped games
 *   docs/data/jeopardy/game-<id>.json    — mirrored file for GitHub Pages static docs (if docs/ exists)
 *   docs/data/jeopardy/index.json        — mirrored index for GitHub Pages static docs (if docs/ exists)
 *   public/data/jeopardy/scrape-failures.json — failed IDs and metadata from latest run
 *
 * After running this script, commit the generated JSON files to the repository.
 * The Jeopardy game page will automatically load them on GitHub Pages.
 */

import * as fs from 'fs';
import * as path from 'path';
import { scrapeGame, scrapeGameList } from '../src/lib/scraper';
import type { JeopardyGameData, JeopardyIndexEntry } from '../src/types/jeopardy';

const PRIMARY_DATA_DIR = path.resolve(__dirname, '../public/data/jeopardy');
const DOCS_DATA_DIR = path.resolve(__dirname, '../docs/data/jeopardy');
const DATA_DIRS = fs.existsSync(path.resolve(__dirname, '../docs'))
  ? [PRIMARY_DATA_DIR, DOCS_DATA_DIR]
  : [PRIMARY_DATA_DIR];
const PRIMARY_INDEX_FILE = path.join(PRIMARY_DATA_DIR, 'index.json');
const FAILURES_FILE = path.join(PRIMARY_DATA_DIR, 'scrape-failures.json');

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getFlagValue(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx < 0) return null;
  const value = args[idx + 1];
  return value && !value.startsWith('--') ? value : null;
}

function getIntFlag(args: string[], flag: string, fallback: number): number {
  const raw = getFlagValue(args, flag);
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positionalGameIdArgs(args: string[]): string[] {
  const flagsWithValue = new Set([
    '--season', '--season-from', '--season-to', '--from', '--to',
    '--delay-ms', '--retries', '--retry-backoff-ms', '--max-games',
  ]);

  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (flagsWithValue.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith('--')) continue;
    result.push(token);
  }
  return result;
}

function loadIndex(): JeopardyIndexEntry[] {
  if (!fs.existsSync(PRIMARY_INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(PRIMARY_INDEX_FILE, 'utf-8')); }
  catch { return []; }
}

function saveIndex(entries: JeopardyIndexEntry[]) {
  const serialized = JSON.stringify(entries, null, 2);
  for (const dir of DATA_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.json'), serialized);
  }
}

function gameFile(dataDir: string, gameId: number) {
  return path.join(dataDir, `game-${gameId}.json`);
}

async function scrapeAndSave(gameId: number): Promise<boolean> {
  const outFile = gameFile(PRIMARY_DATA_DIR, gameId);

  if (fs.existsSync(outFile)) {
    console.log(`  ⏭  game-${gameId}.json already exists — skipping`);
    return true;
  }

  process.stdout.write(`  ↓  Scraping game ${gameId}... `);
  const scraped = await scrapeGame(gameId);
  if (!scraped) {
    console.log('✗ failed (returned null)');
    return false;
  }

  const gameData: JeopardyGameData = {
    gameId,
    showNumber: scraped.showNumber,
    airDate: scraped.airDate,
    season: scraped.season,
    isSpecial: scraped.isSpecial,
    tournamentType: scraped.tournamentType,
    categories: scraped.categories.map(cat => ({
      ...cat,
      clues: cat.clues.map((cl, rowIdx) => ({
        ...cl,
        rowIndex: rowIdx,
        // Stable unique ID: g<gameId>-<roundLetter>-c<catPos>-r<rowIdx>
        // e.g. g8000-s-c2-r3  (game 8000, single round, category 2, row 3)
        clueId: `g${gameId}-${cat.round[0]}-c${cat.position}-r${rowIdx}`,
      })),
    })),
  };

  const serializedGame = JSON.stringify(gameData, null, 2);
  for (const dir of DATA_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(gameFile(dir, gameId), serializedGame);
  }

  const entry: JeopardyIndexEntry = {
    gameId,
    showNumber: scraped.showNumber,
    airDate: scraped.airDate,
    season: scraped.season,
    isSpecial: scraped.isSpecial,
    tournamentType: scraped.tournamentType,
    file: `game-${gameId}.json`,
  };

  const index = loadIndex();
  const existing = index.findIndex(e => e.gameId === gameId);
  if (existing >= 0) index[existing] = entry;
  else index.push(entry);
  // Keep sorted by showNumber descending
  index.sort((a, b) => b.showNumber - a.showNumber);
  saveIndex(index);

  const clueCount = gameData.categories.reduce((n, c) => n + c.clues.length, 0);
  const ddCount = gameData.categories.flatMap(c => c.clues).filter(cl => cl.dailyDouble).length;
  const tsCount = gameData.categories.flatMap(c => c.clues).filter(cl => cl.tripleStumper).length;
  console.log(
    `✓  Show #${scraped.showNumber} | ${scraped.airDate}` +
    (scraped.isSpecial ? ` [${scraped.tournamentType}]` : '') +
    ` | ${clueCount} clues | ${ddCount} DD | ${tsCount} TS`,
  );
  return true;
}

async function scrapeAndSaveWithRetry(gameId: number, retries: number, retryBackoffMs: number): Promise<boolean> {
  let attempt = 0;
  while (attempt <= retries) {
    attempt += 1;
    const ok = await scrapeAndSave(gameId);
    if (ok) return true;
    if (attempt <= retries) {
      const wait = retryBackoffMs * Math.pow(2, attempt - 1);
      console.log(`    ↻ retrying game ${gameId} in ${wait}ms (attempt ${attempt + 1}/${retries + 1})`);
      await sleep(wait);
    }
  }
  return false;
}

async function scrapeSeasonGameIds(
  season: number,
  retries: number,
  retryBackoffMs: number,
): Promise<number[]> {
  let attempt = 0;
  while (attempt <= retries) {
    attempt += 1;
    try {
      const list = await scrapeGameList(season);
      const ids = list
        .filter(g => g.gameId > 0)
        .sort((a, b) => a.showNumber - b.showNumber)
        .map(g => g.gameId);
      return ids;
    } catch (err) {
      if (attempt > retries) break;
      const wait = retryBackoffMs * Math.pow(2, attempt - 1);
      console.log(`  ⚠ season ${season} list fetch failed; retrying in ${wait}ms (attempt ${attempt + 1}/${retries + 1})`);
      await sleep(wait);
      void err;
    }
  }
  return [];
}

async function main() {
  for (const dir of DATA_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  npm run scrape -- <gameId> [gameId...]  scrape specific games');
    console.error('  npm run scrape -- --season <n>          scrape a full season');
    console.error('  npm run scrape -- --season-from <n> --season-to <n>  scrape season range');
    console.error('  npm run scrape -- --from <id> --to <id> scrape a range of IDs');
    console.error('Optional flags: --delay-ms <n> --retries <n> --retry-backoff-ms <n> --max-games <n>');
    process.exit(1);
  }

  const delayMs = Math.max(0, getIntFlag(args, '--delay-ms', 500));
  const retries = Math.max(0, getIntFlag(args, '--retries', 2));
  const retryBackoffMs = Math.max(100, getIntFlag(args, '--retry-backoff-ms', 1000));
  const maxGames = Math.max(0, getIntFlag(args, '--max-games', 0));

  let gameIds: number[] = [];

  if (args.includes('--season-from') && args.includes('--season-to')) {
    const from = parseInt(args[args.indexOf('--season-from') + 1], 10);
    const to = parseInt(args[args.indexOf('--season-to') + 1], 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      console.error('--season-from and --season-to require numbers');
      process.exit(1);
    }

    const seasonFrom = Math.min(from, to);
    const seasonTo = Math.max(from, to);
    console.log(`Fetching game lists for seasons ${seasonFrom}–${seasonTo}...`);

    const seen = new Set<number>();
    for (let season = seasonFrom; season <= seasonTo; season++) {
      const ids = await scrapeSeasonGameIds(season, retries, retryBackoffMs);
      if (ids.length === 0) {
        console.log(`  ⚠ no games found for season ${season}`);
        continue;
      }
      for (const id of ids) {
        if (!seen.has(id)) {
          seen.add(id);
          gameIds.push(id);
        }
      }
      console.log(`  ✓ season ${season}: ${ids.length} game(s)`);
      await sleep(Math.min(delayMs, 1000));
    }
    console.log(`Found ${gameIds.length} total unique game(s) across seasons ${seasonFrom}–${seasonTo}`);
  } else if (args.includes('--season')) {
    const seasonIdx = args.indexOf('--season');
    const season = parseInt(args[seasonIdx + 1], 10);
    if (isNaN(season)) { console.error('--season requires a number'); process.exit(1); }
    console.log(`Fetching game list for season ${season}...`);
    gameIds = await scrapeSeasonGameIds(season, retries, retryBackoffMs);
    console.log(`Found ${gameIds.length} games in season ${season}`);
  } else if (args.includes('--from') && args.includes('--to')) {
    const from = parseInt(args[args.indexOf('--from') + 1], 10);
    const to = parseInt(args[args.indexOf('--to') + 1], 10);
    if (isNaN(from) || isNaN(to)) { console.error('--from and --to require numbers'); process.exit(1); }
    for (let id = from; id <= to; id++) gameIds.push(id);
    console.log(`Scraping game IDs ${from}–${to} (${gameIds.length} games)`);
  } else {
    gameIds = positionalGameIdArgs(args).map(Number).filter(n => !isNaN(n) && n > 0);
    if (gameIds.length === 0) { console.error('No valid game IDs provided'); process.exit(1); }
    console.log(`Scraping ${gameIds.length} game(s): ${gameIds.join(', ')}`);
  }

  if (maxGames > 0 && gameIds.length > maxGames) {
    gameIds = gameIds.slice(0, maxGames);
    console.log(`Limiting run to first ${maxGames} game(s) due to --max-games`);
  }

  console.log(`Options: delay=${delayMs}ms, retries=${retries}, backoff=${retryBackoffMs}ms`);

  let ok = 0; let fail = 0;
  const failedGameIds: number[] = [];
  const startedAt = new Date().toISOString();

  for (const id of gameIds) {
    const success = await scrapeAndSaveWithRetry(id, retries, retryBackoffMs);
    if (success) ok++;
    else {
      fail++;
      failedGameIds.push(id);
    }
    if (gameIds.length > 1 && delayMs > 0) await sleep(delayMs);
  }

  const finishedAt = new Date().toISOString();
  fs.writeFileSync(FAILURES_FILE, JSON.stringify({
    startedAt,
    finishedAt,
    totalRequested: gameIds.length,
    saved: ok,
    failed: fail,
    failedGameIds,
  }, null, 2));

  console.log('');
  console.log(`Done. Saved: ${ok} | Failed: ${fail}`);
  console.log(`Index now has ${loadIndex().length} game(s).`);
  console.log(`Failure report: ${FAILURES_FILE}`);
  if (failedGameIds.length > 0) {
    console.log(`Retry failed IDs:`);
    console.log(`  npm run scrape -- ${failedGameIds.join(' ')} --delay-ms ${delayMs} --retries ${retries}`);
  }
  console.log('');
  console.log('Next steps:');
  console.log('  git add public/data/jeopardy/ docs/data/jeopardy/ && git commit -m "feat: add scraped Jeopardy games"');
  console.log('  git push');
}

main().catch(err => { console.error(err); process.exit(1); });
