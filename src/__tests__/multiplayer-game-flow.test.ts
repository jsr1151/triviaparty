import {
  computeAwardedPoints,
  isSelectionCorrect,
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
