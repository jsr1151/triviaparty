/**
 * clue-store.ts
 *
 * Browser-side (localStorage) store for user-applied metadata on individual
 * Jeopardy clues. Never modifies the JSON game files — all user data lives
 * in localStorage keyed by `clueId`.
 *
 * Also exposes `searchClues()` which loads game files from
 * public/data/jeopardy/ and filters them by a JeopardyFilter.
 */

import type {
  ClueUserData,
  JeopardyClueData,
  JeopardyCategoryData,
  JeopardyGameData,
  JeopardyIndexEntry,
  JeopardyFilter,
} from '@/types/jeopardy';

const LS_PREFIX = 'jeopardy:clue:';
const LS_TAGS_USED = 'jeopardy:tags';

// ── Read / write per-clue user data ─────────────────────────────────────────

export function getClueUserData(clueId: string): ClueUserData {
  if (typeof window === 'undefined') return emptyData(clueId);
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + clueId);
    if (!raw) return emptyData(clueId);
    return { ...emptyData(clueId), ...JSON.parse(raw) };
  } catch {
    return emptyData(clueId);
  }
}

export function setClueUserData(data: ClueUserData): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LS_PREFIX + data.clueId, JSON.stringify(data));
  // Keep a master list of all tag names ever used (for autocomplete)
  if (data.topicTags.length > 0) {
    const existing = getAllTags();
    const merged = Array.from(new Set([...existing, ...data.topicTags])).sort();
    window.localStorage.setItem(LS_TAGS_USED, JSON.stringify(merged));
  }
}

export function updateClueFlags(
  clueId: string,
  patch: Partial<Pick<ClueUserData, 'flagged' | 'mediaFlag'>>,
): void {
  setClueUserData({ ...getClueUserData(clueId), ...patch });
}

export function updateClueTags(clueId: string, topicTags: string[]): void {
  setClueUserData({ ...getClueUserData(clueId), topicTags });
}

/** Returns all tag names the user has ever created (from localStorage). */
export function getAllTags(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(LS_TAGS_USED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function emptyData(clueId: string): ClueUserData {
  return { clueId, topicTags: [], flagged: false, mediaFlag: false };
}

// ── Search / filter clues across game files ─────────────────────────────────

export interface ClueSearchResult {
  clue: JeopardyClueData;
  userData: ClueUserData;
  game: Pick<JeopardyGameData, 'gameId' | 'showNumber' | 'airDate' | 'season' | 'isSpecial' | 'tournamentType'>;
}

/**
 * Load all scraped games from the static JSON index and apply a filter.
 * This runs entirely in the browser — no server needed.
 *
 * @param basePath  NEXT_PUBLIC_BASE_PATH (e.g. "/triviaparty" on GitHub Pages)
 * @param filter    Filter criteria to apply
 * @param limit     Maximum number of results to return
 */
export async function searchClues(
  basePath: string,
  filter: JeopardyFilter,
  limit = 500,
): Promise<ClueSearchResult[]> {
  // 1. Load the index
  const idxRes = await fetch(`${basePath}/data/jeopardy/index.json`);
  const index: JeopardyIndexEntry[] = await idxRes.json();

  const results: ClueSearchResult[] = [];
  const searchLower = filter.search?.toLowerCase();

  for (const entry of index) {
    if (results.length >= limit) break;

    // Fast pre-filter on index-level fields (avoid loading file)
    if (filter.seasons?.length && !filter.seasons.includes(entry.season ?? -1)) continue;
    if (filter.gameIds?.length && !filter.gameIds.includes(entry.gameId)) continue;

    const gRes = await fetch(`${basePath}/data/jeopardy/${entry.file}`);
    const game: JeopardyGameData = await gRes.json();
    const gameMeta = {
      gameId: game.gameId,
      showNumber: game.showNumber,
      airDate: game.airDate,
      season: game.season,
      isSpecial: game.isSpecial,
      tournamentType: game.tournamentType,
    };

    for (const cat of game.categories) {
      if (filter.rounds?.length && !filter.rounds.includes(cat.round)) continue;

      for (const clue of cat.clues) {
        if (!clue.clueId) continue; // skip clues from before clueId was added

        // Boolean filters
        if (filter.tripleStumpersOnly && !clue.tripleStumper) continue;
        if (filter.dailyDoublesOnly && !clue.dailyDouble) continue;
        if (filter.finalOnly && !clue.isFinalJeopardy) continue;
        if (filter.minValue != null && clue.value != null && clue.value < filter.minValue) continue;
        if (filter.maxValue != null && clue.value != null && clue.value > filter.maxValue) continue;

        // Full-text search
        if (searchLower) {
          const combined = `${clue.question} ${clue.answer} ${clue.category}`.toLowerCase();
          if (!combined.includes(searchLower)) continue;
        }

        // User-data filters (localStorage)
        const userData = getClueUserData(clue.clueId);
        if (filter.flaggedOnly && !userData.flagged) continue;
        if (filter.mediaFlaggedOnly && !userData.mediaFlag) continue;
        if (filter.topicTags?.length) {
          const hasAll = filter.topicTags.every(t => userData.topicTags.includes(t));
          if (!hasAll) continue;
        }

        results.push({ clue, userData, game: gameMeta });
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }
  }

  return results;
}

// ── Board-builder helpers ────────────────────────────────────────────────────

/**
 * Build a "Replay" board from a game file — the exact historical layout.
 * Returns the game's single/double/final categories as-is.
 */
export function buildReplayBoard(game: JeopardyGameData): JeopardyCategoryData[] {
  return game.categories;
}

/**
 * Build a "Random" board — pick `catCount` random categories from the pool
 * of all loaded games, then pick `cluesPerCat` random clues per category.
 * All clues come from the `round` requested (default: 'single').
 */
export function buildRandomBoard(
  games: JeopardyGameData[],
  catCount = 6,
  cluesPerCat = 5,
  round: 'single' | 'double' = 'single',
): JeopardyCategoryData[] {
  // Flatten all categories of the requested round across all games
  const allCats = games.flatMap(g =>
    g.categories.filter(c => c.round === round && c.clues.length >= cluesPerCat),
  );
  // Shuffle and pick
  const shuffled = [...allCats].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, catCount).map(cat => ({
    ...cat,
    clues: [...cat.clues].sort(() => Math.random() - 0.5).slice(0, cluesPerCat),
  }));
}

/**
 * Build a "Custom" board from a filtered clue pool.
 * Groups matching clues by category name and returns up to `catCount`
 * categories with up to `cluesPerCat` clues each.
 */
export function buildCustomBoard(
  results: ClueSearchResult[],
  catCount = 6,
  cluesPerCat = 5,
): JeopardyCategoryData[] {
  // Group clues by category name
  const byCategory = new Map<string, JeopardyClueData[]>();
  for (const r of results) {
    const key = r.clue.category;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(r.clue);
  }

  // Pick categories that have enough clues, shuffle, and cap
  const eligible = [...byCategory.entries()]
    .filter(([, clues]) => clues.length >= 1)
    .sort(() => Math.random() - 0.5)
    .slice(0, catCount);

  return eligible.map(([name, clues], idx) => ({
    name,
    round: clues[0].round,
    position: idx,
    clues: [...clues].sort(() => Math.random() - 0.5).slice(0, cluesPerCat),
  }));
}
