import type { Prisma } from '@/generated/prisma/client';
import { buildPartyQuestions, createDefaultSettings, type PartySettings } from '@/lib/party-mode';
import type { AnyQuestion } from '@/types/questions';

type DbQuestion = Prisma.QuestionGetPayload<{
  include: {
    category: true;
    multipleChoice: true;
    openEnded: true;
    listQuestion: true;
    groupingQuestion: true;
    thisOrThat: true;
    rankingQuestion: true;
    mediaQuestion: true;
    promptQuestion: true;
  };
}>;

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function isPartySettings(value: unknown): value is PartySettings {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as PartySettings).rounds));
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArrayLoose(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizePartySettings(value: unknown): PartySettings {
  const defaults = createDefaultSettings();
  if (!isPartySettings(value)) return defaults;
  const incoming = value as Partial<PartySettings>;
  const rounds = Array.isArray(incoming.rounds) && incoming.rounds.length
    ? incoming.rounds.map((round, index) => ({
      ...defaults.rounds[0],
      ...round,
      id: typeof round.id === 'string' && round.id ? round.id : `round-${index + 1}`,
      name: typeof round.name === 'string' && round.name ? round.name : `Round ${index + 1}`,
      categoryTheme: asString(round.categoryTheme),
      categoryOptions: asStringArrayLoose(round.categoryOptions),
    }))
    : defaults.rounds;
  return {
    ...defaults,
    ...incoming,
    rounds,
    categoryTheme: asString(incoming.categoryTheme),
    categoryOptions: asStringArrayLoose(incoming.categoryOptions),
    excludedCategories: asStringArrayLoose(incoming.excludedCategories),
  };
}

function broadenPartySettings(settings: PartySettings): PartySettings {
  return {
    ...settings,
    difficultyScope: 'game',
    difficultyMode: 'random',
    categoryScope: 'game',
    categoryMode: 'random',
    categoryTheme: '',
    categoryOptions: [],
    rounds: settings.rounds.map((round) => ({
      ...round,
      difficulty: 'mixed',
      categoryMode: 'random',
      category: '',
      categoryTheme: '',
      categoryOptions: [],
    })),
  };
}

/**
 * Builds a concise, human-readable summary of round-level difficulty/category filters
 * to include in host-facing "no questions matched" error responses.
 */
function buildFilterHint(settings: PartySettings): string | null {
  const roundHints = settings.rounds
    .map((round, index) => {
      const details: string[] = [];
      if (round.difficulty && round.difficulty !== 'mixed') details.push(`difficulty "${round.difficulty}"`);
      const trimmedCategory = typeof round.category === 'string' ? round.category.trim() : '';
      if (trimmedCategory) details.push(`category "${trimmedCategory}"`);
      if (typeof round.categoryTheme === 'string' && round.categoryTheme.trim()) details.push(`theme "${round.categoryTheme.trim()}"`);
      return details.length ? `Round ${index + 1}: ${details.join(', ')}` : null;
    })
    .filter((hint): hint is string => Boolean(hint));
  return roundHints.length ? roundHints.join(' | ') : null;
}

export type PartyBuildResult = {
  questions: AnyQuestion[];
  fallbackApplied: boolean;
  failureHint: string | null;
};

export function mapDbQuestionToAnyQuestion(question: DbQuestion): AnyQuestion | null {
  const base = {
    id: question.id,
    type: question.type,
    question: question.question,
    difficulty: (question.difficulty as AnyQuestion['difficulty']) || 'medium',
    category: question.category?.name || '',
  };
  if (question.type === 'multiple_choice' && question.multipleChoice) {
    return {
      ...base,
      type: 'multiple_choice',
      options: asStringArray(question.multipleChoice.options),
      correctAnswer: question.multipleChoice.correctAnswer,
    };
  }
  if (question.type === 'open_ended' && question.openEnded) {
    return {
      ...base,
      type: 'open_ended',
      answer: question.openEnded.answer,
      acceptedAnswers: asStringArray(question.openEnded.acceptedAnswers),
    };
  }
  if (question.type === 'list' && question.listQuestion) {
    return {
      ...base,
      type: 'list',
      answers: asStringArray(question.listQuestion.answers),
      minRequired: question.listQuestion.minRequired,
    };
  }
  if (question.type === 'grouping' && question.groupingQuestion) {
    return {
      ...base,
      type: 'grouping',
      groupName: question.groupingQuestion.groupName,
      items: asStringArray(question.groupingQuestion.items),
      correctItems: asStringArray(question.groupingQuestion.correctItems),
    };
  }
  if (question.type === 'this_or_that' && question.thisOrThat) {
    return {
      ...base,
      type: 'this_or_that',
      categoryA: question.thisOrThat.categoryA,
      categoryB: question.thisOrThat.categoryB,
      categoryC: question.thisOrThat.categoryC || undefined,
      items: Array.isArray(question.thisOrThat.items)
        ? question.thisOrThat.items as Array<{ text: string; answer: 'A' | 'B' | 'C' }>
        : [],
    };
  }
  if (question.type === 'ranking' && question.rankingQuestion) {
    return {
      ...base,
      type: 'ranking',
      criteria: question.rankingQuestion.criteria,
      items: Array.isArray(question.rankingQuestion.items)
        ? question.rankingQuestion.items as Array<{ text: string; rank: number; value?: string }>
        : [],
    };
  }
  if (question.type === 'media' && question.mediaQuestion) {
    return {
      ...base,
      type: 'media',
      mediaType: question.mediaQuestion.mediaType,
      mediaUrl: question.mediaQuestion.mediaUrl,
      answer: question.mediaQuestion.answer,
      acceptedAnswers: asStringArray(question.mediaQuestion.acceptedAnswers),
    };
  }
  if (question.type === 'prompt' && question.promptQuestion) {
    return {
      ...base,
      type: 'prompt',
      prompt: question.promptQuestion.prompt,
      answer: question.promptQuestion.answer,
      acceptedAnswers: asStringArray(question.promptQuestion.acceptedAnswers),
    };
  }
  return null;
}

export function buildPartyQuestionsFromRoomConfig(
  questions: DbQuestion[],
  gameConfig: unknown,
): PartyBuildResult {
  const mapped = questions
    .map(mapDbQuestionToAnyQuestion)
    .filter((question): question is AnyQuestion => Boolean(question));
  const settings = normalizePartySettings(gameConfig);
  const planned = buildPartyQuestions(mapped, settings);
  if (planned.length) {
    return { questions: planned, fallbackApplied: false, failureHint: null };
  }
  const broader = buildPartyQuestions(mapped, broadenPartySettings(settings));
  if (broader.length) {
    return { questions: broader, fallbackApplied: true, failureHint: null };
  }
  return { questions: [], fallbackApplied: true, failureHint: buildFilterHint(settings) };
}
