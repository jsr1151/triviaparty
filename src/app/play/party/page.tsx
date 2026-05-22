'use client';
import { useMemo, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import QuestionRenderer, { type AnswerResult } from '@/components/questions/QuestionRenderer';
import type { AnyQuestion } from '@/types/questions';
import {
  buildPartyQuestions,
  createDefaultSettings,
  type PartySettings,
} from '@/lib/party-mode';
import { getQuestionPossiblePoints } from '@/lib/question-utils';
import { isQuestionFlagged, setQuestionFlagged } from '@/lib/question-session-store';
import { PartySettingsModal, type SavedPreset } from '@/components/party/PartySettingsModal';

const LOCAL_PRESETS_KEY = 'triviaparty:party-presets';
export default function PartyPage() {
  const [allQuestions, setAllQuestions] = useState<AnyQuestion[]>([]);
  const [questions, setQuestions] = useState<AnyQuestion[]>([]);
  const [settings, setSettings] = useState<PartySettings>(createDefaultSettings());
  const [showSettings, setShowSettings] = useState(true);
  const [current, setCurrent] = useState(0);
  const [score, setScore] = useState(0);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [pointsPossible, setPointsPossible] = useState(0);
  const [typePoints, setTypePoints] = useState<Record<string, { earned: number; possible: number }>>({});
  const [answered, setAnswered] = useState<boolean | null>(null);
  const [currentResult, setCurrentResult] = useState<{ earned: number; possible: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [flagged, setFlagged] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    const load = async () => {
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
        const staticRes = await fetch(`${base}/data/questions/sheets-import-questions.json`);
        if (!staticRes.ok) {
          setAllQuestions([]);
          return;
        }
        const staticData = await staticRes.json();
        const all = (Array.isArray(staticData?.questions) ? staticData.questions : [])
          .filter((q: AnyQuestion) => {
            if (q.type !== 'media') return true;
            const mediaQuestion = q as AnyQuestion & { mediaUrl?: string; needsMediaReview?: boolean };
            const mediaUrl = mediaQuestion.mediaUrl || '';
            if (mediaQuestion.needsMediaReview) return false;
            return !/youtube\.com\/clip\//i.test(mediaUrl);
          })
          .map((q: AnyQuestion, index: number) => ({
            ...q,
            id: q.id || `static-${index}`,
          }));
        setAllQuestions(all);
      } catch {
        setAllQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const question = questions[current];
    setFlagged(Boolean(question && isQuestionFlagged(question)));
  }, [questions, current]);

  const handleTimerExpiry = useCallback(() => {
    const q = questions[current];
    if (!q || answered !== null) return;
    const possible = getQuestionPossiblePoints(q);
    setAnswered(false);
    setCurrentResult({ earned: 0, possible });
    setPointsPossible((p) => p + possible);
    setTypePoints((prev) => ({
      ...prev,
      [q.type]: {
        earned: (prev[q.type]?.earned || 0),
        possible: (prev[q.type]?.possible || 0) + possible,
      },
    }));
  }, [questions, current, answered]);

  useEffect(() => {
    if (showSettings || answered !== null) return;
    if (timeLeft <= 0) {
      handleTimerExpiry();
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, answered, showSettings, handleTimerExpiry]);

  useEffect(() => {
    const loadMeta = async () => {
      try {
        const [meRes, presetsRes] = await Promise.all([
          fetch('/api/auth/me'),
          fetch('/api/party-presets'),
        ]);

        if (meRes.ok) {
          const mePayload = await meRes.json();
          setIsOwner(Boolean(mePayload?.user?.isOwner));
        }

        const globalPresets: SavedPreset[] = presetsRes.ok
          ? ((await presetsRes.json())?.presets || []).map((preset: { id: string; name: string; description?: string; config: PartySettings }) => ({
              id: preset.id,
              name: preset.name,
              description: preset.description || undefined,
              config: preset.config,
              source: 'global' as const,
            }))
          : [];

        const localPresets = typeof window === 'undefined'
          ? []
          : (() => {
              try {
                const raw = window.localStorage.getItem(LOCAL_PRESETS_KEY);
                return raw ? JSON.parse(raw) : [];
              } catch {
                return [];
              }
            })();
        const localMapped = Array.isArray(localPresets)
          ? localPresets.map((preset: { id: string; name: string; description?: string; config: PartySettings }) => ({ ...preset, source: 'local' as const }))
          : [];

        setSavedPresets([...globalPresets, ...localMapped]);
      } catch {
        setSavedPresets([]);
      }
    };
    loadMeta();
  }, []);

  const roundLabel = useMemo(() => {
    const q = questions[current] as AnyQuestion & { partyRound?: number } | undefined;
    return q?.partyRound ? `Round ${q.partyRound}` : 'Round';
  }, [questions, current]);

  function startPartyGame() {
    const planned = buildPartyQuestions(allQuestions, settings);
    setQuestions(planned);
    setCurrent(0);
    setScore(0);
    setPointsEarned(0);
    setPointsPossible(0);
    setTypePoints({});
    setAnswered(null);
    setCurrentResult(null);
    setShowSettings(false);
    const firstQ = planned[0] as AnyQuestion & { partyTimeLimitSec?: number };
    setTimeLeft((firstQ?.partyTimeLimitSec && firstQ.partyTimeLimitSec > 0) ? firstQ.partyTimeLimitSec : 30);
  }

  function handleAnswer(result: AnswerResult) {
    if (result.override && answered === false) {
      const previous = currentResult || { earned: 0, possible: 0 };
      const earnedDelta = Math.max(0, result.pointsEarned - previous.earned);
      setAnswered(true);
      setScore((s) => s + 1);
      setPointsEarned((p) => p + earnedDelta);
      setCurrentResult({ earned: result.pointsEarned, possible: result.pointsPossible });
      setTypePoints((prev) => ({
        ...prev,
        [result.type]: {
          earned: (prev[result.type]?.earned || 0) + earnedDelta,
          possible: (prev[result.type]?.possible || 0),
        },
      }));
      return;
    }
    if (answered !== null) return;
    setAnswered(result.correct);
    setCurrentResult({ earned: result.pointsEarned, possible: result.pointsPossible });
    if (result.correct) setScore((s) => s + 1);
    setPointsEarned((p) => p + result.pointsEarned);
    setPointsPossible((p) => p + result.pointsPossible);
    setTypePoints((prev) => ({
      ...prev,
      [result.type]: {
        earned: (prev[result.type]?.earned || 0) + result.pointsEarned,
        possible: (prev[result.type]?.possible || 0) + result.pointsPossible,
      },
    }));
  }

  function rerollPrompt(prompt: string) {
    const pool = questions.filter((q) => q.type === 'prompt' && (q as AnyQuestion & { prompt?: string }).prompt === prompt);
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setQuestions((prev) => prev.map((q, idx) => (idx === current ? pick : q)));
    setAnswered(null);
    setCurrentResult(null);
  }

  function nextQuestion() {
    const nextIdx = current + 1;
    const nextQ = questions[nextIdx] as AnyQuestion & { partyTimeLimitSec?: number };
    const nextTime = (nextQ?.partyTimeLimitSec && nextQ.partyTimeLimitSec > 0) ? nextQ.partyTimeLimitSec : 30;
    setCurrent(nextIdx);
    setAnswered(null);
    setCurrentResult(null);
    setTimeLeft(nextTime);
  }

  async function saveCurrentPreset(name: string, description: string) {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const payload = {
      id: `local-${Date.now()}`,
      name: trimmedName,
      description: description.trim(),
      config: settings,
    };

    if (isOwner) {
      const res = await fetch('/api/party-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setSavedPresets((prev) => [{ ...data.preset, source: 'global' as const }, ...prev.filter((item) => item.id !== data.preset.id)]);
        return;
      }
    }

    const localOnly = savedPresets.filter((preset) => preset.source === 'local');
    const nextLocal = [{ ...payload, source: 'local' as const }, ...localOnly];
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LOCAL_PRESETS_KEY, JSON.stringify(nextLocal.map((item) => {
        const { source, ...rest } = item;
        return source ? rest : rest;
      })));
    }
    setSavedPresets((prev) => [...prev.filter((preset) => preset.source === 'global'), ...nextLocal]);
  }

  async function startMultiplayerHost() {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'party', gameConfig: settings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.room?.code) return;
    window.location.href = `/room/${data.room.code}/host`;
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 p-8 text-white">
      <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link>
      <div className="h-[80vh] flex items-center justify-center text-2xl">Loading...</div>
    </div>
  );

  if (showSettings) {
    return (
      <PartySettingsModal
        settings={settings}
        setSettings={setSettings}
        startGame={startPartyGame}
        startMultiplayerHost={startMultiplayerHost}
        savePreset={saveCurrentPreset}
        loadPreset={(preset) => setSettings(preset.config)}
        savedPresets={savedPresets}
        isOwner={isOwner}
        hasQuestions={allQuestions.length > 0}
      />
    );
  }

  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="mb-3"><Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link></div>
          <div className="text-5xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold mb-4">Party Mode</h1>
          <p className="text-gray-400">No questions available yet. Add questions to get started!</p>
        </div>
      </div>
    );
  }

  if (current >= questions.length) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-3xl font-bold mb-4">Game Over!</h1>
          <p className="text-2xl text-yellow-400">Score: {score}/{questions.length}</p>
          <p className="text-xl text-purple-300 mt-2">Points: {pointsEarned}/{pointsPossible}</p>
          {!!Object.keys(typePoints).length && (
            <div className="mt-4 bg-gray-800 rounded-lg p-3 text-left max-w-md mx-auto">
              <div className="text-xs text-gray-400 mb-2 uppercase">By question type</div>
              <div className="grid grid-cols-1 gap-1 text-sm">
                {Object.entries(typePoints).map(([key, value]) => (
                  <div key={key} className="flex justify-between bg-gray-700 rounded px-2 py-1">
                    <span>{key.replace(/_/g, ' ')}</span>
                    <span className="text-yellow-300">{value.earned}/{value.possible}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button onClick={() => setShowSettings(true)} className="mt-8 bg-purple-600 hover:bg-purple-500 px-8 py-3 rounded-xl font-bold text-xl">
            Play Again
          </button>
        </div>
      </div>
    );
  }

  const q = questions[current];
  const categoryLabel = (typeof q.category === 'string' ? q.category : q.category?.name) || q.type;
  const displayQuestionText = q.type === 'ranking' || q.type === 'list' || q.type === 'this_or_that' ? '' : q.question;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link>
        </div>
        <div className="flex justify-between items-center mb-8">
          <span className="text-gray-400">{current + 1}/{questions.length} • {roundLabel}</span>
          <div className="flex items-center gap-4">
            {answered === null && (
              <span className={`font-bold tabular-nums ${timeLeft <= 5 ? 'text-red-400' : timeLeft <= 10 ? 'text-yellow-400' : 'text-gray-300'}`}>
                ⏱ {timeLeft}s
              </span>
            )}
            <span className="text-yellow-400 font-bold">Score: {score}</span>
          </div>
        </div>
        <div className="bg-gray-800 rounded-2xl p-8">
          <div className="text-sm text-yellow-300 mb-2">Points: {pointsEarned}/{pointsPossible}</div>
          <div className="text-sm text-purple-400 mb-2 uppercase">{categoryLabel}</div>
          <button
            onClick={() => {
              const next = !flagged;
              setFlagged(next);
              setQuestionFlagged(q, next);
            }}
            className={`mb-3 px-3 py-1 rounded-lg text-sm font-bold ${flagged ? 'bg-yellow-500 text-gray-900' : 'bg-gray-700 hover:bg-gray-600 text-yellow-300'}`}
          >
            🚩 {flagged ? 'Flagged' : 'Flag'}
          </button>
          {displayQuestionText && <div className="text-xl font-bold mb-6">{displayQuestionText}</div>}
          <QuestionRenderer key={current} question={q} onAnswer={handleAnswer} onRerollPrompt={rerollPrompt} forceReveal={answered !== null} />
          {answered !== null && (
            <div className={`mt-4 text-center text-xl font-bold ${answered ? 'text-green-400' : 'text-red-400'}`}>
              {answered ? '✓ Correct!' : '✗ Incorrect'}
            </div>
          )}
          {!!Object.keys(typePoints).length && (
            <div className="mt-4 bg-gray-900 rounded-lg p-3">
              <div className="text-xs text-gray-400 mb-2 uppercase">By question type</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(typePoints).map(([key, value]) => (
                  <div key={key} className="flex justify-between bg-gray-800 rounded px-2 py-1">
                    <span>{key.replace(/_/g, ' ')}</span>
                    <span className="text-yellow-300">{value.earned}/{value.possible}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {answered !== null && (
            <button onClick={nextQuestion} className="mt-6 w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-xl font-bold text-xl">
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
