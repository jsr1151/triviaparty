/**
 * Canonical JSON format for a Jeopardy game stored as a flat file.
 *
 * Files live in public/data/jeopardy/ and are served as static assets —
 * no server or database needed. The game page reads them directly when the
 * API returns no games (GitHub Pages mode).
 *
 * Every clue has a stable `clueId` that uniquely identifies it across all
 * games. User-applied tags and flags are stored in localStorage (see
 * src/lib/clue-store.ts) keyed by `clueId` and never modify the JSON files.
 */

export interface JeopardyClueData {
  /** Stable unique identifier: "g<gameId>-<round[0]>-c<catPos>-r<rowIdx>" */
  clueId: string;
  question: string;
  answer: string;
  value: number | null;       // null for Final Jeopardy
  dailyDouble: boolean;
  tripleStumper: boolean;     // all contestants answered incorrectly
  isFinalJeopardy: boolean;
  category: string;
  round: 'single' | 'double' | 'final';
  /** Row index within the category (0 = cheapest / first clue) */
  rowIndex: number;
  /** Optional repository-persisted topic tags shared across users */
  topicTags?: string[];
}

export interface JeopardyCategoryData {
  name: string;
  round: 'single' | 'double' | 'final';
  position: number;
  clues: JeopardyClueData[];
}

export interface JeopardyGameData {
  gameId: number;             // J-Archive game_id
  showNumber: number;         // Episode number (e.g. #8000)
  airDate: string;            // "January 1, 2024" or "2024-01-01"
  season: number | null;
  isSpecial: boolean;         // tournament, championship, celebrity, etc.
  tournamentType: string | null;   // e.g. "Tournament of Champions"
  categories: JeopardyCategoryData[];
}

/** Entry in public/data/jeopardy/index.json */
export interface JeopardyIndexEntry {
  gameId: number;
  showNumber: number;
  airDate: string;
  season: number | null;
  isSpecial: boolean;
  tournamentType: string | null;
  file: string;               // filename relative to public/data/jeopardy/, e.g. "game-8000.json"
}

// ── User-applied metadata (stored in localStorage, never in the JSON files) ──

export interface ClueUserData {
  clueId: string;
  /** Topic tags assigned by the user, e.g. ["art", "history"] */
  topicTags: string[];
  /** General flag — mark a clue for later review */
  flagged: boolean;
  /** Media flag — clue references a video/image/audio not available here */
  mediaFlag: boolean;
}

// ── Game-builder filter options (used by Custom and Random modes) ────────────

export interface JeopardyFilter {
  /** Only include triple stumper clues */
  tripleStumpersOnly?: boolean;
  /** Only include daily doubles */
  dailyDoublesOnly?: boolean;
  /** Only include final jeopardy clues */
  finalOnly?: boolean;
  /** Only include flagged clues */
  flaggedOnly?: boolean;
  /** Only include media-flagged clues */
  mediaFlaggedOnly?: boolean;
  /** Only include clues that have ALL of these topic tags */
  topicTags?: string[];
  /** Restrict to specific seasons */
  seasons?: number[];
  /** Restrict to specific game IDs */
  gameIds?: number[];
  /** Restrict to specific rounds */
  rounds?: Array<'single' | 'double' | 'final'>;
  /** Dollar value range (inclusive) */
  minValue?: number;
  maxValue?: number;
  /** Free-text search across question + answer */
  search?: string;
}
