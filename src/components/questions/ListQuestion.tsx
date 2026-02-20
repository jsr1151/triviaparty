'use client';
import { useState, useEffect } from 'react';

interface ListQuestionProps {
  question: { id: string };
  onAnswer: (correct: boolean) => void;
}

interface ListData {
  answers: string[];
  minRequired: number;
}

export default function ListQuestion({ question, onAnswer }: ListQuestionProps) {
  const [data, setData] = useState<ListData | null>(null);
  const [input, setInput] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    setData(null);
    setInput('');
    setFound([]);
    setSubmitted(false);
    fetch(`/api/questions/details?id=${question.id}&type=list`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [question.id]);

  if (!data) return <div className="text-gray-400">Loading...</div>;

  function handleAdd() {
    if (!data || !input.trim()) return;
    const norm = (s: string) => s.toLowerCase().trim();
    const match = data.answers.find(a => norm(a) === norm(input));
    if (match && !found.includes(match)) {
      setFound(f => [...f, match]);
    }
    setInput('');
  }

  function handleDone() {
    setSubmitted(true);
    onAnswer(found.length >= (data?.minRequired || 1));
  }

  return (
    <div>
      <div className="text-sm text-gray-400 mb-3">Find at least {data.minRequired} of {data.answers.length} answers</div>
      <div className="flex gap-2 mb-4">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          disabled={submitted}
          placeholder="Type an answer..."
          className="flex-1 bg-gray-700 text-white rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-500" />
        <button onClick={handleAdd} disabled={submitted} className="bg-purple-600 hover:bg-purple-500 px-4 rounded-xl">Add</button>
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {found.map(a => <span key={a} className="bg-green-700 px-3 py-1 rounded-full text-sm">{a}</span>)}
      </div>
      {!submitted && (
        <button onClick={handleDone} className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-xl font-bold">
          Done ({found.length}/{data.answers.length})
        </button>
      )}
      {submitted && (
        <div className="mt-4 p-4 bg-gray-700 rounded-xl">
          <div className="text-sm text-gray-400 mb-2">All answers:</div>
          <div className="flex flex-wrap gap-2">
            {data.answers.map(a => (
              <span key={a} className={`px-3 py-1 rounded-full text-sm ${found.includes(a) ? 'bg-green-700' : 'bg-gray-600'}`}>{a}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
