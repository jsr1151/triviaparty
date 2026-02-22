'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import QuestionRenderer from '@/components/questions/QuestionRenderer';
import type { AnyQuestion } from '@/types/questions';

export default function PartyPage() {
  const [questions, setQuestions] = useState<AnyQuestion[]>([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const staticRes = await fetch(`${base}/data/questions/sheets-import-questions.json`);
        if (!staticRes.ok) {
          setQuestions([]);
          return;
        }
        const staticData = await staticRes.json();
        const all = (Array.isArray(staticData?.questions) ? staticData.questions : []).map((q: AnyQuestion, index: number) => ({
          ...q,
          id: q.id || `static-${index}`,
        }));
        const shuffled = [...all].sort(() => Math.random() - 0.5).slice(0, 20);
        setQuestions(shuffled);
      } catch {
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  function handleAnswer(correct: boolean) {
    if (answered !== null) return;
    setAnswered(correct);
    if (correct) setScore(s => s + 1);
  }

  function rerollPrompt(prompt: string) {
    const pool = questions.filter((q) => q.type === 'prompt' && (q as AnyQuestion & { prompt?: string }).prompt === prompt);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setQuestions((prev) => prev.map((q, idx) => (idx === current ? pick : q)));
    setAnswered(null);
  }

  function nextQuestion() {
    setCurrent(c => c + 1);
    setAnswered(null);
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 p-8 text-white">
      <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link>
      <div className="h-[80vh] flex items-center justify-center text-2xl">Loading...</div>
    </div>
  );

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mb-3"><Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link></div>
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold mb-4">Party Mode</h1>
          <p className="text-gray-400">No questions available yet. Add questions to get started!</p>
        </div>
      </div>
    );
  }

  if (current >= questions.length) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-3xl font-bold mb-4">Game Over!</h1>
          <p className="text-2xl text-yellow-400">Score: {score}/{questions.length}</p>
          <button onClick={() => { setCurrent(0); setScore(0); setAnswered(null); }}
            className="mt-8 bg-purple-600 hover:bg-purple-500 px-8 py-3 rounded-xl font-bold text-xl">
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const categoryLabel = (typeof q.category === 'string' ? q.category : q.category?.name) || q.type;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link>
        </div>
        <div className="flex justify-between items-center mb-8">
          <span className="text-gray-400">{current + 1}/{questions.length}</span>
          <span className="text-yellow-400 font-bold">Score: {score}</span>
        </div>
        <div className="bg-gray-800 rounded-2xl p-8">
          <div className="text-sm text-purple-400 mb-2 uppercase">{categoryLabel}</div>
          <div className="text-xl font-bold mb-6">{q.question}</div>
          <QuestionRenderer question={q} onAnswer={({ correct }) => handleAnswer(correct)} onRerollPrompt={rerollPrompt} />
          {answered !== null && (
            <div className={`mt-4 text-center text-xl font-bold ${answered ? 'text-green-400' : 'text-red-400'}`}>
              {answered ? '✓ Correct!' : '✗ Incorrect'}
            </div>
          )}
          {answered !== null && (
            <button onClick={nextQuestion} className="mt-6 w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-bold text-xl">
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
