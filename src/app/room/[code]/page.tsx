'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';
import type { AnyQuestion } from '@/types/questions';

type RoomPayload = {
  code: string;
  mode: 'party' | 'jeopardy' | string;
  status: string;
  players: Array<{ id: string; name: string; team?: string }>;
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
};

function getQuestionId(question: AnyQuestion | null): string {
  if (!question) return 'unknown-question';
  return String(question.id || `${question.type}-question`);
}

export default function RoomPlayerPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [listItem, setListItem] = useState('');
  const [listSubmissions, setListSubmissions] = useState<string[]>([]);
  const [groupingSelected, setGroupingSelected] = useState<string[]>([]);
  const [rankingOrder, setRankingOrder] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
    if (!code) return;
    const load = async () => {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const loadedRoom = data.room as RoomPayload | undefined;
        if (!loadedRoom) return;
        setRoom(loadedRoom);
        if (!profile && loadedRoom.players?.length) {
          const fallback = loadedRoom.players.find((player) => player.name !== 'Host');
          if (fallback) setProfile((prev) => prev || { playerId: fallback.id, playerName: fallback.name });
        }
      }
    };
    void load();

    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`game-${code}`);
    channel.bind('state-updated', (payload: { gameState: Record<string, unknown>; status: string }) => {
      setRoom((prev) => (prev ? { ...prev, gameState: payload.gameState, status: payload.status } : prev));
    });
    channel.bind('player-joined', (payload: { players: RoomPayload['players'] }) => {
      setRoom((prev) => (prev ? { ...prev, players: payload.players } : prev));
    });
    channel.bind('game-started', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, status: String(payload.status || 'active'), gameState: { ...(prev.gameState || {}), ...payload } } : prev));
    });
    channel.bind('question-changed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.question, currentQuestionIndex: payload.questionIndex } } : prev));
      setTextAnswer('');
      setListItem('');
      setListSubmissions([]);
      setGroupingSelected([]);
    });
    channel.bind('answer-revealed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), answerRevealed: true, ...payload } } : prev));
    });
    channel.bind('game-finished', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, status: String(payload.status || 'finished'), gameState: { ...(prev.gameState || {}), ...payload } } : prev));
    });
    channel.bind('player-buzzed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), buzz: payload } } : prev));
    });
    channel.bind('score-updated', (payload: { scores?: Record<string, number> }) => {
      if (!payload?.scores) return;
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), scores: payload.scores } } : prev));
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${code}`);
    };
  }, [code, profile]);

  const state = (room?.gameState || {}) as Record<string, unknown>;
  const currentQuestion = (state.currentQuestion && typeof state.currentQuestion === 'object') ? state.currentQuestion as AnyQuestion : null;
  const currentQuestionId = getQuestionId(currentQuestion);
  const scores = (state.scores && typeof state.scores === 'object') ? state.scores as Record<string, number> : {};
  const playerAnswers = (state.playerAnswers && typeof state.playerAnswers === 'object') ? state.playerAnswers as Record<string, PlayerAnswerEntry[]> : {};
  const answersForQuestion = Array.isArray(playerAnswers[currentQuestionId]) ? playerAnswers[currentQuestionId] : [];
  const myAnswer = profile ? answersForQuestion.find((entry) => entry.playerId === profile.playerId) : null;
  const questionIndex = Number(state.currentQuestionIndex || 0);
  const totalQuestions = Number(state.totalQuestions || 0);
  const buzz = (state.buzz && typeof state.buzz === 'object') ? state.buzz as { playerId?: string; playerName?: string } : null;
  const isJeopardyRoom = room?.mode === 'jeopardy';
  const buzzLocked = Boolean(isJeopardyRoom && buzz?.playerId && buzz.playerId !== profile?.playerId);
  const playerCount = useMemo(() => room?.players?.length || 0, [room]);

  useEffect(() => {
    if (currentQuestion?.type === 'ranking') {
      const items = (currentQuestion.items || []).map((item) => item.text);
      setRankingOrder(items);
    } else {
      setRankingOrder([]);
    }
  }, [currentQuestion]);

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

  async function submitSelection(selection: string, selectionKey?: 'A' | 'B' | 'C') {
    if (!profile) return;
    await submitEvent('player-selected', {
      playerId: profile.playerId,
      playerName: profile.playerName,
      questionId: currentQuestionId,
      selection,
      selectionKey,
      submittedAt: new Date().toISOString(),
    });
  }

  function moveRanking(from: number, to: number) {
    if (to < 0 || to >= rankingOrder.length || from === to) return;
    setRankingOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">Room {code}</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <div className="text-sm text-gray-300">
            Mode: {room?.mode || '—'} · Status: {room?.status || '—'} · Players: {playerCount}
          </div>
          {!!totalQuestions && <div className="text-sm text-cyan-200">Question {Math.min(totalQuestions, questionIndex + 1)} / {totalQuestions}</div>}
          {profile && <div className="text-sm text-gray-300">You: <span className="font-semibold">{profile.playerName}</span></div>}

          {currentQuestion ? (
            <div className="space-y-3">
              <div className="text-xs uppercase tracking-wide text-purple-300">{currentQuestion.type.replace(/_/g, ' ')}</div>
              {currentQuestion.type !== 'ranking' && currentQuestion.type !== 'list' && (
                <div className="text-lg">{currentQuestion.question}</div>
              )}

              {currentQuestion.type === 'multiple_choice' && (
                <div className="grid gap-2">
                  {(currentQuestion.options || []).map((option) => {
                    const label = option.replace(/\*/g, '').trim();
                    return (
                      <button key={label} onClick={() => submitSelection(label)} className="text-left bg-indigo-700 hover:bg-indigo-600 px-3 py-2 rounded-lg">
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
                  <div className="text-lg">{currentQuestion.question}</div>
                  <div className="flex gap-2">
                    <input
                      value={listItem}
                      onChange={(event) => setListItem(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return;
                        event.preventDefault();
                        if (!listItem.trim()) return;
                        setListSubmissions((prev) => [...prev, listItem.trim()]);
                        void submitTextAnswer(listItem);
                        setListItem('');
                      }}
                      placeholder="Submit one list item"
                      className="flex-1 bg-gray-800 rounded-lg px-3 py-2"
                    />
                    <button
                      onClick={() => {
                        if (!listItem.trim()) return;
                        setListSubmissions((prev) => [...prev, listItem.trim()]);
                        void submitTextAnswer(listItem);
                        setListItem('');
                      }}
                      className="bg-emerald-700 hover:bg-emerald-600 px-4 rounded-lg"
                    >
                      Add
                    </button>
                  </div>
                  {!!listSubmissions.length && <div className="text-sm text-gray-300">Submitted: {listSubmissions.join(', ')}</div>}
                </div>
              )}

              {currentQuestion.type === 'grouping' && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-300">Tap tiles to assign to &quot;{currentQuestion.groupName || 'Group'}&quot;</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(currentQuestion.items || []).map((item) => {
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
                  <button onClick={() => void submitTextAnswer(groupingSelected.join(' | '))} className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">
                    Submit Grouping
                  </button>
                </div>
              )}

              {currentQuestion.type === 'this_or_that' && (
                <div className="space-y-2">
                  <div className="grid gap-2">
                    {[currentQuestion.categoryA, currentQuestion.categoryB, currentQuestion.categoryC].filter(Boolean).map((category, index) => {
                      const key = index === 0 ? 'A' : index === 1 ? 'B' : 'C';
                      return (
                        <button
                          key={category}
                          onClick={() => void submitSelection(category || '', key)}
                          className="bg-indigo-700 hover:bg-indigo-600 px-3 py-2 rounded-lg"
                        >
                          {category}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {currentQuestion.type === 'ranking' && (
                <div className="space-y-2">
                  <div className="text-lg">{currentQuestion.question}</div>
                  <div className="space-y-2">
                    {rankingOrder.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (dragIndex === null) return;
                          moveRanking(dragIndex, index);
                          setDragIndex(null);
                        }}
                        className="bg-gray-800 rounded-lg px-3 py-2 flex justify-between items-center"
                      >
                        <span>{index + 1}. {item}</span>
                        <span className="flex gap-1">
                          <button onClick={() => moveRanking(index, index - 1)} className="text-xs bg-gray-700 hover:bg-gray-600 rounded px-2 py-1">↑</button>
                          <button onClick={() => moveRanking(index, index + 1)} className="text-xs bg-gray-700 hover:bg-gray-600 rounded px-2 py-1">↓</button>
                        </span>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => void submitTextAnswer(rankingOrder.join(' > '))} className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">
                    Submit Ranking
                  </button>
                </div>
              )}

              {Boolean(state.answerRevealed) && (
                <div className="rounded-lg bg-violet-900/60 border border-violet-500 px-3 py-2 text-violet-100">
                  Host has revealed the answer.
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400">Waiting for host to start the game…</div>
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
            {(room?.players || []).map((player) => (
              <div key={player.id} className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between">
                <span>{player.name}{player.team ? ` · Team ${player.team}` : ''}</span>
                <span className="text-yellow-300 font-bold">{Number(scores[player.id] || 0)}</span>
              </div>
            ))}
          </div>

          {myAnswer && (
            <div className="text-sm text-cyan-300">
              Last submission: {myAnswer.answer || myAnswer.selection || '(empty)'}
              {myAnswer.judged ? ` · ${myAnswer.correct ? `Correct (+${myAnswer.points || 0})` : 'Wrong'}` : ' · Pending host review'}
            </div>
          )}
          {status && <div className="text-sm text-cyan-300">{status}</div>}
        </div>
      </div>
    </main>
  );
}
