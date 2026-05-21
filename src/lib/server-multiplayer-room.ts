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
): AnyQuestion[] {
  const mapped = questions
    .map(mapDbQuestionToAnyQuestion)
    .filter((question): question is AnyQuestion => Boolean(question));
  const settings = isPartySettings(gameConfig) ? gameConfig : createDefaultSettings();
  return buildPartyQuestions(mapped, settings);
}
