'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type FlaggedItem = {
  question: string;
  category?: string | { name?: string };
  mediaUrl: string;
  reason: string;
  audit?: {
    title?: string;
    overlap?: string[];
    overlapRatio?: number;
  };
};

type FlaggedPayload = {
  count: number;
  items: FlaggedItem[];
};

const UNVERIFIED_REASONS = new Set([
  'unresolved_youtube_clip',
  'potentially_mismatched_converted_clip_url',
  'low_confidence_video_match',
]);

export default function MediaAuditPage() {
  const [payload, setPayload] = useState<FlaggedPayload>({ count: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('all');

  useEffect(() => {
    const load = async () => {
      setLoadError(null);
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const candidates = Array.from(new Set([
          `${base}/data/questions/flagged-media-questions.json`,
          '/triviaparty/data/questions/flagged-media-questions.json',
          '/data/questions/flagged-media-questions.json',
        ]));

        let loaded = false;
        let lastFailure = '';

        for (const url of candidates) {
          const res = await fetch(url);
          if (!res.ok) {
            lastFailure = `${url} -> ${res.status}`;
            continue;
          }

          const data = await res.json();
          setPayload({
            count: Number(data?.count || 0),
            items: Array.isArray(data?.items) ? data.items : [],
          });
          loaded = true;
          break;
        }

        if (!loaded) {
          setPayload({ count: 0, items: [] });
          setLoadError(lastFailure || 'No valid audit dataset endpoint responded.');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const reasonOptions = useMemo(() => {
    const options = Array.from(new Set(payload.items.map((item) => item.reason).filter(Boolean)));
    return ['all', ...options];
  }, [payload.items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payload.items.filter((item) => {
      if (reason !== 'all' && item.reason !== reason) return false;
      if (!q) return true;
      const categoryText = typeof item.category === 'string' ? item.category : item.category?.name || '';
      return [item.question, categoryText, item.mediaUrl, item.audit?.title || ''].join(' ').toLowerCase().includes(q);
    });
  }, [payload.items, reason, search]);

  const reasonCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of payload.items) counts[item.reason] = (counts[item.reason] || 0) + 1;
    return counts;
  }, [payload.items]);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-4xl font-bold text-yellow-400">Media Audit</h1>
          <Link href="/" className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg font-bold">Main Menu</Link>
        </div>

        <div className="bg-gray-900 rounded-xl p-4 mb-6">
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Total flagged</div>
              <div className="text-2xl font-bold text-yellow-300">{payload.count}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Shown</div>
              <div className="text-2xl font-bold text-cyan-300">{filtered.length}</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-3">
              <div className="text-xs text-gray-400">Reasons</div>
              <div className="text-sm text-gray-200">{Object.keys(reasonCounts).length}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search question/category/video title"
              className="md:col-span-3 bg-gray-800 border border-gray-700 rounded-lg p-2"
            />
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg p-2">
              {reasonOptions.map((option) => (
                <option key={option} value={option}>
                  {option === 'all' ? 'All reasons' : `${option} (${reasonCounts[option] || 0})`}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading audit list…</div>
        ) : loadError ? (
          <div className="text-red-300">Could not load audit items: {loadError}</div>
        ) : filtered.length === 0 ? (
          <div className="text-gray-400">No flagged items for this filter.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item, index) => {
              const categoryText = typeof item.category === 'string' ? item.category : item.category?.name || 'uncategorized';
              const isUnverified = UNVERIFIED_REASONS.has(item.reason);
              const searchHref = `https://www.youtube.com/results?search_query=${encodeURIComponent(item.question)}`;
              return (
                <div key={`${item.question}-${index}`} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="text-sm text-purple-300 mb-1">{categoryText}</div>
                  <div className="font-bold mb-2">{item.question}</div>
                  <div className="text-xs text-red-300 mb-2">{item.reason}</div>
                  {item.audit?.title && (
                    <div className="text-xs text-gray-300 mb-2">
                      Current video title: <span className="text-gray-100">{item.audit.title}</span>
                      {typeof item.audit.overlapRatio === 'number' && (
                        <span className="ml-2 text-yellow-300">overlap {item.audit.overlapRatio}</span>
                      )}
                    </div>
                  )}
                  {isUnverified ? (
                    <div className="space-y-2">
                      <div className="text-xs text-yellow-300">Unverified media URL hidden (known mismatch risk).</div>
                      <a href={searchHref} target="_blank" rel="noreferrer" className="text-sm text-blue-300 underline break-all">
                        Search this clue on YouTube
                      </a>
                    </div>
                  ) : (
                    <a href={item.mediaUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-300 underline break-all">
                      {item.mediaUrl}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
