'use client';
import { useState } from 'react';

interface Question {
  id: string;
  type: string;
  question: string;
  difficulty: string;
  category?: { name: string };
}

const TYPES = ['multiple_choice', 'open_ended', 'list', 'grouping', 'this_or_that', 'ranking', 'media', 'prompt'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function RandomPage() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);

  function fetchRandom() {
    setLoading(true);
    const params = new URLSearchParams({ limit: '1' });
    if (type) params.append('type', type);
    if (difficulty) params.append('difficulty', difficulty);
    fetch(`/api/questions?${params}`)
      .then(r => r.json())
      .then(data => { setQuestion(data.questions?.[0] || null); setLoading(false); })
      .catch(() => setLoading(false));
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-green-400 mb-8 text-center">🎲 Random Questions</h1>
        <div className="bg-gray-800 rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-2">
                <option value="">Any type</option>
                {TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg p-2">
                <option value="">Any difficulty</option>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <button onClick={fetchRandom} disabled={loading}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-600 py-3 rounded-xl font-bold text-xl">
            {loading ? 'Loading...' : 'Get Random Question'}
          </button>
        </div>
        {question && (
          <div className="bg-gray-800 rounded-2xl p-8">
            <div className="text-sm text-green-400 mb-2 uppercase">{question.category?.name || question.type} • {question.difficulty}</div>
            <div className="text-xl font-bold">{question.question}</div>
          </div>
        )}
        {question === null && !loading && (
          <div className="text-center text-gray-500">No questions found. Try different filters.</div>
        )}
      </div>
    </div>
  );
}
