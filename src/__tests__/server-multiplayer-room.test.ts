import { buildPartyQuestionsFromRoomConfig } from '@/lib/server-multiplayer-room';
import type { AnyQuestion } from '@/types/questions';

const questionPool: AnyQuestion[] = [
  {
    id: 'q1',
    type: 'multiple_choice',
    question: 'Capital of France?',
    difficulty: 'easy',
    category: 'geography',
    options: ['Paris', 'Rome', 'Berlin', 'Madrid'],
    correctAnswer: 'Paris',
  },
];

describe('server multiplayer party builder', () => {
  it('builds party questions from pre-mapped AnyQuestion data', () => {
    const config = {
      rounds: [
        {
          id: 'round-1',
          name: 'Round 1',
          mode: 'configured',
          order: 'fixed',
          questionCount: 1,
          slots: [{ id: 'slot-1', type: 'multiple_choice', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target' }],
          options: ['multiple_choice'],
          difficulty: 'mixed',
          categoryMode: 'random',
        },
      ],
    };

    const built = buildPartyQuestionsFromRoomConfig(questionPool, config);
    expect(built.questions).toHaveLength(1);
    expect(built.questions[0].id).toBe('q1');
    expect(built.fallbackApplied).toBe(false);
  });
});
