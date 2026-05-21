import type { JeopardyEpisodeMode, JeopardyEpisodeStatus } from '@/lib/jeopardy-episode-progress';

export interface JeopardyEpisodeStatsRecord {
  episodeKey: string;
  showNumber: number | null;
  mode: JeopardyEpisodeMode;
  status: JeopardyEpisodeStatus;
  lastPlayedAt: string;
  completedAt: string | null;
}

export interface JeopardyClueStatsRecord {
  clueId: string;
  correctCount: number;
  incorrectCount: number;
  skipCount: number;
  lastOutcome: 'correct' | 'incorrect' | 'skip';
  tripleStumper: boolean;
  isFinalJeopardy: boolean;
}

export interface JeopardyStatsSnapshot {
  gamesCompleted: number;
  unfinishedGames: number;
  uniqueCluesAnswered: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedAnswers: number;
  tripleStumpers: number;
  finalJeopardyCorrect: number;
  finalJeopardyIncorrect: number;
  averageCorrectPercent: number;
}

export interface JeopardySeasonStats extends JeopardyStatsSnapshot {
  season: number | null;
  label: string;
}

export interface JeopardyStatsView {
  overall: JeopardyStatsSnapshot;
  bySeason: JeopardySeasonStats[];
  last5Games: JeopardyStatsSnapshot & { gameCount: number };
  modeSplits: Array<{ mode: JeopardyEpisodeMode; gamesCompleted: number; unfinishedGames: number }>;
  performanceOverTime: Array<{
    episodeKey: string;
    showNumber: number | null;
    mode: JeopardyEpisodeMode;
    playedAt: string;
    label: string;
    correctPercent: number;
    averageCorrectPercent: number;
  }>;
}

interface BuildStatsParams {
  episodes: JeopardyEpisodeStatsRecord[];
  clues: JeopardyClueStatsRecord[];
  seasonByShowNumber: Map<number, number | null>;
  showNumberToGameId: Map<number, number>;
  seasonByGameId: Map<number, number | null>;
}

function buildEmptySnapshot(): JeopardyStatsSnapshot {
  return {
    gamesCompleted: 0,
    unfinishedGames: 0,
    uniqueCluesAnswered: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    skippedAnswers: 0,
    tripleStumpers: 0,
    finalJeopardyCorrect: 0,
    finalJeopardyIncorrect: 0,
    averageCorrectPercent: 0,
  };
}

function toPercent(correct: number, incorrect: number): number {
  const attempts = correct + incorrect;
  if (attempts <= 0) return 0;
  return Number(((correct / attempts) * 100).toFixed(1));
}

function parseGameId(clueId: string): number | null {
  const match = clueId.match(/^g(\d+)-/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function snapshotFromData(args: {
  completed: number;
  unfinished: number;
  clues: JeopardyClueStatsRecord[];
}): JeopardyStatsSnapshot {
  const next = buildEmptySnapshot();
  next.gamesCompleted = args.completed;
  next.unfinishedGames = args.unfinished;
  next.uniqueCluesAnswered = args.clues.length;
  for (const clue of args.clues) {
    next.correctAnswers += clue.correctCount;
    next.incorrectAnswers += clue.incorrectCount;
    next.skippedAnswers += clue.skipCount;
    if (clue.lastOutcome === 'skip' && clue.tripleStumper) next.tripleStumpers += 1;
    if (clue.isFinalJeopardy) {
      next.finalJeopardyCorrect += clue.correctCount;
      next.finalJeopardyIncorrect += clue.incorrectCount;
    }
  }
  next.averageCorrectPercent = toPercent(next.correctAnswers, next.incorrectAnswers);
  return next;
}

export function buildJeopardyStatsView(params: BuildStatsParams): JeopardyStatsView {
  const replayEpisodes = params.episodes.filter((episode) => episode.showNumber != null && episode.episodeKey.startsWith('replay:'));

  const modeSplits: JeopardyStatsView['modeSplits'] = (['practice', 'competition', 'learn'] as JeopardyEpisodeMode[]).map((mode) => {
    const episodes = replayEpisodes.filter((entry) => entry.mode === mode);
    return {
      mode,
      gamesCompleted: episodes.filter((entry) => entry.status === 'completed').length,
      unfinishedGames: episodes.filter((entry) => entry.status === 'unfinished').length,
    };
  });

  const overall = snapshotFromData({
    completed: replayEpisodes.filter((entry) => entry.status === 'completed').length,
    unfinished: replayEpisodes.filter((entry) => entry.status === 'unfinished').length,
    clues: params.clues,
  });

  const cluesBySeason = new Map<number | null, JeopardyClueStatsRecord[]>();
  for (const clue of params.clues) {
    const gameId = parseGameId(clue.clueId);
    const season = gameId != null ? (params.seasonByGameId.get(gameId) ?? null) : null;
    cluesBySeason.set(season, [...(cluesBySeason.get(season) ?? []), clue]);
  }

  const episodesBySeason = new Map<number | null, JeopardyEpisodeStatsRecord[]>();
  for (const episode of replayEpisodes) {
    const season = episode.showNumber != null ? (params.seasonByShowNumber.get(episode.showNumber) ?? null) : null;
    episodesBySeason.set(season, [...(episodesBySeason.get(season) ?? []), episode]);
  }

  const seasons = new Set<number | null>([
    ...Array.from(cluesBySeason.keys()),
    ...Array.from(episodesBySeason.keys()),
  ]);

  const bySeason: JeopardySeasonStats[] = Array.from(seasons)
    .map((season) => {
      const seasonEpisodes = episodesBySeason.get(season) ?? [];
      const snapshot = snapshotFromData({
        completed: seasonEpisodes.filter((entry) => entry.status === 'completed').length,
        unfinished: seasonEpisodes.filter((entry) => entry.status === 'unfinished').length,
        clues: cluesBySeason.get(season) ?? [],
      });
      return {
        season,
        label: season == null ? 'Unknown' : `Season ${season}`,
        ...snapshot,
      };
    })
    .sort((a, b) => {
      if (a.season == null) return 1;
      if (b.season == null) return -1;
      return b.season - a.season;
    });

  const last5Episodes = [...replayEpisodes]
    .sort((a, b) => {
      const aTime = a.completedAt ?? a.lastPlayedAt;
      const bTime = b.completedAt ?? b.lastPlayedAt;
      return bTime.localeCompare(aTime);
    })
    .slice(0, 5);

  const last5GameIds = new Set<number>();
  for (const episode of last5Episodes) {
    if (episode.showNumber == null) continue;
    const mapped = params.showNumberToGameId.get(episode.showNumber);
    if (mapped != null) {
      last5GameIds.add(mapped);
      continue;
    }
    last5GameIds.add(episode.showNumber);
  }
  const last5Clues = params.clues.filter((clue) => {
    const gameId = parseGameId(clue.clueId);
    return gameId != null && last5GameIds.has(gameId);
  });

  const last5Games = {
    ...snapshotFromData({
      completed: last5Episodes.filter((entry) => entry.status === 'completed').length,
      unfinished: last5Episodes.filter((entry) => entry.status === 'unfinished').length,
      clues: last5Clues,
    }),
    gameCount: last5Episodes.length,
  };

  const performanceOverTime = [...replayEpisodes]
    .sort((a, b) => {
      const aTime = a.completedAt ?? a.lastPlayedAt;
      const bTime = b.completedAt ?? b.lastPlayedAt;
      return aTime.localeCompare(bTime);
    })
    .map((episode) => {
      const gameId = episode.showNumber != null
        ? (params.showNumberToGameId.get(episode.showNumber) ?? episode.showNumber)
        : null;
      const gameClues = params.clues.filter((clue) => {
        if (gameId == null) return false;
        return parseGameId(clue.clueId) === gameId;
      });
      const correct = gameClues.reduce((sum, clue) => sum + clue.correctCount, 0);
      const incorrect = gameClues.reduce((sum, clue) => sum + clue.incorrectCount, 0);
      return {
        episodeKey: episode.episodeKey,
        showNumber: episode.showNumber,
        mode: episode.mode,
        playedAt: episode.completedAt ?? episode.lastPlayedAt,
        label: episode.showNumber != null ? `#${episode.showNumber}` : episode.episodeKey,
        correctPercent: toPercent(correct, incorrect),
        averageCorrectPercent: overall.averageCorrectPercent,
      };
    });

  return {
    overall,
    bySeason,
    last5Games,
    modeSplits,
    performanceOverTime,
  };
}
