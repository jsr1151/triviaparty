#!/usr/bin/env ts-node
/**
 * scripts/scrape-to-json.ts
 *
 * Scrape one or more J-Archive games and save them as static JSON files
 * under public/data/jeopardy/. No database or server needed — the JSON
 * files are committed to the repository and served directly by GitHub Pages.
 *
 * Usage:
 *   # Scrape individual games by J-Archive game_id:
 *   npm run scrape -- 8000 8001 8002
 *
 *   # Scrape all games in a season:
 *   npm run scrape -- --season 40
 *
 *   # Scrape a range of game IDs:
 *   npm run scrape -- --from 7990 --to 8010
 *
 * Output:
 *   public/data/jeopardy/game-<id>.json  — one file per game
 *   public/data/jeopardy/index.json      — updated list of all scraped games
 *
 * After running this script, commit the generated JSON files to the repository.
 * The Jeopardy game page will automatically load them on GitHub Pages.
 */

import * as fs from 'fs';
import * as path from 'path';
import { scrapeGame, scrapeGameList } from '../src/lib/scraper';
import type { JeopardyGameData, JeopardyIndexEntry } from '../src/types/jeopardy';

const DATA_DIR = path.resolve(__dirname, '../public/data/jeopardy');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

function loadIndex(): JeopardyIndexEntry[] {
  if (!fs.existsSync(INDEX_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8')); }
  catch { return []; }
}

function saveIndex(entries: JeopardyIndexEntry[]) {
  fs.writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2));
}

function gameFile(gameId: number) {
  return path.join(DATA_DIR, `game-${gameId}.json`);
}

async function scrapeAndSave(gameId: number): Promise<boolean> {
  const outFile = gameFile(gameId);

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

  fs.writeFileSync(outFile, JSON.stringify(gameData, null, 2));

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

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage:');
    console.error('  npm run scrape -- <gameId> [gameId...]  scrape specific games');
    console.error('  npm run scrape -- --season <n>          scrape a full season');
    console.error('  npm run scrape -- --from <id> --to <id> scrape a range of IDs');
    process.exit(1);
  }

  let gameIds: number[] = [];

  if (args.includes('--season')) {
    const seasonIdx = args.indexOf('--season');
    const season = parseInt(args[seasonIdx + 1]);
    if (isNaN(season)) { console.error('--season requires a number'); process.exit(1); }
    console.log(`Fetching game list for season ${season}...`);
    const list = await scrapeGameList(season);
    gameIds = list.map((_, i) => {
      // scrapeGameList returns URLs; we need the game_id from the URL
      const urlMatch = list[i].url?.match(/game_id=(\d+)/);
      return urlMatch ? parseInt(urlMatch[1]) : 0;
    }).filter(id => id > 0);
    console.log(`Found ${gameIds.length} games in season ${season}`);
  } else if (args.includes('--from') && args.includes('--to')) {
    const from = parseInt(args[args.indexOf('--from') + 1]);
    const to = parseInt(args[args.indexOf('--to') + 1]);
    if (isNaN(from) || isNaN(to)) { console.error('--from and --to require numbers'); process.exit(1); }
    for (let id = from; id <= to; id++) gameIds.push(id);
    console.log(`Scraping game IDs ${from}–${to} (${gameIds.length} games)`);
  } else {
    gameIds = args.filter(a => !a.startsWith('--')).map(Number).filter(n => !isNaN(n) && n > 0);
    if (gameIds.length === 0) { console.error('No valid game IDs provided'); process.exit(1); }
    console.log(`Scraping ${gameIds.length} game(s): ${gameIds.join(', ')}`);
  }

  let ok = 0; let fail = 0;
  for (const id of gameIds) {
    const success = await scrapeAndSave(id);
    if (success) ok++; else fail++;
    // Be polite to J-Archive — 500ms between requests
    if (gameIds.length > 1) await new Promise(r => setTimeout(r, 500));
  }

  console.log('');
  console.log(`Done. Saved: ${ok} | Failed: ${fail}`);
  console.log(`Index now has ${loadIndex().length} game(s).`);
  console.log('');
  console.log('Next steps:');
  console.log('  git add public/data/jeopardy/ && git commit -m "feat: add scraped Jeopardy games"');
  console.log('  git push');
}

main().catch(err => { console.error(err); process.exit(1); });
