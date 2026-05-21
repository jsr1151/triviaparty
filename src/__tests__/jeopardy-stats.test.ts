import { buildJeopardyStatsView } from '@/lib/jeopardy-stats';

describe('jeopardy stats aggregation', () => {
  it('computes overall, season, and last-5 stats from tracked progress', () => {
    const stats = buildJeopardyStatsView({
      episodes: [
        {
          episodeKey: 'replay:9507',
          showNumber: 9507,
          mode: 'practice',
          status: 'completed',
          lastPlayedAt: '2026-05-21T00:00:00.000Z',
          completedAt: '2026-05-21T00:00:00.000Z',
        },
        {
          episodeKey: 'replay:9506',
          showNumber: 9506,
          mode: 'competition',
          status: 'unfinished',
          lastPlayedAt: '2026-05-20T00:00:00.000Z',
          completedAt: null,
        },
      ],
      clues: [
        {
          clueId: 'g9507-s-c0-r0',
          correctCount: 2,
          incorrectCount: 1,
          skipCount: 0,
          lastOutcome: 'correct',
          tripleStumper: false,
          isFinalJeopardy: false,
        },
        {
          clueId: 'g9506-f-c0-r0',
          correctCount: 0,
          incorrectCount: 1,
          skipCount: 1,
          lastOutcome: 'skip',
          tripleStumper: true,
          isFinalJeopardy: true,
        },
      ],
      seasonByShowNumber: new Map([
        [9507, 42],
        [9506, 42],
      ]),
      showNumberToGameId: new Map([
        [9507, 9507],
        [9506, 9506],
      ]),
      seasonByGameId: new Map([
        [9507, 42],
        [9506, 42],
      ]),
    });

    expect(stats.overall.gamesCompleted).toBe(1);
    expect(stats.overall.unfinishedGames).toBe(1);
    expect(stats.overall.uniqueCluesAnswered).toBe(2);
    expect(stats.overall.correctAnswers).toBe(2);
    expect(stats.overall.incorrectAnswers).toBe(2);
    expect(stats.overall.skippedAnswers).toBe(1);
    expect(stats.overall.averageCorrectPercent).toBe(50);
    expect(stats.overall.tripleStumpers).toBe(1);
    expect(stats.overall.finalJeopardyIncorrect).toBe(1);

    expect(stats.bySeason[0].label).toBe('Season 42');
    expect(stats.bySeason[0].gamesCompleted).toBe(1);
    expect(stats.bySeason[0].unfinishedGames).toBe(1);

    expect(stats.last5Games.gameCount).toBe(2);
    expect(stats.last5Games.uniqueCluesAnswered).toBe(2);
    expect(stats.last5Games.averageCorrectPercent).toBe(50);
    expect(stats.performanceOverTime).toHaveLength(2);
    expect(stats.performanceOverTime[0].label).toBe('#9506');
    expect(stats.performanceOverTime[1].label).toBe('#9507');
  });
});
