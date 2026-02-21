import type { JeopardyClueData } from '@/types/jeopardy';

const OVERALL_KEY = 'triviaparty:local:overall';
const EPISODES_KEY = 'triviaparty:local:episodes';
const CLUES_KEY = 'triviaparty:local:clues';

export type LocalOutcome = 'correct' | 'incorrect' | 'skip';

export interface OverallStats {
  gamesPlayed: number;
  episodesCompleted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  updatedAt: string;
}

export interface EpisodeStats {
  episodeKey: string;
  showNumber: number | null;
  mode: string;
  totalClues: number;
  answeredClues: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  completed: boolean;
  startedAt: string;
  completedAt: string | null;
}

export interface LocalClueProgress {
  clueId: string;
  question: string;
  answer: string;
  category: string;
  round: string;
  value: number | null;
  dailyDouble: boolean;
  tripleStumper: boolean;
  isFinalJeopardy: boolean;
  outcomes: LocalOutcome[];
  lastOutcome: LocalOutcome;
  updatedAt: string;
}

function canUseStorage() {
  return typeof window !== 'undefined';
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getOverallStats(): OverallStats {
  return readJson<OverallStats>(OVERALL_KEY, {
    gamesPlayed: 0,
    episodesCompleted: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    skippedQuestions: 0,
    updatedAt: new Date(0).toISOString(),
  });
}

function saveOverallStats(stats: OverallStats) {
  writeJson(OVERALL_KEY, { ...stats, updatedAt: new Date().toISOString() });
}

export function getEpisodeMap(): Record<string, EpisodeStats> {
  return readJson<Record<string, EpisodeStats>>(EPISODES_KEY, {});
}

function saveEpisodeMap(map: Record<string, EpisodeStats>) {
  writeJson(EPISODES_KEY, map);
}

export function listEpisodeStats(): EpisodeStats[] {
  return Object.values(getEpisodeMap()).sort((a, b) => {
    if (a.completedAt && b.completedAt) return b.completedAt.localeCompare(a.completedAt);
    return b.startedAt.localeCompare(a.startedAt);
  });
}

export function getEpisodeStats(episodeKey: string): EpisodeStats | null {
  const map = getEpisodeMap();
  return map[episodeKey] ?? null;
}

export function initEpisodeStats(params: {
  episodeKey: string;
  showNumber: number | null;
  mode: string;
  totalClues: number;
}) {
  const map = getEpisodeMap();
  if (!map[params.episodeKey]) {
    map[params.episodeKey] = {
      episodeKey: params.episodeKey,
      showNumber: params.showNumber,
      mode: params.mode,
      totalClues: params.totalClues,
      answeredClues: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      skippedQuestions: 0,
      completed: false,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };
    saveEpisodeMap(map);
  }
}

export function recordEpisodeOutcome(params: {
  episodeKey: string;
  outcome: LocalOutcome;
  clue: JeopardyClueData;
}) {
  const map = getEpisodeMap();
  const episode = map[params.episodeKey];
  if (!episode) return;

  episode.answeredClues += 1;
  if (params.outcome === 'correct') episode.correctAnswers += 1;
  if (params.outcome === 'incorrect') episode.incorrectAnswers += 1;
  if (params.outcome === 'skip') episode.skippedQuestions += 1;
  map[params.episodeKey] = episode;
  saveEpisodeMap(map);

  const overall = getOverallStats();
  if (params.outcome === 'correct') overall.correctAnswers += 1;
  if (params.outcome === 'incorrect') overall.incorrectAnswers += 1;
  if (params.outcome === 'skip') overall.skippedQuestions += 1;
  saveOverallStats(overall);

  if (params.clue.clueId) {
    const clueMap = readJson<Record<string, LocalClueProgress>>(CLUES_KEY, {});
    const existing = clueMap[params.clue.clueId];
    clueMap[params.clue.clueId] = {
      clueId: params.clue.clueId,
      question: params.clue.question,
      answer: params.clue.answer,
      category: params.clue.category,
      round: params.clue.round,
      value: params.clue.value,
      dailyDouble: params.clue.dailyDouble,
      tripleStumper: params.clue.tripleStumper,
      isFinalJeopardy: params.clue.isFinalJeopardy,
      outcomes: [...(existing?.outcomes ?? []), params.outcome].slice(-50),
      lastOutcome: params.outcome,
      updatedAt: new Date().toISOString(),
    };
    writeJson(CLUES_KEY, clueMap);
  }
}

export function markEpisodeCompleted(episodeKey: string) {
  const map = getEpisodeMap();
  const episode = map[episodeKey];
  if (!episode || episode.completed) return;
  episode.completed = true;
  episode.completedAt = new Date().toISOString();
  map[episodeKey] = episode;
  saveEpisodeMap(map);

  const overall = getOverallStats();
  overall.gamesPlayed += 1;
  overall.episodesCompleted += 1;
  saveOverallStats(overall);
}

export function getLearnCluesLocal() {
  const clueMap = readJson<Record<string, LocalClueProgress>>(CLUES_KEY, {});
  return Object.values(clueMap)
    .filter(c => c.lastOutcome === 'incorrect' || c.lastOutcome === 'skip')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
