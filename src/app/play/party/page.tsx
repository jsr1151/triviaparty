'use client';
import { useState, useEffect } from 'react';
import MultipleChoice from '@/components/questions/MultipleChoice';
import OpenEnded from '@/components/questions/OpenEnded';
import ListQuestion from '@/components/questions/ListQuestion';

interface Question {
  id: string;
  type: string;
  question: string;
  difficulty: string;
  category?: { name: string };
}

export default function PartyPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/questions?limit=20')
      .then(r => r.json())
      .then(data => { setQuestions(data.questions || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleAnswer(correct: boolean) {
    setAnswered(correct);
    if (correct) setScore(s => s + 1);
  }

  function nextQuestion() {
    setCurrent(c => c + 1);
    setAnswered(null);
  }

  if (loading) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white text-2xl">Loading...</div>;

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
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

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <span className="text-gray-400">{current + 1}/{questions.length}</span>
          <span className="text-yellow-400 font-bold">Score: {score}</span>
        </div>
        <div className="bg-gray-800 rounded-2xl p-8">
          <div className="text-sm text-purple-400 mb-2 uppercase">{q.category?.name || q.type}</div>
          <div className="text-xl font-bold mb-6">{q.question}</div>
          {q.type === 'multiple_choice' && <MultipleChoice question={q} onAnswer={handleAnswer} />}
          {q.type === 'open_ended' && <OpenEnded question={q} onAnswer={handleAnswer} />}
          {q.type === 'list' && <ListQuestion question={q} onAnswer={handleAnswer} />}
          {!['multiple_choice','open_ended','list'].includes(q.type) && (
            <div className="text-gray-400 italic">Question type &quot;{q.type}&quot; viewer coming soon.</div>
          )}
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
