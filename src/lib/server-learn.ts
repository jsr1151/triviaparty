import { prisma } from '@/lib/prisma';
import { calculateNextSchedule } from '@/lib/learn-scheduler';

type LearnSourceType = 'jeopardy' | 'non_jeopardy';

const DEFAULT_QUEUE_LIMIT = 40;

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function syncStudyItemsForUser(userId: string, includeNonJeopardy: boolean) {
  const jeopardyMisses = await prisma.userClueProgress.findMany({
    where: {
      userId,
      practiceMissCount: { gt: 0 },
    },
    select: {
      clueId: true,
      question: true,
      answer: true,
      category: true,
    },
    orderBy: { updatedAt: 'desc' },
    take: 600,
  });

  if (jeopardyMisses.length) {
    await prisma.$transaction(
      jeopardyMisses.map((entry) =>
        prisma.userStudyItem.upsert({
          where: {
            userId_sourceType_sourceId: {
              userId,
              sourceType: 'jeopardy',
              sourceId: entry.clueId,
            },
          },
          update: {
            prompt: entry.question,
            answer: entry.answer,
            category: entry.category,
          },
          create: {
            userId,
            sourceType: 'jeopardy',
            sourceId: entry.clueId,
            prompt: entry.question,
            answer: entry.answer,
            category: entry.category,
          },
        }),
      ),
    );
  }

  if (includeNonJeopardy) {
    const nonJeopardy = await prisma.question.findMany({
      select: {
        id: true,
        question: true,
        explanation: true,
        type: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 120,
    });

    if (nonJeopardy.length) {
      await prisma.$transaction(
        nonJeopardy.map((entry) =>
          prisma.userStudyItem.upsert({
            where: {
              userId_sourceType_sourceId: {
                userId,
                sourceType: 'non_jeopardy',
                sourceId: entry.id,
              },
            },
            update: {
              prompt: entry.question,
              answer: entry.explanation?.trim() || 'Review this item in Random/Party mode for full answer details.',
              category: entry.type,
            },
            create: {
              userId,
              sourceType: 'non_jeopardy',
              sourceId: entry.id,
              prompt: entry.question,
              answer: entry.explanation?.trim() || 'Review this item in Random/Party mode for full answer details.',
              category: entry.type,
            },
          }),
        ),
      );
    }
  }
}

export async function getLearnQueueForUser(userId: string, includeNonJeopardy: boolean, limit = DEFAULT_QUEUE_LIMIT) {
  await syncStudyItemsForUser(userId, includeNonJeopardy);

  const sourceTypes: LearnSourceType[] = includeNonJeopardy ? ['jeopardy', 'non_jeopardy'] : ['jeopardy'];
  const now = new Date();
  const where = {
    userId,
    sourceType: { in: sourceTypes },
  } as const;

  const [dueItems, dueCount, masteredCount, totalCount] = await Promise.all([
    prisma.userStudyItem.findMany({
      where: {
        ...where,
        nextDueAt: { lte: now },
      },
      orderBy: [{ nextDueAt: 'asc' }, { updatedAt: 'asc' }],
      take: limit,
    }),
    prisma.userStudyItem.count({
      where: {
        ...where,
        nextDueAt: { lte: now },
      },
    }),
    prisma.userStudyItem.count({
      where: {
        ...where,
        masteredAt: { not: null },
      },
    }),
    prisma.userStudyItem.count({ where }),
  ]);

  return {
    queue: dueItems.map((item) => ({
      id: item.id,
      sourceType: item.sourceType as LearnSourceType,
      sourceId: item.sourceId,
      prompt: item.prompt,
      answer: item.answer,
      category: item.category,
      reviewCount: item.reviewCount,
      lapseCount: item.lapseCount,
      consecutiveCorrect: item.consecutiveCorrect,
      nextDueAt: item.nextDueAt.toISOString(),
      masteredAt: toIso(item.masteredAt),
      lastOutcome: item.lastOutcome,
    })),
    counts: {
      due: dueCount,
      mastered: masteredCount,
      total: totalCount,
    },
  };
}

export async function gradeLearnStudyItem(params: {
  userId: string;
  itemId: string;
  correct: boolean;
}) {
  const current = await prisma.userStudyItem.findFirst({
    where: {
      id: params.itemId,
      userId: params.userId,
    },
  });

  if (!current) return null;

  const now = new Date();
  const schedule = calculateNextSchedule(
    {
      easeFactor: current.easeFactor,
      intervalDays: current.intervalDays,
      consecutiveCorrect: current.consecutiveCorrect,
      lapseCount: current.lapseCount,
    },
    params.correct,
    now,
  );
  const nextMasteredAt = schedule.mastered ? now : params.correct ? current.masteredAt : null;

  const updated = await prisma.userStudyItem.update({
    where: { id: current.id },
    data: {
      reviewCount: { increment: 1 },
      lapseCount: schedule.lapseCount,
      consecutiveCorrect: schedule.consecutiveCorrect,
      easeFactor: schedule.easeFactor,
      intervalDays: schedule.intervalDays,
      nextDueAt: schedule.nextDueAt,
      lastReviewedAt: now,
      lastOutcome: params.correct ? 'correct' : 'incorrect',
      masteredAt: nextMasteredAt,
    },
    select: {
      id: true,
      nextDueAt: true,
      consecutiveCorrect: true,
      masteredAt: true,
      lapseCount: true,
      reviewCount: true,
    },
  });

  return {
    id: updated.id,
    nextDueAt: updated.nextDueAt.toISOString(),
    consecutiveCorrect: updated.consecutiveCorrect,
    masteredAt: toIso(updated.masteredAt),
    lapseCount: updated.lapseCount,
    reviewCount: updated.reviewCount,
  };
}
