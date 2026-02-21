import type { JeopardyClueData } from '@/types/jeopardy';

const USERS_KEY = 'triviaparty:users';
const ACTIVE_USER_KEY = 'triviaparty:active-user';

export interface UserProfile {
  username: string;
  createdAt: string;
}

export interface UserStats {
  gamesPlayed: number;
  totalEndMoney: number;
  averageEndMoney: number;
  episodesCompleted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
}

export type ClueOutcome = 'correct' | 'incorrect' | 'skip';

export interface StoredClueProgress {
  clueId: string;
  question: string;
  answer: string;
  value: number | null;
  dailyDouble: boolean;
  tripleStumper: boolean;
  isFinalJeopardy: boolean;
  category: string;
  round: 'single' | 'double' | 'final';
  outcomes: ClueOutcome[];
  lastOutcome: ClueOutcome;
  updatedAt: string;
}

interface StoredUserData {
  profile: UserProfile;
  stats: UserStats;
  clueProgress: Record<string, StoredClueProgress>;
  completedEpisodes: number[];
}

const emptyStats: UserStats = {
  gamesPlayed: 0,
  totalEndMoney: 0,
  averageEndMoney: 0,
  episodesCompleted: 0,
  correctAnswers: 0,
  incorrectAnswers: 0,
  skippedQuestions: 0,
};

function canUseStorage() {
  return typeof window !== 'undefined';
}

function getUserKey(username: string) {
  return `triviaparty:user:${username.toLowerCase()}`;
}

function safeRead<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function listUsers(): UserProfile[] {
  return safeRead<UserProfile[]>(USERS_KEY, []);
}

export function getActiveUsername(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(ACTIVE_USER_KEY);
}

export function setActiveUsername(username: string | null) {
  if (!canUseStorage()) return;
  if (!username) {
    window.localStorage.removeItem(ACTIVE_USER_KEY);
    return;
  }
  window.localStorage.setItem(ACTIVE_USER_KEY, username);
}

export function ensureUser(username: string): StoredUserData {
  const clean = username.trim();
  if (!clean) {
    return {
      profile: { username: '', createdAt: new Date().toISOString() },
      stats: { ...emptyStats },
      clueProgress: {},
      completedEpisodes: [],
    };
  }

  const existing = loadUser(clean);
  if (existing) return existing;

  const profile: UserProfile = {
    username: clean,
    createdAt: new Date().toISOString(),
  };
  const userData: StoredUserData = {
    profile,
    stats: { ...emptyStats },
    clueProgress: {},
    completedEpisodes: [],
  };

  safeWrite(getUserKey(clean), userData);
  const users = listUsers();
  if (!users.some(u => u.username.toLowerCase() === clean.toLowerCase())) {
    users.push(profile);
    users.sort((a, b) => a.username.localeCompare(b.username));
    safeWrite(USERS_KEY, users);
  }

  return userData;
}

export function loadUser(username: string): StoredUserData | null {
  if (!username.trim()) return null;
  return safeRead<StoredUserData | null>(getUserKey(username), null);
}

function saveUser(username: string, data: StoredUserData) {
  safeWrite(getUserKey(username), data);
}

export function getUserStats(username: string): UserStats {
  const user = loadUser(username);
  return user?.stats ?? { ...emptyStats };
}

export function recordClueOutcome(username: string, clue: JeopardyClueData, outcome: ClueOutcome) {
  const user = ensureUser(username);
  if (!clue.clueId) return;

  const existing = user.clueProgress[clue.clueId];
  const progress: StoredClueProgress = {
    clueId: clue.clueId,
    question: clue.question,
    answer: clue.answer,
    value: clue.value,
    dailyDouble: clue.dailyDouble,
    tripleStumper: clue.tripleStumper,
    isFinalJeopardy: clue.isFinalJeopardy,
    category: clue.category,
    round: clue.round,
    outcomes: [...(existing?.outcomes ?? []), outcome].slice(-30),
    lastOutcome: outcome,
    updatedAt: new Date().toISOString(),
  };

  user.clueProgress[clue.clueId] = progress;

  if (outcome === 'correct') user.stats.correctAnswers += 1;
  if (outcome === 'incorrect') user.stats.incorrectAnswers += 1;
  if (outcome === 'skip') user.stats.skippedQuestions += 1;

  saveUser(username, user);
}

export function recordGameCompleted(
  username: string,
  options: { endMoney: number; showNumber?: number | null },
) {
  const user = ensureUser(username);
  user.stats.gamesPlayed += 1;
  user.stats.totalEndMoney += options.endMoney;
  user.stats.averageEndMoney = Math.round(user.stats.totalEndMoney / user.stats.gamesPlayed);

  if (options.showNumber && !user.completedEpisodes.includes(options.showNumber)) {
    user.completedEpisodes.push(options.showNumber);
    user.stats.episodesCompleted = user.completedEpisodes.length;
  }

  saveUser(username, user);
}

export function getLearnClues(username: string): Array<StoredClueProgress> {
  const user = loadUser(username);
  if (!user) return [];

  return Object.values(user.clueProgress)
    .filter(item => item.lastOutcome === 'incorrect' || item.lastOutcome === 'skip')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
