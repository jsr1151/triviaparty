'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type LearnQueueItem = {
  id: string;
  sourceType: 'jeopardy' | 'non_jeopardy';
  sourceId: string;
  prompt: string;
  answer: string;
  category: string | null;
  reviewCount: number;
  lapseCount: number;
  consecutiveCorrect: number;
  nextDueAt: string;
  masteredAt: string | null;
  lastOutcome: string;
};

type LearnPayload = {
  queue: LearnQueueItem[];
  counts: {
    due: number;
    mastered: number;
    total: number;
  };
};

export default function LearnModePage() {
  const [loading, setLoading] = useState(true);
  const [includeNonJeopardy, setIncludeNonJeopardy] = useState(false);
  const [queue, setQueue] = useState<LearnQueueItem[]>([]);
  const [counts, setCounts] = useState({ due: 0, mastered: 0, total: 0 });
  const [signedIn, setSignedIn] = useState(true);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [lastMastered, setLastMastered] = useState(false);
  const [reviewedThisSession, setReviewedThisSession] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const current = queue[0] ?? null;
  const remaining = queue.length;

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/user/learn?includeNonJeopardy=${includeNonJeopardy}`);
      if (res.status === 401) {
        setSignedIn(false);
        return;
      }
      if (!res.ok) throw new Error('Failed');
      const data = (await res.json()) as LearnPayload;
      setQueue(data.queue ?? []);
      setCounts(data.counts ?? { due: 0, mastered: 0, total: 0 });
      setSignedIn(true);
      setRevealed(false);
      setFeedback('');
      setLastMastered(false);
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [includeNonJeopardy]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  async function submitGrade(correct: boolean) {
    if (!current || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/user/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grade',
          itemId: current.id,
          correct,
        }),
      });
      const data = await res.json();
      const item = data?.item as { masteredAt?: string | null; nextDueAt?: string } | undefined;
      setLastMastered(Boolean(item?.masteredAt));
      setFeedback(correct ? `Saved. Next review: ${item?.nextDueAt ? new Date(item.nextDueAt).toLocaleString() : 'scheduled'}` : 'Marked again. This card returns in about 10 minutes.');
      setReviewedThisSession((v) => v + 1);
      setQueue((prev) => prev.slice(1));
      setCounts((prev) => ({ ...prev, due: Math.max(0, prev.due - 1) }));
      setRevealed(false);
    } finally {
      setSubmitting(false);
    }
  }

  const dueLabel = useMemo(() => {
    if (counts.due === 1) return '1 card due';
    return `${counts.due} cards due`;
  }, [counts.due]);

  return (
    <main className="min-h-screen bg-blue-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold text-yellow-400">Learn Mode</h1>
          <Link href="/" className="bg-blue-800 hover:bg-blue-700 px-4 py-2 rounded-lg font-bold">Main Menu</Link>
        </div>

        <section className="bg-blue-900 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="text-blue-200">Anki-style review queue based on <span className="text-yellow-300 font-bold">practice-mode Jeopardy misses</span>.</div>
            <button onClick={() => void loadQueue()} className="px-3 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm font-bold">Refresh queue</button>
          </div>
          <label className="text-sm text-blue-200 flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeNonJeopardy}
              onChange={(e) => setIncludeNonJeopardy(e.target.checked)}
            />
            Include non-Jeopardy questions in review queue
          </label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Metric label="Due now" value={dueLabel} />
            <Metric label="Mastered" value={counts.mastered} />
            <Metric label="Tracked cards" value={counts.total} />
            <Metric label="Reviewed this session" value={reviewedThisSession} />
          </div>
        </section>

        {!signedIn && (
          <section className="bg-blue-900 rounded-xl p-4">
            Sign in from the home page to use synced Learn mode.
          </section>
        )}

        {signedIn && loading && <section className="bg-blue-900 rounded-xl p-4">Loading review queue…</section>}

        {signedIn && !loading && !current && (
          <section className="bg-blue-900 rounded-xl p-6 text-center space-y-2">
            <div className="text-2xl">✅</div>
            <div className="font-bold text-yellow-300">No cards due right now.</div>
            <div className="text-sm text-blue-200">Miss clues in Jeopardy practice mode (or enable non-Jeopardy cards) to refill this queue.</div>
          </section>
        )}

        {signedIn && !loading && current && (
          <section className="bg-blue-900 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between text-sm">
              <div className="text-blue-300">{current.sourceType === 'jeopardy' ? 'Jeopardy practice miss' : 'Non-Jeopardy review'}</div>
              <div className="text-blue-300">Remaining due: {remaining}</div>
            </div>
            {current.category && <div className="text-xs uppercase tracking-wide text-yellow-300">{current.category}</div>}
            <div className="text-lg font-semibold whitespace-pre-wrap">{current.prompt}</div>

            {!revealed ? (
              <button onClick={() => setRevealed(true)} className="bg-yellow-400 text-blue-950 px-6 py-2 rounded-lg font-bold">Reveal answer</button>
            ) : (
              <div className="bg-blue-950/70 border border-blue-700 rounded-lg p-4 whitespace-pre-wrap">
                {current.answer}
              </div>
            )}

            {revealed && (
              <div className="flex flex-wrap gap-2">
                <button disabled={submitting} onClick={() => void submitGrade(false)} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg font-bold disabled:opacity-60">Again</button>
                <button disabled={submitting} onClick={() => void submitGrade(true)} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-lg font-bold disabled:opacity-60">Got it</button>
              </div>
            )}

            {feedback && (
              <div className="text-sm text-blue-200">
                {feedback} {lastMastered ? <span className="text-yellow-300 font-bold">Card mastered.</span> : null}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-blue-950/50 rounded-lg p-2">
      <div className="text-xs text-blue-300">{label}</div>
      <div className="text-base font-bold text-yellow-300">{value}</div>
    </div>
  );
}
