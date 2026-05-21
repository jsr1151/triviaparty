'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function JoinRoomPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [team, setTeam] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  async function joinRoom() {
    if (!code.trim() || !displayName.trim()) {
      setError('Room code and display name are required.');
      return;
    }
    setJoining(true);
    setError('');
    const roomCode = code.trim().toUpperCase();
    const res = await fetch(`/api/rooms/${roomCode}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, team }),
    });
    const data = await res.json().catch(() => ({}));
    setJoining(false);
    if (!res.ok) {
      setError(data?.error || 'Unable to join room.');
      return;
    }
    if (typeof window !== 'undefined' && data?.playerId) {
      window.localStorage.setItem(`triviaparty:room:${roomCode}:player`, JSON.stringify({
        playerId: data.playerId,
        playerName: displayName.trim(),
        team: team.trim() || undefined,
      }));
    }
    router.push(`/room/${roomCode}`);
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">🎮 Join Game</h1>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} placeholder="Room Code" className="w-full bg-gray-800 rounded-lg px-3 py-2 tracking-[0.3em] font-mono text-center" />
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display Name" className="w-full bg-gray-800 rounded-lg px-3 py-2" />
          <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Team (optional)" className="w-full bg-gray-800 rounded-lg px-3 py-2" />
          {error && <div className="text-red-300 text-sm">{error}</div>}
          <button onClick={joinRoom} disabled={joining} className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 py-2 rounded-lg font-bold">
            {joining ? 'Joining…' : 'Join Room'}
          </button>
        </div>
      </div>
    </main>
  );
}
