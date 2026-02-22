'use client';
import { useState } from 'react';
import Link from 'next/link';
import QuestionRenderer from '@/components/questions/QuestionRenderer';
import type { AnyQuestion, Difficulty } from '@/types/questions';

const TYPES = ['multiple_choice', 'open_ended', 'list', 'grouping', 'this_or_that', 'ranking', 'media', 'prompt'];
const DIFFICULTIES: Difficulty[] = ['very_easy', 'easy', 'medium', 'hard', 'very_hard'];

export default function RandomPage() {
  const [question, setQuestion] = useState<AnyQuestion | null>(null);
  const [questionBank, setQuestionBank] = useState<AnyQuestion[] | null>(null);
  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [loading, setLoading] = useState(false);
  const [answered, setAnswered] = useState<boolean | null>(null);

  async function fetchStaticBank(): Promise<AnyQuestion[]> {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const res = await fetch(`${base}/data/questions/sheets-import-questions.json`);
    if (!res.ok) return [];
    const data = await res.json();
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    return questions.map((q: AnyQuestion, index: number) => ({
      ...q,
      id: q.id || `static-${index}`,
    }));
  }

  async function loadBankIfNeeded(): Promise<AnyQuestion[]> {
    if (questionBank) return questionBank;
    const loaded = await fetchStaticBank();
    setQuestionBank(loaded);
    return loaded;
  }

  function pickRandom(questions: AnyQuestion[]): AnyQuestion | null {
    const filtered = questions.filter((q) => {
      if (type && q.type !== type) return false;
      if (difficulty && q.difficulty !== difficulty) return false;
      return true;
    });
    if (!filtered.length) return null;
    return filtered[Math.floor(Math.random() * filtered.length)];
  }

  async function fetchRandom() {
    setLoading(true);
    try {
      const bank = await loadBankIfNeeded();
      setQuestion(pickRandom(bank));
      setAnswered(null);
    } finally {
      setLoading(false);
    }
  }

  async function rerollPrompt(prompt: string) {
    const bank = await loadBankIfNeeded();
    const pool = bank.filter((q) => q.type === 'prompt' && (q as AnyQuestion & { prompt?: string }).prompt === prompt);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setQuestion(pick);
    setAnswered(null);
  }

  const categoryLabel = question
    ? (typeof question.category === 'string' ? question.category : question.category?.name) || question.type
    : '';

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-green-300 hover:text-green-200 font-bold">← Main Menu</Link>
        </div>
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
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
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
            <div className="text-xl font-bold mb-6">{question.question}</div>
            <QuestionRenderer
              question={question}
              onAnswer={({ correct }) => {
                if (answered === null) setAnswered(correct);
              }}
              onRerollPrompt={rerollPrompt}
            />
            {answered !== null && (
              <div className={`mt-4 text-center font-bold ${answered ? 'text-green-300' : 'text-red-300'}`}>
                {answered ? '✓ Correct' : '✗ Incorrect'}
              </div>
            )}
          </div>
        )}
        {question === null && !loading && (
          <div className="text-center text-gray-500">No questions found. Try different filters.</div>
        )}
      </div>
    </div>
  );
}
