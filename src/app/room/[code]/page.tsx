'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';

type RoomPayload = {
  code: string;
  mode: string;
  status: string;
  players: Array<{ id: string; name: string; team?: string }>;
  gameState: Record<string, unknown>;
};

export default function RoomPlayerPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    params.then((value) => setCode(value.code.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!code) return;
    const load = async () => {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRoom(data.room);
    };
    load();

    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`game-${code}`);
    channel.bind('state-updated', (payload: { gameState: Record<string, unknown>; status: string }) => {
      setRoom((prev) => (prev ? { ...prev, gameState: payload.gameState, status: payload.status } : prev));
    });
    channel.bind('player-joined', (payload: { players: RoomPayload['players'] }) => {
      setRoom((prev) => (prev ? { ...prev, players: payload.players } : prev));
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${code}`);
    };
  }, [code]);

  const playerCount = useMemo(() => room?.players?.length || 0, [room]);

  async function submitEvent(event: string, payload: Record<string, unknown>) {
    if (!code) return;
    const res = await fetch(`/api/rooms/${code}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? 'Submitted.' : data?.error || 'Failed to submit.');
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">Room {code}</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm text-gray-300">Mode: {room?.mode || '—'} · Status: {room?.status || '—'} · Players: {playerCount}</div>
          <div className="text-sm text-gray-400">{JSON.stringify(room?.gameState || {}, null, 2)}</div>
          <div className="grid md:grid-cols-2 gap-2">
            <button onClick={() => submitEvent('buzz-in', { at: new Date().toISOString() })} className="bg-amber-700 hover:bg-amber-600 py-2 rounded-lg font-bold">Buzz In</button>
            <button onClick={() => submitEvent('answer-submitted', { answer, at: new Date().toISOString() })} className="bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">Submit Answer</button>
          </div>
          <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer / wager / response" className="w-full bg-gray-800 rounded-lg px-3 py-2" />
          {status && <div className="text-sm text-cyan-300">{status}</div>}
        </div>
      </div>
    </main>
  );
}
