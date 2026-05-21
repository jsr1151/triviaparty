import type { Difficulty } from '@/types/questions';

const BASE_POINTS: Record<Difficulty, number> = {
  very_easy: 100,
  easy: 100,
  medium: 200,
  hard: 350,
  very_hard: 350,
};

export function basePointsForDifficulty(difficulty: Difficulty | string | undefined): number {
  if (!difficulty || !(difficulty in BASE_POINTS)) return BASE_POINTS.medium;
  return BASE_POINTS[difficulty as Difficulty];
}

export function applyBuzzerBeater(basePoints: number, elapsedMs: number, totalWindowMs: number): number {
  if (totalWindowMs <= 0) return basePoints;
  const ratio = Math.max(0, Math.min(1, elapsedMs / totalWindowMs));
  const multiplier = ratio <= 0.25 ? 1 : 1 - ((ratio - 0.25) / 0.75) * 0.5;
  return Math.round(basePoints * Math.max(0.5, Math.min(1, multiplier)));
}

export function applyRace(basePoints: number, correctPosition: number): number {
  if (correctPosition <= 1) return basePoints;
  if (correctPosition === 2) return Math.round(basePoints * 0.8);
  if (correctPosition === 3) return Math.round(basePoints * 0.65);
  return Math.round(basePoints * 0.5);
}

export function comboBreakerMultiplier(streak: number): number {
  if (streak >= 4) return 2;
  if (streak === 3) return 1.5;
  if (streak === 2) return 1.25;
  return 1;
}

export function applyComboBreaker(basePoints: number, streak: number): number {
  return Math.round(basePoints * comboBreakerMultiplier(streak));
}

export function partialCredit(basePoints: number, earnedItems: number, totalItems: number): number {
  if (totalItems <= 0) return 0;
  const ratio = Math.max(0, Math.min(1, earnedItems / totalItems));
  return Math.round(basePoints * ratio);
}

export function bestFitPoints(basePoints: number, correctIndex: number): number {
  if (correctIndex <= 0) return basePoints;
  const factor = Math.max(0.25, 1 - correctIndex * 0.2);
  return Math.round(basePoints * factor);
}
