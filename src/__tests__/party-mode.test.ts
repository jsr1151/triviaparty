import { buildPartyQuestions, createDefaultSettings, createPresetSettings } from '@/lib/party-mode';
import type { AnyQuestion } from '@/types/questions';

const sampleQuestions: AnyQuestion[] = [
  { id: '1', type: 'multiple_choice', question: 'Q1', difficulty: 'easy', category: 'science', options: ['a', 'b'] },
  { id: '2', type: 'open_ended', question: 'Q2', difficulty: 'medium', category: 'history', answer: 'A' },
  { id: '3', type: 'list', question: 'List 4 chemists', difficulty: 'medium', category: 'science', answers: ['x', 'y', 'z'], minRequired: 1 },
  { id: '4', type: 'grouping', question: 'Q4', difficulty: 'hard', category: 'sports', items: ['a'], correctItems: ['a'] },
  { id: '5', type: 'this_or_that', question: 'Q5', difficulty: 'easy', category: 'music', categoryA: 'A', categoryB: 'B', items: [{ text: 'x', answer: 'A' }] },
];

describe('party-mode builder', () => {
  it('builds questions from default configured round', () => {
    const settings = createDefaultSettings();
    settings.rounds[0].slots = [{ ...settings.rounds[0].slots[0], type: 'multiple_choice', count: 1 }];
    settings.rounds[0].questionCount = 1;
    const built = buildPartyQuestions(sampleQuestions, settings);
    expect(built).toHaveLength(1);
    expect(built[0].partyRound).toBe(1);
  });

  it('builds a valid preset configuration', () => {
    const settings = createPresetSettings('variety-pack');
    const built = buildPartyQuestions(sampleQuestions, settings);
    expect(built.length).toBeGreaterThan(0);
  });
});
