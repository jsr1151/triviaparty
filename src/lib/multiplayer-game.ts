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

export function isSelectionCorrect(question: AnyQuestion, selection: string, selectionKey?: 'A' | 'B' | 'C'): boolean {
  if (question.type === 'multiple_choice' || question.type === 'media') {
    const expected = extractMultipleChoiceCorrectAnswer(question);
    return Boolean(expected) && expected.trim() === selection.trim();
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
