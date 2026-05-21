import type { AnyQuestion } from '@/types/questions';

const STORAGE_KEY = 'triviaparty:question-session:v1';

type StoredQuestionSnapshot = {
  signature: string;
  type: AnyQuestion['type'];
  question: string;
  category: string;
  flaggedAt: string;
};

type StoredEntry = {
  flagged?: boolean;
  snapshot?: StoredQuestionSnapshot;
  openEndedAccepted?: string[];
  listAccepted?: string[];
};

type StoredState = Record<string, StoredEntry>;

function canUseStorage() {
  return typeof window !== 'undefined';
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function categoryName(category: AnyQuestion['category']): string {
  if (!category) return '';
  if (typeof category === 'string') return category;
  return category.name || '';
}

export function questionSignature(question: AnyQuestion): string {
  return `${question.type}|${normalize(categoryName(question.category))}|${normalize(question.question || '')}`;
}

function readState(): StoredState {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredState) : {};
  } catch {
    return {};
  }
}

function writeState(state: StoredState) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function upsertEntry(question: AnyQuestion): { state: StoredState; key: string; entry: StoredEntry } {
  const state = readState();
  const key = questionSignature(question);
  const entry = state[key] || {};
  return { state, key, entry };
}

export function isQuestionFlagged(question: AnyQuestion): boolean {
  return Boolean(readState()[questionSignature(question)]?.flagged);
}

export function setQuestionFlagged(question: AnyQuestion, flagged: boolean) {
  const { state, key, entry } = upsertEntry(question);
  if (flagged) {
    const category = categoryName(question.category);
    state[key] = {
      ...entry,
      flagged: true,
      snapshot: {
        signature: key,
        type: question.type,
        question: question.question,
        category,
        flaggedAt: new Date().toISOString(),
      },
    };
  } else {
    state[key] = { ...entry, flagged: false };
  }
  writeState(state);
}

export function listFlaggedQuestionSnapshots(): StoredQuestionSnapshot[] {
  return Object.values(readState())
    .filter((entry) => entry.flagged && entry.snapshot)
    .map((entry) => entry.snapshot as StoredQuestionSnapshot)
    .sort((a, b) => b.flaggedAt.localeCompare(a.flaggedAt));
}

export function clearFlagBySignature(signature: string) {
  const state = readState();
  const entry = state[signature];
  if (!entry) return;
  state[signature] = { ...entry, flagged: false };
  writeState(state);
}

function addUnique(existing: string[], value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return existing;
  const normalized = normalize(trimmed);
  if (existing.some((item) => normalize(item) === normalized)) return existing;
  return [...existing, trimmed];
}

export function addOpenEndedAcceptedAnswer(question: AnyQuestion, answer: string) {
  const { state, key, entry } = upsertEntry(question);
  state[key] = {
    ...entry,
    openEndedAccepted: addUnique(entry.openEndedAccepted || [], answer),
  };
  writeState(state);
}

export function addListAcceptedAnswer(question: AnyQuestion, answer: string) {
  const { state, key, entry } = upsertEntry(question);
  state[key] = {
    ...entry,
    listAccepted: addUnique(entry.listAccepted || [], answer),
  };
  writeState(state);
}

export function getOpenEndedAcceptedAnswers(question: AnyQuestion): string[] {
  return readState()[questionSignature(question)]?.openEndedAccepted || [];
}

export function getListAcceptedAnswers(question: AnyQuestion): string[] {
  return readState()[questionSignature(question)]?.listAccepted || [];
}
