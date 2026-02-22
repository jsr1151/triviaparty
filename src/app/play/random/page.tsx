'use client';
import { useState } from 'react';

interface Question {
  id?: string;
  type: string;
  question: string;
  difficulty: string;
  category?: { name: string } | string;
  options?: string[];
  correctAnswer?: string;
  answer?: string;
  acceptedAnswers?: string[];
  answers?: string[];
  minRequired?: number;
}

const TYPES = ['multiple_choice', 'open_ended', 'list', 'grouping', 'this_or_that', 'ranking', 'media', 'prompt'];
const DIFFICULTIES = ['easy', 'medium', 'hard'];

export default function RandomPage() {
  const [question, setQuestion] = useState<Question | null>(null);
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);

  async function fetchStaticBank(): Promise<Question[]> {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const res = await fetch(`${base}/data/questions/random-index.json`);
    if (!res.ok) return [];
    const data = await res.json();
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    return questions.map((q: Question, index: number) => ({
      ...q,
      id: q.id || `static-${index}`,
    }));
  }

  async function fetchRandom() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '1' });
      if (type) params.append('type', type);
      if (difficulty) params.append('difficulty', difficulty);

      const apiRes = await fetch(`/api/questions?${params}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data.questions?.[0]) {
          setQuestion(data.questions[0]);
          setLoading(false);
          return;
        }
      }

      const staticQuestions = await fetchStaticBank();
      const filtered = staticQuestions.filter((q) => {
        if (type && q.type !== type) return false;
        if (difficulty && q.difficulty !== difficulty) return false;
        return true;
      });
      if (filtered.length === 0) {
        setQuestion(null);
      } else {
        const pick = filtered[Math.floor(Math.random() * filtered.length)];
        setQuestion(pick);
      }
    } finally {
      setLoading(false);
    }
  }

  const categoryLabel = question
    ? (typeof question.category === 'string' ? question.category : question.category?.name) || question.type
    : '';

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
            <div className="text-sm text-green-400 mb-2 uppercase">{categoryLabel} • {question.difficulty}</div>
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
