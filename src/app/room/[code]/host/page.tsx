'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PartySettingsModal } from '@/components/party/PartySettingsModal';
import { getPusherClient } from '@/lib/pusher-client';
import {
  calculateRemainingTimeMs,
  extractMultipleChoiceCorrectAnswer,
  getThisOrThatItem,
} from '@/lib/multiplayer-game';
import { normalizePartySettings, type PartySettings } from '@/lib/party-mode';
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
  groupingSelection?: string[];
  submittedAt: string;
  judged?: boolean;
  correct?: boolean;
  points?: number;
  challenged?: boolean;
  gaveUp?: boolean;
  strikeCount?: number;
  selectionKey?: 'A' | 'B' | 'C';
  questionItemIndex?: number;
};

type TransitionState = {
  type?: string;
  startedAt?: string;
  durationMs?: number;
};

type JeopardyLobbySettings = {
  method: string;
  sessionType: string;
  teams: string[];
};

// Wait briefly after revealing the answer before moving to the next host-controlled step.
const REVEAL_DELAY_MS = 2000;
// Show the scoreboard transition between full questions.
const TRANSITION_DELAY_MS = 2000;
const HANDOFF_BUFFER_MS = 200;
const SAFETY_BUFFER_MS = 500;
// Reset the flow guard after a short This or That item-to-item handoff.
const INTERMEDIATE_RESET_DELAY_MS = REVEAL_DELAY_MS + HANDOFF_BUFFER_MS;
// Reset the flow guard after reveal + scoreboard transition + a small safety buffer.
const FULL_ADVANCE_RESET_DELAY_MS = REVEAL_DELAY_MS + TRANSITION_DELAY_MS + SAFETY_BUFFER_MS;

function getQuestionId(question: AnyQuestion | null): string {
  if (!question) return 'unknown-question';
  return String(question.id || `${question.type}-question`);
}

function getQuestionCategoryLabel(question: AnyQuestion | null): string {
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

function getGroupingMode(question: AnyQuestion | null): string {
  return String((question as { partyGroupingMode?: unknown } | null)?.partyGroupingMode || 'elimination');
}

function getGroupedState<T>(state: Record<string, unknown>, key: string): Record<string, T> {
  const value = state[key];
  return value && typeof value === 'object' ? value as Record<string, T> : {};
}

export default function HostRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<HostRoom | null>(null);
  const [message, setMessage] = useState('');
  const [playAsParticipant, setPlayAsParticipant] = useState(false);
  const [textAnswer, setTextAnswer] = useState('');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [transitionVisible, setTransitionVisible] = useState(false);
  const [countdownMs, setCountdownMs] = useState(0);
  const [partySettings, setPartySettings] = useState<PartySettings>(normalizePartySettings(null));
  const [jeopardySettings, setJeopardySettings] = useState<JeopardyLobbySettings>({ method: 'random', sessionType: 'competition', teams: [] });
  const revealRequestedRef = useRef(false);
  const advanceInProgressRef = useRef(false);

  useEffect(() => {
    params.then((value) => setCode(value.code.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!room?.gameConfig) return;
    if (room.mode === 'party') {
      setPartySettings(normalizePartySettings(room.gameConfig));
      return;
    }
    if (room.mode === 'jeopardy') {
      const config = room.gameConfig as { method?: unknown; sessionType?: unknown; teams?: unknown };
      setJeopardySettings({
        method: typeof config?.method === 'string' && config.method ? config.method : 'random',
        sessionType: typeof config?.sessionType === 'string' && config.sessionType ? config.sessionType : 'competition',
        teams: Array.isArray(config?.teams) ? config.teams.filter((team): team is string => typeof team === 'string') : [],
      });
    }
  }, [room?.gameConfig, room?.mode]);

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
        window.setTimeout(() => setTransitionVisible(false), Number(payload.transition.durationMs || TRANSITION_DELAY_MS));
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
      revealRequestedRef.current = false;
      advanceInProgressRef.current = false;
    });
    channel.bind('question-changed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? {
        ...prev,
        gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.currentQuestion || payload.question, currentQuestionIndex: payload.currentQuestionIndex ?? payload.questionIndex, phase: 'active' },
      } : prev));
      setSelectedChoice(null);
      setTextAnswer('');
      revealRequestedRef.current = false;
      advanceInProgressRef.current = false;
      setTransitionVisible(false);
    });
    channel.bind('answer-revealed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, answerRevealed: true, answerRevealedQuestionId: payload.questionId } } : prev));
    });
    channel.bind('transition-started', (payload: { transition?: TransitionState }) => {
      setTransitionVisible(true);
      const duration = Number(payload?.transition?.durationMs || TRANSITION_DELAY_MS);
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
  const playerAnswers = getGroupedState<PlayerAnswerEntry[]>(state, 'playerAnswers');
  const answersForCurrent = Array.isArray(playerAnswers[questionId]) ? playerAnswers[questionId] : [];
  const answeredByPlayer = new Set(answersForCurrent.map((entry) => entry.playerId));
  const answerRevealed = Boolean(state.answerRevealed) && String(state.answerRevealedQuestionId || '') === questionId;
  const sortedPlayers = [...(room?.players || [])].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));
  const hostPlayer = (room?.players || []).find((player) => player.isHost);
  const thisOrThatItem = getThisOrThatItem(currentQuestion, thisOrThatItemIndex);
  const thisOrThatLabels = currentQuestion?.type === 'this_or_that'
    ? [currentQuestion.categoryA, currentQuestion.categoryB, currentQuestion.categoryC].filter(Boolean) as string[]
    : [];
  const thisOrThatCorrect = thisOrThatItem?.answer ? thisOrThatLabels[(thisOrThatItem.answer === 'A' ? 0 : thisOrThatItem.answer === 'B' ? 1 : 2)] : '';
  const groupingSelectionsByPlayer = new Map(
    answersForCurrent
      .filter((entry) => Array.isArray(entry.groupingSelection) && entry.groupingSelection.length)
      .map((entry) => [entry.playerId, entry.groupingSelection || []]),
  );
  const groupingEliminatedItems = getGroupedState<string[]>(state, 'groupingEliminatedItems')[questionId] || [];
  const groupingClaimedItems = getGroupedState<Record<string, string>>(state, 'groupingClaimedItems')[questionId] || {};
  const groupingTurnByQuestion = getGroupedState<number>(state, 'groupingTurnByQuestion');
  const currentTurnPlayer = currentQuestion?.type === 'grouping'
    ? (room?.players || [])[Number(groupingTurnByQuestion[questionId] || 0)] || null
    : null;
  const questionPromptLabel = getQuestionCategoryLabel(currentQuestion);
  const questionText = getQuestionText(currentQuestion, thisOrThatItemIndex);

  useEffect(() => {
    if (!currentQuestion || phase !== 'active' || answerRevealed || transitionVisible) {
      setCountdownMs(0);
      return;
    }
    const tick = () => {
      const remaining = calculateRemainingTimeMs(state.questionStartedAt, currentQuestion, room?.gameConfig);
      setCountdownMs(remaining);
      if (remaining <= 0 && !revealRequestedRef.current) {
        revealRequestedRef.current = true;
        void advanceQuestionFlow();
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [answerRevealed, currentQuestion, phase, room?.gameConfig, state.questionStartedAt, transitionVisible, thisOrThatItemIndex]);

  async function submitEvent(event: string, payload: Record<string, unknown> = {}) {
    if (!code) return false;
    const res = await fetch(`/api/rooms/${code}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data?.error || 'Request failed.');
      return false;
    }
    return true;
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

  async function savePartyLobbySettings() {
    const res = await fetch(`/api/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameConfig: partySettings }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data?.error || 'Failed to update settings.');
      return;
    }
    setRoom(data.room);
    setMessage('Lobby settings saved.');
  }

  async function saveJeopardyLobbySettings() {
    const res = await fetch(`/api/rooms/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameConfig: {
          method: jeopardySettings.method,
          sessionType: jeopardySettings.sessionType,
          teams: jeopardySettings.teams,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage(data?.error || 'Failed to update settings.');
      return;
    }
    setRoom(data.room);
    setMessage('Lobby settings saved.');
  }

  async function advanceQuestionFlow() {
    if (!currentQuestion) return;
    if (advanceInProgressRef.current) {
      setMessage('Advance already in progress.');
      return;
    }
    let isIntermediateThisOrThat = false;
    try {
      advanceInProgressRef.current = true;
      const items = currentQuestion.type === 'this_or_that' && Array.isArray(currentQuestion.items) ? currentQuestion.items : [];
      isIntermediateThisOrThat = currentQuestion.type === 'this_or_that' && thisOrThatItemIndex < items.length - 1;
      if (!answerRevealed) {
        const revealed = await submitEvent('answer-revealed');
        if (!revealed) return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, REVEAL_DELAY_MS));
      if (isIntermediateThisOrThat) {
        await submitEvent('question-changed', { direction: 'next' });
        return;
      }
      const started = await submitEvent('transition-started', { durationMs: TRANSITION_DELAY_MS });
      if (!started) return;
      window.setTimeout(() => {
        void submitEvent('question-changed', { direction: 'next' });
      }, TRANSITION_DELAY_MS);
    } finally {
      window.setTimeout(() => {
        advanceInProgressRef.current = false;
      }, isIntermediateThisOrThat ? INTERMEDIATE_RESET_DELAY_MS : FULL_ADVANCE_RESET_DELAY_MS);
    }
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

  if (phase === 'lobby' && room?.mode === 'party') {
    return (
      <PartySettingsModal
        settings={partySettings}
        setSettings={setPartySettings}
        startGame={() => { void submitEvent('game-started'); }}
        startMultiplayerHost={() => undefined}
        savePreset={async () => undefined}
        loadPreset={() => undefined}
        savedPresets={[]}
        isOwner={false}
        hasQuestions
        title={`🎉 Lobby Settings · Room ${code}`}
        backHref={`/room/${code}/host`}
        showPresetControls={false}
        hideDefaultActionButtons
        footerContent={(
          <>
            <label className="bg-gray-900 rounded-lg border border-gray-700 px-4 py-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={playAsParticipant} onChange={(event) => setPlayAsParticipant(event.target.checked)} />
              Play as participant
            </label>
            <button onClick={() => void savePartyLobbySettings()} className="bg-blue-700 hover:bg-blue-600 px-4 py-2 rounded-lg font-bold">
              Save Settings
            </button>
            <button onClick={() => void submitEvent('game-started')} className="bg-emerald-700 hover:bg-emerald-600 px-4 py-2 rounded-lg font-bold">
              Start Game
            </button>
          </>
        )}
      />
    );
  }

  if (phase === 'lobby' && room?.mode === 'jeopardy') {
    return (
      <main className="min-h-screen bg-blue-950 text-white p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
            <div className="text-sm text-blue-200">Room code <span className="font-mono tracking-[0.25em]">{code}</span></div>
          </div>
          <div className="bg-blue-900 border border-blue-700 rounded-xl p-6 space-y-4">
            <div>
              <h1 className="text-3xl font-bold text-yellow-300">Jeopardy Lobby Settings</h1>
              <p className="text-sm text-blue-200">Update the same multiplayer settings you chose when creating the room, then start when everyone is ready.</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <label className="space-y-2 text-sm">
                <span className="text-blue-200">Show selection</span>
                <select value={jeopardySettings.method} onChange={(event) => setJeopardySettings((prev) => ({ ...prev, method: event.target.value }))} className="w-full bg-blue-800 border border-blue-600 rounded-lg px-3 py-2">
                  <option value="random">Random</option>
                  <option value="replay">Replay selected show</option>
                </select>
              </label>
              <label className="space-y-2 text-sm">
                <span className="text-blue-200">Session type</span>
                <select value={jeopardySettings.sessionType} onChange={(event) => setJeopardySettings((prev) => ({ ...prev, sessionType: event.target.value }))} className="w-full bg-blue-800 border border-blue-600 rounded-lg px-3 py-2">
                  <option value="competition">Competition</option>
                  <option value="practice">Practice</option>
                </select>
              </label>
            </div>
            <label className="space-y-2 text-sm block">
              <span className="text-blue-200">Teams (comma separated)</span>
              <input
                value={jeopardySettings.teams.join(', ')}
                onChange={(event) => setJeopardySettings((prev) => ({
                  ...prev,
                  teams: event.target.value.split(',').map((team) => team.trim()).filter(Boolean),
                }))}
                className="w-full bg-blue-800 border border-blue-600 rounded-lg px-3 py-2"
                placeholder="Team 1, Team 2"
              />
            </label>
            <label className="bg-blue-950/70 rounded-lg border border-blue-700 px-4 py-2 flex items-center gap-2 text-sm w-fit">
              <input type="checkbox" checked={playAsParticipant} onChange={(event) => setPlayAsParticipant(event.target.checked)} />
              Play as participant
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => void saveJeopardyLobbySettings()} className="bg-cyan-700 hover:bg-cyan-600 px-4 py-2 rounded-lg font-bold">Save Settings</button>
              <button onClick={() => void submitEvent('game-started')} className="bg-emerald-700 hover:bg-emerald-600 px-4 py-2 rounded-lg font-bold">Start Game</button>
            </div>
            {message && <div className="text-cyan-200 text-sm">{message}</div>}
          </div>
        </div>
      </main>
    );
  }

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

                  {questionPromptLabel && <div className="text-sm uppercase tracking-wide text-yellow-300">{questionPromptLabel}</div>}
                  <div className="text-3xl font-bold leading-tight">{questionText || 'No question loaded yet.'}</div>

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
                        return <div key={option} className={`rounded px-3 py-3 ${isCorrect ? 'bg-emerald-700' : 'bg-gray-800'}`}>{option}</div>;
                      })}
                    </div>
                  )}

                  {currentQuestion.type === 'ranking' && (
                    <div className="space-y-2 rounded-lg bg-gray-900/70 border border-gray-700 p-4">
                      <div className="text-sm font-semibold text-purple-200">Items to rank</div>
                      <div className="grid gap-2">
                        {(currentQuestion.items || []).map((item, index) => (
                          <div key={`${item.text}-${index}`} className="bg-gray-800 rounded px-3 py-2 text-sm">{item.text}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentQuestion.type === 'grouping' && (
                    <div className="space-y-3 rounded-lg bg-gray-900/70 border border-gray-700 p-4">
                      <div className="text-sm text-purple-200">Group: <span className="font-semibold">{currentQuestion.groupName || 'Group'}</span> · Mode: <span className="font-semibold">{getGroupingMode(currentQuestion)}</span></div>
                      <div className="text-sm text-gray-300">Correct items: {(currentQuestion.correctItems || []).join(', ') || '—'}</div>
                      {!!currentTurnPlayer && getGroupingMode(currentQuestion) === 'turns' && (
                        <div className="text-sm text-yellow-300">Current turn: <span className="font-semibold">{currentTurnPlayer.name}</span></div>
                      )}
                      <div className="grid md:grid-cols-2 gap-2">
                        {(currentQuestion.items || []).map((item) => {
                          const eliminated = groupingEliminatedItems.includes(item);
                          const claimedByPlayerId = groupingClaimedItems[item];
                          const claimedBy = claimedByPlayerId ? room?.players.find((player) => player.id === claimedByPlayerId)?.name : '';
                          return (
                            <div key={item} className={`rounded border px-3 py-2 text-sm ${eliminated ? 'bg-gray-900 border-gray-700 text-gray-500 line-through' : claimedBy ? 'bg-emerald-900/60 border-emerald-600' : 'bg-gray-800 border-gray-700'}`}>
                              <div>{item}</div>
                              {claimedBy && <div className="text-xs text-emerald-200">Claimed by {claimedBy}</div>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2 border-t border-gray-700 pt-3">
                        <div className="text-sm font-semibold text-purple-200">Per-player selection status</div>
                        {(room?.players || []).map((player) => {
                          const selections = groupingSelectionsByPlayer.get(player.id) || [];
                          return (
                            <div key={player.id} className="bg-gray-800 rounded px-3 py-2 text-sm">
                              <span className="font-semibold">{player.name}</span>: {selections.length ? selections.join(', ') : 'No locked selection'}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'list' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && (
                    <div className="text-sm text-gray-300">Waiting for submissions...</div>
                  )}

                  <div className="text-2xl font-bold text-amber-300">⏱ {Math.ceil(countdownMs / 1000)}s</div>

                  {answerRevealed && (
                    <div className="text-yellow-300 font-semibold">
                      {currentQuestion.type === 'multiple_choice' && `Answer: ${extractMultipleChoiceCorrectAnswer(currentQuestion) || '—'}`}
                      {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && `Answer: ${currentQuestion.answer || '—'}`}
                      {currentQuestion.type === 'list' && `Answers: ${(currentQuestion.answers || []).join(', ') || '—'}`}
                      {currentQuestion.type === 'grouping' && `Correct items: ${(currentQuestion.correctItems || []).join(', ') || '—'}`}
                      {currentQuestion.type === 'this_or_that' && `Answer: ${thisOrThatCorrect || '—'}`}
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
                  {answersForCurrent.map((entry, index) => {
                    const canShowResponse = currentQuestion?.type !== 'multiple_choice' && currentQuestion?.type !== 'this_or_that';
                    const responseText = entry.groupingSelection?.length
                      ? entry.groupingSelection.join(', ')
                      : entry.answer || entry.selection || '(no answer)';
                    return (
                      <div key={`${entry.playerId}-${entry.questionId}-${index}`} className="bg-gray-800 rounded px-3 py-2 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-semibold">{entry.playerName}</div>
                          <div className={`text-xs ${entry.judged ? (entry.correct ? 'text-green-300' : 'text-red-300') : 'text-gray-400'}`}>
                            {entry.judged ? (entry.correct ? `Correct (+${entry.points || 0})` : 'Wrong') : 'Pending'}
                          </div>
                        </div>
                        <div className="text-sm text-gray-200">{canShowResponse || answerRevealed ? responseText : 'Answer submitted'}</div>
                        {!!entry.challenged && <div className="text-xs text-amber-300">Challenge requested</div>}
                        {typeof entry.strikeCount === 'number' && entry.strikeCount > 0 && <div className="text-xs text-rose-300">Strikes: {entry.strikeCount}</div>}
                        {(currentQuestion?.type === 'open_ended' || currentQuestion?.type === 'list' || currentQuestion?.type === 'prompt') && (
                          <div className="flex gap-2">
                            <button aria-label="Mark as correct" onClick={() => void submitEvent('answer-judged', { questionId: entry.questionId, playerId: entry.playerId, correct: true })} className="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded text-sm">✓</button>
                            <button aria-label="Mark as incorrect" onClick={() => void submitEvent('answer-judged', { questionId: entry.questionId, playerId: entry.playerId, correct: false })} className="bg-rose-700 hover:bg-rose-600 px-2 py-1 rounded text-sm">✗</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                <button onClick={() => void submitEvent('question-changed', { direction: 'previous' })} className="w-full bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Previous</button>
                <button onClick={() => void advanceQuestionFlow()} className="w-full bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Next</button>
                <button onClick={() => void submitEvent('answer-revealed')} className="w-full bg-violet-700 hover:bg-violet-600 px-3 py-2 rounded-lg text-sm">Reveal only</button>
                <button onClick={() => void submitEvent('game-finished')} className="w-full bg-rose-700 hover:bg-rose-600 px-3 py-2 rounded-lg">Finish</button>
              </div>

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
                      <button onClick={() => void submitHostParticipantAnswer()} className="bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">Submit selection</button>
                    </div>
                  )}
                  {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'list' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && (
                    <div className="space-y-2">
                      <input value={textAnswer} onChange={(event) => setTextAnswer(event.target.value)} className="w-full bg-gray-800 rounded-lg px-3 py-2" placeholder="Type your answer" />
                      <button onClick={() => void submitHostParticipantAnswer()} className="w-full bg-emerald-700 hover:bg-emerald-600 py-2 rounded-lg font-bold">Submit answer</button>
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
