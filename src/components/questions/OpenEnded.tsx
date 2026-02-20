'use client';
import { useState, useEffect } from 'react';

interface OpenEndedProps {
  question: { id: string };
  onAnswer: (correct: boolean) => void;
}

interface OEData {
  answer: string;
  acceptedAnswers: string[];
}

export default function OpenEnded({ question, onAnswer }: OpenEndedProps) {
  const [data, setData] = useState<OEData | null>(null);
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setData(null);
    setInput('');
    setSubmitted(false);
    fetch(`/api/questions/details?id=${question.id}&type=open_ended`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [question.id]);

  if (!data) return <div className="text-gray-400">Loading...</div>;

  function handleSubmit() {
    if (!data || submitted) return;
    setSubmitted(true);
    const norm = (s: string) => s.toLowerCase().trim();
    const correct = [data.answer, ...data.acceptedAnswers].some(a => norm(a) === norm(input));
    onAnswer(correct);
  }

  return (
    <div>
      <input value={input} onChange={e => setInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        disabled={submitted}
        placeholder="Type your answer..."
        className="w-full bg-gray-700 text-white rounded-xl p-4 text-lg mb-4 focus:outline-none focus:ring-2 focus:ring-purple-500" />
      {!submitted && (
        <button onClick={handleSubmit} className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-bold">
          Submit
        </button>
      )}
      {submitted && (
        <div className="mt-4 p-4 bg-gray-700 rounded-xl">
          <div className="text-sm text-gray-400">Correct answer:</div>
          <div className="text-lg font-bold text-yellow-400">{data.answer}</div>
        </div>
      )}
    </div>
  );
}
