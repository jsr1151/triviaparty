/**
 * match-media-to-jeopardy.ts
 *
 * Scans all Jeopardy game files and finds clues whose question text
 * matches a media question. Simple normalized text lookup — the media
 * questions were sourced from these episodes so text is essentially identical.
 *
 * Usage:
 *   npx tsx scripts/match-media-to-jeopardy.ts              # apply matches
 *   npx tsx scripts/match-media-to-jeopardy.ts --dry-run     # preview only
 *   npx tsx scripts/match-media-to-jeopardy.ts --clean       # strip all media
 */

import * as fs from 'fs';
import * as path from 'path';

const GAMES_DIR = path.join(__dirname, '..', 'public', 'data', 'jeopardy');
const QUESTIONS_FILE = path.join(__dirname, '..', 'public', 'data', 'questions', 'sheets-import-questions.json');

// Video game categories — these won't appear in Jeopardy episodes
const SKIP_CATEGORIES = new Set([
  'retroarcade-games', 'adventureplatformers', 'racing-games',
  'rpgs-and-open-worlds', 'horror-games', 'simulation-games',
  'fighting-games', 'all-games-in-between', 'all-pokemon', 'consoles',
  'actionshooter-games-vghis-mix', 'sports-games-vgsports-mix',
  'party-games-vgent-mix', 'musicrhythm-games-vgarts-mix',
  'puzzle-games-vgsci-mix', 'mobile-games-vggeo-mix',
  'recreational-and-tabletop',
]);

interface MediaQuestion {
  type: string;
  question: string;
  answer: string;
  category?: string;
  mediaUrl?: string;
  mediaType?: string;
}

interface JeopardyClue {
  clueId: string;
  question: string;
  answer: string;
  mediaUrl?: string;
  mediaType?: string;
  [key: string]: unknown;
}

interface JeopardyCategory {
  name: string;
  clues: JeopardyClue[];
  [key: string]: unknown;
}

interface JeopardyGame {
  gameId: number;
  showNumber: number;
  categories: JeopardyCategory[];
  [key: string]: unknown;
}

/** Normalize text for matching: lowercase, strip punctuation, collapse whitespace */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip leading article (the/a/an) for a secondary lookup */
function stripArticle(text: string): string {
  return text.replace(/^(the|a|an)\s+/, '');
}

function cleanAllMedia(index: { file: string }[]) {
  let cleaned = 0;
  for (const entry of index) {
    const gamePath = path.join(GAMES_DIR, entry.file);
    if (!fs.existsSync(gamePath)) continue;
    const game: JeopardyGame = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    let modified = false;
    for (const cat of game.categories) {
      for (const clue of cat.clues) {
        if (clue.mediaUrl) {
          delete clue.mediaUrl;
          delete clue.mediaType;
          delete (clue as Record<string, unknown>).mediaStart;
          delete (clue as Record<string, unknown>).mediaEnd;
          delete (clue as Record<string, unknown>).obscureMedia;
          modified = true;
          cleaned++;
        }
      }
    }
    if (modified) {
      const content = JSON.stringify(game, null, 2) + '\n';
      fs.writeFileSync(gamePath, content);
      const docsPath = path.join(__dirname, '..', 'docs', 'data', 'jeopardy', entry.file);
      if (fs.existsSync(path.dirname(docsPath))) {
        fs.writeFileSync(docsPath, content);
      }
    }
  }
  console.log(`Cleaned media from ${cleaned} clues`);
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const index: { file: string; showNumber: number }[] = JSON.parse(
    fs.readFileSync(path.join(GAMES_DIR, 'index.json'), 'utf8'),
  );

  if (process.argv.includes('--clean')) {
    cleanAllMedia(index);
    return;
  }

  // Load media questions, skip video game categories
  console.log('Loading media questions...');
  const questionsData = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
  const mediaQuestions: MediaQuestion[] = (questionsData.questions || []).filter(
    (q: MediaQuestion) =>
      q.type === 'media' && q.mediaUrl && q.question && !SKIP_CATEGORIES.has(q.category || ''),
  );
  console.log(`Found ${mediaQuestions.length} media questions (excluding video game trivia)`);

  // Build maps: normalized question text -> media question
  // Primary: exact normalized text. Secondary: with leading article stripped.
  const mediaByText = new Map<string, MediaQuestion>();
  const mediaByStripped = new Map<string, MediaQuestion>();
  for (const mq of mediaQuestions) {
    const key = normalize(mq.question);
    if (key.length >= 5) {
      mediaByText.set(key, mq);
      mediaByStripped.set(stripArticle(key), mq);
    }
  }
  console.log(`Index: ${mediaByText.size} unique normalized question texts`);

  let gamesModified = 0;
  let cluesMatched = 0;

  for (const entry of index) {
    const gamePath = path.join(GAMES_DIR, entry.file);
    if (!fs.existsSync(gamePath)) continue;

    const game: JeopardyGame = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    let modified = false;

    for (const cat of game.categories) {
      for (const clue of cat.clues) {
        if (!clue.question || clue.mediaUrl) continue;

        const key = normalize(clue.question);
        const match = mediaByText.get(key) || mediaByStripped.get(stripArticle(key));

        if (match) {
          clue.mediaUrl = match.mediaUrl;
          clue.mediaType = (match.mediaType as 'image' | 'video' | 'audio') || 'image';
          modified = true;
          cluesMatched++;
          console.log(
            `  MATCH [show ${game.showNumber}]: "${clue.question.slice(0, 60)}" -> ${match.mediaType} ${(match.mediaUrl || '').slice(0, 70)}`,
          );
        }
      }
    }

    if (modified) {
      gamesModified++;
      if (!dryRun) {
        const content = JSON.stringify(game, null, 2) + '\n';
        fs.writeFileSync(gamePath, content);
        const docsPath = path.join(__dirname, '..', 'docs', 'data', 'jeopardy', entry.file);
        if (fs.existsSync(path.dirname(docsPath))) {
          fs.writeFileSync(docsPath, content);
        }
      }
    }
  }

  console.log('\n-- Results --');
  console.log(`Games scanned: ${index.length}`);
  console.log(`Matches found: ${cluesMatched}`);
  console.log(`Games modified: ${gamesModified}`);
  if (dryRun) console.log('(dry run -- no files written)');
  else console.log('Files updated in public/ and docs/');
}

main();
