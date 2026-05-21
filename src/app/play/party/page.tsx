'use client';
import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import QuestionRenderer, { type AnswerResult } from '@/components/questions/QuestionRenderer';
import type { AnyQuestion } from '@/types/questions';
import {
  buildPartyQuestions,
  createDefaultSettings,
  createPresetSettings,
  PARTY_TYPES,
  type PartySettings,
} from '@/lib/party-mode';
import { isQuestionFlagged, setQuestionFlagged } from '@/lib/question-session-store';

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
  const [loading, setLoading] = useState(true);
  const [flagged, setFlagged] = useState(false);

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
    setShowSettings(false);
  }

  function handleAnswer(result: AnswerResult) {
    if (result.override && answered === false) {
      setAnswered(true);
      setScore((s) => s + 1);
      setPointsEarned((p) => p + result.pointsEarned);
      setTypePoints((prev) => ({
        ...prev,
        [result.type]: {
          earned: (prev[result.type]?.earned || 0) + result.pointsEarned,
          possible: (prev[result.type]?.possible || 0) + result.pointsPossible,
        },
      }));
      return;
    }
    if (answered !== null) return;
    setAnswered(result.correct);
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
  }

  function nextQuestion() {
    setCurrent((c) => c + 1);
    setAnswered(null);
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
          <span className="text-yellow-400 font-bold">Score: {score}</span>
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
          <QuestionRenderer question={q} onAnswer={handleAnswer} onRerollPrompt={rerollPrompt} />
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

function PartySettingsModal({
  settings,
  setSettings,
  startGame,
  hasQuestions,
}: {
  settings: PartySettings;
  setSettings: (value: PartySettings) => void;
  startGame: () => void;
  hasQuestions: boolean;
}) {
  const totalQuestions = settings.rounds.reduce((sum, round) => sum + Math.max(1, round.questionCount), 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-purple-300">🎉 Party Mode Settings</h1>
          <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['Pursuit (Short)', 'pursuit-short'],
              ['Pursuit (Long)', 'pursuit-long'],
              ['Lightning Round', 'lightning-round'],
              ['Variety Pack', 'variety-pack'],
              ['Expert Challenge', 'expert-challenge'],
            ].map(([label, key]) => (
              <button key={key} onClick={() => setSettings(createPresetSettings(key))} className="bg-indigo-700 hover:bg-indigo-600 px-3 py-2 rounded-lg text-sm font-bold">
                {label}
              </button>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="font-bold text-purple-300">Difficulty</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={settings.difficultyScope} onChange={(e) => setSettings({ ...settings, difficultyScope: e.target.value as 'game' | 'round' })} className="bg-gray-700 rounded p-2">
                  <option value="game">Game level</option>
                  <option value="round">Per round</option>
                </select>
                <select value={settings.difficultyMode} onChange={(e) => setSettings({ ...settings, difficultyMode: e.target.value as PartySettings['difficultyMode'] })} className="bg-gray-700 rounded p-2">
                  <option value="set">Set</option>
                  <option value="scaling_incremental">Scaling – Incremental</option>
                  <option value="scaling_performance">Scaling – Performance-based</option>
                  <option value="random">Random</option>
                </select>
              </div>
              {settings.difficultyMode === 'set' && (
                <select value={settings.fixedDifficulty} onChange={(e) => setSettings({ ...settings, fixedDifficulty: e.target.value as PartySettings['fixedDifficulty'] })} className="bg-gray-700 rounded p-2 w-full">
                  <option value="very_easy">Very Easy</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="very_hard">Very Hard</option>
                </select>
              )}
            </div>
            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="font-bold text-purple-300">Categories</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={settings.categoryScope} onChange={(e) => setSettings({ ...settings, categoryScope: e.target.value as 'game' | 'round' })} className="bg-gray-700 rounded p-2">
                  <option value="game">Game level</option>
                  <option value="round">Per round</option>
                </select>
                <select value={settings.categoryMode} onChange={(e) => setSettings({ ...settings, categoryMode: e.target.value as PartySettings['categoryMode'] })} className="bg-gray-700 rounded p-2">
                  <option value="balanced">Balanced</option>
                  <option value="cycle">Cycle</option>
                  <option value="random">Random</option>
                  <option value="choice">Choice</option>
                </select>
              </div>
              <input
                value={settings.categoryTheme}
                onChange={(e) => setSettings({ ...settings, categoryTheme: e.target.value })}
                placeholder="Theme category (optional)"
                className="bg-gray-700 rounded p-2 w-full"
              />
              <input
                value={settings.categoryOptions.join(', ')}
                onChange={(e) => setSettings({ ...settings, categoryOptions: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                placeholder="Choice options (comma separated)"
                className="bg-gray-700 rounded p-2 w-full"
              />
              <input
                value={settings.excludedCategories.join(', ')}
                onChange={(e) => setSettings({ ...settings, excludedCategories: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                placeholder="Excluded categories (comma separated)"
                className="bg-gray-700 rounded p-2 w-full"
              />
            </div>
          </div>

          <div className="space-y-3">
            {settings.rounds.map((round, roundIndex) => (
              <div key={round.id} className="bg-gray-900 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <input value={round.name} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, name: e.target.value };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2 font-bold" />
                  <select value={round.mode} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, mode: e.target.value as typeof round.mode };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2">
                    <option value="configured">Configured</option>
                    <option value="fully_random">Fully Random</option>
                    <option value="player_choice">Player&apos;s Choice</option>
                    <option value="random_from_options">Random from Options</option>
                  </select>
                  <select value={round.order} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, order: e.target.value as typeof round.order };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2">
                    <option value="fixed">Fixed order</option>
                    <option value="randomized">Randomized order</option>
                  </select>
                  <input type="number" min={1} max={50} value={round.questionCount} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, questionCount: Math.max(1, Number(e.target.value || 1)) };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2 w-20" />
                  <button
                    onClick={() => setSettings({ ...settings, rounds: settings.rounds.filter((_, i) => i !== roundIndex) })}
                    className="bg-red-700 hover:bg-red-600 px-3 py-2 rounded text-sm"
                  >
                    Remove
                  </button>
                </div>

                {(round.mode === 'player_choice' || round.mode === 'random_from_options') && (
                  <input
                    value={round.options.join(', ')}
                    onChange={(e) => {
                      const options = e.target.value.split(',').map((value) => value.trim() as AnyQuestion['type']).filter((value) => PARTY_TYPES.includes(value));
                      const next = [...settings.rounds];
                      next[roundIndex] = { ...round, options };
                      setSettings({ ...settings, rounds: next });
                    }}
                    placeholder="Options (comma separated question types)"
                    className="bg-gray-700 rounded p-2 w-full"
                  />
                )}

                {round.mode === 'configured' && (
                  <div className="space-y-2">
                    {round.slots.map((slot, slotIndex) => (
                      <div key={slot.id} className="grid md:grid-cols-7 gap-2">
                        <select value={slot.type} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, type: e.target.value as AnyQuestion['type'] };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          {PARTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <input type="number" min={1} max={30} value={slot.count} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, count: Math.max(1, Number(e.target.value || 1)) };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2" />
                        <select value={slot.order} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, order: e.target.value as typeof slot.order };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          <option value="fixed">Fixed</option>
                          <option value="randomized">Randomized</option>
                        </select>
                        <select value={slot.listMode} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, listMode: e.target.value as typeof slot.listMode };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          <option value="timed">List: Timed</option>
                          <option value="strikes">List: 3 Strikes</option>
                          <option value="unlimited">List: Unlimited</option>
                          <option value="random">List: Random</option>
                        </select>
                        <select value={slot.listScoring} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, listScoring: e.target.value as typeof slot.listScoring };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          <option value="target">Goal: Target</option>
                          <option value="as_many">Goal: Name as Many</option>
                          <option value="random">Goal: Random</option>
                        </select>
                        <input type="number" min={0} max={300} value={slot.timeLimitSec || 0} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          const parsed = Number(e.target.value || 0);
                          slots[slotIndex] = { ...slot, timeLimitSec: parsed > 0 ? parsed : undefined };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} placeholder="Time (sec)" className="bg-gray-700 rounded p-2" />
                        <button onClick={() => {
                          const rounds = [...settings.rounds];
                          rounds[roundIndex] = { ...round, slots: round.slots.filter((_, i) => i !== slotIndex) };
                          setSettings({ ...settings, rounds });
                        }} className="bg-red-700 hover:bg-red-600 rounded p-2">
                          Remove
                        </button>
                      </div>
                    ))}
                    <button onClick={() => {
                      const rounds = [...settings.rounds];
                      rounds[roundIndex] = {
                        ...round,
                        slots: [
                          ...round.slots,
                          {
                            id: `${round.id}-slot-${round.slots.length + 1}`,
                            type: 'multiple_choice',
                            count: 1,
                            order: 'fixed',
                            listMode: 'timed',
                            listScoring: 'target',
                          },
                        ],
                      };
                      setSettings({ ...settings, rounds });
                    }} className="bg-purple-700 hover:bg-purple-600 px-3 py-2 rounded-lg text-sm">
                      + Add slot
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (settings.rounds.length >= 10) return;
                setSettings({
                  ...settings,
                  rounds: [
                    ...settings.rounds,
                    {
                      id: `round-${settings.rounds.length + 1}`,
                      name: `Round ${settings.rounds.length + 1}`,
                      mode: 'configured',
                      order: 'fixed',
                      questionCount: 10,
                      slots: [{ id: `round-${settings.rounds.length + 1}-slot-1`, type: 'multiple_choice', count: 10, order: 'fixed', listMode: 'timed', listScoring: 'target' }],
                      options: ['multiple_choice', 'open_ended', 'list'],
                    },
                  ],
                });
              }}
              className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg font-bold"
            >
              + Add Round
            </button>
            <button
              onClick={startGame}
              disabled={!hasQuestions}
              className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 px-4 py-2 rounded-lg font-bold"
            >
              Start Party ({totalQuestions} planned)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
