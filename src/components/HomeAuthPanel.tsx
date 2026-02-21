'use client';

import { useEffect, useState } from 'react';

type AuthUser = {
  id: string;
  email: string;
  username: string;
};

type UserStats = {
  gamesPlayed: number;
  averageEndMoney: number;
  episodesCompleted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
};

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export default function HomeAuthPanel() {
  const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        setUser(data.user ?? null);
        setStats(data.stats ?? null);
      } catch {
      }
    })();
  }, []);

  async function submit() {
    if (isStaticHost) {
      setError('Account sign-in requires a server deployment (e.g. Vercel). GitHub Pages is static only.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const data = await postJson('/api/auth/login', { email, password });
        setUser(data.user);
        setStats(data.stats ?? null);
      } else {
        await postJson('/api/auth/signup', { email, password, username });
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        setUser(me.user ?? null);
        setStats(me.stats ?? null);
      }
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    }
    setLoading(false);
  }

  async function logout() {
    setLoading(true);
    setError('');
    try {
      await postJson('/api/auth/logout', {});
      setUser(null);
      setStats(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
    setLoading(false);
  }

  if (user) {
    return (
      <div className="max-w-4xl mx-auto bg-gray-900 rounded-2xl p-5 mb-10 border border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm text-gray-400">Signed in as</div>
            <div className="text-lg font-bold text-yellow-400">{user.username}</div>
            <div className="text-xs text-gray-400">{user.email}</div>
          </div>
          <button onClick={logout} disabled={loading} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-bold">
            Sign out
          </button>
        </div>
        {stats && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-xs text-gray-300">
            <div>Games: {stats.gamesPlayed}</div>
            <div>Avg $: {stats.averageEndMoney}</div>
            <div>Episodes: {stats.episodesCompleted}</div>
            <div>Correct: {stats.correctAnswers}</div>
            <div>Wrong: {stats.incorrectAnswers}</div>
            <div>Skipped: {stats.skippedQuestions}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto bg-gray-900 rounded-2xl p-5 mb-10 border border-gray-800">
      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('signin')} className={`px-4 py-2 rounded-lg font-bold ${mode === 'signin' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-white'}`}>
          Sign In
        </button>
        <button onClick={() => setMode('signup')} className={`px-4 py-2 rounded-lg font-bold ${mode === 'signup' ? 'bg-yellow-400 text-black' : 'bg-gray-800 text-white'}`}>
          Create Account
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="bg-gray-800 border border-gray-700 rounded px-3 py-2" />
        {mode === 'signup' && (
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" className="bg-gray-800 border border-gray-700 rounded px-3 py-2" />
        )}
        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="bg-gray-800 border border-gray-700 rounded px-3 py-2" />
      </div>

      {error && <div className="text-red-400 text-sm mt-3">{error}</div>}

      <button onClick={submit} disabled={loading} className="mt-4 bg-yellow-400 text-black px-5 py-2 rounded-lg font-bold disabled:opacity-60">
        {loading ? 'Working…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
      </button>

      {isStaticHost && !error && (
        <div className="text-yellow-300 text-sm mt-3">
          This deployment is GitHub Pages (static). Full account login requires a server deployment.
        </div>
      )}
    </div>
  );
}
