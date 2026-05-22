'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';
import {
  calculateRemainingTimeMs,
  extractMultipleChoiceCorrectAnswer,
  getThisOrThatItem,
} from '@/lib/multiplayer-game';
import type { AnyQuestion } from '@/types/questions';

type RoomPayload = {
  code: string;
  mode: 'party' | 'jeopardy' | string;
  status: string;
  players: Array<{ id: string; name: string; team?: string; isHost?: boolean }>;
  gameConfig?: Record<string, unknown>;
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
  groupingSelection?: string[];
  submittedAt: string;
  judged?: boolean;
  correct?: boolean;
  points?: number;
  challenged?: boolean;
  gaveUp?: boolean;
  strikeCount?: number;
  questionItemIndex?: number;
};

function getQuestionId(question: AnyQuestion | null): string {
  if (!question) return 'unknown-question';
  return String(question.id || `${question.type}-question`);
}

function getPromptLabel(question: AnyQuestion | null): string {
  if (!question) return '';
  if (question.type === 'prompt') return question.prompt || 'Prompt';
  if (question.type === 'this_or_that') return question.question || 'This or That';
  return '';
}

function getQuestionText(question: AnyQuestion | null, thisOrThatItemIndex: number): string {
  if (!question) return '';
  if (question.type === 'prompt') return question.question;
  if (question.type === 'this_or_that') return getThisOrThatItem(question, thisOrThatItemIndex)?.text || question.question;
  return question.question;
}

function getGroupedState<T>(state: Record<string, unknown>, key: string): Record<string, T> {
  const value = state[key];
  return value && typeof value === 'object' ? value as Record<string, T> : {};
}

function getGroupingMode(question: AnyQuestion | null): string {
  return String((question as { partyGroupingMode?: unknown } | null)?.partyGroupingMode || 'elimination');
}

export default function RoomPlayerPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<RoomPayload | null>(null);
  const [status, setStatus] = useState('');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [listItem, setListItem] = useState('');
  const [groupingSelected, setGroupingSelected] = useState<string[]>([]);
  const [selection, setSelection] = useState<string | null>(null);
  const [countdownMs, setCountdownMs] = useState(0);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

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
        window.setTimeout(() => setTransitionVisible(false), Number(payload.transition.durationMs || 2000));
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
      setGroupingSelected([]);
    });
    channel.bind('question-changed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.currentQuestion || payload.question, currentQuestionIndex: payload.currentQuestionIndex ?? payload.questionIndex, phase: 'active' } } : prev));
      setTextAnswer('');
      setListItem('');
      setSelection(null);
      setGroupingSelected([]);
      setTransitionVisible(false);
    });
    channel.bind('answer-revealed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, answerRevealed: true, answerRevealedQuestionId: payload.questionId } } : prev));
    });
    channel.bind('transition-started', (payload: { transition?: { durationMs?: number } }) => {
      setTransitionVisible(true);
      window.setTimeout(() => setTransitionVisible(false), Number(payload?.transition?.durationMs || 2000));
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
  const playerAnswers = getGroupedState<PlayerAnswerEntry[]>(state, 'playerAnswers');
  const answersForQuestion = Array.isArray(playerAnswers[currentQuestionId]) ? playerAnswers[currentQuestionId] : [];
  const myAnswers = profile ? answersForQuestion.filter((entry) => entry.playerId === profile.playerId) : [];
  const myLatestAnswer = myAnswers[myAnswers.length - 1] || null;
  const answeredByPlayer = new Set(answersForQuestion.map((entry) => entry.playerId));
  const answerRevealed = Boolean(state.answerRevealed) && String(state.answerRevealedQuestionId || '') === currentQuestionId;
  const questionIndex = Number(state.currentQuestionIndex || 0);
  const totalQuestions = Number(state.totalQuestions || 0);
  const isJeopardyRoom = room?.mode === 'jeopardy';
  const buzz = (state.buzz && typeof state.buzz === 'object') ? state.buzz as { playerId?: string; playerName?: string } : null;
  const buzzLocked = Boolean(isJeopardyRoom && buzz?.playerId && buzz.playerId !== profile?.playerId);
  const sortedPlayers = [...(room?.players || [])].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));
  const thisOrThatItem = getThisOrThatItem(currentQuestion, thisOrThatItemIndex);
  const thisOrThatLabels = currentQuestion?.type === 'this_or_that'
    ? [currentQuestion.categoryA, currentQuestion.categoryB, currentQuestion.categoryC].filter(Boolean) as string[]
    : [];
  const thisOrThatCorrect = thisOrThatItem?.answer ? thisOrThatLabels[(thisOrThatItem.answer === 'A' ? 0 : thisOrThatItem.answer === 'B' ? 1 : 2)] : '';
  const questionPromptLabel = getPromptLabel(currentQuestion);
  const questionText = getQuestionText(currentQuestion, thisOrThatItemIndex);
  const groupingMode = getGroupingMode(currentQuestion);
  const groupingEliminatedItems = getGroupedState<string[]>(state, 'groupingEliminatedItems')[currentQuestionId] || [];
  const groupingClaimedItems = getGroupedState<Record<string, string>>(state, 'groupingClaimedItems')[currentQuestionId] || {};
  const groupingTurnByQuestion = getGroupedState<number>(state, 'groupingTurnByQuestion');
  const currentTurnPlayer = currentQuestion?.type === 'grouping'
    ? (room?.players || [])[Number(groupingTurnByQuestion[currentQuestionId] || 0)] || null
    : null;
  const myGroupingSelections = Array.from(new Set(myAnswers.flatMap((entry) => entry.groupingSelection || [])));
  const myListAnswers = myAnswers.filter((entry) => Boolean(entry.answer || entry.selection));
  const myListGaveUp = myAnswers.some((entry) => entry.gaveUp);
  const myStrikeCount = myAnswers.reduce((highest, entry) => Math.max(highest, Number(entry.strikeCount || 0)), 0);
  const myOpenEndedSubmitted = Boolean(currentQuestion?.type === 'open_ended' && myLatestAnswer);
  const groupingItems = currentQuestion?.type === 'grouping'
    ? (currentQuestion.items || []).filter((item) => !groupingEliminatedItems.includes(item))
    : [];
  const canInteractWithGrouping = Boolean(
    currentQuestion?.type === 'grouping'
      && profile
      && !answerRevealed
      && (
        groupingMode !== 'turns'
          || currentTurnPlayer?.id === profile.playerId
      ),
  );

  useEffect(() => {
    if (!currentQuestion || phase !== 'active' || answerRevealed) {
      setCountdownMs(0);
      return;
    }
    const tick = () => {
      const remaining = calculateRemainingTimeMs(state.questionStartedAt, currentQuestion, room?.gameConfig);
      setCountdownMs(remaining);
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [answerRevealed, currentQuestion, phase, room?.gameConfig, state.questionStartedAt, thisOrThatItemIndex]);

  async function submitEvent(event: string, payload: Record<string, unknown>) {
    if (!code || !profile) return false;
    const res = await fetch(`/api/rooms/${code}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? 'Submitted.' : data?.error || 'Failed to submit.');
    return res.ok;
  }

  async function submitTextAnswer(value: string) {
    if (!value.trim() || !profile) return;
    if (currentQuestion?.type === 'open_ended' && myOpenEndedSubmitted) {
      setStatus('Answer already submitted.');
      return;
    }
    const submitted = await submitEvent('player-answered', {
      playerId: profile.playerId,
      playerName: profile.playerName,
      questionId: currentQuestionId,
      answer: value.trim(),
      submittedAt: new Date().toISOString(),
    });
    if (submitted) setTextAnswer('');
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

  async function submitGroupingSelection(selectionItems: string[]) {
    if (!profile || !selectionItems.length) return;
    const submitted = await submitEvent('player-answered', {
      playerId: profile.playerId,
      playerName: profile.playerName,
      questionId: currentQuestionId,
      answer: selectionItems.join(' | '),
      groupingSelection: selectionItems,
      submittedAt: new Date().toISOString(),
    });
    if (submitted && groupingMode !== 'continuous') {
      setGroupingSelected([]);
    }
  }

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
              {questionPromptLabel && <div className="text-sm uppercase tracking-wide text-yellow-300">{questionPromptLabel}</div>}
              <div className="text-2xl font-bold">{questionText}</div>
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
                    disabled={myOpenEndedSubmitted}
                    className="w-full bg-gray-800 rounded-lg px-3 py-2 disabled:opacity-60"
                  />
                  <button onClick={() => void submitTextAnswer(textAnswer)} disabled={myOpenEndedSubmitted} className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 py-2 rounded-lg font-bold">Submit Answer</button>
                  {myOpenEndedSubmitted && <div className="text-emerald-300 font-semibold">Answer submitted</div>}
                </div>
              )}

              {currentQuestion.type === 'list' && (
                <div className="space-y-3">
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
                      disabled={myListGaveUp}
                      className="flex-1 bg-gray-800 rounded-lg px-3 py-2 disabled:opacity-60"
                    />
                    <button
                      onClick={() => {
                        if (!listItem.trim()) return;
                        void submitTextAnswer(listItem);
                        setListItem('');
                      }}
                      className="bg-emerald-700 hover:bg-emerald-600 px-4 rounded-lg"
                      disabled={myListGaveUp}
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
                  {myListGaveUp && <div className="text-rose-300 font-semibold">You&apos;re out!</div>}
                  {!!myListAnswers.length && (
                    <div className="rounded-lg bg-gray-900/70 border border-gray-700 p-3 space-y-2">
                      <div className="text-sm font-semibold text-purple-200">Your submitted items</div>
                      <div className="grid gap-2">
                        {myListAnswers.map((entry, index) => (
                          <div key={`${entry.playerId}-${index}`} className="bg-gray-800 rounded px-3 py-2 text-sm flex justify-between gap-3">
                            <span>{entry.answer || entry.selection}</span>
                            <span className={entry.correct ? 'text-emerald-300' : entry.judged ? 'text-rose-300' : 'text-gray-400'}>
                              {entry.judged ? (entry.correct ? `+${entry.points || 0}` : '0') : 'Pending'}
                            </span>
                          </div>
                        ))}
                      </div>
                      {myStrikeCount > 0 && <div className="text-xs text-rose-300">Strikes: {myStrikeCount}</div>}
                    </div>
                  )}
                </div>
              )}

              {currentQuestion.type === 'grouping' && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-300">Select items that belong to &quot;{currentQuestion.groupName || 'Group'}&quot;</div>
                  {groupingMode === 'turns' && currentTurnPlayer && (
                    <div className={`text-sm font-semibold ${currentTurnPlayer.id === profile?.playerId ? 'text-yellow-300' : 'text-gray-300'}`}>
                      Current turn: {currentTurnPlayer.name}
                    </div>
                  )}
                  {!!myGroupingSelections.length && (
                    <div className="text-sm text-cyan-300">Locked in: {myGroupingSelections.join(', ')}</div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {groupingItems.map((item) => {
                      const selected = groupingSelected.includes(item) || myGroupingSelections.includes(item);
                      const claimedByPlayerId = groupingClaimedItems[item];
                      const claimedBy = claimedByPlayerId ? room?.players.find((player) => player.id === claimedByPlayerId)?.name : '';
                      const isClaimedByMe = claimedByPlayerId === profile?.playerId;
                      const isDisabled = !canInteractWithGrouping || myGroupingSelections.includes(item) || Boolean(claimedByPlayerId && !isClaimedByMe);
                      return (
                        <button
                          key={item}
                          onClick={() => {
                            if (groupingMode === 'blitz') {
                              void submitGroupingSelection([item]);
                              return;
                            }
                            if (groupingMode === 'turns') {
                              setGroupingSelected([item]);
                              return;
                            }
                            setGroupingSelected((prev) => prev.includes(item) ? prev.filter((value) => value !== item) : [...prev, item]);
                          }}
                          disabled={isDisabled}
                          className={`px-3 py-3 rounded-lg border text-left ${claimedByPlayerId ? 'bg-emerald-900/60 border-emerald-600' : selected ? 'bg-blue-700 border-blue-400' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'} disabled:opacity-60`}
                        >
                          <div>{item}</div>
                          {claimedBy && <div className="text-xs text-emerald-200">Claimed by {claimedBy}</div>}
                        </button>
                      );
                    })}
                  </div>
                  {groupingMode !== 'blitz' && (
                    <button onClick={() => void submitGroupingSelection(groupingSelected)} disabled={!groupingSelected.length || !canInteractWithGrouping} className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:bg-gray-700 py-2 rounded-lg font-bold">
                      Confirm Selection
                    </button>
                  )}
                </div>
              )}

              {currentQuestion.type === 'ranking' && (
                <div className="space-y-2 rounded-lg bg-gray-900/70 border border-gray-700 p-4">
                  <div className="text-sm font-semibold text-purple-200">Items to rank</div>
                  {(currentQuestion.items || []).map((item, index) => (
                    <div key={`${item.text}-${index}`} className="bg-gray-800 rounded px-3 py-2 text-sm">{item.text}</div>
                  ))}
                </div>
              )}

              {currentQuestion.type === 'this_or_that' && (
                <div className="space-y-2">
                  <div className="grid gap-3">
                    {thisOrThatLabels.map((category, index) => {
                      const key = index === 0 ? 'A' : index === 1 ? 'B' : 'C';
                      const isCorrect = answerRevealed && category === thisOrThatCorrect;
                      return (
                        <button
                          key={category}
                          onClick={() => void submitSelection(category || '', key)}
                          className={`w-full px-4 py-4 rounded-xl text-xl font-bold ${isCorrect ? 'bg-emerald-700' : selection === category ? 'bg-indigo-500' : 'bg-indigo-700 hover:bg-indigo-600'}`}
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
                  {currentQuestion.type === 'this_or_that' ? `Correct answer: ${thisOrThatCorrect || '—'}` : 'Host has revealed the answer.'}
                </div>
              )}

              {!!myLatestAnswer && (currentQuestion.type === 'open_ended' || currentQuestion.type === 'list' || currentQuestion.type === 'prompt') && (
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

          {myLatestAnswer && (
            <div className="text-sm text-cyan-300">
              Last submission: {myLatestAnswer.groupingSelection?.length ? myLatestAnswer.groupingSelection.join(', ') : myLatestAnswer.answer || myLatestAnswer.selection || '(empty)'}
              {myLatestAnswer.judged ? ` · ${myLatestAnswer.correct ? `Correct (+${myLatestAnswer.points || 0})` : 'Wrong'}` : ' · Pending review'}
              {myLatestAnswer.challenged ? ' · Challenge sent' : ''}
              {typeof myLatestAnswer.strikeCount === 'number' && myLatestAnswer.strikeCount > 0 ? ` · Strikes: ${myLatestAnswer.strikeCount}` : ''}
            </div>
          )}
          {status && <div className="text-sm text-cyan-300">{status}</div>}
        </div>
      </div>
    </main>
  );
}
