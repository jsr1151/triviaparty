import {
  calculateRemainingTimeMs,
  computePerItemPoints,
  computeAwardedPoints,
  countMatchingItems,
  getThisOrThatItem,
  isSelectionCorrect,
  resolveQuestionAnswerWindowMs,
  resolveMultiplayerScoreMode,
  tallySelections,
  upsertPlayerAnswer,
} from '@/lib/multiplayer-game';

describe('multiplayer game flow helpers', () => {
  it('normalizes score mode from room config', () => {
    expect(resolveMultiplayerScoreMode({ scoringMode: 'Buzzer Beater' })).toBe('buzzer_beater');
    expect(resolveMultiplayerScoreMode({ multiplayerScoringMode: 'combo-breaker' })).toBe('combo_breaker');
    expect(resolveMultiplayerScoreMode({})).toBe('standard');
  });

  it('upserts answers and tallies selections', () => {
    const answers = upsertPlayerAnswer([], {
      playerId: 'p1',
      playerName: 'Player 1',
      questionId: 'q1',
      selection: 'A',
      submittedAt: new Date().toISOString(),
    });
    const next = upsertPlayerAnswer(answers, {
      playerId: 'p1',
      playerName: 'Player 1',
      questionId: 'q1',
      selection: 'B',
      submittedAt: new Date().toISOString(),
    });
    const combined = upsertPlayerAnswer(next, {
      playerId: 'p2',
      playerName: 'Player 2',
      questionId: 'q1',
      selection: 'B',
      submittedAt: new Date().toISOString(),
    });
    expect(combined).toHaveLength(2);
    expect(tallySelections(combined)).toEqual({ B: 2 });
  });

  it('detects selection correctness for MC and this-or-that', () => {
    expect(isSelectionCorrect({
      type: 'multiple_choice',
      question: 'Test',
      difficulty: 'medium',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'B',
    }, 'B')).toBe(true);

    expect(isSelectionCorrect({
      type: 'this_or_that',
      question: 'Pick',
      difficulty: 'medium',
      categoryA: 'This',
      categoryB: 'That',
      items: [{ text: 'One', answer: 'A' }],
    }, 'This', 'A')).toBe(true);
    expect(isSelectionCorrect({
      type: 'multiple_choice',
      question: 'Test',
      difficulty: 'medium',
      options: ['A', 'B', 'C', 'D'],
      correctAnswer: 'B',
    }, 'A')).toBe(false);
    expect(isSelectionCorrect({
      type: 'this_or_that',
      question: 'Pick',
      difficulty: 'medium',
      categoryA: 'This',
      categoryB: 'That',
      items: [{ text: 'One', answer: 'A' }],
    }, 'That', 'B')).toBe(false);
  });

  it('resolves question timers from room config and per-question settings', () => {
    expect(resolveQuestionAnswerWindowMs(null, { answerWindowMs: 9000 })).toBe(9000);
    expect(resolveQuestionAnswerWindowMs({
      type: 'list',
      question: 'Name one',
      difficulty: 'easy',
      answers: ['A'],
      partyListMode: 'timed',
      partyTimeLimitSec: 12,
    } as never, { answerWindowMs: 9000 })).toBe(12000);
    expect(resolveQuestionAnswerWindowMs({
      type: 'list',
      question: 'Name one',
      difficulty: 'easy',
      answers: ['A'],
      partyListMode: 'strikes',
      partyTimeLimitSec: 12,
    } as never, { answerWindowMs: 9000 })).toBe(9000);
    expect(calculateRemainingTimeMs('2026-01-01T00:00:00.000Z', {
      type: 'multiple_choice',
      question: 'Test',
      difficulty: 'medium',
      options: ['A', 'B'],
    }, { answerWindowMs: 15000 }, new Date('2026-01-01T00:00:10.000Z').getTime())).toBe(5000);
  });

  it('returns exact this-or-that items without clamping out-of-range indices', () => {
    const question = {
      type: 'this_or_that' as const,
      question: 'Pick one',
      difficulty: 'easy' as const,
      categoryA: 'This',
      categoryB: 'That',
      items: [{ text: 'One', answer: 'A' as const }, { text: 'Two', answer: 'B' as const }],
    };
    expect(getThisOrThatItem(question, 1)?.text).toBe('Two');
    expect(getThisOrThatItem(question, 2)).toBeNull();
  });

  it('normalizes text for open-ended and list auto-scoring', () => {
    expect(isSelectionCorrect({
      type: 'open_ended',
      question: 'Answer me',
      difficulty: 'medium',
      answer: 'New York',
      acceptedAnswers: ['NYC'],
    }, 'new york!')).toBe(true);

    expect(isSelectionCorrect({
      type: 'list',
      question: 'Name one',
      difficulty: 'easy',
      answers: ['Mount Everest', 'K2'],
    }, 'mount   everest')).toBe(true);
  });

  it('counts matching grouping/list items and computes per-item points', () => {
    expect(countMatchingItems(['Mercury', 'venus'], ['venus', 'Mars'])).toBe(1);
    expect(computePerItemPoints({
      type: 'grouping',
      question: 'Pick planets',
      difficulty: 'medium',
      items: ['Mercury', 'Venus', 'Mars'],
      correctItems: ['Mercury', 'Venus'],
    }, 4)).toBe(50);
  });

  it('awards points using the selected scoring mode', () => {
    const question = {
      type: 'open_ended' as const,
      question: 'Answer me',
      difficulty: 'medium' as const,
      answer: 'x',
    };
    expect(computeAwardedPoints({
      question,
      scoreMode: 'standard',
      elapsedMs: 1000,
      totalWindowMs: 15000,
      correctPosition: 1,
      streak: 1,
    })).toBe(200);
    expect(computeAwardedPoints({
      question,
      scoreMode: 'race',
      elapsedMs: 1000,
      totalWindowMs: 15000,
      correctPosition: 2,
      streak: 1,
    })).toBe(160);
  });
});
