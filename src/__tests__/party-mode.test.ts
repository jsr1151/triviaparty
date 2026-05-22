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

  it('supports turns/blitz mode values on grouping and ranking slots', () => {
    const settings = createDefaultSettings();
    settings.rounds[0].slots = [
      { id: 'g1', type: 'grouping', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target', groupingMode: 'turns' },
      { id: 'r1', type: 'ranking', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target', rankingMode: 'blitz' },
    ];
    settings.rounds[0].questionCount = 2;
    const built = buildPartyQuestions(sampleQuestions, settings);
    expect(built.length).toBeGreaterThan(0);
  });

  it('builds pursuit long with additional rounds', () => {
    const settings = createPresetSettings('pursuit-long');
    expect(settings.rounds).toHaveLength(7);
    expect(settings.rounds[5].name).toContain('Brainstorm');
    expect(settings.rounds[6].name).toContain('Quick Wits');
  });

  it('applies default round difficulty/category values for built-in presets', () => {
    const pursuitShort = createPresetSettings('pursuit-short');
    expect(pursuitShort.difficultyScope).toBe('game');
    expect(pursuitShort.difficultyMode).toBe('random');
    expect(pursuitShort.categoryScope).toBe('round');
    expect(pursuitShort.categoryMode).toBe('random');
    pursuitShort.rounds.forEach((round) => {
      expect(round.difficulty).toBe('mixed');
      expect(round.categoryMode).toBe('random');
    });

    const pursuitLong = createPresetSettings('pursuit-long');
    expect(pursuitLong.difficultyScope).toBe('game');
    expect(pursuitLong.difficultyMode).toBe('random');
    expect(pursuitLong.categoryScope).toBe('round');
    expect(pursuitLong.categoryMode).toBe('random');
    pursuitLong.rounds.forEach((round) => {
      expect(round.difficulty).toBe('mixed');
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

  it('falls back to any available type when a slot type is absent from the question pool', () => {
    const settings = createDefaultSettings();
    settings.rounds[0] = {
      ...settings.rounds[0],
      questionCount: 1,
      slots: [{ id: 'ranking-only', type: 'ranking', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target' }],
      difficulty: 'mixed',
      categoryMode: 'random',
    };
    const built = buildPartyQuestions(sampleQuestions, settings);
    expect(built).toHaveLength(1);
  });

  it('does not fall back to other types when requested type exists but has no unused questions left', () => {
    const settings = createDefaultSettings();
    settings.rounds[0] = {
      ...settings.rounds[0],
      questionCount: 2,
      slots: [{ id: 'ranking-only', type: 'ranking', count: 2, order: 'fixed', listMode: 'timed', listScoring: 'target' }],
      difficulty: 'mixed',
      categoryMode: 'random',
    };
    const rankingPool: AnyQuestion[] = [
      { id: 'ranking-1', type: 'ranking', question: 'Rank these', difficulty: 'medium', category: 'science', criteria: 'ascending', items: [{ text: 'A', rank: 1 }] },
      { id: 'mc-1', type: 'multiple_choice', question: 'Fallback candidate', difficulty: 'easy', category: 'science', options: ['A', 'B'] },
    ];
    const built = buildPartyQuestions(rankingPool, settings);
    expect(built).toHaveLength(1);
    expect(built[0].type).toBe('ranking');
  });
});
