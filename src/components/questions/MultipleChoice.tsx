'use client';
import { useState, useEffect } from 'react';

interface MultipleChoiceProps {
  question: { id: string };
  onAnswer: (correct: boolean) => void;
}

interface MCData {
  options: string[];
  correctAnswer: string;
}

export default function MultipleChoice({ question, onAnswer }: MultipleChoiceProps) {
  const [data, setData] = useState<MCData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setSelected(null);
    fetch(`/api/questions/details?id=${question.id}&type=multiple_choice`)
      .then(r => r.json())
      .then(setData)
      .catch(() => {});
  }, [question.id]);

  if (!data) return <div className="text-gray-400">Loading options...</div>;

  function handleSelect(opt: string) {
    if (selected) return;
    setSelected(opt);
    onAnswer(opt === data!.correctAnswer);
  }

  return (
    <div className="space-y-3">
      {data.options.map(opt => (
        <button key={opt} onClick={() => handleSelect(opt)}
          className={`w-full text-left p-4 rounded-xl font-medium transition-colors
            ${selected === null ? 'bg-gray-700 hover:bg-gray-600' :
              opt === data.correctAnswer ? 'bg-green-700' :
              opt === selected ? 'bg-red-700' : 'bg-gray-700 opacity-50'}`}>
          {opt}
        </button>
      ))}
    </div>
  );
}
