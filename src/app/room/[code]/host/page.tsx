'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getPusherClient } from '@/lib/pusher-client';
import { extractMultipleChoiceCorrectAnswer } from '@/lib/multiplayer-game';
import type { AnyQuestion } from '@/types/questions';

type HostRoom = {
  code: string;
  mode: 'party' | 'jeopardy' | string;
  status: string;
  players: Array<{ id: string; name: string; team?: string; isHost?: boolean }>;
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
};

function getQuestionId(question: AnyQuestion | null): string {
  if (!question) return 'unknown-question';
  return String(question.id || `${question.type}-question`);
}

function renderQuestion(question: AnyQuestion | null) {
  if (!question) return <div className="text-gray-400">No question loaded yet.</div>;
  if (question.type === 'multiple_choice') {
    return (
      <div className="space-y-2">
        <div className="text-lg">{question.question}</div>
        <div className="grid md:grid-cols-2 gap-2">
          {(question.options || []).map((option) => <div key={option} className="bg-gray-800 rounded px-3 py-2">{option.replace(/\*/g, '').trim()}</div>)}
        </div>
      </div>
    );
  }
  if (question.type === 'this_or_that') {
    return (
      <div className="space-y-2">
        <div className="text-lg">{question.question}</div>
        <div className="flex flex-wrap gap-2">
          {[question.categoryA, question.categoryB, question.categoryC].filter(Boolean).map((label) => (
            <span key={label} className="bg-gray-800 rounded-full px-3 py-1 text-sm">{label}</span>
          ))}
        </div>
      </div>
    );
  }
  if (question.type === 'grouping') {
    return (
      <div className="space-y-2">
        <div className="text-lg">{question.question}</div>
        <div className="text-sm text-gray-300">Group: {question.groupName || 'Group'}</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {(question.items || []).map((item) => <div key={item} className="bg-gray-800 rounded px-3 py-2">{item}</div>)}
        </div>
      </div>
    );
  }
  if (question.type === 'ranking') {
    return (
      <div className="space-y-2">
        <div className="text-lg">{question.question}</div>
        <div className="grid gap-2">
          {(question.items || []).map((item) => <div key={item.text} className="bg-gray-800 rounded px-3 py-2">{item.text}</div>)}
        </div>
      </div>
    );
  }
  if (question.type === 'media') {
    return (
      <div className="space-y-2">
        <div className="text-lg">{question.question}</div>
        <div className="text-sm text-gray-300">{question.mediaType || 'media'}: {question.mediaUrl || 'No media URL'}</div>
      </div>
    );
  }
  if (question.type === 'list') {
    return (
      <div className="space-y-2">
        <div className="text-lg">{question.question}</div>
        <div className="text-sm text-gray-300">Expected answers: {(question.answers || []).length}</div>
      </div>
    );
  }
  return <div className="text-lg">{question.question}</div>;
}

export default function HostRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [code, setCode] = useState('');
  const [room, setRoom] = useState<HostRoom | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    params.then((value) => setCode(value.code.toUpperCase()));
  }, [params]);

  useEffect(() => {
    if (!code) return;
    const load = async () => {
      const res = await fetch(`/api/rooms/${code}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRoom(data.room);
    };
    void load();

    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`game-${code}`);
    channel.bind('state-updated', (payload: { gameState: Record<string, unknown>; status?: string }) => {
      setRoom((prev) => (prev ? { ...prev, gameState: payload.gameState, status: payload.status || prev.status } : prev));
    });
    channel.bind('player-joined', (payload: { players: HostRoom['players'] }) => {
      setRoom((prev) => (prev ? { ...prev, players: payload.players } : prev));
    });
    channel.bind('game-started', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, status: String(payload.status || prev.status), gameState: { ...(prev.gameState || {}), ...payload } } : prev));
      setMessage('Game started.');
    });
    channel.bind('question-changed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), ...payload, currentQuestion: payload.question, currentQuestionIndex: payload.questionIndex } } : prev));
    });
    channel.bind('answer-revealed', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), answerRevealed: true, ...payload } } : prev));
    });
    channel.bind('game-finished', (payload: Record<string, unknown>) => {
      setRoom((prev) => (prev ? { ...prev, status: String(payload.status || 'finished'), gameState: { ...(prev.gameState || {}), ...payload } } : prev));
      setMessage('Game finished.');
    });
    channel.bind('player-buzzed', (payload: { playerName?: string; playerId?: string }) => {
      setRoom((prev) => (prev ? { ...prev, gameState: { ...(prev.gameState || {}), buzz: payload } } : prev));
      setMessage(payload.playerName ? `${payload.playerName} buzzed in` : 'Buzz-in received');
    });
    channel.bind('player-answered', (payload: { answer?: PlayerAnswerEntry }) => {
      const answer = payload?.answer;
      if (!answer) return;
      setRoom((prev) => {
        if (!prev) return prev;
        const currentState = (prev.gameState || {}) as Record<string, unknown>;
        const playerAnswers = currentState.playerAnswers && typeof currentState.playerAnswers === 'object'
          ? { ...(currentState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
          : {};
        const questionId = answer.questionId;
        const existing = Array.isArray(playerAnswers[questionId]) ? [...playerAnswers[questionId]] : [];
        const idx = existing.findIndex((entry) => entry.playerId === answer.playerId);
        if (idx >= 0) existing[idx] = { ...existing[idx], ...answer };
        else existing.push(answer);
        playerAnswers[questionId] = existing;
        return { ...prev, gameState: { ...currentState, playerAnswers } };
      });
      setMessage(answer.playerName ? `${answer.playerName}: ${answer.answer || answer.selection || '(no answer)'}` : 'Answer received');
    });
    channel.bind('player-selected', (payload: { answer?: PlayerAnswerEntry; tally?: Record<string, number> }) => {
      const answer = payload?.answer;
      if (answer) {
        setRoom((prev) => {
          if (!prev) return prev;
          const currentState = (prev.gameState || {}) as Record<string, unknown>;
          const playerAnswers = currentState.playerAnswers && typeof currentState.playerAnswers === 'object'
            ? { ...(currentState.playerAnswers as Record<string, PlayerAnswerEntry[]>) }
            : {};
          const selectionTallies = currentState.selectionTallies && typeof currentState.selectionTallies === 'object'
            ? { ...(currentState.selectionTallies as Record<string, Record<string, number>>) }
            : {};
          const questionId = answer.questionId;
          const existing = Array.isArray(playerAnswers[questionId]) ? [...playerAnswers[questionId]] : [];
          const idx = existing.findIndex((entry) => entry.playerId === answer.playerId);
          if (idx >= 0) existing[idx] = { ...existing[idx], ...answer };
          else existing.push(answer);
          playerAnswers[questionId] = existing;
          if (payload.tally) selectionTallies[questionId] = payload.tally;
          return { ...prev, gameState: { ...currentState, playerAnswers, selectionTallies } };
        });
      }
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
  const currentQuestion = (state.currentQuestion && typeof state.currentQuestion === 'object') ? state.currentQuestion as AnyQuestion : null;
  const currentIndex = Number(state.currentQuestionIndex || 0);
  const totalQuestions = Number(state.totalQuestions || 0);
  const questionId = getQuestionId(currentQuestion);
  const scores = (state.scores && typeof state.scores === 'object') ? state.scores as Record<string, number> : {};
  const playerAnswers = (state.playerAnswers && typeof state.playerAnswers === 'object') ? state.playerAnswers as Record<string, PlayerAnswerEntry[]> : {};
  const answersForCurrent = Array.isArray(playerAnswers[questionId]) ? playerAnswers[questionId] : [];
  const selectionTallies = (state.selectionTallies && typeof state.selectionTallies === 'object') ? state.selectionTallies as Record<string, Record<string, number>> : {};
  const tallyForCurrent = selectionTallies[questionId] || {};
  const buzz = (state.buzz && typeof state.buzz === 'object') ? state.buzz as { playerName?: string; playerId?: string } : null;

  const sortedPlayers = [...(room?.players || [])].sort((a, b) => Number(scores[b.id] || 0) - Number(scores[a.id] || 0));

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
        gameState: { ...(room.gameState || {}), phase: 'lobby', buzz: null },
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

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-5xl mx-auto space-y-4">
        <Link href="/" className="text-cyan-300 hover:text-cyan-200 font-bold">← Main Menu</Link>
        <h1 className="text-3xl font-bold text-cyan-300">Host Room {code}</h1>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-4">
          <div className="text-sm text-gray-300">
            Mode: {room?.mode || '—'} · Status: {room?.status || '—'} · Code: <span className="font-mono tracking-[0.25em]">{code}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={setLobby} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg">Set to Lobby</button>
            <button onClick={() => submitEvent('game-started')} className="bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-lg">Start Game</button>
            <button onClick={() => submitEvent('question-changed', { direction: 'previous' })} className="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Previous Question</button>
            <button onClick={() => submitEvent('question-changed', { direction: 'next' })} className="bg-blue-700 hover:bg-blue-600 px-3 py-2 rounded-lg">Next Question</button>
            <button onClick={() => submitEvent('answer-revealed')} className="bg-violet-700 hover:bg-violet-600 px-3 py-2 rounded-lg">Reveal Answer</button>
            <button onClick={() => submitEvent('game-finished')} className="bg-rose-700 hover:bg-rose-600 px-3 py-2 rounded-lg">Finish</button>
          </div>

          {!!totalQuestions && (
            <div className="text-sm text-cyan-200">
              Question {Math.min(totalQuestions, currentIndex + 1)} / {totalQuestions}
            </div>
          )}

          {buzz?.playerName && (
            <div className="bg-amber-900/70 border border-amber-500 rounded-lg px-3 py-2 text-amber-100 font-bold">
              First buzz: {buzz.playerName}
            </div>
          )}

          <div className="bg-gray-850 rounded-lg border border-gray-700 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wide text-purple-300">{currentQuestion?.type || 'question'}</div>
            {renderQuestion(currentQuestion)}
            {Boolean(state.answerRevealed) && currentQuestion && (
                <div className="text-yellow-300 font-semibold">
                {currentQuestion.type === 'multiple_choice' && `Answer: ${extractMultipleChoiceCorrectAnswer(currentQuestion) || '—'}`}
                {(currentQuestion.type === 'open_ended' || currentQuestion.type === 'prompt' || currentQuestion.type === 'media') && `Answer: ${currentQuestion.answer || '—'}`}
                {currentQuestion.type === 'list' && `Answers: ${(currentQuestion.answers || []).join(', ') || '—'}`}
                {currentQuestion.type === 'grouping' && `Correct items: ${(currentQuestion.correctItems || []).join(', ') || '—'}`}
              </div>
            )}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="font-semibold">Live Scoreboard</div>
              {!sortedPlayers.length && <div className="text-gray-500 text-sm">No players joined yet.</div>}
              {sortedPlayers.map((player) => (
                <div key={player.id} className="bg-gray-800 rounded px-3 py-2 flex items-center justify-between">
                  <span>{player.name}{player.team ? ` · Team ${player.team}` : ''}{player.isHost ? ' (Host)' : ''}</span>
                  <span className="text-yellow-300 font-bold">{Number(scores[player.id] || 0)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="font-semibold">Live Player Answers</div>
              {!answersForCurrent.length && <div className="text-gray-500 text-sm">No submissions for this question yet.</div>}
              {answersForCurrent.map((entry) => (
                <div key={`${entry.playerId}-${entry.questionId}`} className="bg-gray-800 rounded px-3 py-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{entry.playerName}</div>
                    <div className={`text-xs ${entry.judged ? (entry.correct ? 'text-green-300' : 'text-red-300') : 'text-gray-400'}`}>
                      {entry.judged ? (entry.correct ? `Correct (+${entry.points || 0})` : 'Wrong') : 'Pending'}
                    </div>
                  </div>
                  <div className="text-sm text-gray-200">{entry.answer || entry.selection || '(no answer)'}</div>
                  {(currentQuestion?.type === 'open_ended' || currentQuestion?.type === 'list' || currentQuestion?.type === 'prompt') && !entry.judged && (
                    <div className="flex gap-2">
                      <button onClick={() => submitEvent('answer-judged', { questionId: entry.questionId, playerId: entry.playerId, correct: true })} className="bg-emerald-700 hover:bg-emerald-600 px-2 py-1 rounded text-sm">Mark Correct</button>
                      <button onClick={() => submitEvent('answer-judged', { questionId: entry.questionId, playerId: entry.playerId, correct: false })} className="bg-rose-700 hover:bg-rose-600 px-2 py-1 rounded text-sm">Mark Wrong</button>
                    </div>
                  )}
                </div>
              ))}
              {(currentQuestion?.type === 'multiple_choice' || currentQuestion?.type === 'this_or_that') && Object.keys(tallyForCurrent).length > 0 && (
                <div className="bg-gray-800 rounded px-3 py-2">
                  <div className="text-sm text-gray-300 mb-1">Selection breakdown</div>
                  <div className="space-y-1 text-sm">
                    {Object.entries(tallyForCurrent).map(([option, count]) => (
                      <div key={option} className="flex justify-between"><span>{option}</span><span className="text-cyan-300">{count}</span></div>
                    ))}
                  </div>
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
