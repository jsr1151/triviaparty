'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';
import { extractMultipleChoiceCorrectAnswer } from '@/lib/multiplayer-game';
import type { AnyQuestion } from '@/types/questions';

type RoomPayload = {
  code: string;
  mode: 'party' | 'jeopardy' | string;
  status: string;
  players: Array<{ id: string; name: string; team?: string; isHost?: boolean }>;
  gameState: Record<string, unknown>;
};

type PlayerProfile = {
  playerId: string;
  playerName: string;
  team?: string;
};

type PlayerAnswerEntry = {
  playerId: string;
  playerName: string;
  questionId: string;
  answer?: string;
  selection?: string;
  submittedAt: string;
  judged?: boolean;
  correct?: boolean;
  points?: number;
  challenged?: boolean;
  gaveUp?: boolean;
  strikeCount?: number;
};

function getQuestionId(question: AnyQuestion | null): string {
  if (!question) return 'unknown-question';
  return String(question.id || `${question.type}-question`);
}

function getThisOrThatItem(question: AnyQuestion | null, index: number) {
  if (!question || question.type !== 'this_or_that') return null;
  const items = Array.isArray(question.items) ? question.items : [];
  if (!items.length) return null;
  return items[Math.max(0, Math.min(items.length - 1, index))] || null;
}

function displayPrompt(question: AnyQuestion | null, thisOrThatItemIndex: number): string {
  if (!question) return '';
  if (question.type === 'prompt') return question.prompt || question.question;
  if (question.type === 'this_or_that') {
    const item = getThisOrThatItem(question, thisOrThatItemIndex);
    return item?.text || question.question;
  }
  return question.question;
}

function answerWindowMs(question: AnyQuestion | null): number {
  const partyLimit = Number((question as { partyTimeLimitSec?: unknown } | null)?.partyTimeLimitSec || 0);
  if (Number.isFinite(partyLimit) && partyLimit > 0) return partyLimit * 1000;
  return 15000;
}

export default function RoomPlayerPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [listItem, setListItem] = useState('');
  const [groupingSelected, setGroupingSelected] = useState<string[]>([]);
  const [eliminatedItems, setEliminatedItems] = useState<string[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const autoRevealRef = useRef(false);

  useEffect(() => {
    params.then((value) => setCode(value.code.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!code) return;
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(`triviaparty:room:${code}:player`) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PlayerProfile;
        if (parsed?.playerId) setProfile(parsed);
      } catch {
        // ignore parse issues
      }
    }
  }, [code]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setReloadTick((value) => value + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (!code) return;
    const load = async () => {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const loadedRoom = data.room as RoomPayload | undefined;
        if (!loadedRoom) return;
        setRoom(loadedRoom);
        if (!profile && loadedRoom.players?.length) {
          const fallback = loadedRoom.players.find((player) => !player.isHost);
          if (fallback) setProfile((prev) => prev || { playerId: fallback.id, playerName: fallback.name });
        }
      }
    };
    void load();

    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`game-${code}`);
    channel.bind('state-updated', (payload: { gameState: Record<string, unknown>; status: string; transition?: { type?: string; durationMs?: number } }) => {
      setRoom((prev) => (prev ? { ...prev, gameState: payload.gameState, status: payload.status } : prev));
      if (payload.transition?.type === 'scoreboard') {
        setTransitionVisible(true);
        window.setTimeout(() => setTransitionVisible(false), Number(payload.transition.durationMs || 3000));
      }
    });
    channel.bind('player-joined', (payload: { players: RoomPayload['players'] }) => {
      setRoom((prev) => (prev ? { ...prev, players: payload.players } : prev));
    });
    channel.bind('game-started', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, status: String(payload.status || 'active'), gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.currentQuestion || payload.question, currentQuestionIndex: payload.currentQuestionIndex ?? payload.questionIndex } } : prev));
      setSelection(null);
      setTextAnswer('');
      setListItem('');
      autoRevealRef.current = false;
    });
    channel.bind('question-changed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.currentQuestion || payload.question, currentQuestionIndex: payload.currentQuestionIndex ?? payload.questionIndex, phase: 'active' } } : prev));
      setTextAnswer('');
      setListItem('');
      setSelection(null);
      setGroupingSelected([]);
      setEliminatedItems([]);
      autoRevealRef.current = false;
      setTransitionVisible(false);
    });
    channel.bind('answer-revealed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, answerRevealed: true, answerRevealedQuestionId: payload.questionId } } : prev));
    });
    channel.bind('transition-started', (payload: { transition?: { durationMs?: number } }) => {
      setTransitionVisible(true);
      window.setTimeout(() => setTransitionVisible(false), Number(payload?.transition?.durationMs || 3000));
    });
    channel.bind('score-updated', (payload: { scores?: Record<string, number> }) => {
      if (!payload?.scores) return;
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), scores: payload.scores } } : prev));
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${code}`);
    };
  }, [code, profile, reloadTick]);

  const state = (room?.gameState || {}) as Record<string, unknown>;
  const phase = String(state.phase || room?.status || 'lobby');
  const currentQuestion = (state.currentQuestion && typeof state.currentQuestion === 'object') ? state.currentQuestion as AnyQuestion : null;
  const thisOrThatItemIndex = Number(state.thisOrThatItemIndex || 0);
  const currentQuestionId = useMemo(() => {
    const base = getQuestionId(currentQuestion);
    if (currentQuestion?.type === 'this_or_that') return `${base}#${thisOrThatItemIndex}`;
    return base;
  }, [currentQuestion, thisOrThatItemIndex]);
  const scores = (state.scores && typeof state.scores === 'object') ? state.scores as Record<string, number> : {};
  const playerAnswers = (state.playerAnswers && typeof state.playerAnswers === 'object') ? state.playerAnswers as Record<string, PlayerAnswerEntry[]> : {};
  const answersForQuestion = Array.isArray(playerAnswers[currentQuestionId]) ? playerAnswers[currentQuestionId] : [];
  const myAnswer = profile ? answersForQuestion.find((entry) => entry.playerId === profile.playerId) : null;
  const answeredByPlayer = new Set(answersForQuestion.map((entry) => entry.playerId));
  const answerRevealed = Boolean(state.answerRevealed) && String(state.answerRevealedQuestionId || '') === currentQuestionId;
  const questionIndex = Number(state.currentQuestionIndex || 0);
  const totalQuestions = Number(state.totalQuestions || 0);
  const isJeopardyRoom = room?.mode === 'jeopardy';
  const buzz = (state.buzz && typeof state.buzz === 'object') ? state.buzz as { playerId?: string; playerName?: string } : null;
  const buzzLocked = Boolean(isJeopardyRoom && buzz?.playerId && buzz.playerId !== profile?.playerId);

  const sortedPlayers = [...(room?.players || [])].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));

  useEffect(() => {
    if (!currentQuestion || phase !== 'active' || answerRevealed) {
      setCountdownMs(0);
      return;
    }
    const tick = () => {
      const startedAt = new Date(String(state.questionStartedAt || new Date().toISOString())).getTime();
      const remaining = Math.max(0, startedAt + answerWindowMs(currentQuestion) - Date.now());
      setCountdownMs(remaining);
      if (remaining <= 0 && !autoRevealRef.current) {
        autoRevealRef.current = true;
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [currentQuestion, state.questionStartedAt, phase, answerRevealed]);

  async function submitEvent(event: string, payload: Record<string, unknown>) {
    if (!code || !profile) return;
    const res = await fetch(`/api/rooms/${code}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? 'Submitted.' : data?.error || 'Failed to submit.');
  }

  async function submitTextAnswer(value: string) {
    if (!value.trim() || !profile) return;
    await submitEvent('player-answered', {
      playerId: profile.playerId,
      playerName: profile.playerName,
      questionId: currentQuestionId,
      answer: value.trim(),
      submittedAt: new Date().toISOString(),
    });
    setTextAnswer('');
  }

  async function submitSelection(nextSelection: string, selectionKey?: 'A' | 'B' | 'C') {
    if (!profile) return;
    setSelection(nextSelection);
    await submitEvent('player-selected', {
      playerId: profile.playerId,
      playerName: profile.playerName,
      questionId: currentQuestionId,
      selection: nextSelection,
      selectionKey,
      submittedAt: new Date().toISOString(),
    });
  }

  const thisOrThatItem = getThisOrThatItem(currentQuestion, thisOrThatItemIndex);
  const thisOrThatLabels = currentQuestion?.type === 'this_or_that'
    ? [currentQuestion.categoryA, currentQuestion.categoryB, currentQuestion.categoryC].filter(Boolean) as string[]
    : [];
  const thisOrThatCorrect = thisOrThatItem?.answer ? thisOrThatLabels[(thisOrThatItem.answer === 'A' ? 0 : thisOrThatItem.answer === 'B' ? 1 : 2)] : '';

  const groupingItems = currentQuestion?.type === 'grouping'
    ? (currentQuestion.items || []).filter((item) => !eliminatedItems.includes(item))
    : [];

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">Room {code}</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm text-gray-300">
            Mode: {room?.mode || '—'} · Status: {room?.status || '—'} · Players: {(room?.players || []).length}
          </div>
          {!!totalQuestions && <div className="text-sm text-cyan-200">Question {Math.min(totalQuestions, questionIndex + 1)} / {totalQuestions}</div>}
          {profile && <div className="text-sm text-gray-300">You: <span className="font-semibold">{profile.playerName}</span></div>}

          {phase === 'lobby' && <div className="text-gray-400">Waiting for host to start the game…</div>}

          {transitionVisible && (
            <div className="rounded-lg bg-gray-850 border border-gray-700 p-6 text-center space-y-2">
              <div className="text-3xl font-bold text-yellow-300">Scoreboard</div>
              <div className="text-sm text-gray-300">Next question is loading…</div>
            </div>
          )}

          {phase === 'active' && currentQuestion && !transitionVisible && (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-purple-300">{currentQuestion.type.replace(/_/g, ' ')}</div>
              <div className="text-2xl font-bold">{displayPrompt(currentQuestion, thisOrThatItemIndex)}</div>
              <div className="text-xl font-bold text-amber-300">⏱ {Math.ceil(countdownMs / 1000)}s</div>

              {currentQuestion.type === 'multiple_choice' && (
                <div className="grid gap-2">
                  {(currentQuestion.options || []).map((option) => {
                    const label = option.replace(/\*/g, '').trim();
                    const isCorrect = answerRevealed && label === extractMultipleChoiceCorrectAnswer(currentQuestion);
                    return (
                      <button key={label} onClick={() => void submitSelection(label)} className={`text-left px-3 py-2 rounded-lg ${isCorrect ? 'bg-emerald-700' : selection === label ? 'bg-indigo-500' : 'bg-indigo-700 hover:bg-indigo-600'}`}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && (
                <div className="space-y-2">
                  <input
                    value={textAnswer}
                    onChange={(event) => setTextAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter') return;
                      event.preventDefault();
                      void submitTextAnswer(textAnswer);
                    }}
                    placeholder="Type your answer"
                    className="w-full bg-gray-800 rounded-lg px-3 py-2"
                  />
                  <button onClick={() => void submitTextAnswer(textAnswer)} className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">Submit Answer</button>
                </div>
              )}

              {currentQuestion.type === 'list' && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={listItem}
                      onChange={(event) => setListItem(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        if (!listItem.trim()) return;
                        void submitTextAnswer(listItem);
                        setListItem('');
                      }}
                      placeholder="Submit one list item"
                      disabled={Boolean(myAnswer?.gaveUp)}
                      className="flex-1 bg-gray-800 rounded-lg px-3 py-2 disabled:opacity-60"
                    />
                    <button
                      onClick={() => {
                        if (!listItem.trim()) return;
                        void submitTextAnswer(listItem);
                        setListItem('');
                      }}
                      className="bg-emerald-700 hover:bg-emerald-600 px-4 rounded-lg"
                      disabled={Boolean(myAnswer?.gaveUp)}
                    >
                      Add
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (!profile) return;
                      if (!window.confirm('Are you sure you want to give up?')) return;
                      void submitEvent('player-gave-up', {
                        playerId: profile.playerId,
                        playerName: profile.playerName,
                        questionId: currentQuestionId,
                      });
                    }}
                    className="w-full bg-gray-700 hover:bg-gray-600 py-2 rounded-lg"
                  >
                    Give Up
                  </button>
                  {myAnswer?.gaveUp && <div className="text-rose-300 font-semibold">You&apos;re out!</div>}
                </div>
              )}

              {currentQuestion.type === 'grouping' && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-300">Select items that belong to &quot;{currentQuestion.groupName || 'Group'}&quot;</div>
                  <div className="grid grid-cols-2 gap-2">
                    {groupingItems.map((item) => {
                      const selected = groupingSelected.includes(item);
                      return (
                        <button
                          key={item}
                          onClick={() => {
                            setGroupingSelected((prev) => prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item]);
                          }}
                          className={`px-3 py-2 rounded-lg border ${selected ? 'bg-blue-700 border-blue-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => {
                    const correct = new Set(currentQuestion.correctItems || []);
                    const incorrectSelected = groupingSelected.filter((item) => !correct.has(item));
                    if (String((currentQuestion as { partyGroupingMode?: unknown }).partyGroupingMode || '') === 'elimination') {
                      setEliminatedItems((prev) => Array.from(new Set([...prev, ...incorrectSelected])));
                    }
                    void submitTextAnswer(groupingSelected.join(' | '));
                  }} className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">
                    Confirm Selection
                  </button>
                </div>
              )}

              {currentQuestion.type === 'this_or_that' && (
                <div className="space-y-2">
                  <div className="grid gap-2">
                    {thisOrThatLabels.map((category, index) => {
                      const key = index === 0 ? 'A' : index === 1 ? 'B' : 'C';
                      const isCorrect = answerRevealed && category === thisOrThatCorrect;
                      return (
                        <button
                          key={category}
                          onClick={() => void submitSelection(category || '', key)}
                          className={`px-3 py-2 rounded-lg ${isCorrect ? 'bg-emerald-700' : selection === category ? 'bg-indigo-500' : 'bg-indigo-700 hover:bg-indigo-600'}`}
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2 border-t border-gray-700">
                {sortedPlayers.map((player) => {
                  const answered = answeredByPlayer.has(player.id);
                  return (
                    <div key={player.id} className="bg-gray-800 rounded px-3 py-2 text-sm flex justify-between gap-2">
                      <span>{player.name}</span>
                      <span className={answered ? 'text-emerald-300' : 'text-gray-500'}>{answered ? '✓' : '…'}</span>
                    </div>
                  );
                })}
              </div>

              {Boolean(answerRevealed) && (
                <div className="rounded-lg bg-violet-900/60 border border-violet-500 px-3 py-2 text-violet-100">
                  Host has revealed the answer.
                </div>
              )}

              {!!myAnswer && (currentQuestion.type === 'open_ended' || currentQuestion.type === 'list' || currentQuestion.type === 'prompt') && (
                <button
                  onClick={() => {
                    if (!profile) return;
                    void submitEvent('answer-challenged', { questionId: currentQuestionId, playerId: profile.playerId });
                  }}
                  className="w-full bg-amber-700 hover:bg-amber-600 py-2 rounded-lg"
                >
                  Challenge
                </button>
              )}
            </div>
          )}

          {isJeopardyRoom && (
            <button
              disabled={buzzLocked}
              onClick={() => {
                if (!profile) return;
                void submitEvent('player-buzzed', {
                  playerId: profile.playerId,
                  playerName: profile.playerName,
                  at: new Date().toISOString(),
                });
              }}
              className="w-full bg-amber-700 hover:bg-amber-600 disabled:bg-gray-700 py-2 rounded-lg font-bold"
            >
              {buzzLocked ? `Buzz locked by ${buzz?.playerName || 'another player'}` : 'Buzz In'}
            </button>
          )}

          <div className="space-y-2">
            <div className="font-semibold">Scoreboard</div>
            {sortedPlayers.map((player) => (
              <div key={player.id} className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between">
                <span>{player.name}{player.team ? ` · Team ${player.team}` : ''}</span>
                <span className="text-yellow-300 font-bold">{Number(scores[player.id] || 0)}</span>
              </div>
            ))}
          </div>

          {myAnswer && (
            <div className="text-sm text-cyan-300">
              Last submission: {myAnswer.answer || myAnswer.selection || '(empty)'}
              {myAnswer.judged ? ` · ${myAnswer.correct ? `Correct (+${myAnswer.points || 0})` : 'Wrong'}` : ' · Pending review'}
              {myAnswer.challenged ? ' · Challenge sent' : ''}
              {typeof myAnswer.strikeCount === 'number' && myAnswer.strikeCount > 0 ? ` · Strikes: ${myAnswer.strikeCount}` : ''}
            </div>
          )}
          {status && <div className="text-sm text-cyan-300">{status}</div>}
        </div>
      </div>
    </main>
  );
}
