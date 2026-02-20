/**
 * Canonical JSON format for a Jeopardy game stored as a flat file.
 *
 * These files live in public/data/jeopardy/ and are served as static
 * assets — no server or database needed. The game page reads them
 * directly when the API returns no games (GitHub Pages mode).
 */

export interface JeopardyClueData {
  question: string;
  answer: string;
  value: number | null;       // null for Final Jeopardy
  dailyDouble: boolean;
  tripleStumper: boolean;     // all contestants answered incorrectly
  isFinalJeopardy: boolean;
  category: string;
  round: 'single' | 'double' | 'final';
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
  tournamentType: string | null;  // e.g. "Tournament of Champions"
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
