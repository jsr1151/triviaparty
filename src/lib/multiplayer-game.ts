import { applyBuzzerBeater, applyComboBreaker, applyRace, basePointsForDifficulty } from '@/lib/multiplayer-scoring';
import type { AnyQuestion } from '@/types/questions';

export type MultiplayerScoreMode = 'standard' | 'buzzer_beater' | 'race' | 'combo_breaker';

export type PlayerAnswerEntry = {
  playerId: string;
  playerName: string;
  questionId: string;
  answer?: string;
  selection?: string;
  selectionKey?: 'A' | 'B' | 'C';
  groupingSelection?: string[];
  challenged?: boolean;
  gaveUp?: boolean;
  strikeCount?: number;
  questionItemIndex?: number;
  submittedAt: string;
  correct?: boolean;
  judged?: boolean;
  points?: number;
};

export function resolveMultiplayerScoreMode(gameConfig: unknown): MultiplayerScoreMode {
  if (!gameConfig || typeof gameConfig !== 'object') return 'standard';
  const config = gameConfig as { scoringMode?: unknown; multiplayerScoringMode?: unknown };
  const raw = String(
    config.scoringMode
      || config.multiplayerScoringMode
      || 'standard',
  )
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (raw === 'buzzer_beater' || raw === 'race' || raw === 'combo_breaker') return raw;
  return 'standard';
}

export function getQuestionId(question: AnyQuestion | null | undefined): string {
  if (!question) return 'unknown-question';
  return String(question.id || `question-${question.type}`);
}

export function getThisOrThatItem(question: AnyQuestion | null | undefined, index: number) {
  if (!question || question.type !== 'this_or_that') return null;
  const items = Array.isArray(question.items) ? question.items : [];
  if (index < 0 || index >= items.length) return null;
  return items[index] ?? null;
}

export function extractMultipleChoiceCorrectAnswer(question: AnyQuestion): string {
  if (question.type === 'multiple_choice') {
    const options = (question.options || []).map((option) => option.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim());
    if (question.correctAnswer?.trim()) return question.correctAnswer.trim();
    const starred = (question.options || []).find((option) => option.trim().startsWith('*') || option.trim().endsWith('*'));
    if (starred) return starred.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
    return options[0] || '';
  }
  if (question.type === 'media') {
    if (question.answer?.trim()) return question.answer.trim();
    return '';
  }
  return '';
}

function normalizeAnswerValue(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function answerMatchesAny(input: string, expected: string[]): boolean {
  const normalizedInput = normalizeAnswerValue(input);
  if (!normalizedInput) return false;
  return expected.some((value) => normalizeAnswerValue(value) === normalizedInput);
}

export function resolveAnswerWindowMs(gameConfig: unknown): number {
  const configured = Number((gameConfig as { answerWindowMs?: unknown } | null)?.answerWindowMs || 15000);
  return Number.isFinite(configured) && configured > 0 ? configured : 15000;
}

export function resolveQuestionAnswerWindowMs(question: AnyQuestion | null | undefined, gameConfig: unknown): number {
  // A missing or zero-valued per-question limit falls back to the room-level answer window.
  const partyLimitSec = Number((question as { partyTimeLimitSec?: unknown } | null)?.partyTimeLimitSec || 0);
  if (question?.type === 'list') {
    const listMode = String((question as { partyListMode?: unknown } | null)?.partyListMode || '').toLowerCase();
    if (listMode === 'timed' && Number.isFinite(partyLimitSec) && partyLimitSec > 0) {
      return Math.max(1000, partyLimitSec * 1000);
    }
    return resolveAnswerWindowMs(gameConfig);
  }
  if (Number.isFinite(partyLimitSec) && partyLimitSec > 0) {
    return Math.max(1000, partyLimitSec * 1000);
  }
  return resolveAnswerWindowMs(gameConfig);
}

export function calculateRemainingTimeMs(
  questionStartedAt: unknown,
  question: AnyQuestion | null | undefined,
  gameConfig: unknown,
  nowMs = Date.now(),
): number {
  const totalWindowMs = resolveQuestionAnswerWindowMs(question, gameConfig);
  const startedAtValue = typeof questionStartedAt === 'string' || questionStartedAt instanceof Date
    ? String(questionStartedAt)
    : '';
  const startedAtMs = Date.parse(startedAtValue);
  if (!Number.isFinite(startedAtMs)) return totalWindowMs;
  return Math.max(0, startedAtMs + totalWindowMs - nowMs);
}

export function computePerItemPoints(question: AnyQuestion, totalItems: number): number {
  const safeTotalItems = Number.isFinite(totalItems) && totalItems > 0 ? totalItems : 1;
  return Math.max(1, Math.round(basePointsForDifficulty(question.difficulty) / safeTotalItems));
}

export function countMatchingItems(selected: string[], expected: string[]): number {
  const expectedValues = new Set(expected.map((value) => normalizeAnswerValue(value)).filter(Boolean));
  return Array.from(new Set(selected.map((value) => normalizeAnswerValue(value)).filter(Boolean)))
    .filter((value) => expectedValues.has(value))
    .length;
}

export function isSelectionCorrect(question: AnyQuestion, selection: string, selectionKey?: 'A' | 'B' | 'C'): boolean {
  if (question.type === 'multiple_choice' || question.type === 'media') {
    const expected = extractMultipleChoiceCorrectAnswer(question);
    return Boolean(expected) && normalizeAnswerValue(expected) === normalizeAnswerValue(selection);
  }
  if (question.type === 'this_or_that') {
    if (!selection && !selectionKey) return false;
    const items = Array.isArray(question.items) ? question.items : [];
    if (!items.length) return false;
    const expected = items[0]?.answer;
    if (selectionKey) return expected === selectionKey;
    const categories = [question.categoryA, question.categoryB, question.categoryC].filter(Boolean);
    const index = categories.findIndex((label) => (label || '').trim() === selection.trim());
    const mapped = index === 0 ? 'A' : index === 1 ? 'B' : index === 2 ? 'C' : null;
    return mapped ? expected === mapped : false;
  }
  if (question.type === 'open_ended' || question.type === 'prompt') {
    const expected = [question.answer || '', ...(question.acceptedAnswers || [])].filter(Boolean);
    return answerMatchesAny(selection, expected);
  }
  if (question.type === 'list') {
    const expected = (question.answers || []).filter(Boolean);
    return answerMatchesAny(selection, expected);
  }
  return false;
}

export function computeAwardedPoints(args: {
  question: AnyQuestion;
  scoreMode: MultiplayerScoreMode;
  elapsedMs: number;
  totalWindowMs: number;
  correctPosition: number;
  streak: number;
}): number {
  const base = basePointsForDifficulty(args.question.difficulty);
  if (args.scoreMode === 'buzzer_beater') {
    return applyBuzzerBeater(base, args.elapsedMs, args.totalWindowMs);
  }
  if (args.scoreMode === 'race') {
    return applyRace(base, args.correctPosition);
  }
  if (args.scoreMode === 'combo_breaker') {
    return applyComboBreaker(base, args.streak);
  }
  return base;
}

export function upsertPlayerAnswer(
  existing: PlayerAnswerEntry[],
  entry: PlayerAnswerEntry,
): PlayerAnswerEntry[] {
  const next = [...existing];
  const index = next.findIndex((item) => item.playerId === entry.playerId);
  if (index >= 0) {
    next[index] = { ...next[index], ...entry };
    return next;
  }
  return [...next, entry];
}

export function tallySelections(answers: PlayerAnswerEntry[]): Record<string, number> {
  return answers.reduce<Record<string, number>>((acc, item) => {
    const key = (item.selection || item.answer || '').trim();
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
