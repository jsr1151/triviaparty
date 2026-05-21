import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';
import { parsePlayers } from '@/lib/multiplayer';
import {
  computeAwardedPoints,
  getQuestionId,
  isSelectionCorrect,
  resolveMultiplayerScoreMode,
  tallySelections,
  upsertPlayerAnswer,
  type PlayerAnswerEntry,
} from '@/lib/multiplayer-game';
import { buildPartyQuestionsFromRoomConfig, mapDbQuestionToAnyQuestion } from '@/lib/server-multiplayer-room';
import { pusherServer } from '@/lib/pusher';
import type { AnyQuestion } from '@/types/questions';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'game-started',
  'question-changed',
  'answer-revealed',
  'game-finished',
  'player-answered',
  'player-selected',
  'player-buzzed',
  'answer-judged',
  'answer-revealed',
  'score-updated',
  'state-updated',
  'answer-submitted',
  'buzz-in',
  'wager-submitted',
]);
const HOST_ONLY_EVENTS = new Set([
  'game-started',
  'question-changed',
  'answer-revealed',
  'game-finished',
  'answer-judged',
  'score-updated',
  'state-updated',
]);
const DEFAULT_ANSWER_WINDOW_MS = 15000;
const STATIC_QUESTIONS_FILE_PATH = join(process.cwd(), 'public', 'data', 'questions', 'sheets-import-questions.json');

type StaticMediaQuestion = AnyQuestion & {
  mediaUrl?: string;
  needsMediaReview?: boolean;
};

function resolveAnswerWindowMs(gameConfig: unknown): number {
  const configured = Number((gameConfig as { answerWindowMs?: unknown } | null)?.answerWindowMs || DEFAULT_ANSWER_WINDOW_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_ANSWER_WINDOW_MS;
}

function elapsedMsSince(startedAt: unknown): number {
  return Math.max(0, Date.now() - new Date(String(startedAt || new Date().toISOString())).getTime());
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const room = await prisma.multiplayerRoom.findUnique({ where: { code: roomCode } });
  if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const event = String(body?.event || '').trim();
  const payload = body?.payload ?? {};

  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: 'Unsupported event.' }, { status: 400 });
  }
  const user = process.env.GITHUB_PAGES === 'true' ? null : await getUserFromRequest(req);
  const resolvedEvent = event === 'answer-submitted'
    ? 'player-answered'
    : event === 'buzz-in'
      ? 'player-buzzed'
      : event;
  if (HOST_ONLY_EVENTS.has(resolvedEvent) && room.hostUserId && room.hostUserId !== user?.id) {
    return NextResponse.json({ error: 'Only the host can perform this action.' }, { status: 403 });
  }

  if (!pusherServer) {
    return NextResponse.json({ error: 'Pusher is not configured.' }, { status: 503 });
  }

  const players = parsePlayers(room.players);
  const currentState = (room.gameState && typeof room.gameState === 'object') ? room.gameState as Record<string, unknown> : {};
  const updatedState: Record<string, unknown> = { ...currentState };
  const now = new Date().toISOString();
  let roomStatus = room.status;
  let pushPayload: Record<string, unknown> = { roomCode };
  let scoresToBroadcast: Record<string, number> | null = null;
  const answerWindowMs = resolveAnswerWindowMs(room.gameConfig);

  function getCurrentQuestion(): AnyQuestion | null {
    const question = updatedState.currentQuestion;
    return question && typeof question === 'object' ? question as AnyQuestion : null;
  }

  function getScores(): Record<string, number> {
    const scores = updatedState.scores;
    if (!scores || typeof scores !== 'object') return {};
    return { ...(scores as Record<string, number>) };
  }

  if (resolvedEvent === 'game-started') {
    if (room.mode === 'party') {
      let rawDbQuestions: Array<Parameters<typeof mapDbQuestionToAnyQuestion>[0]> = [];
      try {
        rawDbQuestions = await prisma.question.findMany({
          include: {
            category: true,
            multipleChoice: true,
            openEnded: true,
            listQuestion: true,
            groupingQuestion: true,
            thisOrThat: true,
            rankingQuestion: true,
            mediaQuestion: true,
            promptQuestion: true,
          },
        });
      } catch {
        rawDbQuestions = [];
      }

      let allQuestionsForGame: AnyQuestion[] = rawDbQuestions
        .map(mapDbQuestionToAnyQuestion)
        .filter((question): question is AnyQuestion => Boolean(question));

      if (!allQuestionsForGame.length) {
        try {
          const raw = JSON.parse(readFileSync(STATIC_QUESTIONS_FILE_PATH, 'utf-8'));
          allQuestionsForGame = (Array.isArray(raw?.questions) ? raw.questions : [])
            .filter((q: AnyQuestion) => {
              if (q.type !== 'media') return true;
              const mediaQuestion = q as StaticMediaQuestion;
              if (mediaQuestion.needsMediaReview) return false;
              return !/youtube\.com\/clip\//i.test(mediaQuestion.mediaUrl || '');
            })
            .map((q: AnyQuestion, index: number) => ({ ...q, id: q.id || `static-${index}` }));
        } catch {
          allQuestionsForGame = [];
        }
      }

      const built = buildPartyQuestionsFromRoomConfig(allQuestionsForGame, room.gameConfig);
      const plannedQuestions = built.questions;
      if (!plannedQuestions.length) {
        const error = !allQuestionsForGame.length
          ? 'No questions found in the database or static question file. Please add questions via the Question Creator before starting a multiplayer game.'
          : built.failureHint
          ? `No questions matched current filters (${built.failureHint}). Try using mixed difficulty or random categories for the round.`
          : 'No questions available for this room configuration. Try broadening difficulty/category filters or adding more question types.';
        return NextResponse.json({ error }, { status: 400 });
      }
      const initialScores = players.reduce<Record<string, number>>((acc, player) => {
        acc[player.id] = Number(getScores()[player.id] || 0);
        return acc;
      }, {});
      updatedState.questions = plannedQuestions;
      updatedState.currentQuestionIndex = 0;
      updatedState.currentQuestion = plannedQuestions[0];
      updatedState.totalQuestions = plannedQuestions.length;
      updatedState.questionStartedAt = now;
      updatedState.answerRevealed = false;
      updatedState.phase = 'active';
      updatedState.playerAnswers = {};
      updatedState.selectionTallies = {};
      updatedState.correctOrderByQuestion = {};
      updatedState.streaks = {};
      updatedState.buzz = null;
      updatedState.scores = initialScores;
      roomStatus = 'active';
      pushPayload = {
        ...pushPayload,
        status: roomStatus,
        question: plannedQuestions[0],
        questionIndex: 0,
        totalQuestions: plannedQuestions.length,
        scores: initialScores,
      };
    } else {
      updatedState.phase = 'active';
      updatedState.buzz = null;
      roomStatus = 'active';
      pushPayload = { ...pushPayload, status: roomStatus, phase: 'active' };
    }
  } else if (resolvedEvent === 'question-changed') {
    const questions = Array.isArray(updatedState.questions) ? updatedState.questions as AnyQuestion[] : [];
    if (!questions.length) {
      return NextResponse.json({ error: 'Game has not been started.' }, { status: 400 });
    }
    const currentIndex = Number(updatedState.currentQuestionIndex || 0);
    const requestedIndex = Number((payload as { index?: unknown }).index);
    const direction = String((payload as { direction?: unknown }).direction || 'next').toLowerCase();
    let nextIndex = Number.isFinite(requestedIndex) ? requestedIndex : currentIndex + (direction === 'previous' ? -1 : 1);
    nextIndex = Math.max(0, Math.min(questions.length - 1, nextIndex));
    const nextQuestion = questions[nextIndex];
    updatedState.currentQuestionIndex = nextIndex;
    updatedState.currentQuestion = nextQuestion;
    updatedState.totalQuestions = questions.length;
    updatedState.questionStartedAt = now;
    updatedState.answerRevealed = false;
    updatedState.buzz = null;
    pushPayload = {
      ...pushPayload,
      question: nextQuestion,
      questionIndex: nextIndex,
      totalQuestions: questions.length,
      scores: getScores(),
    };
  } else if (resolvedEvent === 'answer-revealed') {
    updatedState.answerRevealed = true;
    updatedState.answerRevealedAt = now;
    if (updatedState.buzz && typeof updatedState.buzz === 'object') {
      updatedState.buzz = { ...(updatedState.buzz as Record<string, unknown>), resolved: true, resolvedAt: now };
    }
    const question = getCurrentQuestion();
    pushPayload = {
      ...pushPayload,
      questionId: getQuestionId(question),
      question,
      revealedAt: now,
    };
  } else if (resolvedEvent === 'game-finished') {
    updatedState.phase = 'finished';
    updatedState.finishedAt = now;
    roomStatus = 'finished';
    pushPayload = { ...pushPayload, status: roomStatus, scores: getScores() };
  } else if (resolvedEvent === 'player-buzzed') {
    const existingBuzz = updatedState.buzz && typeof updatedState.buzz === 'object' ? updatedState.buzz as Record<string, unknown> : null;
    if (room.mode === 'jeopardy' && existingBuzz?.playerId && !existingBuzz?.resolved) {
      return NextResponse.json({ ok: true, ignored: 'buzz-locked' });
    }
    const requestedPlayerId = String((payload as { playerId?: unknown }).playerId || '');
    const fallbackName = String((payload as { playerName?: unknown; player?: unknown }).playerName || (payload as { player?: unknown }).player || 'Player');
    const player = players.find((entry) => entry.id === requestedPlayerId || entry.name === fallbackName);
    const buzzPayload = {
      playerId: player?.id || requestedPlayerId || 'unknown',
      playerName: player?.name || fallbackName,
      at: now,
      resolved: false,
    };
    updatedState.buzz = buzzPayload;
    pushPayload = { ...pushPayload, ...buzzPayload };
  } else if (resolvedEvent === 'player-answered' || resolvedEvent === 'player-selected') {
    const question = getCurrentQuestion();
    const questionId = String((payload as { questionId?: unknown }).questionId || getQuestionId(question));
    const requestedPlayerId = String((payload as { playerId?: unknown }).playerId || '');
    const fallbackName = String((payload as { playerName?: unknown }).playerName || 'Player');
    const player = players.find((entry) => entry.id === requestedPlayerId || entry.name === fallbackName);
    const playerId = player?.id || requestedPlayerId || 'unknown';
    const playerName = player?.name || fallbackName;
    const submittedAt = now;
    const rawAnswer = String((payload as { answer?: unknown }).answer || '');
    const selection = String((payload as { selection?: unknown }).selection || '');
    const selectionKey = ((payload as { selectionKey?: unknown }).selectionKey || undefined) as 'A' | 'B' | 'C' | undefined;

    const playerAnswers = (updatedState.playerAnswers && typeof updatedState.playerAnswers === 'object')
      ? { ...(updatedState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
      : {};
    const existingForQuestion = Array.isArray(playerAnswers[questionId]) ? playerAnswers[questionId] : [];
    const baseEntry: PlayerAnswerEntry = {
      playerId,
      playerName,
      questionId,
      answer: rawAnswer || selection || undefined,
      selection: selection || undefined,
      selectionKey,
      submittedAt,
    };
    let nextEntry = baseEntry;
    const scoreMode = resolveMultiplayerScoreMode(room.gameConfig);
    const isAutoScored = Boolean(question && (question.type === 'multiple_choice' || question.type === 'this_or_that' || question.type === 'media'));

    const scores = getScores();
    const streaks = (updatedState.streaks && typeof updatedState.streaks === 'object')
      ? { ...(updatedState.streaks as Record<string, number>) }
      : {};
    const correctOrderByQuestion = (updatedState.correctOrderByQuestion && typeof updatedState.correctOrderByQuestion === 'object')
      ? { ...(updatedState.correctOrderByQuestion as Record<string, string[]>) }
      : {};
    const correctOrder = Array.isArray(correctOrderByQuestion[questionId]) ? [...correctOrderByQuestion[questionId]] : [];

    if (question && isAutoScored && (resolvedEvent === 'player-selected' || selection || rawAnswer)) {
      const correct = isSelectionCorrect(question, selection || rawAnswer, selectionKey);
      if (correct) {
        if (!correctOrder.includes(playerId)) correctOrder.push(playerId);
        const elapsedMs = elapsedMsSince(updatedState.questionStartedAt || now);
        const streak = Number(streaks[playerId] || 0) + 1;
        const points = computeAwardedPoints({
          question,
          scoreMode,
          elapsedMs,
          totalWindowMs: answerWindowMs,
          correctPosition: correctOrder.length,
          streak,
        });
        scores[playerId] = Number(scores[playerId] || 0) + points;
        streaks[playerId] = streak;
        nextEntry = { ...baseEntry, correct: true, judged: true, points };
      } else {
        streaks[playerId] = 0;
        nextEntry = { ...baseEntry, correct: false, judged: true, points: 0 };
      }
      correctOrderByQuestion[questionId] = correctOrder;
      updatedState.scores = scores;
      updatedState.streaks = streaks;
      updatedState.correctOrderByQuestion = correctOrderByQuestion;
      pushPayload = { ...pushPayload, scores };
      scoresToBroadcast = scores;
    }
    const mergedForQuestion = upsertPlayerAnswer(existingForQuestion, nextEntry);
    playerAnswers[questionId] = mergedForQuestion;
    updatedState.playerAnswers = playerAnswers;
    if (resolvedEvent === 'player-selected') {
      const selectionTallies = (updatedState.selectionTallies && typeof updatedState.selectionTallies === 'object')
        ? { ...(updatedState.selectionTallies as Record<string, Record<string, number>>) }
        : {};
      selectionTallies[questionId] = tallySelections(mergedForQuestion);
      updatedState.selectionTallies = selectionTallies;
      pushPayload = { ...pushPayload, tally: selectionTallies[questionId] };
    }
    pushPayload = { ...pushPayload, questionId, answer: nextEntry };
  } else if (resolvedEvent === 'answer-judged') {
    const question = getCurrentQuestion();
    const questionId = String((payload as { questionId?: unknown }).questionId || getQuestionId(question));
    const playerId = String((payload as { playerId?: unknown }).playerId || '');
    const correct = Boolean((payload as { correct?: unknown }).correct);
    const playerAnswers = (updatedState.playerAnswers && typeof updatedState.playerAnswers === 'object')
      ? { ...(updatedState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
      : {};
    const existingForQuestion = Array.isArray(playerAnswers[questionId]) ? [...playerAnswers[questionId]] : [];
    const answerIndex = existingForQuestion.findIndex((entry) => entry.playerId === playerId);
    if (answerIndex < 0 || !question) {
      return NextResponse.json({ error: 'Answer not found for player.' }, { status: 404 });
    }

    const scores = getScores();
    const streaks = (updatedState.streaks && typeof updatedState.streaks === 'object')
      ? { ...(updatedState.streaks as Record<string, number>) }
      : {};
    const scoreMode = resolveMultiplayerScoreMode(room.gameConfig);
    const correctOrderByQuestion = (updatedState.correctOrderByQuestion && typeof updatedState.correctOrderByQuestion === 'object')
      ? { ...(updatedState.correctOrderByQuestion as Record<string, string[]>) }
      : {};
    const correctOrder = Array.isArray(correctOrderByQuestion[questionId]) ? [...correctOrderByQuestion[questionId]] : [];

    const nextEntry = { ...existingForQuestion[answerIndex] };
    if (correct) {
      if (!correctOrder.includes(playerId)) correctOrder.push(playerId);
      const elapsedMs = elapsedMsSince(updatedState.questionStartedAt || now);
      const streak = Number(streaks[playerId] || 0) + 1;
      const points = computeAwardedPoints({
        question,
        scoreMode,
        elapsedMs,
        totalWindowMs: answerWindowMs,
        correctPosition: correctOrder.length,
        streak,
      });
      scores[playerId] = Number(scores[playerId] || 0) + points;
      streaks[playerId] = streak;
      nextEntry.correct = true;
      nextEntry.points = points;
      nextEntry.judged = true;
    } else {
      streaks[playerId] = 0;
      nextEntry.correct = false;
      nextEntry.points = 0;
      nextEntry.judged = true;
    }
    if (updatedState.buzz && typeof updatedState.buzz === 'object') {
      updatedState.buzz = { ...(updatedState.buzz as Record<string, unknown>), resolved: true, resolvedAt: now };
    }
    existingForQuestion[answerIndex] = nextEntry;
    playerAnswers[questionId] = existingForQuestion;
    correctOrderByQuestion[questionId] = correctOrder;
    updatedState.playerAnswers = playerAnswers;
    updatedState.correctOrderByQuestion = correctOrderByQuestion;
    updatedState.streaks = streaks;
    updatedState.scores = scores;
    pushPayload = { ...pushPayload, questionId, answer: nextEntry, scores };
    scoresToBroadcast = scores;
  } else if (resolvedEvent === 'score-updated' && payload && typeof payload === 'object') {
    updatedState.scores = (payload as { scores?: unknown }).scores ?? getScores();
  } else if (resolvedEvent === 'state-updated' && payload && typeof payload === 'object') {
    Object.assign(updatedState, payload as Record<string, unknown>);
  } else if (resolvedEvent === 'wager-submitted') {
    const wagers = (updatedState.wagers && typeof updatedState.wagers === 'object') ? updatedState.wagers as Record<string, unknown> : {};
    const submittedBy = String((payload as { playerId?: string }).playerId || 'unknown');
    updatedState.wagers = { ...wagers, [submittedBy]: payload };
  }

  await prisma.multiplayerRoom.update({
    where: { code: roomCode },
    data: {
      gameState: updatedState as Prisma.InputJsonValue,
      status: roomStatus,
    },
  });

  await pusherServer.trigger(`game-${roomCode}`, resolvedEvent, {
    ...pushPayload,
  });
  if (scoresToBroadcast) {
    await pusherServer.trigger(`game-${roomCode}`, 'score-updated', {
      roomCode,
      scores: scoresToBroadcast,
    });
  }

  return NextResponse.json({ ok: true });
}
