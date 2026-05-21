'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { clearFlagBySignature, listFlaggedQuestionSnapshots } from '@/lib/question-session-store';

type FlaggedItem = {
  signature: string;
  type: string;
  question: string;
  category: string;
  flaggedAt: string;
};

export default function FlaggedQuestionsPage() {
  const [items, setItems] = useState<FlaggedItem[]>([]);

  useEffect(() => {
    setItems(listFlaggedQuestionSnapshots());
  }, []);

  function unflag(signature: string) {
    clearFlagBySignature(signature);
    setItems((prev) => prev.filter((item) => item.signature !== signature));
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-300">🚩 Flagged Questions</h1>
          <Link href="/" className="text-yellow-300 hover:text-yellow-200 font-bold">← Main Menu</Link>
        </div>
        {!items.length && (
          <div className="bg-gray-800 rounded-xl p-6 text-gray-300">
            No flagged questions yet. Flag questions while playing Party or Random mode.
          </div>
        )}
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.signature} className="bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="text-xs text-purple-300 uppercase">{item.type.replace(/_/g, ' ')} • {item.category || 'uncategorized'}</div>
              <div className="text-lg font-semibold">{item.question}</div>
              <div className="text-xs text-gray-400">Flagged {new Date(item.flaggedAt).toLocaleString()}</div>
              <button onClick={() => unflag(item.signature)} className="bg-red-700 hover:bg-red-600 px-3 py-1 rounded-lg text-sm font-bold">
                Unflag
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
