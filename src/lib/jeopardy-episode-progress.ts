export type JeopardyEpisodeMode = 'practice' | 'competition' | 'learn';
export type JeopardyEpisodeStatus = 'unfinished' | 'completed';
export type JeopardyEpisodeFilter = 'all' | 'completed' | 'unfinished' | 'unstarted';

export interface JeopardyCompetitionTeamState {
  name: string;
  score: number;
  color?: string;
}

export interface JeopardyFinalJeopardyState {
  wagers: number[];
  locked: boolean;
  results: Array<'correct' | 'incorrect' | null>;
  resolved: boolean;
}

export interface JeopardyEpisodeSessionState {
  teams?: JeopardyCompetitionTeamState[];
  chooserTeamIndex?: number;
  finalJeopardy?: JeopardyFinalJeopardyState;
}

export interface JeopardyEpisodeProgress {
  episodeKey: string;
  showNumber: number | null;
  mode: JeopardyEpisodeMode;
  status: JeopardyEpisodeStatus;
  totalClues: number;
  revealedClueIds: string[];
  revealedCount: number;
  uniqueCluesAnswered: number;
  startedAt: string;
  lastPlayedAt: string;
  completedAt: string | null;
  sessionState: JeopardyEpisodeSessionState;
}

export function clampFinalJeopardyWager(score: number, wager: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  if (!Number.isFinite(wager)) return 0;
  return Math.max(0, Math.min(score, Math.floor(wager)));
}

const LOCAL_PROGRESS_KEY = 'triviaparty:local:jeopardy-episode-progress';

function canUseStorage() {
  return typeof window !== 'undefined';
}

function readLocalProgressMap(): Record<string, JeopardyEpisodeProgress> {
  if (!canUseStorage()) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, JeopardyEpisodeProgress>) : {};
    return Object.fromEntries(
      Object.entries(parsed).map(([key, progress]) => [
        key,
        {
          ...progress,
          sessionState: progress?.sessionState ?? {},
        },
      ]),
    );
  } catch {
    return {};
  }
}

function writeLocalProgressMap(map: Record<string, JeopardyEpisodeProgress>) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(map));
}

function progressMapKey(episodeKey: string, mode: JeopardyEpisodeMode) {
  return `${episodeKey}|${mode}`;
}

export function getLocalEpisodeProgressList(): JeopardyEpisodeProgress[] {
  return Object.values(readLocalProgressMap()).sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt));
}

export function startLocalEpisodeProgress(params: {
  episodeKey: string;
  showNumber: number | null;
  mode: JeopardyEpisodeMode;
  totalClues: number;
}) {
  const now = new Date().toISOString();
  const map = readLocalProgressMap();
  const key = progressMapKey(params.episodeKey, params.mode);
  map[key] = {
    episodeKey: params.episodeKey,
    showNumber: params.showNumber,
    mode: params.mode,
    status: 'unfinished',
    totalClues: params.totalClues,
    revealedClueIds: [],
    revealedCount: 0,
    uniqueCluesAnswered: 0,
    startedAt: now,
    lastPlayedAt: now,
    completedAt: null,
    sessionState: {},
  };
  writeLocalProgressMap(map);
  return map[key];
}

export function restartLocalEpisodeProgress(params: {
  episodeKey: string;
  showNumber: number | null;
  mode: JeopardyEpisodeMode;
  totalClues: number;
}) {
  return startLocalEpisodeProgress(params);
}

export function revealLocalEpisodeClue(params: {
  episodeKey: string;
  mode: JeopardyEpisodeMode;
  clueId: string;
}) {
  if (!params.clueId) return null;
  const map = readLocalProgressMap();
  const key = progressMapKey(params.episodeKey, params.mode);
  const existing = map[key];
  if (!existing) return null;

  const revealed = new Set(existing.revealedClueIds ?? []);
  revealed.add(params.clueId);
  const now = new Date().toISOString();
  const next: JeopardyEpisodeProgress = {
    ...existing,
    status: 'unfinished',
    revealedClueIds: Array.from(revealed),
    revealedCount: revealed.size,
    uniqueCluesAnswered: revealed.size,
    lastPlayedAt: now,
    completedAt: null,
  };
  map[key] = next;
  writeLocalProgressMap(map);
  return next;
}

export function updateLocalEpisodeSessionState(params: {
  episodeKey: string;
  mode: JeopardyEpisodeMode;
  sessionState: JeopardyEpisodeSessionState;
}) {
  const map = readLocalProgressMap();
  const key = progressMapKey(params.episodeKey, params.mode);
  const existing = map[key];
  if (!existing) return null;

  const now = new Date().toISOString();
  const next: JeopardyEpisodeProgress = {
    ...existing,
    status: existing.status === 'completed' ? 'completed' : 'unfinished',
    sessionState: params.sessionState,
    lastPlayedAt: now,
  };
  map[key] = next;
  writeLocalProgressMap(map);
  return next;
}

export function completeLocalEpisodeProgress(params: {
  episodeKey: string;
  mode: JeopardyEpisodeMode;
  totalClues: number;
}) {
  const map = readLocalProgressMap();
  const key = progressMapKey(params.episodeKey, params.mode);
  const existing = map[key];
  if (!existing) return null;

  const now = new Date().toISOString();
  const next: JeopardyEpisodeProgress = {
    ...existing,
    status: 'completed',
    totalClues: params.totalClues,
    revealedCount: existing.revealedClueIds.length,
    uniqueCluesAnswered: existing.revealedClueIds.length,
    completedAt: now,
    lastPlayedAt: now,
  };
  map[key] = next;
  writeLocalProgressMap(map);
  return next;
}

export function getEpisodeProgressStatus(
  progress: JeopardyEpisodeProgress | undefined | null,
): 'completed' | 'unfinished' | 'unstarted' {
  if (!progress) return 'unstarted';
  return progress.status;
}

export function matchesEpisodeFilter(
  status: 'completed' | 'unfinished' | 'unstarted',
  filter: JeopardyEpisodeFilter,
) {
  return filter === 'all' ? true : status === filter;
}
