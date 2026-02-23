/**
 * match-media-to-jeopardy.ts
 *
 * Scans all Jeopardy game files and the media questions pool to find
 * clues whose text matches a media question. When a match is found,
 * the clue gets mediaUrl, mediaType, mediaStart, mediaEnd injected.
 *
 * Usage: npx tsx scripts/match-media-to-jeopardy.ts [--dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const GAMES_DIR = path.join(__dirname, '..', 'public', 'data', 'jeopardy');
const QUESTIONS_FILE = path.join(__dirname, '..', 'data', 'sheets-import-questions.json');

interface MediaQuestion {
  type: string;
  question: string;
  answer: string;
  mediaUrl?: string;
  mediaType?: string;
  category?: string;
  acceptedAnswers?: string[];
}

interface JeopardyClue {
  clueId: string;
  question: string;
  answer: string;
  mediaUrl?: string;
  mediaType?: string;
  mediaStart?: number;
  mediaEnd?: number;
  obscureMedia?: boolean;
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

/** Normalize text for comparison: lowercase, strip punctuation, collapse whitespace */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute word-level Jaccard similarity */
function wordJaccard(a: string, b: string): number {
  const setA = new Set(a.split(' ').filter(Boolean));
  const setB = new Set(b.split(' ').filter(Boolean));
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Load media questions
  console.log('Loading media questions…');
  const questionsData = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
  const mediaQuestions: MediaQuestion[] = (questionsData.questions || []).filter(
    (q: MediaQuestion) => q.type === 'media' && q.mediaUrl && q.question,
  );
  console.log(`Found ${mediaQuestions.length} media questions with URLs`);

  // Build a lookup map: normalized question text → media question
  const mediaByNorm = new Map<string, MediaQuestion>();
  const mediaByAnswer = new Map<string, MediaQuestion[]>();
  for (const mq of mediaQuestions) {
    const norm = normalize(mq.question);
    if (norm.length >= 10) {
      mediaByNorm.set(norm, mq);
    }
    const normA = normalize(mq.answer);
    if (normA.length >= 2) {
      if (!mediaByAnswer.has(normA)) mediaByAnswer.set(normA, []);
      mediaByAnswer.get(normA)!.push(mq);
    }
  }
  console.log(`Index: ${mediaByNorm.size} by question text, ${mediaByAnswer.size} by answer`);

  // Scan all game files
  const index = JSON.parse(fs.readFileSync(path.join(GAMES_DIR, 'index.json'), 'utf8'));
  let gamesModified = 0;
  let cluesMatched = 0;
  let cluesAlreadyHaveMedia = 0;

  for (const entry of index) {
    const gamePath = path.join(GAMES_DIR, entry.file);
    if (!fs.existsSync(gamePath)) continue;

    const game: JeopardyGame = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
    let modified = false;

    for (const cat of game.categories) {
      for (const clue of cat.clues) {
        if (!clue.question) continue;
        if (clue.mediaUrl) {
          cluesAlreadyHaveMedia++;
          continue;
        }

        const normQ = normalize(clue.question);
        const normA = normalize(clue.answer);

        // Strategy 1: Exact question text match
        let match = mediaByNorm.get(normQ);

        // Strategy 2: Same answer + high question overlap (Jaccard ≥ 0.5)
        if (!match && normA.length >= 3) {
          const candidates = mediaByAnswer.get(normA) || [];
          for (const cand of candidates) {
            const candNorm = normalize(cand.question);
            const similarity = wordJaccard(normQ, candNorm);
            if (similarity >= 0.5) {
              match = cand;
              break;
            }
          }
        }

        if (match) {
          clue.mediaUrl = match.mediaUrl;
          clue.mediaType = (match.mediaType as 'image' | 'video' | 'audio') || 'image';
          // Don't set start/end — the URL may already contain timestamp params
          modified = true;
          cluesMatched++;
          if (cluesMatched <= 20) {
            console.log(`  MATCH [game ${game.showNumber}]: "${clue.question.slice(0, 50)}" → ${match.mediaType} ${match.mediaUrl?.slice(0, 60)}`);
          }
        }
      }
    }

    if (modified) {
      gamesModified++;
      if (!dryRun) {
        // Write back to both public/ and docs/
        const content = JSON.stringify(game, null, 2) + '\n';
        fs.writeFileSync(gamePath, content);
        const docsPath = path.join(__dirname, '..', 'docs', 'data', 'jeopardy', entry.file);
        if (fs.existsSync(path.dirname(docsPath))) {
          fs.writeFileSync(docsPath, content);
        }
      }
    }
  }

  console.log('\n── Results ──');
  console.log(`Games scanned: ${index.length}`);
  console.log(`Clues already with media: ${cluesAlreadyHaveMedia}`);
  console.log(`New matches found: ${cluesMatched}`);
  console.log(`Games modified: ${gamesModified}`);
  if (dryRun) {
    console.log('(dry run — no files written)');
  } else {
    console.log('Files updated in public/ and docs/');
  }
}

main();
