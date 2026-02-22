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
  const text = ` ${prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()} `;

  const hasAny = (terms: string[]) => terms.some((term) => text.includes(` ${term} `));

  if (hasAny(['earliest', 'oldest', 'first'])) {
    return { topLabel: '1 = earliest', bottomLabel: 'N = latest' };
  }
  if (hasAny(['latest', 'newest', 'most recent', 'recent'])) {
    return { topLabel: '1 = latest', bottomLabel: 'N = earliest' };
  }
  if (hasAny(['highest', 'largest', 'biggest', 'longest', 'fastest', 'strongest', 'most', 'greatest'])) {
    return { topLabel: '1 = greatest / most', bottomLabel: 'N = least / lowest' };
  }
  if (hasAny(['lowest', 'smallest', 'shortest', 'slowest', 'weakest', 'least', 'fewest'])) {
    return { topLabel: '1 = least / lowest', bottomLabel: 'N = greatest / most' };
  }

  return { topLabel: '1 = best fit for the prompt', bottomLabel: 'N = least fit for the prompt' };
}
