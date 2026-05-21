import {
  clampFinalJeopardyWager,
  getEpisodeProgressStatus,
  matchesEpisodeFilter,
  type JeopardyEpisodeProgress,
} from '@/lib/jeopardy-episode-progress';

describe('jeopardy episode progress helpers', () => {
  it('classifies missing progress as unstarted', () => {
    expect(getEpisodeProgressStatus(null)).toBe('unstarted');
    expect(getEpisodeProgressStatus(undefined)).toBe('unstarted');
  });

  it('returns stored progress status', () => {
    const progress: JeopardyEpisodeProgress = {
      episodeKey: 'replay:9000',
      showNumber: 9000,
      mode: 'practice',
      status: 'completed',
      totalClues: 61,
      revealedClueIds: [],
      revealedCount: 61,
      uniqueCluesAnswered: 61,
      startedAt: new Date().toISOString(),
      lastPlayedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      sessionState: {},
    };
    expect(getEpisodeProgressStatus(progress)).toBe('completed');
  });

  it('matches status filters correctly', () => {
    expect(matchesEpisodeFilter('unfinished', 'all')).toBe(true);
    expect(matchesEpisodeFilter('unfinished', 'unfinished')).toBe(true);
    expect(matchesEpisodeFilter('unstarted', 'unfinished')).toBe(false);
  });

  it('clamps final jeopardy wagers to valid ranges', () => {
    expect(clampFinalJeopardyWager(1000, 1200)).toBe(1000);
    expect(clampFinalJeopardyWager(1000, 450.7)).toBe(450);
    expect(clampFinalJeopardyWager(0, 500)).toBe(0);
    expect(clampFinalJeopardyWager(-100, 500)).toBe(0);
  });
});
