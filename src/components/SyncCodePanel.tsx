'use client';

import { useMemo, useState } from 'react';
import { pullProgressFromFirestore } from '@/lib/firebase-sync';
import { getSyncCode, setSyncCode } from '@/lib/sync-code';

export default function SyncCodePanel() {
  const initialCode = useMemo(() => getSyncCode(), []);
  const [currentCode, setCurrentCode] = useState(initialCode);
  const [inputCode, setInputCode] = useState(initialCode);
  const [status, setStatus] = useState('');

  async function handleCopy() {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(currentCode);
    setStatus('Code copied.');
  }

  async function handleLoad() {
    const saved = setSyncCode(inputCode);
    if (!saved) {
      setStatus('Enter an 8-character code (letters and numbers).');
      return;
    }
    setCurrentCode(saved);
    setStatus('Loading progress...');
    await pullProgressFromFirestore(saved);
    setStatus('Loaded sync code.');
  }

  return (
    <section className="rounded-xl bg-blue-900 p-4 border border-blue-800">
      <h2 className="text-xl font-bold text-yellow-300 mb-2">Cross-Device Sync</h2>
      <p className="text-sm text-blue-200 mb-4">
        Enter this code on another device to sync your progress.
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="rounded-lg bg-blue-950 border border-blue-700 px-4 py-3 text-2xl font-mono tracking-[0.3em] text-cyan-200">
          {currentCode}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold px-4 py-2 rounded-md"
        >
          Copy
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={inputCode}
          onChange={event => setInputCode(event.target.value.toUpperCase())}
          placeholder="Enter sync code"
          className="bg-blue-950 border border-blue-700 rounded-md px-3 py-2 font-mono tracking-wider text-white"
        />
        <button
          type="button"
          onClick={handleLoad}
          className="bg-yellow-500 hover:bg-yellow-400 text-blue-950 font-semibold px-4 py-2 rounded-md"
        >
          Load
        </button>
      </div>
      {status ? <p className="mt-3 text-sm text-blue-200">{status}</p> : null}
    </section>
  );
}
