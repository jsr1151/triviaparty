import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { ensureUserStats } from '@/lib/server-user-stats';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface LocalClueEntry {
  clueId: string;
  question: string;
  answer: string;
  category: string;
  round: string;
  value: number | null;
  dailyDouble: boolean;
  tripleStumper: boolean;
  isFinalJeopardy: boolean;
  lastOutcome: 'correct' | 'incorrect' | 'skip';
  outcomes: ('correct' | 'incorrect' | 'skip')[];
}

interface LocalOverallStats {
  gamesPlayed: number;
  episodesCompleted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
}

/**
 * POST /api/user/import-local
 *
 * One-time import of local (localStorage) progress into the signed-in account.
 * Clue entries are merged: if the clue already exists in the DB the counts are
 * added together and the latest outcome is kept. Overall stats are similarly
 * merged additively so no progress is lost.
 */
export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const clues: LocalClueEntry[] = Array.isArray(body.clues) ? body.clues : [];
    const overall: LocalOverallStats | null = body.overall ?? null;

    if (clues.length === 0 && !overall) {
      return NextResponse.json({ imported: 0 });
    }

    const stats = await ensureUserStats(user.id);

    // Merge clue progress (upsert each clue, adding counts)
    let imported = 0;
    for (const clue of clues) {
      if (!clue.clueId) continue;

      const counts = (clue.outcomes ?? []).reduce(
        (acc: { correct: number; incorrect: number; skip: number }, o) => {
          if (o === 'correct') acc.correct++;
          else if (o === 'incorrect') acc.incorrect++;
          else acc.skip++;
          return acc;
        },
        { correct: 0, incorrect: 0, skip: 0 },
      );

      const existing = await prisma.userClueProgress.findUnique({
        where: { userId_clueId: { userId: user.id, clueId: clue.clueId } },
      });

      if (existing) {
        await prisma.userClueProgress.update({
          where: { userId_clueId: { userId: user.id, clueId: clue.clueId } },
          data: {
            correctCount: existing.correctCount + counts.correct,
            incorrectCount: existing.incorrectCount + counts.incorrect,
            skipCount: existing.skipCount + counts.skip,
            // Keep the more recent lastOutcome
            lastOutcome: clue.lastOutcome ?? existing.lastOutcome,
          },
        });
      } else {
        await prisma.userClueProgress.create({
          data: {
            userId: user.id,
            clueId: clue.clueId,
            question: clue.question ?? '',
            answer: clue.answer ?? '',
            value: clue.value ?? null,
            dailyDouble: clue.dailyDouble ?? false,
            tripleStumper: clue.tripleStumper ?? false,
            isFinalJeopardy: clue.isFinalJeopardy ?? false,
            category: clue.category ?? '',
            round: clue.round ?? 'single',
            correctCount: counts.correct,
            incorrectCount: counts.incorrect,
            skipCount: counts.skip,
            lastOutcome: clue.lastOutcome ?? 'skip',
          },
        });
      }
      imported++;
    }

    // Merge overall stats additively (only if local stats are non-trivial)
    if (overall && (overall.gamesPlayed > 0 || overall.correctAnswers > 0)) {
      await prisma.userStats.update({
        where: { userId: user.id },
        data: {
          gamesPlayed: stats.gamesPlayed + (overall.gamesPlayed ?? 0),
          episodesCompleted: stats.episodesCompleted + (overall.episodesCompleted ?? 0),
          correctAnswers: stats.correctAnswers + (overall.correctAnswers ?? 0),
          incorrectAnswers: stats.incorrectAnswers + (overall.incorrectAnswers ?? 0),
          skippedQuestions: stats.skippedQuestions + (overall.skippedQuestions ?? 0),
        },
      });
    }

    return NextResponse.json({ imported });
  } catch {
    return NextResponse.json({ error: 'Import failed.' }, { status: 500 });
  }
}
