'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';

type HostRoom = {
  code: string;
  mode: string;
  status: string;
  players: Array<{ id: string; name: string; team?: string; isHost?: boolean }>;
  gameState: Record<string, unknown>;
};

export default function HostRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<HostRoom | null>(null);
  const [message, setMessage] = useState('');

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
    channel.bind('player-joined', (payload: { players: HostRoom['players'] }) => {
      setRoom((prev) => (prev ? { ...prev, players: payload.players } : prev));
    });
    channel.bind('buzz-in', (payload: { player?: string }) => setMessage(payload?.player ? `${payload.player} buzzed in` : 'Buzz-in received'));
    channel.bind('wager-submitted', () => setMessage('Wager submitted'));
    channel.bind('answer-submitted', () => setMessage('Answer submitted'));
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${code}`);
    };
  }, [code]);

  async function updateState(status: string) {
    if (!code || !room) return;
    const res = await fetch(`/api/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        gameState: {
          ...(room.gameState || {}),
          phase: status,
          updatedAt: new Date().toISOString(),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setRoom(data.room);
      setMessage(`Room set to ${status}`);
    } else {
      setMessage(data?.error || 'Failed to update room');
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">Host Room {code}</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm text-gray-300">Mode: {room?.mode || '—'} · Status: {room?.status || '—'} · Code: <span className="font-mono tracking-[0.25em]">{code}</span></div>
          <div className="flex gap-2">
            <button onClick={() => updateState('lobby')} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg">Lobby</button>
            <button onClick={() => updateState('active')} className="bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-lg">Start Game</button>
            <button onClick={() => updateState('finished')} className="bg-rose-700 hover:bg-rose-600 px-3 py-2 rounded-lg">Finish</button>
          </div>
          {message && <div className="text-cyan-300 text-sm">{message}</div>}
          <div className="space-y-2">
            <div className="font-semibold">Players / Teams</div>
            {!room?.players?.length && <div className="text-gray-500 text-sm">No players joined yet.</div>}
            {room?.players?.map((player) => (
              <div key={player.id} className="bg-gray-800 rounded px-3 py-2 text-sm">
                {player.name}{player.team ? ` · Team ${player.team}` : ''}{player.isHost ? ' (Host)' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
