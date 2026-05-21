import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { buildJeopardyStatsView } from '@/lib/jeopardy-stats';

interface JeopardyIndexEntry {
  gameId: number;
  showNumber: number;
  season: number | null;
}

async function readJeopardyIndexEntries(): Promise<JeopardyIndexEntry[]> {
  const indexPath = path.join(process.cwd(), 'public', 'data', 'jeopardy', 'index.json');
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const gameId = Number((entry as { gameId?: unknown }).gameId);
        const showNumber = Number((entry as { showNumber?: unknown }).showNumber);
        const seasonRaw = (entry as { season?: unknown }).season;
        const season = seasonRaw == null ? null : Number(seasonRaw);
        if (!Number.isFinite(gameId) || !Number.isFinite(showNumber)) return null;
        return {
          gameId,
          showNumber,
          season: Number.isFinite(season) ? season : null,
        };
      })
      .filter((entry): entry is JeopardyIndexEntry => entry != null);
  } catch {
    return [];
  }
}

export async function getJeopardyStatsForUser(userId: string) {
  const [episodes, clues, indexEntries] = await Promise.all([
    prisma.userJeopardyEpisodeProgress.findMany({
      where: { userId },
      select: {
        episodeKey: true,
        showNumber: true,
        mode: true,
        status: true,
        lastPlayedAt: true,
        completedAt: true,
      },
    }),
    prisma.userClueProgress.findMany({
      where: { userId },
      select: {
        clueId: true,
        correctCount: true,
        incorrectCount: true,
        skipCount: true,
        lastOutcome: true,
        tripleStumper: true,
        isFinalJeopardy: true,
      },
    }),
    readJeopardyIndexEntries(),
  ]);

  const seasonByShowNumber = new Map<number, number | null>();
  const showNumberToGameId = new Map<number, number>();
  const seasonByGameId = new Map<number, number | null>();
  for (const entry of indexEntries) {
    seasonByShowNumber.set(entry.showNumber, entry.season);
    showNumberToGameId.set(entry.showNumber, entry.gameId);
    seasonByGameId.set(entry.gameId, entry.season);
  }

  return buildJeopardyStatsView({
    episodes: episodes.map((episode) => ({
      episodeKey: episode.episodeKey,
      showNumber: episode.showNumber,
      mode: episode.mode as 'practice' | 'competition' | 'learn',
      status: episode.status as 'unfinished' | 'completed',
      lastPlayedAt: episode.lastPlayedAt.toISOString(),
      completedAt: episode.completedAt ? episode.completedAt.toISOString() : null,
    })),
    clues: clues.map((clue) => ({
      clueId: clue.clueId,
      correctCount: clue.correctCount,
      incorrectCount: clue.incorrectCount,
      skipCount: clue.skipCount,
      lastOutcome: clue.lastOutcome as 'correct' | 'incorrect' | 'skip',
      tripleStumper: clue.tripleStumper,
      isFinalJeopardy: clue.isFinalJeopardy,
    })),
    seasonByShowNumber,
    showNumberToGameId,
    seasonByGameId,
  });
}
