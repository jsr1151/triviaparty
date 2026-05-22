import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';
import { parsePlayers } from '@/lib/multiplayer';
import {
  computePerItemPoints,
  computeAwardedPoints,
  countMatchingItems,
  getQuestionId,
  getThisOrThatItem,
  isSelectionCorrect,
  resolveQuestionAnswerWindowMs,
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
  'answer-challenged',
  'player-gave-up',
  'transition-started',
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
  'transition-started',
]);
const STATIC_QUESTIONS_FILE_PATH = process.env.MULTIPLAYER_PARTY_QUESTIONS_FILE
  ?? join(process.cwd(), 'public', 'data', 'questions', 'sheets-import-questions.json');
const MAX_LIST_STRIKES = 3;

type StaticMediaQuestion = AnyQuestion & {
  mediaUrl?: string;
  needsMediaReview?: boolean;
};

function elapsedMsSince(startedAt: unknown): number {
  return Math.max(0, Date.now() - new Date(String(startedAt || new Date().toISOString())).getTime());
}

function listModeForQuestion(question: AnyQuestion | null): string {
  return String((question as { partyListMode?: unknown } | null)?.partyListMode || '').toLowerCase();
}

function groupingModeForQuestion(question: AnyQuestion | null): string {
  return String((question as { partyGroupingMode?: unknown } | null)?.partyGroupingMode || 'elimination').toLowerCase();
}

function getGroupedState<T>(state: Record<string, unknown>, key: string): Record<string, T> {
  const value = state[key];
  return value && typeof value === 'object' ? { ...(value as Record<string, T>) } : {};
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const room = await prisma.multiplayerRoom.findUnique({ where: { code: roomCode } });
  if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  const roomGameConfig = room.gameConfig;

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

  function getCurrentQuestion(): AnyQuestion | null {
    const question = updatedState.currentQuestion;
    return question && typeof question === 'object' ? question as AnyQuestion : null;
  }

  function getScores(): Record<string, number> {
    const scores = updatedState.scores;
    if (!scores || typeof scores !== 'object') return {};
    return { ...(scores as Record<string, number>) };
  }

  function awardPointsToPlayer(playerId: string, points: number): Record<string, number> {
    const scores = getScores();
    if (points !== 0) {
      scores[playerId] = Number(scores[playerId] || 0) + points;
      updatedState.scores = scores;
    }
    return scores;
  }

  function updateGroupingTurn(questionId: string) {
    const nextTurnState = getGroupedState<number>(updatedState, 'groupingTurnByQuestion');
    if (!players.length) return nextTurnState;
    const currentTurnIndex = Number(nextTurnState[questionId] || 0);
    nextTurnState[questionId] = (currentTurnIndex + 1) % players.length;
    updatedState.groupingTurnByQuestion = nextTurnState;
    return nextTurnState;
  }

  function canAcceptSubmission(question: AnyQuestion | null): boolean {
    if (!question) return false;
    if (Boolean(updatedState.answerRevealed)) return false;
    const elapsed = elapsedMsSince(updatedState.questionStartedAt || now);
    return elapsed <= resolveQuestionAnswerWindowMs(question, roomGameConfig);
  }

  function scoreEntry(args: {
    question: AnyQuestion;
    questionId: string;
    playerId: string;
    selection: string;
    selectionKey?: 'A' | 'B' | 'C';
    baseEntry: PlayerAnswerEntry;
    priorEntry?: PlayerAnswerEntry;
  }): { entry: PlayerAnswerEntry; scores: Record<string, number> } {
    const scores = getScores();
    if (args.priorEntry?.judged && Number(args.priorEntry.points || 0) !== 0) {
      scores[args.playerId] = Number(scores[args.playerId] || 0) - Number(args.priorEntry.points || 0);
    }
    const scoreMode = resolveMultiplayerScoreMode(roomGameConfig);
    const streaks = (updatedState.streaks && typeof updatedState.streaks === 'object')
      ? { ...(updatedState.streaks as Record<string, number>) }
      : {};
    const correctOrderByQuestion = (updatedState.correctOrderByQuestion && typeof updatedState.correctOrderByQuestion === 'object')
      ? { ...(updatedState.correctOrderByQuestion as Record<string, string[]>) }
      : {};
    const correctOrder = Array.isArray(correctOrderByQuestion[args.questionId]) ? [...correctOrderByQuestion[args.questionId]] : [];
    const correct = isSelectionCorrect(args.question, args.selection, args.selectionKey);
    if (correct) {
      if (!correctOrder.includes(args.playerId)) correctOrder.push(args.playerId);
      const elapsedMs = elapsedMsSince(updatedState.questionStartedAt || now);
      const streak = Number(streaks[args.playerId] || 0) + 1;
      const points = computeAwardedPoints({
        question: args.question,
        scoreMode,
        elapsedMs,
        totalWindowMs: resolveQuestionAnswerWindowMs(args.question, roomGameConfig),
        correctPosition: correctOrder.length,
        streak,
      });
      scores[args.playerId] = Number(scores[args.playerId] || 0) + points;
      streaks[args.playerId] = streak;
      correctOrderByQuestion[args.questionId] = correctOrder;
      updatedState.streaks = streaks;
      updatedState.correctOrderByQuestion = correctOrderByQuestion;
      updatedState.scores = scores;
      return { entry: { ...args.baseEntry, correct: true, judged: true, points }, scores };
    }
    streaks[args.playerId] = 0;
    updatedState.streaks = streaks;
    updatedState.correctOrderByQuestion = correctOrderByQuestion;
    updatedState.scores = scores;
    return { entry: { ...args.baseEntry, correct: false, judged: true, points: 0 }, scores };
  }

  if (resolvedEvent === 'game-started') {
    if (room.mode === 'party') {
      let dbQuestionsWithRelations: Array<Parameters<typeof mapDbQuestionToAnyQuestion>[0]> = [];
      let databaseSourceFailed = false;
      let staticSourceFailed = false;
      try {
        dbQuestionsWithRelations = await prisma.question.findMany({
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
        databaseSourceFailed = true;
        dbQuestionsWithRelations = [];
      }

      let availableQuestions: AnyQuestion[] = dbQuestionsWithRelations
        .map(mapDbQuestionToAnyQuestion)
        .filter((question): question is AnyQuestion => Boolean(question));

      if (!availableQuestions.length) {
        try {
          const raw = JSON.parse(await readFile(STATIC_QUESTIONS_FILE_PATH, 'utf-8'));
          availableQuestions = (Array.isArray(raw?.questions) ? raw.questions : [])
            .filter((q: AnyQuestion) => {
              if (q.type !== 'media') return true;
              const mediaQuestion = q as StaticMediaQuestion;
              if (mediaQuestion.needsMediaReview) return false;
              return !/youtube\.com\/clip\//i.test(mediaQuestion.mediaUrl || '');
            })
            .map((q: AnyQuestion, index: number) => ({ ...q, id: q.id || `static-${index}` }));
        } catch (error) {
          staticSourceFailed = true;
          console.error('Failed to load static multiplayer questions fallback:', error);
          availableQuestions = [];
        }
      }

      const built = buildPartyQuestionsFromRoomConfig(availableQuestions, roomGameConfig);
      const plannedQuestions = built.questions;
      if (!plannedQuestions.length) {
        const error = !availableQuestions.length
          ? databaseSourceFailed || staticSourceFailed
            ? 'No questions available from either source. Please add questions via the Question Creator or contact an administrator.'
            : 'No questions available. Please add questions via the Question Creator.'
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
      updatedState.answerRevealedQuestionId = null;
      updatedState.phase = 'active';
      updatedState.playerAnswers = {};
      updatedState.selectionTallies = {};
      updatedState.correctOrderByQuestion = {};
      updatedState.listStrikesByQuestion = {};
      updatedState.groupingEliminatedItems = {};
      updatedState.groupingClaimedItems = {};
      updatedState.groupingTurnByQuestion = {};
      updatedState.thisOrThatItemIndex = 0;
      updatedState.streaks = {};
      updatedState.buzz = null;
      updatedState.scores = initialScores;
      roomStatus = 'active';
      pushPayload = {
        ...pushPayload,
        status: roomStatus,
        question: plannedQuestions[0],
        questionIndex: 0,
        currentQuestion: plannedQuestions[0],
        currentQuestionIndex: 0,
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
    const currentQuestion = questions[currentIndex];
    const currentItemIndex = Number(updatedState.thisOrThatItemIndex || 0);
    let handledThisOrThatItemAdvance = false;
    if (!Number.isFinite(requestedIndex) && direction === 'next' && currentQuestion?.type === 'this_or_that') {
      const totalItems = Array.isArray(currentQuestion.items) ? currentQuestion.items.length : 0;
      if (currentItemIndex < Math.max(0, totalItems - 1)) {
        const nextItemIndex = currentItemIndex + 1;
        updatedState.thisOrThatItemIndex = nextItemIndex;
        updatedState.currentQuestionIndex = currentIndex;
        updatedState.currentQuestion = currentQuestion;
        updatedState.questionStartedAt = now;
        updatedState.answerRevealed = false;
        updatedState.answerRevealedQuestionId = null;
        updatedState.phase = 'active';
        updatedState.transition = null;
        pushPayload = {
          ...pushPayload,
          question: currentQuestion,
          questionIndex: currentIndex,
          currentQuestion: currentQuestion,
          currentQuestionIndex: currentIndex,
          thisOrThatItemIndex: nextItemIndex,
          totalQuestions: questions.length,
          scores: getScores(),
        };
        handledThisOrThatItemAdvance = true;
      }
    }
    if (!handledThisOrThatItemAdvance) {
    let nextIndex = Number.isFinite(requestedIndex) ? requestedIndex : currentIndex + (direction === 'previous' ? -1 : 1);
    nextIndex = Math.max(0, Math.min(questions.length - 1, nextIndex));
    const nextQuestion = questions[nextIndex];
    updatedState.currentQuestionIndex = nextIndex;
    updatedState.currentQuestion = nextQuestion;
    updatedState.totalQuestions = questions.length;
    updatedState.questionStartedAt = now;
    updatedState.answerRevealed = false;
    updatedState.answerRevealedQuestionId = null;
    updatedState.thisOrThatItemIndex = 0;
    updatedState.buzz = null;
    updatedState.phase = 'active';
    updatedState.transition = null;
    pushPayload = {
      ...pushPayload,
      question: nextQuestion,
      questionIndex: nextIndex,
      currentQuestion: nextQuestion,
      currentQuestionIndex: nextIndex,
      totalQuestions: questions.length,
      scores: getScores(),
    };
    }
  } else if (resolvedEvent === 'answer-revealed') {
    const question = getCurrentQuestion();
    const thisOrThatItemIndex = Number(updatedState.thisOrThatItemIndex || 0);
    const currentQuestionId = question?.type === 'this_or_that'
      ? `${getQuestionId(question)}#${thisOrThatItemIndex}`
      : getQuestionId(question);
    updatedState.answerRevealed = true;
    updatedState.answerRevealedQuestionId = currentQuestionId;
    updatedState.answerRevealedAt = now;
    if (updatedState.buzz && typeof updatedState.buzz === 'object') {
      updatedState.buzz = { ...(updatedState.buzz as Record<string, unknown>), resolved: true, resolvedAt: now };
    }
    if (question) {
      const playerAnswers = (updatedState.playerAnswers && typeof updatedState.playerAnswers === 'object')
        ? { ...(updatedState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
        : {};
      const existingForQuestion = Array.isArray(playerAnswers[currentQuestionId]) ? [...playerAnswers[currentQuestionId]] : [];
      const shouldScoreOnReveal = question.type === 'multiple_choice' || question.type === 'this_or_that';
      if (shouldScoreOnReveal && existingForQuestion.length) {
        const currentItem = getThisOrThatItem(question, thisOrThatItemIndex);
        const scoringQuestion = question.type === 'this_or_that'
          ? { ...question, items: currentItem ? [currentItem] : [] }
          : question;
        const rescored = existingForQuestion.map((entry) => {
          if (!entry.selection && !entry.answer) return entry;
          const scored = scoreEntry({
            question: scoringQuestion,
            questionId: currentQuestionId,
            playerId: entry.playerId,
            selection: entry.selection || entry.answer || '',
            selectionKey: entry.selectionKey,
            baseEntry: { ...entry, submittedAt: entry.submittedAt || now },
            priorEntry: entry,
          });
          scoresToBroadcast = scored.scores;
          return scored.entry;
        });
        playerAnswers[currentQuestionId] = rescored;
        updatedState.playerAnswers = playerAnswers;
      }
    }
    pushPayload = {
      ...pushPayload,
      questionId: currentQuestionId,
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
    if (!canAcceptSubmission(question)) {
      return NextResponse.json({ ok: true, ignored: 'question-closed' });
    }
    const thisOrThatItemIndex = Number(updatedState.thisOrThatItemIndex || 0);
    const baseQuestionId = getQuestionId(question);
    const questionId = String((payload as { questionId?: unknown }).questionId || (
      question?.type === 'this_or_that'
        ? `${baseQuestionId}#${thisOrThatItemIndex}`
        : baseQuestionId
    ));
    const requestedPlayerId = String((payload as { playerId?: unknown }).playerId || '');
    const fallbackName = String((payload as { playerName?: unknown }).playerName || 'Player');
    const player = players.find((entry) => entry.id === requestedPlayerId || entry.name === fallbackName);
    const playerId = player?.id || requestedPlayerId || 'unknown';
    const playerName = player?.name || fallbackName;
    const submittedAt = now;
    const rawAnswer = String((payload as { answer?: unknown }).answer || '');
    const selection = String((payload as { selection?: unknown }).selection || '');
    const selectionKey = ((payload as { selectionKey?: unknown }).selectionKey || undefined) as 'A' | 'B' | 'C' | undefined;
    const groupingSelection = Array.isArray((payload as { groupingSelection?: unknown }).groupingSelection)
      ? ((payload as { groupingSelection?: string[] }).groupingSelection || []).filter(Boolean)
      : [];

    const playerAnswers = (updatedState.playerAnswers && typeof updatedState.playerAnswers === 'object')
      ? { ...(updatedState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
      : {};
    const existingForQuestion = Array.isArray(playerAnswers[questionId]) ? [...playerAnswers[questionId]] : [];
    const playerEntries = existingForQuestion.filter((entry) => entry.playerId === playerId);
    const priorEntry = [...playerEntries].reverse().find(Boolean);
    if (playerEntries.some((entry) => entry.gaveUp)) {
      return NextResponse.json({ ok: true, ignored: 'player-gave-up' });
    }
    if (question?.type === 'open_ended' && playerEntries.length) {
      return NextResponse.json({ ok: true, ignored: 'already-submitted' });
    }
    const baseEntry: PlayerAnswerEntry = {
      playerId,
      playerName,
      questionId,
      answer: rawAnswer || selection || undefined,
      selection: selection || undefined,
      selectionKey,
      groupingSelection: groupingSelection.length ? groupingSelection : undefined,
      questionItemIndex: question?.type === 'this_or_that' ? thisOrThatItemIndex : undefined,
      challenged: priorEntry?.challenged || false,
      strikeCount: priorEntry?.strikeCount || 0,
      submittedAt,
    };

    let nextEntry = baseEntry;
    if (question?.type === 'grouping') {
      const submittedItems = Array.from(new Set((groupingSelection.length ? groupingSelection : (rawAnswer || selection).split('|'))
        .map((item) => String(item).trim())
        .filter(Boolean)));
      if (!submittedItems.length) {
        return NextResponse.json({ ok: true, ignored: 'empty-grouping-selection' });
      }
      const mode = groupingModeForQuestion(question);
      const priorSelections = Array.from(new Set(playerEntries.flatMap((entry) => entry.groupingSelection || [])));
      let acceptedItems = submittedItems.filter((item) => !priorSelections.includes(item));
      if (mode === 'turns' || mode === 'blitz') acceptedItems = acceptedItems.slice(0, 1);
      if (!acceptedItems.length) {
        return NextResponse.json({ ok: true, ignored: 'duplicate-grouping-selection' });
      }
      if (mode === 'turns') {
        const groupingTurns = getGroupedState<number>(updatedState, 'groupingTurnByQuestion');
        const activeTurnIndex = Number(groupingTurns[questionId] || 0);
        const activePlayer = players[activeTurnIndex];
        if (activePlayer?.id && activePlayer.id !== playerId) {
          return NextResponse.json({ ok: true, ignored: 'not-player-turn' });
        }
      }

      const correctItems = Array.isArray(question.correctItems) ? question.correctItems : [];
      let newlyCorrect = acceptedItems.filter((item) => countMatchingItems([item], correctItems) > 0);
      if (mode === 'blitz') {
        const claimedState = getGroupedState<Record<string, string>>(updatedState, 'groupingClaimedItems');
        const claimedForQuestion = { ...(claimedState[questionId] || {}) };
        newlyCorrect = newlyCorrect.filter((item) => !claimedForQuestion[item]);
        newlyCorrect.forEach((item) => {
          claimedForQuestion[item] = playerId;
        });
        claimedState[questionId] = claimedForQuestion;
        updatedState.groupingClaimedItems = claimedState;
      }

      if (mode === 'elimination') {
        const eliminatedState = getGroupedState<string[]>(updatedState, 'groupingEliminatedItems');
        const incorrectItems = acceptedItems.filter((item) => countMatchingItems([item], correctItems) === 0);
        eliminatedState[questionId] = Array.from(new Set([...(eliminatedState[questionId] || []), ...incorrectItems]));
        updatedState.groupingEliminatedItems = eliminatedState;
      }

      if (mode === 'turns') {
        updateGroupingTurn(questionId);
      }

      const allSelections = Array.from(new Set([...priorSelections, ...acceptedItems]));
      const awardedPoints = newlyCorrect.length * computePerItemPoints(question, Math.max(1, correctItems.length));
      if (awardedPoints > 0) {
        scoresToBroadcast = awardPointsToPlayer(playerId, awardedPoints);
        pushPayload = { ...pushPayload, scores: scoresToBroadcast };
      }
      nextEntry = {
        ...baseEntry,
        answer: allSelections.join(' | '),
        groupingSelection: allSelections,
        judged: awardedPoints > 0 || Boolean(priorEntry?.judged),
        correct: awardedPoints > 0 || Boolean(priorEntry?.correct),
        points: Number(priorEntry?.points || 0) + awardedPoints,
      };
      playerAnswers[questionId] = upsertPlayerAnswer(existingForQuestion, nextEntry);
      updatedState.playerAnswers = playerAnswers;
      pushPayload = { ...pushPayload, questionId, answer: nextEntry };
    } else if (question?.type === 'list') {
      const priorAnswers = playerEntries.map((entry) => entry.answer || entry.selection || '');
      const submittedValue = selection || rawAnswer;
      if (!submittedValue.trim()) {
        return NextResponse.json({ ok: true, ignored: 'empty-list-answer' });
      }
      if (countMatchingItems([submittedValue], priorAnswers) > 0) {
        return NextResponse.json({ ok: true, ignored: 'duplicate-list-answer' });
      }
      const correct = countMatchingItems([submittedValue], question.answers || []) > 0;
      const priorStrikeCount = playerEntries.reduce((highest, entry) => Math.max(highest, Number(entry.strikeCount || 0)), 0);
      const strikes = listModeForQuestion(question) === 'strikes' && !correct ? priorStrikeCount + 1 : priorStrikeCount;
      const awardedPoints = correct ? computePerItemPoints(question, Math.max(1, (question.answers || []).length)) : 0;
      if (awardedPoints > 0) {
        scoresToBroadcast = awardPointsToPlayer(playerId, awardedPoints);
        pushPayload = { ...pushPayload, scores: scoresToBroadcast };
      }
      nextEntry = {
        ...baseEntry,
        judged: true,
        correct,
        points: awardedPoints,
        strikeCount: strikes,
        gaveUp: strikes >= MAX_LIST_STRIKES,
      };
      playerAnswers[questionId] = [...existingForQuestion, nextEntry];
      updatedState.playerAnswers = playerAnswers;
      pushPayload = { ...pushPayload, questionId, answer: nextEntry };
    } else {
      const shouldScoreNow = Boolean(question && (question.type === 'open_ended' || question.type === 'prompt' || question.type === 'media'));
      if (question && shouldScoreNow && (selection || rawAnswer)) {
      const scored = scoreEntry({
        question,
        questionId,
        playerId,
        selection: selection || rawAnswer,
        selectionKey,
        baseEntry,
        priorEntry,
      });
      nextEntry = scored.entry;
      scoresToBroadcast = scored.scores;
      pushPayload = { ...pushPayload, scores: scored.scores };
      } else if (priorEntry?.judged || priorEntry?.correct !== undefined) {
      nextEntry = {
        ...nextEntry,
        judged: priorEntry.judged,
        correct: priorEntry.correct,
        points: priorEntry.points,
      };
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
    }
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

    const nextEntry = { ...existingForQuestion[answerIndex] };
    const scored = correct
      ? scoreEntry({
        question,
        questionId,
        playerId,
        selection: nextEntry.selection || nextEntry.answer || '',
        selectionKey: nextEntry.selectionKey,
        baseEntry: nextEntry,
        priorEntry: nextEntry,
      })
      : { entry: { ...nextEntry, correct: false, points: 0, judged: true }, scores: getScores() };
    if (!correct && nextEntry.judged && Number(nextEntry.points || 0) !== 0) {
      scored.scores[playerId] = Number(scored.scores[playerId] || 0) - Number(nextEntry.points || 0);
      updatedState.scores = scored.scores;
    }
    if (updatedState.buzz && typeof updatedState.buzz === 'object') {
      updatedState.buzz = { ...(updatedState.buzz as Record<string, unknown>), resolved: true, resolvedAt: now };
    }
    existingForQuestion[answerIndex] = scored.entry;
    playerAnswers[questionId] = existingForQuestion;
    updatedState.playerAnswers = playerAnswers;
    pushPayload = { ...pushPayload, questionId, answer: scored.entry, scores: scored.scores };
    scoresToBroadcast = scored.scores;
  } else if (resolvedEvent === 'answer-challenged') {
    const question = getCurrentQuestion();
    const questionId = String((payload as { questionId?: unknown }).questionId || getQuestionId(question));
    const playerId = String((payload as { playerId?: unknown }).playerId || '');
    const playerAnswers = (updatedState.playerAnswers && typeof updatedState.playerAnswers === 'object')
      ? { ...(updatedState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
      : {};
    const existingForQuestion = Array.isArray(playerAnswers[questionId]) ? [...playerAnswers[questionId]] : [];
    const index = existingForQuestion.findIndex((entry) => entry.playerId === playerId);
    if (index >= 0) {
      existingForQuestion[index] = { ...existingForQuestion[index], challenged: true };
      playerAnswers[questionId] = existingForQuestion;
      updatedState.playerAnswers = playerAnswers;
      pushPayload = { ...pushPayload, questionId, answer: existingForQuestion[index] };
    }
  } else if (resolvedEvent === 'player-gave-up') {
    const question = getCurrentQuestion();
    if (!question) return NextResponse.json({ error: 'No active question.' }, { status: 400 });
    const questionId = String((payload as { questionId?: unknown }).questionId || getQuestionId(question));
    const playerId = String((payload as { playerId?: unknown }).playerId || '');
    const playerName = String((payload as { playerName?: unknown }).playerName || 'Player');
    const playerAnswers = (updatedState.playerAnswers && typeof updatedState.playerAnswers === 'object')
      ? { ...(updatedState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
      : {};
    const existingForQuestion = Array.isArray(playerAnswers[questionId]) ? playerAnswers[questionId] : [];
    const mergedForQuestion = upsertPlayerAnswer(existingForQuestion, {
      playerId,
      playerName,
      questionId,
      gaveUp: true,
      judged: true,
      correct: false,
      points: 0,
      submittedAt: now,
    });
    playerAnswers[questionId] = mergedForQuestion;
    updatedState.playerAnswers = playerAnswers;
    pushPayload = { ...pushPayload, questionId, answer: mergedForQuestion.find((entry) => entry.playerId === playerId) };
  } else if (resolvedEvent === 'transition-started') {
    const durationMs = Number((payload as { durationMs?: unknown }).durationMs || 3000);
    updatedState.phase = 'transition';
    updatedState.transition = { type: 'scoreboard', startedAt: now, durationMs };
    pushPayload = { ...pushPayload, transition: updatedState.transition };
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
  await pusherServer.trigger(`game-${roomCode}`, 'state-updated', {
    roomCode,
    status: roomStatus,
    gameState: updatedState,
    transition: (updatedState.transition && typeof updatedState.transition === 'object')
      ? updatedState.transition
      : undefined,
  });
  if (scoresToBroadcast) {
    await pusherServer.trigger(`game-${roomCode}`, 'score-updated', {
      roomCode,
      scores: scoresToBroadcast,
    });
  }

  return NextResponse.json({ ok: true });
}
