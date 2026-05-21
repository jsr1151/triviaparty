import type { AnyQuestion, Difficulty } from '@/types/questions';

export const PARTY_TYPES: AnyQuestion['type'][] = ['multiple_choice', 'open_ended', 'list', 'grouping', 'this_or_that', 'ranking', 'media', 'prompt'];
const MAX_LIGHTNING_SLOTS = 8;

export type RoundMode = 'configured' | 'fully_random' | 'player_choice' | 'random_from_options';

export type ListModeSetting = 'timed' | 'strikes' | 'unlimited' | 'random';
export type ListScoringSetting = 'target' | 'as_many' | 'random';

export type RoundSlot = {
  id: string;
  type: AnyQuestion['type'];
  count: number;
  order: 'fixed' | 'randomized';
  listMode: ListModeSetting;
  listScoring: ListScoringSetting;
  timeLimitSec?: number;
  categoryStrategy?: 'any' | 'same_round' | 'unique_round' | 'rotate_round' | 'player_choice';
  groupingMode?: 'elimination' | 'continuous';
  rankingMode?: 'anchor_adjust' | 'one_shot';
};

export type DifficultyMode = 'set' | 'scaling_incremental' | 'scaling_performance' | 'random';
export type CategoryMode = 'balanced' | 'cycle' | 'random' | 'choice';

export type RoundConfig = {
  id: string;
  name: string;
  mode: RoundMode;
  order: 'fixed' | 'randomized';
  questionCount: number;
  slots: RoundSlot[];
  options: AnyQuestion['type'][];
  difficultyMode?: DifficultyMode;
  fixedDifficulty?: Difficulty;
  categoryMode?: CategoryMode;
  categoryTheme?: string;
  categoryOptions?: string[];
  promptVariant?: 'standard' | 'master';
};

export type PartySettings = {
  rounds: RoundConfig[];
  difficultyScope: 'game' | 'round';
  difficultyMode: DifficultyMode;
  fixedDifficulty: Difficulty;
  categoryScope: 'game' | 'round';
  categoryMode: CategoryMode;
  categoryTheme: string;
  categoryOptions: string[];
  excludedCategories: string[];
};

export type PlannedQuestion = AnyQuestion & {
  partyRound: number;
  partyTimeLimitSec?: number;
  partyListMode?: ListModeSetting;
  partyListScoring?: ListScoringSetting;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getCategoryName(question: AnyQuestion): string {
  if (!question.category) return '';
  return typeof question.category === 'string' ? question.category : question.category.name || '';
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function uniqueCategories(questions: AnyQuestion[]): string[] {
  return Array.from(new Set(questions.map(getCategoryName).map(normalize).filter(Boolean)));
}

function incrementalDifficulty(index: number, total: number): Difficulty {
  const ratio = total <= 1 ? 1 : index / (total - 1);
  if (ratio < 0.2) return 'very_easy';
  if (ratio < 0.4) return 'easy';
  if (ratio < 0.6) return 'medium';
  if (ratio < 0.8) return 'hard';
  return 'very_hard';
}

function pickDifficulty(mode: DifficultyMode, fixedDifficulty: Difficulty, index: number, total: number): Difficulty | null {
  if (mode === 'set') return fixedDifficulty;
  if (mode === 'random') return null;
  if (mode === 'scaling_incremental' || mode === 'scaling_performance') return incrementalDifficulty(index, total);
  return null;
}

function pickCategory(
  questions: AnyQuestion[],
  mode: CategoryMode,
  categoryOptions: string[],
  categoryTheme: string,
  usedCounts: Record<string, number>,
  index: number,
): string | null {
  const options = categoryOptions.map(normalize).filter(Boolean);
  const allCategories = uniqueCategories(questions);
  if (categoryTheme.trim()) return normalize(categoryTheme);
  if (mode === 'choice' && options.length) return options[index % options.length];
  if (mode === 'cycle' && allCategories.length) return allCategories[index % allCategories.length];
  if (mode === 'balanced') {
    const entries = allCategories.map((category) => ({ category, count: usedCounts[category] || 0 }));
    entries.sort((a, b) => a.count - b.count);
    return entries[0]?.category || null;
  }
  return null;
}

function withRoundSettings(question: AnyQuestion, roundNumber: number, slot?: RoundSlot): PlannedQuestion {
  return {
    ...question,
    partyRound: roundNumber,
    partyTimeLimitSec: slot?.timeLimitSec,
    partyListMode: slot?.listMode,
    partyListScoring: slot?.listScoring,
    ...(slot?.groupingMode ? { partyGroupingMode: slot.groupingMode } : {}),
    ...(slot?.rankingMode ? { partyRankingMode: slot.rankingMode } : {}),
  };
}

function takeOne(
  pool: AnyQuestion[],
  usedIndices: Set<number>,
  type: AnyQuestion['type'] | null,
  desiredDifficulty: Difficulty | null,
  desiredCategory: string | null,
  desiredPrompt: string | null,
): number {
  const candidates = pool
    .map((question, index) => ({ question, index }))
    .filter((entry) => !usedIndices.has(entry.index))
    .filter((entry) => (type ? entry.question.type === type : true))
    .filter((entry) => (desiredDifficulty ? entry.question.difficulty === desiredDifficulty : true))
    .filter((entry) => (desiredCategory ? normalize(getCategoryName(entry.question)) === desiredCategory : true))
    .filter((entry) => (desiredPrompt ? ((entry.question as AnyQuestion & { prompt?: string }).prompt || '').trim().toLowerCase() === desiredPrompt : true));
  if (!candidates.length) {
    const fallback = pool
      .map((question, index) => ({ question, index }))
      .filter((entry) => !usedIndices.has(entry.index))
      .filter((entry) => (type ? entry.question.type === type : true));
    if (!fallback.length) return -1;
    return fallback[Math.floor(Math.random() * fallback.length)].index;
  }
  return candidates[Math.floor(Math.random() * candidates.length)].index;
}

export function createDefaultSettings(): PartySettings {
  return {
    rounds: [
      {
        id: 'round-1',
        name: 'Round 1',
        mode: 'configured',
        order: 'fixed',
        questionCount: 10,
        slots: [{ id: 'slot-1', type: 'multiple_choice', count: 10, order: 'fixed', listMode: 'timed', listScoring: 'target' }],
        options: ['multiple_choice', 'open_ended', 'list'],
      },
    ],
    difficultyScope: 'game',
    difficultyMode: 'random',
    fixedDifficulty: 'medium',
    categoryScope: 'game',
    categoryMode: 'random',
    categoryTheme: '',
    categoryOptions: [],
    excludedCategories: [],
  };
}

export function createPresetSettings(name: string): PartySettings {
  const base = createDefaultSettings();
  if (name === 'pursuit-short') {
    const grabBagMode = Math.random() < 0.5 ? 'elimination' : 'continuous';
    const closeCallMode = Math.random() < 0.5 ? 'anchor_adjust' : 'one_shot';
    return {
      ...base,
      rounds: [
        {
          ...base.rounds[0],
          id: 'round-1',
          name: 'Round 1: Quickstarter',
          questionCount: 5,
          slots: [
            { id: 'quickstarter-mc', type: 'multiple_choice', count: 4, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'same_round' },
            { id: 'quickstarter-open-media', type: Math.random() < 0.5 ? 'open_ended' : 'media', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'player_choice' },
          ],
        },
        {
          ...base.rounds[0],
          id: 'round-2',
          name: `Round 2: ${grabBagMode === 'continuous' ? 'Grab Bag Blitz' : 'Grab Bag'}`,
          questionCount: 4,
          slots: [
            { id: 'grabbag-random', type: 'grouping', count: 3, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'any', groupingMode: grabBagMode },
            { id: 'grabbag-choice', type: 'grouping', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'player_choice', groupingMode: grabBagMode },
          ],
        },
        {
          ...base.rounds[0],
          id: 'round-3',
          name: 'Round 3: Switchagories',
          questionCount: 5,
          slots: [
            { id: 'switchagories-mc', type: 'multiple_choice', count: 4, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'unique_round' },
            { id: 'switchagories-open-media', type: Math.random() < 0.5 ? 'open_ended' : 'media', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'unique_round' },
          ],
        },
        {
          ...base.rounds[0],
          id: 'round-4',
          name: `Round 4: ${closeCallMode === 'one_shot' ? 'Close Call Blitz' : 'Close Call'}`,
          questionCount: 5,
          slots: [
            { id: 'closecall-shared', type: 'ranking', count: 4, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'same_round', rankingMode: closeCallMode },
            { id: 'closecall-choice', type: 'ranking', count: 1, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'player_choice', rankingMode: closeCallMode },
          ],
        },
        {
          ...base.rounds[0],
          id: 'round-5',
          name: 'Round 5: Rapid Fire',
          questionCount: 5,
          slots: [{ id: 'rapid-fire', type: 'this_or_that', count: 5, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: 'rotate_round' }],
        },
      ],
      difficultyMode: 'set',
      fixedDifficulty: 'medium',
      categoryMode: 'cycle',
    };
  }
  if (name === 'pursuit-long') {
    const short = createPresetSettings('pursuit-short');
    const brainstormTimed = Math.random() < 0.5;
    const quickWitsMaster = Math.random() < 0.5;
    const promptCount = quickWitsMaster ? Math.floor(Math.random() * 5) + 3 : 10;
    return {
      ...short,
      rounds: [
        ...short.rounds,
        {
          ...base.rounds[0],
          id: 'round-6',
          name: `Round 6: ${brainstormTimed ? 'Brainstorm Blitz' : 'Brainstorm'}`,
          questionCount: 3,
          slots: [
            { id: 'brainstorm-random', type: 'list', count: 2, order: 'fixed', listMode: brainstormTimed ? 'timed' : 'strikes', listScoring: brainstormTimed ? 'target' : 'as_many', categoryStrategy: 'any' },
            { id: 'brainstorm-choice', type: 'list', count: 1, order: 'fixed', listMode: brainstormTimed ? 'timed' : 'strikes', listScoring: brainstormTimed ? 'target' : 'as_many', categoryStrategy: 'player_choice' },
          ],
        },
        {
          ...base.rounds[0],
          id: 'round-7',
          name: `Round 7: ${quickWitsMaster ? 'Quick Wits Master' : 'Quick Wits'}`,
          questionCount: promptCount,
          slots: [{ id: 'quick-wits', type: 'prompt', count: promptCount, order: 'fixed', listMode: 'timed', listScoring: 'target', categoryStrategy: quickWitsMaster ? 'same_round' : 'unique_round' }],
          promptVariant: quickWitsMaster ? 'master' : 'standard',
        },
      ],
      difficultyMode: 'scaling_incremental',
      categoryMode: 'balanced',
    };
  }
  if (name === 'lightning-round') {
    const lightningSlots = PARTY_TYPES.map((type, index) => ({
      id: `slot-${index + 1}`,
      type,
      count: 2,
      order: 'randomized' as const,
      listMode: 'timed' as const,
      listScoring: 'as_many' as const,
      timeLimitSec: 20,
    })).slice(0, MAX_LIGHTNING_SLOTS) as RoundSlot[];
    return {
      ...base,
      rounds: [{ ...base.rounds[0], questionCount: 15, slots: lightningSlots }],
      difficultyMode: 'random',
      categoryMode: 'random',
    };
  }
  if (name === 'variety-pack') {
    return {
      ...base,
      rounds: [{ ...base.rounds[0], mode: 'random_from_options', options: PARTY_TYPES, questionCount: 20, slots: [] }],
      difficultyMode: 'random',
      categoryMode: 'balanced',
    };
  }
  if (name === 'expert-challenge') {
    return {
      ...base,
      rounds: [{ ...base.rounds[0], mode: 'fully_random', questionCount: 15, slots: [] }],
      difficultyMode: 'set',
      fixedDifficulty: 'very_hard',
      categoryMode: 'random',
    };
  }
  return base;
}

export function buildPartyQuestions(allQuestions: AnyQuestion[], settings: PartySettings): PlannedQuestion[] {
  const excluded = new Set(settings.excludedCategories.map(normalize).filter(Boolean));
  const pool = allQuestions.filter((question) => !excluded.has(normalize(getCategoryName(question))));
  const usedIndices = new Set<number>();
  const usedCategoryCounts: Record<string, number> = {};
  const plan: PlannedQuestion[] = [];

  const totalTarget = settings.rounds.reduce((sum, round) => sum + Math.max(1, round.questionCount), 0);

  settings.rounds.forEach((round, roundIndex) => {
    const roundSlots: Array<{ slot?: RoundSlot; type: AnyQuestion['type'] | null }> = [];
    let roundSeedCategory: string | null = null;
    const roundUsedCategories = new Set<string>();
    let roundPrompt: string | null = null;
    if (round.promptVariant === 'master') {
      const promptCounts: Record<string, number> = {};
      pool.forEach((question) => {
        if (question.type !== 'prompt') return;
        const prompt = ((question as AnyQuestion & { prompt?: string }).prompt || '').trim().toLowerCase();
        if (!prompt) return;
        promptCounts[prompt] = (promptCounts[prompt] || 0) + 1;
      });
      const candidates = Object.entries(promptCounts).filter(([, count]) => count >= 3).map(([prompt]) => prompt);
      if (candidates.length) {
        roundPrompt = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    if (round.mode === 'configured') {
      for (const slot of round.slots) {
        const slotCount = Math.max(1, slot.count);
        for (let i = 0; i < slotCount; i++) {
          roundSlots.push({ slot, type: slot.type });
        }
      }
    } else if (round.mode === 'fully_random') {
      for (let i = 0; i < Math.max(1, round.questionCount); i++) roundSlots.push({ type: PARTY_TYPES[Math.floor(Math.random() * PARTY_TYPES.length)] });
    } else if (round.mode === 'player_choice') {
      const options = round.options.length ? round.options : PARTY_TYPES;
      for (let i = 0; i < Math.max(1, round.questionCount); i++) {
        roundSlots.push({ type: options[i % options.length] });
      }
    } else {
      const options = round.options.length ? round.options : PARTY_TYPES;
      for (let i = 0; i < Math.max(1, round.questionCount); i++) {
        roundSlots.push({ type: options[Math.floor(Math.random() * options.length)] });
      }
    }

    const orderedSlots = round.order === 'randomized' ? shuffle(roundSlots) : roundSlots;
    orderedSlots.forEach(({ slot, type }, slotIndex) => {
      const absoluteIndex = plan.length;
      const difficultyScopeRound = settings.difficultyScope === 'round';
      const activeDifficultyMode = difficultyScopeRound ? (round.difficultyMode || settings.difficultyMode) : settings.difficultyMode;
      const activeFixedDifficulty = difficultyScopeRound ? (round.fixedDifficulty || settings.fixedDifficulty) : settings.fixedDifficulty;
      const difficulty = pickDifficulty(
        activeDifficultyMode,
        activeFixedDifficulty,
        difficultyScopeRound ? slotIndex : absoluteIndex,
        difficultyScopeRound ? orderedSlots.length : totalTarget,
      );
      const categoryScopeRound = settings.categoryScope === 'round';
      const activeCategoryMode = categoryScopeRound ? (round.categoryMode || settings.categoryMode) : settings.categoryMode;
      const activeCategoryTheme = categoryScopeRound ? (round.categoryTheme || settings.categoryTheme) : settings.categoryTheme;
      const activeCategoryOptions = categoryScopeRound ? (round.categoryOptions || settings.categoryOptions) : settings.categoryOptions;
      const desiredCategory = pickCategory(pool, activeCategoryMode, activeCategoryOptions, activeCategoryTheme, usedCategoryCounts, absoluteIndex);
      let slotDesiredCategory = desiredCategory;
      const strategy = slot?.categoryStrategy || 'any';
      if (strategy === 'same_round') {
        if (!roundSeedCategory) {
          const categories = uniqueCategories(pool);
          roundSeedCategory = categories[Math.floor(Math.random() * categories.length)] || null;
        }
        slotDesiredCategory = roundSeedCategory;
      } else if (strategy === 'unique_round') {
        const remaining = uniqueCategories(pool).filter((cat) => !roundUsedCategories.has(cat));
        if (remaining.length) {
          slotDesiredCategory = remaining[Math.floor(Math.random() * remaining.length)];
        }
      } else if (strategy === 'rotate_round') {
        const categories = uniqueCategories(pool);
        slotDesiredCategory = categories[slotIndex % Math.max(1, categories.length)] || null;
      } else if (strategy === 'player_choice') {
        slotDesiredCategory = null;
      }

      const slotDesiredPrompt = round.promptVariant === 'master' ? roundPrompt : null;
      const pickIndex = takeOne(pool, usedIndices, type, difficulty, slotDesiredCategory, slotDesiredPrompt);
      if (pickIndex < 0) return;
      usedIndices.add(pickIndex);
      const question = pool[pickIndex];
      const normalizedCategory = normalize(getCategoryName(question));
      if (normalizedCategory) usedCategoryCounts[normalizedCategory] = (usedCategoryCounts[normalizedCategory] || 0) + 1;
      if (normalizedCategory) roundUsedCategories.add(normalizedCategory);
      plan.push(withRoundSettings(question, roundIndex + 1, slot));
    });
  });

  return plan;
}
