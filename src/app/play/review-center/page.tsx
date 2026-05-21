'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { clearFlagBySignature, listFlaggedQuestionSnapshots } from '@/lib/question-session-store';

type MediaAuditItem = {
  question: string;
  category?: string | { name?: string };
  mediaUrl: string;
  reason: string;
};

export default function ReviewCenterPage() {
  const [allowed, setAllowed] = useState(false);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [tab, setTab] = useState<'flagged' | 'media'>('flagged');
  const [flagged, setFlagged] = useState(() => listFlaggedQuestionSnapshots());
  const [media, setMedia] = useState<MediaAuditItem[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const loadOwner = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        setAllowed(Boolean(data?.user?.isOwner));
      } finally {
        setLoadingOwner(false);
      }
    };
    loadOwner();
  }, []);

  useEffect(() => {
    if (!allowed) return;
    const loadMedia = async () => {
      const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
      const candidates = [
        `${base}/data/questions/flagged-media-questions.json`,
        '/triviaparty/data/questions/flagged-media-questions.json',
        '/data/questions/flagged-media-questions.json',
      ];
      for (const url of candidates) {
        const res = await fetch(url);
        if (!res.ok) continue;
        const payload = await res.json();
        setMedia(Array.isArray(payload?.items) ? payload.items : []);
        return;
      }
      setMedia([]);
    };
    loadMedia();
  }, [allowed]);

  const filteredFlagged = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return flagged;
    return flagged.filter((item) => `${item.question} ${item.category} ${item.type}`.toLowerCase().includes(q));
  }, [flagged, search]);

  const filteredMedia = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return media;
    return media.filter((item) => `${item.question} ${typeof item.category === 'string' ? item.category : item.category?.name || ''} ${item.reason}`.toLowerCase().includes(q));
  }, [media, search]);

  if (loadingOwner) {
    return <main className="min-h-screen bg-gray-950 text-white p-8">Loading…</main>;
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-gray-950 text-white p-8">
        <div className="max-w-3xl mx-auto space-y-4">
          <Link href="/" className="text-yellow-300 hover:text-yellow-200 font-bold">← Main Menu</Link>
          <div className="bg-gray-800 rounded-xl p-6 text-red-300">Owner access required.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-yellow-300">🧭 Review Center</h1>
          <Link href="/" className="text-yellow-300 hover:text-yellow-200 font-bold">← Main Menu</Link>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setTab('flagged')} className={`px-3 py-2 rounded-lg ${tab === 'flagged' ? 'bg-yellow-600 text-gray-900' : 'bg-gray-800 hover:bg-gray-700'}`}>Flagged Questions</button>
          <button onClick={() => setTab('media')} className={`px-3 py-2 rounded-lg ${tab === 'media' ? 'bg-yellow-600 text-gray-900' : 'bg-gray-800 hover:bg-gray-700'}`}>Media Audit</button>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="ml-auto bg-gray-800 rounded-lg px-3 py-2 text-sm" />
        </div>

        {tab === 'flagged' ? (
          <div className="space-y-3">
            {!filteredFlagged.length && <div className="bg-gray-800 rounded-xl p-4 text-gray-400">No flagged questions.</div>}
            {filteredFlagged.map((item) => (
              <div key={item.signature} className="bg-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-1">{item.type} · {item.category || 'uncategorized'}</div>
                <div className="font-semibold">{item.question}</div>
                <button
                  onClick={() => {
                    clearFlagBySignature(item.signature);
                    setFlagged(listFlaggedQuestionSnapshots());
                  }}
                  className="mt-2 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm"
                >
                  Unflag
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {!filteredMedia.length && <div className="bg-gray-800 rounded-xl p-4 text-gray-400">No media audit items.</div>}
            {filteredMedia.map((item, index) => (
              <div key={`${item.question}-${index}`} className="bg-gray-800 rounded-xl p-4">
                <div className="text-xs text-gray-400 mb-1">{typeof item.category === 'string' ? item.category : item.category?.name || 'uncategorized'} · {item.reason}</div>
                <div className="font-semibold">{item.question}</div>
                <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200 text-sm break-all">{item.mediaUrl}</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
