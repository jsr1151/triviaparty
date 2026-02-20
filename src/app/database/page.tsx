'use client';

import { useEffect, useState } from 'react';

interface DatabaseQuestion {
  id: string;
  source: 'database' | 'jeopardy';
  type: string;
  difficulty: string;
  question: string;
  explanation: string | null;
  category: { slug: string; name: string } | null;
  tags: string[];
  details: {
    multipleChoice: { options: unknown[]; correctAnswer: string } | null;
    openEnded: { acceptedAnswers: unknown[] } | null;
    listQuestion: { answers: unknown[]; minRequired: number } | null;
    groupingQuestion: { items: unknown[]; correctItems: unknown[]; groupName: string } | null;
    thisOrThat: { items: unknown[]; categoryA: string; categoryB: string } | null;
    rankingQuestion: { items: unknown[]; criteria: string } | null;
    mediaQuestion: { mediaType: string; mediaUrl: string } | null;
    promptQuestion: { hints: unknown[] } | null;
    jeopardy: {
      gameId: number;
      showNumber: number;
      airDate: string;
      season: number | null;
      value: number | null;
      round: string;
      dailyDouble: boolean;
      tripleStumper: boolean;
      category: string;
    } | null;
  };
}

const TYPES = ['all', 'jeopardy', 'multiple_choice', 'open_ended', 'list', 'grouping', 'this_or_that', 'ranking', 'media', 'prompt'];
const DIFFICULTIES = ['all', 'n/a', 'easy', 'medium', 'hard'];
const SOURCES = ['all', 'database', 'jeopardy'];

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatInfo(q: DatabaseQuestion): string {
  if (q.details.multipleChoice) return `${asArray(q.details.multipleChoice.options).length} options`;
  if (q.details.openEnded) return `${asArray(q.details.openEnded.acceptedAnswers).length} accepted answers`;
  if (q.details.listQuestion) return `${asArray(q.details.listQuestion.answers).length} list answers • min ${q.details.listQuestion.minRequired}`;
  if (q.details.groupingQuestion) return `${asArray(q.details.groupingQuestion.items).length} items • group ${q.details.groupingQuestion.groupName}`;
  if (q.details.thisOrThat) return `${asArray(q.details.thisOrThat.items).length} items • ${q.details.thisOrThat.categoryA} / ${q.details.thisOrThat.categoryB}`;
  if (q.details.rankingQuestion) return `${asArray(q.details.rankingQuestion.items).length} ranked items • ${q.details.rankingQuestion.criteria}`;
  if (q.details.mediaQuestion) return `${q.details.mediaQuestion.mediaType} • ${q.details.mediaQuestion.mediaUrl}`;
  if (q.details.promptQuestion) return `${asArray(q.details.promptQuestion.hints).length} hints`;
  if (q.details.jeopardy) {
    const valueLabel = q.details.jeopardy.value == null ? 'FJ' : `$${q.details.jeopardy.value}`;
    return `Show #${q.details.jeopardy.showNumber} • ${q.details.jeopardy.round} • ${valueLabel}`;
  }
  return 'No type details';
}

export default function DatabasePage() {
  const [questions, setQuestions] = useState<DatabaseQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [difficulty, setDifficulty] = useState('all');
  const [source, setSource] = useState('all');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) params.set('search', search.trim());
      if (type !== 'all') params.set('type', type);
      if (difficulty !== 'all') params.set('difficulty', difficulty);
      if (source !== 'all') params.set('source', source);

      try {
        const res = await fetch(`/api/questions/database?${params.toString()}`);
        const data = await res.json();
        setQuestions(data.questions ?? []);
        setTotal(data.total ?? 0);
      } catch {
        setQuestions([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [page, limit, search, type, difficulty, source]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-2 text-cyan-400">🗄️ Database</h1>
        <p className="text-gray-300 mb-6">Browse questions in the database with their tags and type metadata.</p>

        <div className="bg-gray-900 rounded-xl p-4 mb-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <input
            value={search}
            onChange={(e) => { setPage(1); setSearch(e.target.value); }}
            placeholder="Search question or explanation..."
            className="md:col-span-2 bg-gray-800 rounded-lg px-3 py-2"
          />
          <select
            value={source}
            onChange={(e) => { setPage(1); setSource(e.target.value); }}
            className="bg-gray-800 rounded-lg px-3 py-2"
          >
            {SOURCES.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All sources' : s}</option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => { setPage(1); setType(e.target.value); }}
            className="bg-gray-800 rounded-lg px-3 py-2"
          >
            {TYPES.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'All types' : t}</option>
            ))}
          </select>
          <select
            value={difficulty}
            onChange={(e) => { setPage(1); setDifficulty(e.target.value); }}
            className="bg-gray-800 rounded-lg px-3 py-2"
          >
            {DIFFICULTIES.map(d => (
              <option key={d} value={d}>{d === 'all' ? 'All difficulties' : d}</option>
            ))}
          </select>
        </div>

        <div className="text-sm text-gray-400 mb-3">{total} total question{total !== 1 ? 's' : ''}</div>

        <div className="overflow-auto rounded-xl border border-gray-800">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-900 text-gray-300">
              <tr>
                <th className="text-left p-3">ID</th>
                <th className="text-left p-3">Source</th>
                <th className="text-left p-3">Question</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Difficulty</th>
                <th className="text-left p-3">Category</th>
                <th className="text-left p-3">Tags</th>
                <th className="text-left p-3">Info</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="p-4 text-gray-400" colSpan={8}>Loading...</td></tr>
              ) : questions.length === 0 ? (
                <tr><td className="p-4 text-gray-400" colSpan={8}>No questions found.</td></tr>
              ) : (
                questions.map(q => (
                  <tr key={q.id} className="border-t border-gray-800 align-top">
                    <td className="p-3 text-xs text-yellow-300">{q.id}</td>
                    <td className="p-3 text-xs">{q.source}</td>
                    <td className="p-3">
                      <div className="font-medium">{q.question}</div>
                      {q.explanation && <div className="text-xs text-gray-400 mt-1">{q.explanation}</div>}
                    </td>
                    <td className="p-3 text-cyan-300">{q.type}</td>
                    <td className="p-3">{q.difficulty}</td>
                    <td className="p-3">{q.category?.name ?? '—'}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {q.tags.map(tag => (
                          <span key={`${q.id}-${tag}`} className="bg-gray-800 text-gray-200 px-2 py-0.5 rounded text-xs">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-gray-300">{formatInfo(q)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-2 rounded-lg bg-gray-800 disabled:opacity-40"
          >
            Previous
          </button>
          <div className="text-sm text-gray-300">Page {page} / {totalPages}</div>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-2 rounded-lg bg-gray-800 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </main>
  );
}
