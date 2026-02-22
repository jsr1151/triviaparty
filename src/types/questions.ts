export type Difficulty = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';

export type BaseQuestion = {
  id?: string;
  type: string;
  question: string;
  difficulty: Difficulty;
  category?: { name: string } | string;
};

export type MultipleChoiceQuestion = BaseQuestion & {
  type: 'multiple_choice';
  options: string[];
  correctAnswer?: string;
};

export type OpenEndedQuestion = BaseQuestion & {
  type: 'open_ended';
  answer?: string;
  acceptedAnswers?: string[];
};

export type ListQuestionType = BaseQuestion & {
  type: 'list';
  answers?: string[];
  minRequired?: number;
};

export type GroupingQuestion = BaseQuestion & {
  type: 'grouping';
  groupName?: string;
  items?: string[];
  correctItems?: string[];
};

export type ThisOrThatQuestion = BaseQuestion & {
  type: 'this_or_that';
  categoryA?: string;
  categoryB?: string;
  categoryC?: string;
  items?: Array<{ text: string; answer: 'A' | 'B' | 'C' }>;
};

export type RankingQuestion = BaseQuestion & {
  type: 'ranking';
  criteria?: string;
  items?: Array<{ text: string; rank: number; value?: string }>;
};

export type MediaQuestion = BaseQuestion & {
  type: 'media';
  mediaType?: string;
  mediaUrl?: string;
  answer?: string;
  acceptedAnswers?: string[];
};

export type PromptQuestion = BaseQuestion & {
  type: 'prompt';
  prompt?: string;
  answer?: string;
  acceptedAnswers?: string[];
};

export type AnyQuestion =
  | MultipleChoiceQuestion
  | OpenEndedQuestion
  | ListQuestionType
  | GroupingQuestion
  | ThisOrThatQuestion
  | RankingQuestion
  | MediaQuestion
  | PromptQuestion;
