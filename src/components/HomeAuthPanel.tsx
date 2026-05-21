'use client';

import { useEffect, useRef, useState } from 'react';

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

/** Collect all local progress from localStorage for one-time import. */
function gatherLocalProgress() {
  if (typeof window === 'undefined') return null;
  try {
    const rawClues = window.localStorage.getItem('triviaparty:local:clues');
    const rawOverall = window.localStorage.getItem('triviaparty:local:overall');
    const clues = rawClues ? Object.values(JSON.parse(rawClues)) : [];
    const overall = rawOverall ? JSON.parse(rawOverall) : null;
    return { clues, overall };
  } catch {
    return null;
  }
}

/** Returns true if there is meaningful local progress worth importing. */
function hasLocalProgress(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem('triviaparty:local:overall');
    if (!raw) return false;
    const overall = JSON.parse(raw);
    return (overall?.correctAnswers ?? 0) + (overall?.incorrectAnswers ?? 0) + (overall?.skippedQuestions ?? 0) > 0;
  } catch {
    return false;
  }
}

const IMPORT_DONE_KEY = 'triviaparty:local:imported';

export default function HomeAuthPanel() {
  const isStaticHost = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState('');
  const [importMsg, setImportMsg] = useState('');

  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');

  const didAutoImport = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        if (data.user) {
          setUser(data.user);
          setStats(data.stats ?? null);
        }
      } catch {
      }
    })();
  }, []);

  /** Attempt to silently import local progress once after sign-in. */
  async function tryImportLocal() {
    if (didAutoImport.current) return;
    const alreadyDone = typeof window !== 'undefined' && window.localStorage.getItem(IMPORT_DONE_KEY) === '1';
    if (alreadyDone || !hasLocalProgress()) return;
    didAutoImport.current = true;

    try {
      const progress = gatherLocalProgress();
      if (!progress) return;
      const result = await postJson('/api/user/import-local', progress);
      if ((result.imported ?? 0) > 0) {
        setImportMsg(`✅ Imported ${result.imported} local clue(s) into your account.`);
        window.localStorage.setItem(IMPORT_DONE_KEY, '1');
        // Refresh stats
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setStats(me.stats ?? null);
        }
      }
    } catch {
      // Non-fatal; local progress remains in localStorage
    }
  }

  async function submit() {
    if (isStaticHost) {
      setError('Account sign-in requires a server deployment (e.g. Vercel). GitHub Pages is static only.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') {
        const data = await postJson('/api/auth/login', { login, password });
        setUser(data.user);
        setStats(data.stats ?? null);
        await tryImportLocal();
      } else {
        await postJson('/api/auth/signup', { email, username, password });
        const meRes = await fetch('/api/auth/me');
        const me = await meRes.json();
        setUser(me.user ?? null);
        setStats(me.stats ?? null);
        await tryImportLocal();
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
    setImportMsg('');
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
        {importMsg && <div className="text-green-400 text-sm mt-3">{importMsg}</div>}
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

      {mode === 'signin' ? (
        <div className="grid md:grid-cols-2 gap-3">
          <input
            aria-label="Username or email"
            autoComplete="username"
            value={login}
            onChange={e => setLogin(e.target.value)}
            placeholder="Username or email"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
          />
          <input
            type="password"
            aria-label="Password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
          />
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-3">
          <input
            aria-label="Email"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
          />
          <input
            aria-label="Username"
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Username"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
          />
          <input
            type="password"
            aria-label="Password"
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password (min 6 chars)"
            className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
          />
        </div>
      )}

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
