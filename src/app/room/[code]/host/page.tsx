'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';
import { extractMultipleChoiceCorrectAnswer } from '@/lib/multiplayer-game';
import type { AnyQuestion } from '@/types/questions';

type HostRoom = {
  code: string;
  mode: 'party' | 'jeopardy' | string;
  status: string;
  players: Array<{ id: string; name: string; team?: string; isHost?: boolean }>;
  gameConfig?: Record<string, unknown>;
  gameState: Record<string, unknown>;
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
  selectionKey?: 'A' | 'B' | 'C';
};

type TransitionState = {
  type?: string;
  startedAt?: string;
  durationMs?: number;
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

export default function HostRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<HostRoom | null>(null);
  const [message, setMessage] = useState('');
  const [lobbyConfigText, setLobbyConfigText] = useState('');
  const [playAsParticipant, setPlayAsParticipant] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);
  const revealRequestedRef = useRef(false);

  useEffect(() => {
    params.then((value) => setCode(value.code.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!room?.gameConfig) return;
    setLobbyConfigText(JSON.stringify(room.gameConfig, null, 2));
  }, [room?.gameConfig]);

  useEffect(() => {
    if (!code) return;
    const load = async () => {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.room) setRoom(data.room);
    };
    void load();

    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`game-${code}`);
    channel.bind('state-updated', (payload: { gameState: Record<string, unknown>; status?: string; transition?: TransitionState }) => {
      setRoom((prev) => (prev ? {
        ...prev,
        gameState: payload.gameState,
        status: payload.status || prev.status,
      } : prev));
      if (payload.transition?.type === 'scoreboard') {
        setTransitionVisible(true);
        window.setTimeout(() => setTransitionVisible(false), Number(payload.transition.durationMs || 3000));
      }
    });
    channel.bind('player-joined', (payload: { players: HostRoom['players'] }) => {
      setRoom((prev) => (prev ? { ...prev, players: payload.players } : prev));
    });
    channel.bind('game-started', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? {
        ...prev,
        status: String(payload.status || prev.status),
        gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.currentQuestion || payload.question, currentQuestionIndex: payload.currentQuestionIndex ?? payload.questionIndex },
      } : prev));
      setMessage('Game started.');
      setTransitionVisible(false);
    });
    channel.bind('question-changed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? {
        ...prev,
        gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.currentQuestion || payload.question, currentQuestionIndex: payload.currentQuestionIndex ?? payload.questionIndex, phase: 'active' },
      } : prev));
      setSelectedChoice(null);
      setTextAnswer('');
      revealRequestedRef.current = false;
      setTransitionVisible(false);
    });
    channel.bind('answer-revealed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, answerRevealed: true, answerRevealedQuestionId: payload.questionId } } : prev));
    });
    channel.bind('transition-started', (payload: { transition?: TransitionState }) => {
      setTransitionVisible(true);
      const duration = Number(payload?.transition?.durationMs || 3000);
      window.setTimeout(() => setTransitionVisible(false), duration);
    });
    channel.bind('score-updated', (payload: { scores?: Record<string, number> }) => {
      if (!payload?.scores) return;
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), scores: payload.scores } } : prev));
    });
    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`game-${code}`);
    };
  }, [code]);

  const state = (room?.gameState || {}) as Record<string, unknown>;
  const phase = String(state.phase || room?.status || 'lobby');
  const currentQuestion = (state.currentQuestion && typeof state.currentQuestion === 'object') ? state.currentQuestion as AnyQuestion : null;
  const thisOrThatItemIndex = Number(state.thisOrThatItemIndex || 0);
  const questionId = useMemo(() => {
    const base = getQuestionId(currentQuestion);
    if (currentQuestion?.type === 'this_or_that') return `${base}#${thisOrThatItemIndex}`;
    return base;
  }, [currentQuestion, thisOrThatItemIndex]);
  const currentIndex = Number(state.currentQuestionIndex || 0);
  const totalQuestions = Number(state.totalQuestions || 0);
  const scores = (state.scores && typeof state.scores === 'object') ? state.scores as Record<string, number> : {};
  const playerAnswers = (state.playerAnswers && typeof state.playerAnswers === 'object') ? state.playerAnswers as Record<string, PlayerAnswerEntry[]> : {};
  const answersForCurrent = Array.isArray(playerAnswers[questionId]) ? playerAnswers[questionId] : [];
  const answeredByPlayer = new Set(answersForCurrent.map((entry) => entry.playerId));
  const answerRevealed = Boolean(state.answerRevealed) && String(state.answerRevealedQuestionId || '') === questionId;
  const sortedPlayers = [...(room?.players || [])].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));
  const hostPlayer = (room?.players || []).find((player) => player.isHost);

  useEffect(() => {
    if (!currentQuestion || phase !== 'active' || answerRevealed || transitionVisible) {
      setCountdownMs(0);
      return;
    }
    const tick = () => {
      const startedAt = new Date(String(state.questionStartedAt || new Date().toISOString())).getTime();
      const remaining = Math.max(0, startedAt + answerWindowMs(currentQuestion) - Date.now());
      setCountdownMs(remaining);
      if (remaining <= 0 && !revealRequestedRef.current) {
        revealRequestedRef.current = true;
        void submitEvent('answer-revealed');
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [currentQuestion, state.questionStartedAt, phase, answerRevealed, transitionVisible]);

  async function submitEvent(event: string, payload: Record<string, unknown> = {}) {
    if (!code) return;
    const res = await fetch(`/api/rooms/${code}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setMessage(data?.error || 'Request failed.');
  }

  async function setLobby() {
    if (!code || !room) return;
    const res = await fetch(`/api/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'lobby',
        gameState: { ...(room.gameState || {}), phase: 'lobby', buzz: null, currentQuestion: null, currentQuestionIndex: 0 },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setRoom(data.room);
      setMessage('Room set to lobby.');
    } else {
      setMessage(data?.error || 'Failed to set lobby.');
    }
  }

  async function saveLobbySettings() {
    if (!room || room.status !== 'lobby') return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(lobbyConfigText) as Record<string, unknown>;
    } catch {
      setMessage('Invalid JSON in settings editor.');
      return;
    }
    const res = await fetch(`/api/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameConfig: parsed }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data?.error || 'Failed to update settings.');
      return;
    }
    setRoom(data.room);
    setMessage('Lobby settings saved.');
  }

  async function goToNextQuestion() {
    await submitEvent('transition-started', { transition: { type: 'scoreboard', startedAt: new Date().toISOString(), durationMs: 3000 } });
    window.setTimeout(() => {
      void submitEvent('question-changed', { direction: 'next' });
    }, 3000);
  }

  async function submitHostParticipantAnswer() {
    if (!hostPlayer || !currentQuestion) return;
    if (currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'this_or_that') {
      if (!selectedChoice) return;
      await submitEvent('player-selected', {
        playerId: hostPlayer.id,
        playerName: hostPlayer.name,
        questionId,
        selection: selectedChoice,
        submittedAt: new Date().toISOString(),
      });
      return;
    }
    if (!textAnswer.trim()) return;
    await submitEvent('player-answered', {
      playerId: hostPlayer.id,
      playerName: hostPlayer.name,
      questionId,
      answer: textAnswer.trim(),
      submittedAt: new Date().toISOString(),
    });
    setTextAnswer('');
  }

  const thisOrThatItem = getThisOrThatItem(currentQuestion, thisOrThatItemIndex);
  const thisOrThatLabels = currentQuestion?.type === 'this_or_that'
    ? [currentQuestion.categoryA, currentQuestion.categoryB, currentQuestion.categoryC].filter(Boolean) as string[]
    : [];
  const thisOrThatCorrect = thisOrThatItem?.answer ? thisOrThatLabels[(thisOrThatItem.answer === 'A' ? 0 : thisOrThatItem.answer === 'B' ? 1 : 2)] : '';

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">Host Room {code}</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="text-sm text-gray-300">
            Mode: {room?.mode || '—'} · Status: {room?.status || '—'} · Code: <span className="font-mono tracking-[0.25em]">{code}</span>
          </div>

          <div className="grid lg:grid-cols-[1fr_320px] gap-4">
            <div className="space-y-4">
              {phase === 'lobby' && (
                <div className="space-y-4">
                  <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-3">
                    <div className="text-xl font-semibold text-cyan-200">Lobby</div>
                    <div className="text-sm text-gray-300">Players: {(room?.players || []).length}</div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={playAsParticipant}
                        onChange={(event) => setPlayAsParticipant(event.target.checked)}
                      />
                      Play as participant
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => submitEvent('game-started')} className="bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-lg">Start Game</button>
                    </div>
                  </div>

                  <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-2">
                    <div className="font-semibold">Lobby Settings (gameConfig JSON)</div>
                    <textarea
                      value={lobbyConfigText}
                      onChange={(event) => setLobbyConfigText(event.target.value)}
                      className="w-full min-h-[180px] bg-gray-800 rounded-lg p-3 font-mono text-xs"
                    />
                    <button onClick={saveLobbySettings} className="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Save Settings</button>
                  </div>
                </div>
              )}

              {phase !== 'lobby' && transitionVisible && (
                <div className="bg-gray-850 rounded-lg border border-gray-700 p-6 text-center space-y-2">
                  <div className="text-3xl font-bold text-yellow-300">Scoreboard</div>
                  <div className="text-sm text-gray-300">Next question is loading…</div>
                </div>
              )}

              {phase === 'active' && currentQuestion && !transitionVisible && (
                <div className="bg-gray-850 rounded-lg border border-gray-700 p-6 space-y-4">
                  <div className="flex justify-between items-center gap-2">
                    <div className="text-xs uppercase tracking-wide text-purple-300">{currentQuestion.type.replace(/_/g, ' ')}</div>
                    {!!totalQuestions && <div className="text-sm text-cyan-200">Question {Math.min(totalQuestions, currentIndex + 1)} / {totalQuestions}</div>}
                  </div>
                  <div className="text-3xl font-bold leading-tight">{displayPrompt(currentQuestion, thisOrThatItemIndex) || 'No question loaded yet.'}</div>

                  {(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'this_or_that') && (
                    <div className="grid md:grid-cols-2 gap-2">
                      {(currentQuestion.type === 'multiple_choice'
                        ? (currentQuestion.options || []).map((option) => option.replace(/\*/g, '').trim())
                        : thisOrThatLabels
                      ).map((option) => {
                        const isCorrect = answerRevealed && (
                          currentQuestion.type === 'multiple_choice'
                            ? option === extractMultipleChoiceCorrectAnswer(currentQuestion)
                            : option === thisOrThatCorrect
                        );
                        return <div key={option} className={`rounded px-3 py-2 ${isCorrect ? 'bg-emerald-700' : 'bg-gray-800'}`}>{option}</div>;
                      })}
                    </div>
                  )}

                  {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'list' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media' || currentQuestion.type === 'grouping' || currentQuestion.type === 'ranking') && (
                    <div className="text-sm text-gray-300">{currentQuestion.type === 'grouping' ? `Group: ${currentQuestion.groupName || 'Group'}` : 'Waiting for submissions...'}</div>
                  )}

                  <div className="text-2xl font-bold text-amber-300">⏱ {Math.ceil(countdownMs / 1000)}s</div>

                  {answerRevealed && (
                    <div className="text-yellow-300 font-semibold">
                      {currentQuestion.type === 'multiple_choice' && `Answer: ${extractMultipleChoiceCorrectAnswer(currentQuestion) || '—'}`}
                      {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && `Answer: ${currentQuestion.answer || '—'}`}
                      {currentQuestion.type === 'list' && `Answers: ${(currentQuestion.answers || []).join(', ') || '—'}`}
                      {currentQuestion.type === 'grouping' && `Correct items: ${(currentQuestion.correctItems || []).join(', ') || '—'}`}
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
                </div>
              )}

              {(phase === 'active' || phase === 'finished') && (
                <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-2">
                  <div className="font-semibold">Live Player Answers</div>
                  {!answersForCurrent.length && <div className="text-gray-500 text-sm">No submissions for this question yet.</div>}
                  {answersForCurrent.map((entry) => (
                    <div key={`${entry.playerId}-${entry.questionId}`} className="bg-gray-800 rounded px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold">{entry.playerName}</div>
                        <div className={`text-xs ${entry.judged ? (entry.correct ? 'text-green-300' : 'text-red-300') : 'text-gray-400'}`}>
                          {entry.judged ? (entry.correct ? `Correct (+${entry.points || 0})` : 'Wrong') : 'Pending'}
                        </div>
                      </div>
                      <div className="text-sm text-gray-200">{answerRevealed ? (entry.answer || entry.selection || '(no answer)') : 'Answer submitted'}</div>
                      {!!entry.challenged && <div className="text-xs text-amber-300">Challenge requested</div>}
                      {typeof entry.strikeCount === 'number' && entry.strikeCount > 0 && <div className="text-xs text-rose-300">Strikes: {entry.strikeCount}</div>}
                      {(currentQuestion?.type === 'open_ended' || currentQuestion?.type === 'list' || currentQuestion?.type === 'prompt') && (
                        <div className="flex gap-2">
                          <button aria-label="Mark as correct" onClick={() => submitEvent('answer-judged', { questionId: entry.questionId, playerId: entry.playerId, correct: true })} className="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded text-sm">✓</button>
                          <button aria-label="Mark as incorrect" onClick={() => submitEvent('answer-judged', { questionId: entry.questionId, playerId: entry.playerId, correct: false })} className="bg-rose-700 hover:bg-rose-600 px-2 py-1 rounded text-sm">✗</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-2">
                <div className="font-semibold">Leaderboard</div>
                {!sortedPlayers.length && <div className="text-gray-500 text-sm">No players joined yet.</div>}
                {sortedPlayers.map((player) => (
                  <div key={player.id} className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between">
                    <span>{player.name}{player.team ? ` · Team ${player.team}` : ''}{player.isHost ? ' (Host)' : ''}</span>
                    <span className="text-yellow-300 font-bold">{Number(scores[player.id] || 0)}</span>
                  </div>
                ))}
              </div>

              <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-2">
                <div className="font-semibold">Host Controls</div>
                <button onClick={setLobby} className="w-full bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg">Set to Lobby</button>
                <button onClick={() => submitEvent('question-changed', { direction: 'previous' })} className="w-full bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Previous</button>
                <button onClick={goToNextQuestion} className="w-full bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Next</button>
                <button onClick={() => submitEvent('answer-revealed')} className="w-full bg-violet-700 hover:bg-violet-600 px-3 py-2 rounded-lg">Reveal Answer</button>
                <button onClick={() => submitEvent('game-finished')} className="w-full bg-rose-700 hover:bg-rose-600 px-3 py-2 rounded-lg">Finish</button>
              </div>

              {phase === 'lobby' && (
                <label className="bg-gray-850 rounded-lg border border-gray-700 p-4 flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={playAsParticipant} onChange={(event) => setPlayAsParticipant(event.target.checked)} />
                  Play as participant
                </label>
              )}

              {playAsParticipant && phase === 'active' && hostPlayer && currentQuestion && (
                <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-2">
                  <div className="font-semibold">Host Participant Controls</div>
                  {(currentQuestion.type === 'multiple_choice' || currentQuestion.type === 'this_or_that') && (
                    <div className="grid gap-2">
                      {(currentQuestion.type === 'multiple_choice'
                        ? (currentQuestion.options || []).map((option) => option.replace(/\*/g, '').trim())
                        : thisOrThatLabels
                      ).map((option) => (
                        <button key={option} onClick={() => setSelectedChoice(option)} className={`text-left px-3 py-2 rounded ${selectedChoice === option ? 'bg-indigo-500' : 'bg-indigo-700 hover:bg-indigo-600'}`}>{option}</button>
                      ))}
                      <button onClick={submitHostParticipantAnswer} className="bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">Submit selection</button>
                    </div>
                  )}
                  {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'list' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && (
                    <div className="space-y-2">
                      <input value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} className="w-full bg-gray-800 rounded-lg px-3 py-2" placeholder="Type your answer" />
                      <button onClick={submitHostParticipantAnswer} className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">Submit answer</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {message && <div className="text-cyan-300 text-sm">{message}</div>}
        </div>
      </div>
    </main>
  );
}
