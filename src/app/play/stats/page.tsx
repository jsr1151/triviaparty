'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getOverallStats, listEpisodeStats } from '@/lib/local-tracker';

export default function StatsPage() {
  const [overall, setOverall] = useState(getOverallStats());
  const [episodes, setEpisodes] = useState(listEpisodeStats());

  useEffect(() => {
    setOverall(getOverallStats());
    setEpisodes(listEpisodeStats());
  }, []);

  return (
    <main className="min-h-screen bg-blue-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold text-yellow-400">Statistics</h1>
          <Link href="/" className="bg-blue-800 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold">Main Menu</Link>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Stat label="Games Played" value={overall.gamesPlayed} />
          <Stat label="Episodes Completed" value={overall.episodesCompleted} />
          <Stat label="Correct" value={overall.correctAnswers} />
          <Stat label="Wrong" value={overall.incorrectAnswers} />
          <Stat label="Skipped" value={overall.skippedQuestions} />
        </div>

        <div className="bg-blue-900 rounded-xl p-4">
          <h2 className="text-xl font-bold mb-3">Episode History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-blue-200">
                  <th className="text-left py-2">Episode</th>
                  <th className="text-left py-2">Mode</th>
                  <th className="text-left py-2">Progress</th>
                  <th className="text-left py-2">C/W/S</th>
                  <th className="text-left py-2">Completed</th>
                </tr>
              </thead>
              <tbody>
                {episodes.slice(0, 200).map(ep => (
                  <tr key={ep.episodeKey} className="border-t border-blue-800">
                    <td className="py-2">{ep.showNumber ? `Show #${ep.showNumber}` : ep.episodeKey.split(':')[0]}</td>
                    <td className="py-2 capitalize">{ep.mode}</td>
                    <td className="py-2">{ep.answeredClues}/{ep.totalClues}</td>
                    <td className="py-2">{ep.correctAnswers}/{ep.incorrectAnswers}/{ep.skippedQuestions}</td>
                    <td className="py-2">{ep.completed ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-blue-900 rounded-xl p-3">
      <div className="text-xs text-blue-300">{label}</div>
      <div className="text-2xl font-bold text-yellow-300">{value.toLocaleString()}</div>
    </div>
  );
}
