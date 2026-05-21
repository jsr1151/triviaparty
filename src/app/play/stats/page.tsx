'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type JeopardyStatsSnapshot = {
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
};

type JeopardyStats = {
  overall: JeopardyStatsSnapshot;
  bySeason: Array<JeopardyStatsSnapshot & { season: number | null; label: string }>;
  last5Games: JeopardyStatsSnapshot & { gameCount: number };
  modeSplits: Array<{ mode: 'practice' | 'competition' | 'learn'; gamesCompleted: number; unfinishedGames: number }>;
  performanceOverTime: Array<{
    episodeKey: string;
    showNumber: number | null;
    mode: 'practice' | 'competition' | 'learn';
    playedAt: string;
    label: string;
    correctPercent: number;
    averageCorrectPercent: number;
  }>;
};

type LegacyStats = {
  gamesPlayed: number;
  episodesCompleted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
  averageEndMoney: number;
};

const emptySnapshot: JeopardyStatsSnapshot = {
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

export default function StatsPage() {
  const [loading, setLoading] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [jeopardyStats, setJeopardyStats] = useState<JeopardyStats | null>(null);
  const [legacyStats, setLegacyStats] = useState<LegacyStats | null>(null);
  const [graphGamesToShow, setGraphGamesToShow] = useState(10);
  const [resetting, setResetting] = useState(false);

  async function loadStats() {
    try {
      const res = await fetch('/api/auth/me');
      if (!res.ok) {
        setSignedIn(false);
        return;
      }
      const data = await res.json();
      setSignedIn(Boolean(data.user));
      setJeopardyStats(data.jeopardyStats ?? null);
      setLegacyStats(data.stats ?? null);
    } catch {
      setSignedIn(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await loadStats();
    })();
  }, []);

  const graphData = useMemo(() => {
    const all = jeopardyStats?.performanceOverTime ?? [];
    const start = Math.max(0, all.length - graphGamesToShow);
    return all.slice(start);
  }, [graphGamesToShow, jeopardyStats?.performanceOverTime]);

  async function handleResetStats() {
    if (resetting) return;
    const ok = window.confirm(
      'Reset Jeopardy stats and learning progress for this profile? This cannot be undone.',
    );
    if (!ok) return;
    setResetting(true);
    try {
      const res = await fetch('/api/user/stats/reset', { method: 'POST' });
      if (!res.ok) throw new Error('reset-failed');
      await loadStats();
    } catch {
      window.alert('Failed to reset stats.');
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="min-h-screen bg-blue-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold text-yellow-400">Statistics</h1>
          <Link href="/" className="bg-blue-800 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold">Main Menu</Link>
        </div>

        {loading && <div className="bg-blue-900 rounded-xl p-4">Loading statistics…</div>}

        {!loading && !signedIn && (
          <div className="bg-blue-900 rounded-xl p-4">
            Sign in from the home page to view persistent Jeopardy statistics.
          </div>
        )}

        {!loading && signedIn && (
          <div className="space-y-6">
            <section className="bg-blue-900 rounded-xl p-4">
              <h2 className="text-xl font-bold mb-3 text-yellow-300">Jeopardy Stats (persistent)</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <Stat label="Games completed" value={jeopardyStats?.overall.gamesCompleted ?? 0} />
                <Stat label="Unfinished games" value={jeopardyStats?.overall.unfinishedGames ?? 0} />
                <Stat label="Unique clues answered" value={jeopardyStats?.overall.uniqueCluesAnswered ?? 0} />
                <Stat label="Average Correct %" value={`${(jeopardyStats?.overall.averageCorrectPercent ?? 0).toFixed(1)}%`} />
              </div>
              <SnapshotGrid snapshot={jeopardyStats?.overall ?? emptySnapshot} />
              <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-blue-200">
                {(jeopardyStats?.modeSplits ?? []).map((split) => (
                  <div key={split.mode} className="bg-blue-950/50 rounded-lg p-2">
                    <div className="font-bold capitalize">{split.mode}</div>
                    <div>Completed: {split.gamesCompleted}</div>
                    <div>Unfinished: {split.unfinishedGames}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-blue-800">
                <button
                  onClick={() => void handleResetStats()}
                  disabled={resetting}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-60 px-4 py-2 rounded-lg font-bold text-sm"
                >
                  {resetting ? 'Resetting…' : 'Reset Jeopardy stats + learn progress'}
                </button>
              </div>
            </section>

            <section className="bg-blue-900 rounded-xl p-4">
              <h2 className="text-lg font-bold mb-3 text-yellow-300">Last 5 Games</h2>
              <div className="text-sm text-blue-200 mb-2">Games included: {jeopardyStats?.last5Games.gameCount ?? 0}</div>
              <div className="text-sm text-blue-200 mb-2">
                Average Correct % (last 5): {(jeopardyStats?.last5Games.averageCorrectPercent ?? 0).toFixed(1)}%
              </div>
              <SnapshotGrid snapshot={jeopardyStats?.last5Games ?? { ...emptySnapshot, gameCount: 0 }} />
            </section>

            <section className="bg-blue-900 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-lg font-bold text-yellow-300">Performance Over Time</h2>
                <label className="text-sm text-blue-200 flex items-center gap-2">
                  Show last
                  <select
                    value={graphGamesToShow}
                    onChange={(e) => setGraphGamesToShow(Number(e.target.value) || 10)}
                    className="bg-blue-800 border border-blue-700 rounded px-2 py-1"
                  >
                    {[5, 10, 20, 50].map((value) => (
                      <option key={value} value={value}>{value} games</option>
                    ))}
                  </select>
                </label>
              </div>
              <PerformanceChart points={graphData} />
            </section>

            <section className="bg-blue-900 rounded-xl p-4">
              <h2 className="text-lg font-bold mb-3 text-yellow-300">By Season</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-blue-200">
                      <th className="text-left py-2">Season</th>
                      <th className="text-left py-2">Completed</th>
                      <th className="text-left py-2">Unfinished</th>
                      <th className="text-left py-2">Unique clues</th>
                      <th className="text-left py-2">Average Correct %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(jeopardyStats?.bySeason ?? []).map((season) => (
                      <tr key={season.label} className="border-t border-blue-800">
                        <td className="py-2">{season.label}</td>
                        <td className="py-2">{season.gamesCompleted}</td>
                        <td className="py-2">{season.unfinishedGames}</td>
                        <td className="py-2">{season.uniqueCluesAnswered}</td>
                        <td className="py-2">{season.averageCorrectPercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-blue-900/70 border border-blue-800 rounded-xl p-4">
              <h2 className="text-lg font-bold mb-3 text-blue-200">Other / Legacy Stats (separate)</h2>
              {legacyStats ? (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm text-blue-200">
                  <div>Games: {legacyStats.gamesPlayed}</div>
                  <div>Avg $: {legacyStats.averageEndMoney}</div>
                  <div>Episodes: {legacyStats.episodesCompleted}</div>
                  <div>Correct: {legacyStats.correctAnswers}</div>
                  <div>Wrong: {legacyStats.incorrectAnswers}</div>
                  <div>Skipped: {legacyStats.skippedQuestions}</div>
                </div>
              ) : (
                <div className="text-sm text-blue-300">No non-Jeopardy/legacy stats available.</div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function SnapshotGrid({ snapshot }: { snapshot: JeopardyStatsSnapshot }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
      <div>Correct: <span className="text-yellow-300 font-bold">{snapshot.correctAnswers}</span></div>
      <div>Incorrect: <span className="text-yellow-300 font-bold">{snapshot.incorrectAnswers}</span></div>
      <div>Skipped: <span className="text-yellow-300 font-bold">{snapshot.skippedAnswers}</span></div>
      <div>Triple stumpers: <span className="text-yellow-300 font-bold">{snapshot.tripleStumpers}</span></div>
      <div>Final Jeopardy correct: <span className="text-yellow-300 font-bold">{snapshot.finalJeopardyCorrect}</span></div>
      <div>Final Jeopardy incorrect: <span className="text-yellow-300 font-bold">{snapshot.finalJeopardyIncorrect}</span></div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-blue-950/60 rounded-xl p-3">
      <div className="text-xs text-blue-300">{label}</div>
      <div className="text-2xl font-bold text-yellow-300">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function PerformanceChart({
  points,
}: {
  points: Array<{ label: string; correctPercent: number; averageCorrectPercent: number; playedAt: string }>;
}) {
  if (points.length === 0) {
    return <div className="text-sm text-blue-300">No Jeopardy game history yet.</div>;
  }

  const width = 760;
  const height = 240;
  const left = 36;
  const top = 16;
  const chartWidth = width - left - 10;
  const chartHeight = height - top - 30;
  const average = points.reduce((sum, point) => sum + point.correctPercent, 0) / points.length;
  const toX = (index: number) => left + (points.length === 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth);
  const toY = (value: number) => top + chartHeight - (Math.max(0, Math.min(100, value)) / 100) * chartHeight;
  const polyline = points.map((point, index) => `${toX(index)},${toY(point.correctPercent)}`).join(' ');
  const avgY = toY(average);

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full bg-blue-950/60 rounded-lg border border-blue-800">
        {[0, 25, 50, 75, 100].map((value) => (
          <g key={value}>
            <line x1={left} x2={width - 10} y1={toY(value)} y2={toY(value)} stroke="#1e3a8a" strokeWidth="1" />
            <text x={4} y={toY(value) + 4} fill="#93c5fd" fontSize="10">{value}%</text>
          </g>
        ))}
        <line x1={left} x2={width - 10} y1={avgY} y2={avgY} stroke="#facc15" strokeWidth="1.5" strokeDasharray="5 4" />
        <polyline fill="none" stroke="#22d3ee" strokeWidth="3" points={polyline} />
        {points.map((point, index) => (
          <circle key={`${point.playedAt}-${index}`} cx={toX(index)} cy={toY(point.correctPercent)} r="3.5" fill="#22d3ee" />
        ))}
      </svg>
      <div className="text-xs text-blue-300">
        Dotted line: selected-range average ({average.toFixed(1)}%).
      </div>
    </div>
  );
}
