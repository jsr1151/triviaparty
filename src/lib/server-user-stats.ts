import { prisma } from '@/lib/prisma';

export type ClueOutcome = 'correct' | 'incorrect' | 'skip';

interface CluePayload {
  clueId: string;
  question: string;
  answer: string;
  value: number | null;
  dailyDouble: boolean;
  tripleStumper: boolean;
  isFinalJeopardy: boolean;
  category: string;
  round: string;
}

export async function ensureUserStats(userId: string) {
  const existing = await prisma.userStats.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userStats.create({
    data: {
      userId,
      completedEpisodes: [],
    },
  });
}

export async function recordClueOutcomeServer(userId: string, clue: CluePayload, outcome: ClueOutcome) {
  await ensureUserStats(userId);

  const existing = await prisma.userClueProgress.findUnique({
    where: { userId_clueId: { userId, clueId: clue.clueId } },
  });

  if (existing) {
    await prisma.userClueProgress.update({
      where: { userId_clueId: { userId, clueId: clue.clueId } },
      data: {
        question: clue.question,
        answer: clue.answer,
        value: clue.value,
        dailyDouble: clue.dailyDouble,
        tripleStumper: clue.tripleStumper,
        isFinalJeopardy: clue.isFinalJeopardy,
        category: clue.category,
        round: clue.round,
        correctCount: outcome === 'correct' ? existing.correctCount + 1 : existing.correctCount,
        incorrectCount: outcome === 'incorrect' ? existing.incorrectCount + 1 : existing.incorrectCount,
        skipCount: outcome === 'skip' ? existing.skipCount + 1 : existing.skipCount,
        lastOutcome: outcome,
      },
    });
  } else {
    await prisma.userClueProgress.create({
      data: {
        userId,
        clueId: clue.clueId,
        question: clue.question,
        answer: clue.answer,
        value: clue.value,
        dailyDouble: clue.dailyDouble,
        tripleStumper: clue.tripleStumper,
        isFinalJeopardy: clue.isFinalJeopardy,
        category: clue.category,
        round: clue.round,
        correctCount: outcome === 'correct' ? 1 : 0,
        incorrectCount: outcome === 'incorrect' ? 1 : 0,
        skipCount: outcome === 'skip' ? 1 : 0,
        lastOutcome: outcome,
      },
    });
  }

  await prisma.userStats.update({
    where: { userId },
    data: {
      correctAnswers: { increment: outcome === 'correct' ? 1 : 0 },
      incorrectAnswers: { increment: outcome === 'incorrect' ? 1 : 0 },
      skippedQuestions: { increment: outcome === 'skip' ? 1 : 0 },
    },
  });
}

export async function recordGameCompletedServer(userId: string, endMoney: number, showNumber?: number | null) {
  const stats = await ensureUserStats(userId);
  const completedEpisodes = Array.isArray(stats.completedEpisodes)
    ? [...(stats.completedEpisodes as number[])]
    : [];

  if (showNumber && !completedEpisodes.includes(showNumber)) {
    completedEpisodes.push(showNumber);
  }

  const gamesPlayed = stats.gamesPlayed + 1;
  const totalEndMoney = stats.totalEndMoney + endMoney;
  const averageEndMoney = Math.round(totalEndMoney / gamesPlayed);

  await prisma.userStats.update({
    where: { userId },
    data: {
      gamesPlayed,
      totalEndMoney,
      averageEndMoney,
      completedEpisodes,
      episodesCompleted: completedEpisodes.length,
    },
  });
}
