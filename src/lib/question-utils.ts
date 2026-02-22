import type { AnyQuestion, Difficulty } from '@/types/questions';

const difficultyPoints: Record<Difficulty, number> = {
  very_easy: 1,
  easy: 2,
  medium: 3,
  hard: 4,
  very_hard: 5,
};

const typeMultipliers: Record<AnyQuestion['type'], number> = {
  multiple_choice: 1,
  open_ended: 1.2,
  list: 1.4,
  grouping: 1.5,
  this_or_that: 1.3,
  ranking: 1.5,
  media: 1.4,
  prompt: 1.2,
};

export function getQuestionPossiblePoints(question: AnyQuestion): number {
  const base = difficultyPoints[question.difficulty] || 3;
  const mult = typeMultipliers[question.type] || 1;
  return Math.max(1, Math.round(base * mult));
}

export function getRankingPromptText(questionText: string): string {
  const [beforeColon] = questionText.split(':');
  return beforeColon?.trim() || questionText;
}

export function inferRankingDirection(prompt: string): { topLabel: string; bottomLabel: string } {
  const text = prompt.toLowerCase();
  const descendingHints = ['most', 'largest', 'highest', 'newest', 'latest', 'longest', 'biggest', 'strongest', 'hottest', 'fastest'];
  const ascendingHints = ['least', 'smallest', 'lowest', 'oldest', 'earliest', 'shortest', 'fewest', 'lightest'];

  if (descendingHints.some((hint) => text.includes(hint))) {
    return { topLabel: '1 = highest / most', bottomLabel: 'N = lowest / least' };
  }
  if (ascendingHints.some((hint) => text.includes(hint))) {
    return { topLabel: '1 = lowest / least', bottomLabel: 'N = highest / most' };
  }

  if (text.includes('first')) {
    return { topLabel: '1 = first', bottomLabel: 'N = last' };
  }

  return { topLabel: '1 = top rank', bottomLabel: 'N = bottom rank' };
}
