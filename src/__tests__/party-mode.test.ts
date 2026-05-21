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

  it('builds pursuit short with expected round count and names', () => {
    const settings = createPresetSettings('pursuit-short');
    expect(settings.rounds).toHaveLength(5);
    expect(settings.rounds[0].name).toContain('Quickstarter');
    expect(settings.rounds[2].name).toContain('Switchagories');
    expect(settings.rounds[4].name).toContain('Rapid Fire');
  });

  it('builds pursuit long with additional rounds', () => {
    const settings = createPresetSettings('pursuit-long');
    expect(settings.rounds).toHaveLength(7);
    expect(settings.rounds[5].name).toContain('Brainstorm');
    expect(settings.rounds[6].name).toContain('Quick Wits');
  });

  it('applies default round difficulty/category values for built-in presets', () => {
    const pursuitShort = createPresetSettings('pursuit-short');
    pursuitShort.rounds.forEach((round) => {
      expect(round.difficulty).toBe('mixed');
      expect(round.categoryMode).toBe('random');
    });

    const pursuitLong = createPresetSettings('pursuit-long');
    pursuitLong.rounds.slice(0, 5).forEach((round) => {
      expect(round.difficulty).toBe('mixed');
      expect(round.categoryMode).toBe('random');
    });
    pursuitLong.rounds.slice(5).forEach((round) => {
      expect(round.difficulty).toBe('medium');
      expect(round.categoryMode).toBe('random');
    });

    const lightning = createPresetSettings('lightning-round');
    expect(lightning.rounds[0].difficulty).toBe('easy');
    expect(lightning.rounds[0].categoryMode).toBe('random');

    const variety = createPresetSettings('variety-pack');
    expect(variety.rounds[0].difficulty).toBe('mixed');
    expect(variety.rounds[0].categoryMode).toBe('balanced');

    const expert = createPresetSettings('expert-challenge');
    expect(expert.rounds[0].difficulty).toBe('hard');
    expect(expert.rounds[0].categoryMode).toBe('random');
  });

  it('treats mixed or unset round filtering as unfiltered', () => {
    const settings = createDefaultSettings();
    settings.difficultyScope = 'round';
    settings.categoryScope = 'round';
    settings.rounds[0] = {
      ...settings.rounds[0],
      questionCount: 2,
      slots: [
        { id: 's1', type: 'multiple_choice', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target' },
        { id: 's2', type: 'open_ended', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target' },
      ],
      difficulty: 'mixed',
      categoryMode: 'random',
      category: '',
    };
    const built = buildPartyQuestions(sampleQuestions, settings);
    expect(built).toHaveLength(2);

    settings.rounds[0] = { ...settings.rounds[0], difficulty: undefined, categoryMode: undefined, category: undefined };
    const builtWithUnset = buildPartyQuestions(sampleQuestions, settings);
    expect(builtWithUnset.length).toBeGreaterThan(0);
  });
});
