import { prisma } from '@/lib/prisma';
import { Prisma } from '@/generated/prisma/client';
import type {
  JeopardyEpisodeMode,
  JeopardyEpisodeProgress,
  JeopardyEpisodeSessionState,
  JeopardyEpisodeStatus,
} from '@/lib/jeopardy-episode-progress';

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function toSessionState(value: unknown): JeopardyEpisodeSessionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as JeopardyEpisodeSessionState;
}

function toPrismaSessionState(value: JeopardyEpisodeSessionState): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function serialiseProgress(progress: {
  episodeKey: string;
  showNumber: number | null;
  mode: string;
  status: string;
  totalClues: number;
  revealedClueIds: unknown;
  revealedCount: number;
  uniqueCluesAnswered: number;
  startedAt: Date;
  lastPlayedAt: Date;
  completedAt: Date | null;
  sessionState: unknown;
}): JeopardyEpisodeProgress {
  return {
    episodeKey: progress.episodeKey,
    showNumber: progress.showNumber,
    mode: progress.mode as JeopardyEpisodeMode,
    status: progress.status as JeopardyEpisodeStatus,
    totalClues: progress.totalClues,
    revealedClueIds: toStringArray(progress.revealedClueIds),
    revealedCount: progress.revealedCount,
    uniqueCluesAnswered: progress.uniqueCluesAnswered,
    startedAt: progress.startedAt.toISOString(),
    lastPlayedAt: progress.lastPlayedAt.toISOString(),
    completedAt: progress.completedAt ? progress.completedAt.toISOString() : null,
    sessionState: toSessionState(progress.sessionState),
  };
}

export async function listEpisodeProgressForUser(userId: string) {
  const rows = await prisma.userJeopardyEpisodeProgress.findMany({
    where: { userId },
    orderBy: { lastPlayedAt: 'desc' },
  });
  return rows.map(serialiseProgress);
}

export async function startEpisodeProgress(params: {
  userId: string;
  episodeKey: string;
  showNumber: number | null;
  mode: JeopardyEpisodeMode;
  totalClues: number;
}) {
  const now = new Date();
  const row = await prisma.userJeopardyEpisodeProgress.upsert({
    where: {
      userId_episodeKey_mode: {
        userId: params.userId,
        episodeKey: params.episodeKey,
        mode: params.mode,
      },
    },
    create: {
      userId: params.userId,
      episodeKey: params.episodeKey,
      showNumber: params.showNumber,
      mode: params.mode,
      status: 'unfinished',
      totalClues: params.totalClues,
      revealedClueIds: [],
      revealedCount: 0,
      uniqueCluesAnswered: 0,
      startedAt: now,
      lastPlayedAt: now,
      completedAt: null,
      sessionState: toPrismaSessionState({}),
    },
    update: {
      showNumber: params.showNumber,
      status: 'unfinished',
      totalClues: params.totalClues,
      revealedClueIds: [],
      revealedCount: 0,
      uniqueCluesAnswered: 0,
      startedAt: now,
      lastPlayedAt: now,
      completedAt: null,
      sessionState: toPrismaSessionState({}),
    },
  });
  return serialiseProgress(row);
}

export async function restartEpisodeProgress(params: {
  userId: string;
  episodeKey: string;
  showNumber: number | null;
  mode: JeopardyEpisodeMode;
  totalClues: number;
}) {
  return startEpisodeProgress(params);
}

export async function revealEpisodeClue(params: {
  userId: string;
  episodeKey: string;
  mode: JeopardyEpisodeMode;
  clueId: string;
}) {
  const existing = await prisma.userJeopardyEpisodeProgress.findUnique({
    where: {
      userId_episodeKey_mode: {
        userId: params.userId,
        episodeKey: params.episodeKey,
        mode: params.mode,
      },
    },
  });
  if (!existing) return null;

  const revealed = new Set(toStringArray(existing.revealedClueIds));
  revealed.add(params.clueId);

  const row = await prisma.userJeopardyEpisodeProgress.update({
    where: { id: existing.id },
    data: {
      status: 'unfinished',
      revealedClueIds: Array.from(revealed),
      revealedCount: revealed.size,
      uniqueCluesAnswered: revealed.size,
      lastPlayedAt: new Date(),
      completedAt: null,
    },
  });
  return serialiseProgress(row);
}

export async function completeEpisodeProgress(params: {
  userId: string;
  episodeKey: string;
  mode: JeopardyEpisodeMode;
  totalClues: number;
}) {
  const existing = await prisma.userJeopardyEpisodeProgress.findUnique({
    where: {
      userId_episodeKey_mode: {
        userId: params.userId,
        episodeKey: params.episodeKey,
        mode: params.mode,
      },
    },
  });
  if (!existing) return null;

  const revealed = toStringArray(existing.revealedClueIds);
  const now = new Date();
  const row = await prisma.userJeopardyEpisodeProgress.update({
    where: { id: existing.id },
    data: {
      status: 'completed',
      totalClues: params.totalClues,
      revealedCount: revealed.length,
      uniqueCluesAnswered: revealed.length,
      completedAt: now,
      lastPlayedAt: now,
    },
  });
  return serialiseProgress(row);
}

export async function updateEpisodeSessionState(params: {
  userId: string;
  episodeKey: string;
  mode: JeopardyEpisodeMode;
  sessionState: JeopardyEpisodeSessionState;
}) {
  const existing = await prisma.userJeopardyEpisodeProgress.findUnique({
    where: {
      userId_episodeKey_mode: {
        userId: params.userId,
        episodeKey: params.episodeKey,
        mode: params.mode,
      },
    },
  });
  if (!existing) return null;

  const row = await prisma.userJeopardyEpisodeProgress.update({
    where: { id: existing.id },
    data: {
      sessionState: toPrismaSessionState(params.sessionState),
      lastPlayedAt: new Date(),
    },
  });
  return serialiseProgress(row);
}
