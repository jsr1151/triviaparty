'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { AnyQuestion, Difficulty } from '@/types/questions';
import type { JeopardyGameData, JeopardyCategoryData, JeopardyClueData, JeopardyIndexEntry } from '@/types/jeopardy';
import {
  getGitHubConfig,
  saveGitHubConfig,
  clearGitHubConfig,
  isGitHubConfigured,
  testGitHubConnection,
  commitQuestions,
  commitJeopardyGame,
} from '@/lib/github-commit';

/* ─── constants ─── */
const QUESTION_TYPES = [
  { value: 'multiple_choice', label: 'Multiple Choice', icon: '🔤' },
  { value: 'open_ended', label: 'Open Ended', icon: '✍️' },
  { value: 'list', label: 'List', icon: '📋' },
  { value: 'grouping', label: 'Grouping', icon: '🗂️' },
  { value: 'this_or_that', label: 'This or That', icon: '⚔️' },
  { value: 'ranking', label: 'Ranking', icon: '📊' },
  { value: 'media', label: 'Media', icon: '🖼️' },
  { value: 'prompt', label: 'Prompt', icon: '🧩' },
] as const;

const DIFFICULTIES: Difficulty[] = ['very_easy', 'easy', 'medium', 'hard', 'very_hard'];

const STORAGE_KEY = 'triviaparty-creator-questions';

/* ─── helpers ─── */
function loadSaved(): AnyQuestion[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToDisk(questions: AnyQuestion[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}

function downloadJson(questions: AnyQuestion[], filename: string) {
  const blob = new Blob(
    [JSON.stringify({ questions, count: questions.length }, null, 2)],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseNumberList(input: string): Set<number> {
  return new Set(
    input
      .split(/[\s,]+/)
      .map((token) => Number(token.trim()))
      .filter((value) => Number.isFinite(value) && value > 0),
  );
}

function parseStringList(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function categoryName(value: AnyQuestion['category'] | string | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || '';
}

function questionSignature(questionText: string, category: AnyQuestion['category'] | string | undefined): string {
  return `${normalizeText(questionText)}|${normalizeText(categoryName(category))}`;
}

/* ─── GitHub Settings Modal ─── */
function GitHubSettingsModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = getGitHubConfig();
  const [token, setToken] = useState(existing?.token || '');
  const [owner, setOwner] = useState(existing?.owner || 'jsr1151');
  const [repo, setRepo] = useState(existing?.repo || 'triviaparty');
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState('');

  async function handleTest() {
    if (!token.trim()) { setStatus('Token is required'); return; }
    setTesting(true);
    setStatus('Testing connection…');
    const ok = await testGitHubConnection({ token: token.trim(), owner: owner.trim(), repo: repo.trim() });
    setTesting(false);
    setStatus(ok ? '✅ Connected successfully!' : '❌ Cannot access repo. Check token/permissions.');
  }

  function handleSave() {
    if (!token.trim()) { setStatus('Token is required'); return; }
    saveGitHubConfig({ token: token.trim(), owner: owner.trim(), repo: repo.trim() });
    onSaved();
    onClose();
  }

  function handleDisconnect() {
    clearGitHubConfig();
    setToken('');
    setStatus('Disconnected');
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4">GitHub Connection</h3>
        <p className="text-sm text-gray-400 mb-4">
          Connect to GitHub to save questions and games directly to your repo from any device.
          Create a <a href="https://github.com/settings/tokens/new?scopes=repo&description=TriviaParty+Creator" target="_blank" rel="noopener" className="text-purple-400 underline">Personal Access Token</a> with <code className="bg-gray-700 px-1 rounded">repo</code> scope.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Personal Access Token</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Owner</label>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Repo</label>
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
          </div>
        </div>
        {status && <p className={`text-sm mt-3 ${status.startsWith('✅') ? 'text-green-400' : status.startsWith('❌') ? 'text-red-400' : 'text-gray-300'}`}>{status}</p>}
        <div className="flex justify-between mt-5">
          <button onClick={handleDisconnect} className="px-3 py-2 rounded-lg bg-red-800 hover:bg-red-700 text-sm font-medium">Disconnect</button>
          <div className="flex gap-2">
            <button onClick={handleTest} disabled={testing} className="px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm font-medium disabled:opacity-50">{testing ? 'Testing…' : 'Test'}</button>
            <button onClick={onClose} className="px-3 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm font-medium">Cancel</button>
            <button onClick={handleSave} className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-bold">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── blank question factories ─── */
type QType = (typeof QUESTION_TYPES)[number]['value'];

function blankQuestion(type: QType): AnyQuestion {
  const base = { question: '', difficulty: 'medium' as Difficulty, category: '' };
  switch (type) {
    case 'multiple_choice':
      return { ...base, type, options: ['', '', '', ''], correctAnswer: '' };
    case 'open_ended':
      return { ...base, type, answer: '', acceptedAnswers: [] };
    case 'list':
      return { ...base, type, answers: [''], minRequired: 1 };
    case 'grouping':
      return { ...base, type, groupName: '', correctItems: [''], items: ['', ''] };
    case 'this_or_that':
      return { ...base, type, categoryA: '', categoryB: '', categoryC: '', items: [{ text: '', answer: 'A' as const }] };
    case 'ranking':
      return { ...base, type, criteria: '', items: [{ text: '', rank: 1, value: '' }] };
    case 'media':
      return { ...base, type, mediaType: 'image', mediaUrl: '', answer: '', acceptedAnswers: [] };
    case 'prompt':
      return { ...base, type, prompt: '', answer: '', acceptedAnswers: [] };
  }
}

/* ─── pill / tag input ─── */
function PillInput({
  items,
  onChange,
  placeholder,
  label,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div>
      {label && <label className="block text-sm text-gray-400 mb-1">{label}</label>}
      <div className="flex flex-wrap gap-2 bg-gray-700 rounded-lg p-2 min-h-[42px]">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center bg-purple-700/60 text-sm rounded-full px-3 py-1">
            {item}
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="ml-1 text-gray-300 hover:text-white">&times;</button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
              e.preventDefault();
              onChange([...items, draft.trim()]);
              setDraft('');
            }
            if (e.key === 'Backspace' && !draft && items.length) {
              onChange(items.slice(0, -1));
            }
          }}
          placeholder={items.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-white text-sm placeholder-gray-500"
        />
      </div>
      <p className="text-xs text-gray-500 mt-1">Press Enter or comma to add</p>
    </div>
  );
}

function buildJeopardyClueId(gameId: number, round: 'single' | 'double' | 'final', categoryPosition: number, rowIndex: number) {
  const roundKey = round === 'single' ? 's' : round === 'double' ? 'd' : 'f';
  return `g${gameId}-${roundKey}-c${categoryPosition}-r${rowIndex}`;
}

function defaultJeopardyCategory(
  gameId: number,
  round: 'single' | 'double' | 'final',
  position: number,
): JeopardyCategoryData {
  const clueCount = round === 'final' ? 1 : 5;
  const valueScale = round === 'double' ? 400 : 200;
  const clues: JeopardyClueData[] = Array.from({ length: clueCount }).map((_, rowIndex) => {
    const isFinal = round === 'final';
    return {
      clueId: buildJeopardyClueId(gameId, round, position, rowIndex),
      question: '',
      answer: '',
      value: isFinal ? null : valueScale * (rowIndex + 1),
      dailyDouble: false,
      tripleStumper: false,
      isFinalJeopardy: isFinal,
      category: '',
      round,
      rowIndex,
    };
  });

  return {
    name: round === 'final' ? 'FINAL JEOPARDY' : `CATEGORY ${position + 1}`,
    round,
    position,
    clues,
  };
}

function blankJeopardyGame(): JeopardyGameData {
  const gameId = 0;
  return {
    gameId,
    showNumber: gameId,
    airDate: new Date().toISOString().slice(0, 10),
    season: null,
    isSpecial: false,
    tournamentType: null,
    categories: [
      ...Array.from({ length: 6 }).map((_, i) => defaultJeopardyCategory(gameId, 'single', i)),
      ...Array.from({ length: 6 }).map((_, i) => defaultJeopardyCategory(gameId, 'double', i)),
      defaultJeopardyCategory(gameId, 'final', 0),
    ],
  };
}

function updateQuestionOption(
  question: AnyQuestion & { type: 'multiple_choice' },
  optionIndex: number,
  optionText: string,
): AnyQuestion & { type: 'multiple_choice' } {
  const options = [...(question.options || [])];
  const previous = options[optionIndex] || '';
  options[optionIndex] = optionText;

  return {
    ...question,
    options,
    correctAnswer: question.correctAnswer === previous ? optionText : question.correctAnswer,
  };
}

function updateMediaOption(
  question: AnyQuestion & { type: 'media'; options?: string[]; correctAnswer?: string },
  optionIndex: number,
  optionText: string,
): AnyQuestion & { type: 'media'; options?: string[]; correctAnswer?: string } {
  const options = [...(question.options || [])];
  const previous = options[optionIndex] || '';
  options[optionIndex] = optionText;

  return {
    ...question,
    options,
    correctAnswer: question.correctAnswer === previous ? optionText : question.correctAnswer,
  };
}

/* ─── per-type editors ─── */
function MultipleChoiceEditor({ q, set }: { q: AnyQuestion & { type: 'multiple_choice' }; set: (q: AnyQuestion) => void }) {
  const options = q.options || ['', '', '', ''];
  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-400">Options (click the left dot to mark the correct answer)</label>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => set({ ...q, correctAnswer: opt })}
            className="w-6 h-6 rounded-full border border-gray-400 flex items-center justify-center hover:border-green-400"
            title="Mark as correct"
          >
            <span className={`w-3 h-3 rounded-full ${q.correctAnswer === opt && opt.trim() ? 'bg-green-500' : 'bg-transparent'}`} />
          </button>
          <input
            value={opt}
            onChange={(e) => set(updateQuestionOption(q, i, e.target.value))}
            placeholder={`Option ${i + 1}`}
            className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
          />
          {options.length > 2 && (
            <button onClick={() => { const next = options.filter((_, j) => j !== i); set({ ...q, options: next, correctAnswer: q.correctAnswer === opt ? '' : q.correctAnswer }); }}
              className="text-red-400 hover:text-red-300 text-sm">✕</button>
          )}
        </div>
      ))}
      {options.length < 8 && (
        <button onClick={() => set({ ...q, options: [...options, ''] })}
          className="text-purple-400 hover:text-purple-300 text-sm">+ Add Option</button>
      )}
    </div>
  );
}

function OpenEndedEditor({ q, set }: { q: AnyQuestion & { type: 'open_ended' }; set: (q: AnyQuestion) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Answer</label>
        <input value={q.answer || ''} onChange={(e) => set({ ...q, answer: e.target.value })}
          className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Primary answer" />
      </div>
      <PillInput
        items={q.acceptedAnswers || []}
        onChange={(acceptedAnswers) => set({ ...q, acceptedAnswers })}
        label="Accepted Answers (alternatives)"
        placeholder="Type an alternative answer…"
      />
    </div>
  );
}

function ListEditor({ q, set }: { q: AnyQuestion & { type: 'list' }; set: (q: AnyQuestion) => void }) {
  return (
    <div className="space-y-3">
      <PillInput
        items={q.answers || []}
        onChange={(answers) => set({ ...q, answers })}
        label="All Valid Answers"
        placeholder="Type an answer…"
      />
      <div>
        <label className="block text-sm text-gray-400 mb-1">Minimum Required</label>
        <input type="number" min={1} value={q.minRequired || 1}
          onChange={(e) => set({ ...q, minRequired: parseInt(e.target.value) || 1 })}
          className="w-24 bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500" />
      </div>
    </div>
  );
}

function GroupingEditor({ q, set }: { q: AnyQuestion & { type: 'grouping' }; set: (q: AnyQuestion) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Group Name</label>
        <input value={q.groupName || ''} onChange={(e) => set({ ...q, groupName: e.target.value })}
          className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="e.g. Wheel of Fortune Wedges" />
      </div>
      <PillInput
        items={q.correctItems || []}
        onChange={(correctItems) => set({ ...q, correctItems })}
        label="Correct Items (belong to the group)"
        placeholder="Type a correct item…"
      />
      <PillInput
        items={q.items || []}
        onChange={(items) => set({ ...q, items })}
        label="All Items Shown (correct + incorrect, shuffled)"
        placeholder="Type an item…"
      />
      <p className="text-xs text-gray-500">All items includes both correct and incorrect options that will be displayed to the player.</p>
    </div>
  );
}

function ThisOrThatEditor({ q, set }: { q: AnyQuestion & { type: 'this_or_that' }; set: (q: AnyQuestion) => void }) {
  const items = q.items || [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Category A</label>
          <input value={q.categoryA || ''} onChange={(e) => set({ ...q, categoryA: e.target.value })}
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="e.g. Wheel of Fortune" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Category B</label>
          <input value={q.categoryB || ''} onChange={(e) => set({ ...q, categoryB: e.target.value })}
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="e.g. Jeopardy!" />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Category C (optional)</label>
          <input value={q.categoryC || ''} onChange={(e) => set({ ...q, categoryC: e.target.value })}
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="(optional)" />
        </div>
      </div>
      <label className="block text-sm text-gray-400">Items</label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={item.text} onChange={(e) => {
            const next = [...items]; next[i] = { ...item, text: e.target.value }; set({ ...q, items: next });
          }} placeholder="Item text" className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500" />
          <select value={item.answer} onChange={(e) => {
            const next = [...items]; next[i] = { ...item, answer: e.target.value as 'A' | 'B' | 'C' }; set({ ...q, items: next });
          }} className="bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500">
            <option value="A">{q.categoryA || 'A'}</option>
            <option value="B">{q.categoryB || 'B'}</option>
            {q.categoryC && <option value="C">{q.categoryC || 'C'}</option>}
          </select>
          {items.length > 1 && (
            <button onClick={() => set({ ...q, items: items.filter((_, j) => j !== i) })}
              className="text-red-400 hover:text-red-300 text-sm">✕</button>
          )}
        </div>
      ))}
      <button onClick={() => set({ ...q, items: [...items, { text: '', answer: 'A' as const }] })}
        className="text-purple-400 hover:text-purple-300 text-sm">+ Add Item</button>
    </div>
  );
}

function RankingEditor({ q, set }: { q: AnyQuestion & { type: 'ranking' }; set: (q: AnyQuestion) => void }) {
  const items = q.items || [];
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Criteria (what are we ranking by?)</label>
        <input value={q.criteria || ''} onChange={(e) => set({ ...q, criteria: e.target.value })}
          className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="e.g. Game Shows Aired First" />
      </div>
      <label className="block text-sm text-gray-400">Items (in correct rank order, #1 first)</label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-yellow-400 font-bold w-6 text-center">{i + 1}</span>
          <input value={item.text} onChange={(e) => {
            const next = [...items]; next[i] = { ...item, text: e.target.value, rank: i + 1 }; set({ ...q, items: next });
          }} placeholder="Item text" className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500" />
          <input value={item.value || ''} onChange={(e) => {
            const next = [...items]; next[i] = { ...item, value: e.target.value }; set({ ...q, items: next });
          }} placeholder="Value (optional, e.g. year)" className="w-32 bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500" />
          {items.length > 1 && (
            <button onClick={() => {
              const next = items.filter((_, j) => j !== i).map((it, j) => ({ ...it, rank: j + 1 }));
              set({ ...q, items: next });
            }} className="text-red-400 hover:text-red-300 text-sm">✕</button>
          )}
        </div>
      ))}
      <button onClick={() => set({ ...q, items: [...items, { text: '', rank: items.length + 1, value: '' }] })}
        className="text-purple-400 hover:text-purple-300 text-sm">+ Add Item</button>
    </div>
  );
}

function MediaEditor({ q, set }: { q: AnyQuestion & { type: 'media' }; set: (q: AnyQuestion) => void }) {
  const mediaQuestion = q as AnyQuestion & { type: 'media'; options?: string[]; correctAnswer?: string };
  const mediaChoices = mediaQuestion.options || ['', '', '', ''];
  const usingMultipleChoice = mediaChoices.some((option) => option.trim().length > 0) || Boolean(mediaQuestion.correctAnswer?.trim());

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Media Type</label>
          <select value={q.mediaType || 'image'} onChange={(e) => set({ ...q, mediaType: e.target.value })}
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Media URL</label>
          <input value={q.mediaUrl || ''} onChange={(e) => set({ ...q, mediaUrl: e.target.value })}
            className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
            placeholder="https://..." />
        </div>
      </div>
      {q.mediaUrl && (
        <div className="bg-gray-800 rounded-lg p-2 text-center">
          {(q.mediaType === 'image' || !q.mediaType) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={q.mediaUrl} alt="Preview" className="max-h-40 mx-auto rounded" />
          )}
          {q.mediaType === 'video' && (
            <video src={q.mediaUrl} controls className="max-h-40 mx-auto rounded" />
          )}
          {q.mediaType === 'audio' && (
            <audio src={q.mediaUrl} controls className="mx-auto" />
          )}
        </div>
      )}
      <div>
        <label className="block text-sm text-gray-400 mb-2">Answer Format</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => set({ ...mediaQuestion, options: undefined, correctAnswer: undefined })}
            className={`px-3 py-1.5 rounded-lg text-sm ${!usingMultipleChoice ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Open Ended
          </button>
          <button
            type="button"
            onClick={() => set({ ...mediaQuestion, options: mediaQuestion.options?.length ? mediaQuestion.options : ['', '', '', ''], correctAnswer: mediaQuestion.correctAnswer || '' })}
            className={`px-3 py-1.5 rounded-lg text-sm ${usingMultipleChoice ? 'bg-purple-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            Multiple Choice
          </button>
        </div>
      </div>
      {usingMultipleChoice ? (
        <div className="space-y-3">
          <label className="block text-sm text-gray-400">Choices (click the left dot to mark correct)</label>
          {mediaChoices.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set({ ...mediaQuestion, correctAnswer: opt })}
                className="w-6 h-6 rounded-full border border-gray-400 flex items-center justify-center hover:border-green-400"
                title="Mark as correct"
              >
                <span className={`w-3 h-3 rounded-full ${mediaQuestion.correctAnswer === opt && opt.trim() ? 'bg-green-500' : 'bg-transparent'}`} />
              </button>
              <input
                value={opt}
                onChange={(e) => set(updateMediaOption(mediaQuestion, i, e.target.value))}
                placeholder={`Option ${i + 1}`}
                className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
              />
              {mediaChoices.length > 2 && (
                <button
                  onClick={() => {
                    const next = mediaChoices.filter((_, j) => j !== i);
                    set({ ...mediaQuestion, options: next, correctAnswer: mediaQuestion.correctAnswer === opt ? '' : mediaQuestion.correctAnswer });
                  }}
                  className="text-red-400 hover:text-red-300 text-sm"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {mediaChoices.length < 8 && (
            <button onClick={() => set({ ...mediaQuestion, options: [...mediaChoices, ''] })}
              className="text-purple-400 hover:text-purple-300 text-sm">+ Add Option</button>
          )}
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Answer</label>
            <input value={q.answer || ''} onChange={(e) => set({ ...q, answer: e.target.value })}
              className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Primary answer" />
          </div>
          <PillInput
            items={q.acceptedAnswers || []}
            onChange={(acceptedAnswers) => set({ ...q, acceptedAnswers })}
            label="Accepted Answers (alternatives)"
            placeholder="Type an alternative answer…"
          />
        </>
      )}
    </div>
  );
}

function PromptEditor({ q, set }: { q: AnyQuestion & { type: 'prompt' }; set: (q: AnyQuestion) => void }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Prompt Label</label>
        <input value={q.prompt || ''} onChange={(e) => set({ ...q, prompt: e.target.value })}
          className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="e.g. Name It, Fill in the Blank" />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Answer</label>
        <input value={q.answer || ''} onChange={(e) => set({ ...q, answer: e.target.value })}
          className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
          placeholder="Primary answer" />
      </div>
      <PillInput
        items={q.acceptedAnswers || []}
        onChange={(acceptedAnswers) => set({ ...q, acceptedAnswers })}
        label="Accepted Answers (alternatives)"
        placeholder="Type an alternative answer…"
      />
    </div>
  );
}

/* ─── type-specific editor dispatcher ─── */
function TypeEditor({ question, setQuestion }: { question: AnyQuestion; setQuestion: (q: AnyQuestion) => void }) {
  switch (question.type) {
    case 'multiple_choice': return <MultipleChoiceEditor q={question as AnyQuestion & { type: 'multiple_choice' }} set={setQuestion} />;
    case 'open_ended': return <OpenEndedEditor q={question as AnyQuestion & { type: 'open_ended' }} set={setQuestion} />;
    case 'list': return <ListEditor q={question as AnyQuestion & { type: 'list' }} set={setQuestion} />;
    case 'grouping': return <GroupingEditor q={question as AnyQuestion & { type: 'grouping' }} set={setQuestion} />;
    case 'this_or_that': return <ThisOrThatEditor q={question as AnyQuestion & { type: 'this_or_that' }} set={setQuestion} />;
    case 'ranking': return <RankingEditor q={question as AnyQuestion & { type: 'ranking' }} set={setQuestion} />;
    case 'media': return <MediaEditor q={question as AnyQuestion & { type: 'media' }} set={setQuestion} />;
    case 'prompt': return <PromptEditor q={question as AnyQuestion & { type: 'prompt' }} set={setQuestion} />;
    default: return <div className="text-gray-400 text-sm">Unknown type</div>;
  }
}

/* ─── validation ─── */
function validate(q: AnyQuestion): string[] {
  const errors: string[] = [];
  if (!q.question.trim()) errors.push('Question text is required');
  switch (q.type) {
    case 'multiple_choice': {
      const mc = q as AnyQuestion & { type: 'multiple_choice' };
      const filled = (mc.options || []).filter((o) => o.trim());
      if (filled.length < 2) errors.push('Need at least 2 options');
      if (!mc.correctAnswer?.trim()) errors.push('Select a correct answer');
      break;
    }
    case 'open_ended': {
      const oe = q as AnyQuestion & { type: 'open_ended' };
      if (!oe.answer?.trim()) errors.push('Answer is required');
      break;
    }
    case 'list': {
      const li = q as AnyQuestion & { type: 'list' };
      if (!li.answers?.length) errors.push('Add at least one answer');
      break;
    }
    case 'grouping': {
      const gr = q as AnyQuestion & { type: 'grouping' };
      if (!gr.correctItems?.length) errors.push('Add at least one correct item');
      if (!gr.items?.length || gr.items.length < 2) errors.push('Add at least 2 total items');
      break;
    }
    case 'this_or_that': {
      const tt = q as AnyQuestion & { type: 'this_or_that' };
      if (!tt.categoryA?.trim()) errors.push('Category A is required');
      if (!tt.categoryB?.trim()) errors.push('Category B is required');
      if (!tt.items?.length) errors.push('Add at least one item');
      break;
    }
    case 'ranking': {
      const rk = q as AnyQuestion & { type: 'ranking' };
      if (!rk.items?.length || rk.items.length < 2) errors.push('Add at least 2 items');
      break;
    }
    case 'media': {
      const md = q as AnyQuestion & { type: 'media'; options?: string[]; correctAnswer?: string };
      const hasMediaChoices = (md.options || []).some((opt) => opt.trim().length > 0) || Boolean(md.correctAnswer?.trim());
      if (!md.mediaUrl?.trim()) errors.push('Media URL is required');
      if (hasMediaChoices) {
        const filledOptions = (md.options || []).filter((opt) => opt.trim().length > 0);
        if (filledOptions.length < 2) errors.push('Media multiple choice needs at least 2 options');
        if (!md.correctAnswer?.trim()) errors.push('Select the correct media option');
      } else if (!md.answer?.trim()) {
        errors.push('Answer is required');
      }
      break;
    }
    case 'prompt': {
      const pr = q as AnyQuestion & { type: 'prompt' };
      if (!pr.answer?.trim()) errors.push('Answer is required');
      break;
    }
  }
  return errors;
}

/* ─── question preview card ─── */
function QuestionCard({
  q,
  isSelected,
  onSelect,
  onDelete,
}: {
  q: AnyQuestion;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const typeInfo = QUESTION_TYPES.find((t) => t.value === q.type);
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        isSelected ? 'bg-purple-700/40 border border-purple-500' : 'bg-gray-800 hover:bg-gray-750 border border-gray-700'
      }`}
    >
      <span className="text-lg">{typeInfo?.icon || '❓'}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{q.question || '(untitled)'}</div>
        <div className="text-xs text-gray-400">{typeInfo?.label || q.type} · {q.difficulty}</div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="text-red-400 hover:text-red-300 text-sm p-1"
        title="Delete"
      >🗑️</button>
    </div>
  );
}

/* ─── import modal ─── */
function ImportModal({ onImport, onClose }: { onImport: (qs: AnyQuestion[]) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function handleImport() {
    try {
      const parsed = JSON.parse(text);
      const qs = Array.isArray(parsed) ? parsed : parsed.questions;
      if (!Array.isArray(qs)) { setError('JSON must be an array or have a "questions" array'); return; }
      onImport(qs);
      onClose();
    } catch { setError('Invalid JSON'); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold mb-4">Import Questions</h3>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setError(''); }}
          placeholder='Paste JSON here (array of questions or {"questions": [...]})'
          className="w-full h-48 bg-gray-700 rounded-lg p-3 text-sm text-white font-mono placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500 resize-y"
        />
        {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        <div className="flex justify-end gap-3 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm font-bold">Cancel</button>
          <button onClick={handleImport} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-bold">Import</button>
        </div>
      </div>
    </div>
  );
}

type LoaderSource = 'pool' | 'jeopardy';

type LoaderResult = {
  key: string;
  question: AnyQuestion;
  questionIdLabel: string;
  source: LoaderSource;
  flagged?: boolean;
  tags?: string[];
  episode?: string;
};

function ExistingLoaderModal({
  onClose,
  onImportQuestions,
  onLoadJeopardyGame,
}: {
  onClose: () => void;
  onImportQuestions: (qs: AnyQuestion[]) => void;
  onLoadJeopardyGame: (game: JeopardyGameData) => void;
}) {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
  const [source, setSource] = useState<LoaderSource>('pool');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<LoaderResult[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const [poolQuery, setPoolQuery] = useState('');
  const [poolIds, setPoolIds] = useState('');
  const [poolFlaggedOnly, setPoolFlaggedOnly] = useState(false);

  const [episodeQuery, setEpisodeQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [clueIdQuery, setClueIdQuery] = useState('');

  const [episodes, setEpisodes] = useState<JeopardyIndexEntry[]>([]);

  async function loadPoolQuestions() {
    setLoading(true);
    setError('');
    try {
      const [response, flaggedResponse] = await Promise.all([
        fetch(`${base}/data/questions/sheets-import-questions.json`),
        fetch(`${base}/data/questions/flagged-media-questions.json`),
      ]);
      if (!response.ok) throw new Error('Failed to load question pool');
      const payload = await response.json();
      const allQuestions = Array.isArray(payload?.questions) ? payload.questions : [];

      const flaggedPayload = flaggedResponse.ok ? await flaggedResponse.json() : { items: [] };
      const flaggedItems = Array.isArray(flaggedPayload?.items) ? flaggedPayload.items : [];
      const flaggedSignatures = new Set<string>(
        flaggedItems
          .map((item: { question?: string; category?: string }) =>
            questionSignature(item.question || '', item.category || ''),
          )
          .filter((signature: string) => signature !== '|'),
      );

      const ids = parseNumberList(poolIds);
      const query = normalizeText(poolQuery);

      const nextResults: LoaderResult[] = allQuestions
        .map((question: AnyQuestion & { needsMediaReview?: boolean }, index: number) => ({
          key: `pool-${index + 1}`,
          question,
          questionIdLabel: `Q${index + 1}`,
          source: 'pool' as const,
          flagged:
            question.needsMediaReview === true ||
            flaggedSignatures.has(questionSignature(question.question || '', question.category)),
        }))
        .filter((entry: LoaderResult) => {
          if (poolFlaggedOnly && !entry.flagged) return false;
          if (ids.size > 0) {
            const numericId = Number(entry.questionIdLabel.replace('Q', ''));
            if (!ids.has(numericId)) return false;
          }
          if (query) {
            const blob = JSON.stringify(entry.question).toLowerCase();
            if (!blob.includes(query)) return false;
          }
          return true;
        })
        .slice(0, 500);

      setResults(nextResults);
      setSelectedKeys(new Set());
      setEpisodes([]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load questions');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadJeopardyClues() {
    setLoading(true);
    setError('');
    try {
      const indexResponse = await fetch(`${base}/data/jeopardy/index.json`);
      if (!indexResponse.ok) throw new Error('Failed to load Jeopardy index');
      const indexPayload = (await indexResponse.json()) as JeopardyIndexEntry[];

      const episodeTokens = parseStringList(episodeQuery);
      const tagTokens = parseStringList(tagQuery);
      const clueTokens = parseStringList(clueIdQuery);

      const matchingEpisodes = indexPayload.filter((entry) => {
        if (episodeTokens.length === 0) return true;
        const gameIdText = String(entry.gameId).toLowerCase();
        const showNumberText = String(entry.showNumber).toLowerCase();
        const airDateText = (entry.airDate || '').toLowerCase();
        return episodeTokens.some((token) =>
          gameIdText.includes(token) || showNumberText.includes(token) || airDateText.includes(token),
        );
      });

      const cappedEpisodes = matchingEpisodes.slice(0, 30);
      const nextResults: LoaderResult[] = [];

      for (const episode of cappedEpisodes) {
        const gameResponse = await fetch(`${base}/data/jeopardy/${episode.file}`);
        if (!gameResponse.ok) continue;
        const game = (await gameResponse.json()) as JeopardyGameData;

        for (const category of game.categories) {
          for (const clue of category.clues) {
            const tags = (clue.topicTags || []).map((tag) => tag.toLowerCase());
            if (tagTokens.length && !tagTokens.every((tag) => tags.includes(tag))) continue;
            if (clueTokens.length) {
              const clueIdText = (clue.clueId || '').toLowerCase();
              if (!clueTokens.some((token) => clueIdText.includes(token))) continue;
            }

            const converted: AnyQuestion = {
              type: 'open_ended',
              question: clue.question,
              difficulty: 'medium',
              category: category.name,
              answer: clue.answer,
              acceptedAnswers: clue.answer ? [clue.answer] : [],
            };

            nextResults.push({
              key: `clue-${clue.clueId}`,
              question: converted,
              questionIdLabel: clue.clueId,
              source: 'jeopardy',
              tags: clue.topicTags || [],
              episode: `Game ${game.gameId} · Show ${game.showNumber} · ${game.airDate}`,
            });
          }
        }
      }

      setEpisodes(cappedEpisodes);
      setResults(nextResults.slice(0, 500));
      setSelectedKeys(new Set());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Jeopardy clues');
      setResults([]);
      setEpisodes([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadEpisodeIntoJeopardy(entry: JeopardyIndexEntry) {
    setLoading(true);
    setError('');
    try {
      const gameResponse = await fetch(`${base}/data/jeopardy/${entry.file}`);
      if (!gameResponse.ok) throw new Error(`Failed to load ${entry.file}`);
      const game = (await gameResponse.json()) as JeopardyGameData;
      onLoadJeopardyGame(game);
      onClose();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load Jeopardy episode');
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function loadSelectedQuestions() {
    const selected = results.filter((entry) => selectedKeys.has(entry.key)).map((entry) => entry.question);
    if (!selected.length) return;
    onImportQuestions(selected);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-2xl p-6 max-w-5xl w-full max-h-[88vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4 gap-3">
          <h3 className="text-xl font-bold">Load Existing Questions</h3>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setSource('pool');
                setResults([]);
                setSelectedKeys(new Set());
              }}
              className={`px-3 py-1 rounded-lg text-sm ${source === 'pool' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              Question Pool
            </button>
            <button
              onClick={() => {
                setSource('jeopardy');
                setResults([]);
                setSelectedKeys(new Set());
              }}
              className={`px-3 py-1 rounded-lg text-sm ${source === 'jeopardy' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            >
              Jeopardy
            </button>
          </div>
        </div>

        {source === 'pool' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={poolQuery}
                onChange={(e) => setPoolQuery(e.target.value)}
                placeholder="Search text"
                className="bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
              <input
                value={poolIds}
                onChange={(e) => setPoolIds(e.target.value)}
                placeholder="Question IDs (e.g. 12, 51, 90)"
                className="bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
              <label className="flex items-center gap-2 text-sm text-gray-200">
                <input
                  type="checkbox"
                  checked={poolFlaggedOnly}
                  onChange={(e) => setPoolFlaggedOnly(e.target.checked)}
                />
                Flagged only
              </label>
            </div>
            <button
              onClick={loadPoolQuestions}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-sm font-medium"
            >
              {loading ? 'Loading…' : 'Search'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={episodeQuery}
                onChange={(e) => setEpisodeQuery(e.target.value)}
                placeholder="Episodes: gameId/show#/date (e.g. 1001, 9180)"
                className="bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
              <input
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="Tags (comma-separated)"
                className="bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
              <input
                value={clueIdQuery}
                onChange={(e) => setClueIdQuery(e.target.value)}
                placeholder="Question IDs (clueId, e.g. g1001-s-c0-r0)"
                className="bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={loadJeopardyClues}
              disabled={loading}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-sm font-medium"
            >
              {loading ? 'Loading…' : 'Search'}
            </button>

            {episodes.length > 0 && (
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2">
                <p className="text-sm text-gray-300">Load full episode into Jeopardy Creator:</p>
                <div className="flex flex-wrap gap-2">
                  {episodes.slice(0, 12).map((episode) => (
                    <button
                      key={episode.file}
                      onClick={() => loadEpisodeIntoJeopardy(episode)}
                      className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-xs"
                    >
                      {`Game ${episode.gameId} · Show ${episode.showNumber}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="mt-4 border border-gray-700 rounded-xl max-h-[45vh] overflow-auto">
          {results.length === 0 ? (
            <div className="p-4 text-sm text-gray-400">No results yet. Run a search above.</div>
          ) : (
            <div className="divide-y divide-gray-700">
              {results.map((entry) => {
                const checked = selectedKeys.has(entry.key);
                return (
                  <label key={entry.key} className="block p-3 hover:bg-gray-750 cursor-pointer">
                    <div className="flex items-start gap-3">
                      <input type="checkbox" checked={checked} onChange={() => toggleSelected(entry.key)} className="mt-1" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-100 truncate">{entry.question.question}</div>
                        <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          <span>{entry.questionIdLabel}</span>
                          <span>{entry.question.type}</span>
                          <span>{typeof entry.question.category === 'string' ? entry.question.category : entry.question.category?.name || 'no-category'}</span>
                          {entry.flagged && <span className="text-amber-300">flagged</span>}
                          {entry.episode && <span>{entry.episode}</span>}
                          {entry.tags && entry.tags.length > 0 && <span>{`tags: ${entry.tags.join(', ')}`}</span>}
                        </div>
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-sm font-medium">Close</button>
          <button
            onClick={loadSelectedQuestions}
            disabled={selectedKeys.size === 0}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-sm font-medium"
          >
            Load Selected ({selectedKeys.size})
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── main page ─── */
export default function CreatorPage() {
  const [questions, setQuestions] = useState<AnyQuestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showLoader, setShowLoader] = useState(false);
  const [showGitHub, setShowGitHub] = useState(false);
  const [ghConnected, setGhConnected] = useState(false);
  const [toast, setToast] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [mode, setMode] = useState<'questions' | 'jeopardy'>('questions');
  const [jeopardyGame, setJeopardyGame] = useState<JeopardyGameData>(() => blankJeopardyGame());
  const [saving, setSaving] = useState(false);

  // Check GitHub connection on mount
  useEffect(() => {
    setGhConnected(isGitHubConfigured());
  }, []);

  // Load saved questions and categories on mount
  useEffect(() => {
    setQuestions(loadSaved());

    // Load existing categories for autocomplete
    const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${base}/data/questions/sheets-import-questions.json`)
      .then((r) => r.json())
      .then((d) => {
        const cats = [...new Set((d.questions || []).map((q: AnyQuestion) => q.category).filter(Boolean))] as string[];
        setCategories(cats.sort());
      })
      .catch(() => {});
  }, []);

  // Auto-save
  useEffect(() => {
    saveToDisk(questions);
  }, [questions]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  const current = selectedIndex !== null ? questions[selectedIndex] : null;

  function addQuestion(type: QType) {
    const q = blankQuestion(type);
    setQuestions((prev) => [...prev, q]);
    setSelectedIndex(questions.length);
  }

  function updateCurrent(q: AnyQuestion) {
    if (selectedIndex === null) return;
    setQuestions((prev) => prev.map((existing, i) => (i === selectedIndex ? q : existing)));
  }

  function deleteCurrent() {
    if (selectedIndex === null) return;
    setQuestions((prev) => prev.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
  }

  function duplicateCurrent() {
    if (selectedIndex === null || !current) return;
    const copy = JSON.parse(JSON.stringify(current));
    setQuestions((prev) => [...prev.slice(0, selectedIndex + 1), copy, ...prev.slice(selectedIndex + 1)]);
    setSelectedIndex(selectedIndex + 1);
    showToast('Duplicated!');
  }

  function exportAll() {
    if (!questions.length) { showToast('No questions to export'); return; }
    downloadJson(questions, `triviaparty-questions-${new Date().toISOString().slice(0, 10)}.json`);
    showToast(`Exported ${questions.length} questions`);
  }

  async function saveQuestionsToRepo() {
    if (!questions.length) {
      showToast('No questions to save');
      return;
    }
    const config = getGitHubConfig();
    if (!config) {
      setShowGitHub(true);
      showToast('Connect to GitHub first');
      return;
    }
    setSaving(true);
    try {
      const result = await commitQuestions(config, questions);
      showToast(`Pushed to GitHub: +${result.added} added, ${result.skipped} skipped`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to push to GitHub');
    } finally {
      setSaving(false);
    }
  }

  async function saveJeopardyGameToRepo() {
    const config = getGitHubConfig();
    if (!config) {
      setShowGitHub(true);
      showToast('Connect to GitHub first');
      return;
    }
    setSaving(true);
    try {
      const normalized: JeopardyGameData = {
        ...jeopardyGame,
        categories: jeopardyGame.categories.map((category) => ({
          ...category,
          clues: category.clues.map((clue, rowIndex) => ({
            ...clue,
            clueId: buildJeopardyClueId(jeopardyGame.gameId, category.round, category.position, rowIndex),
            rowIndex,
            category: category.name,
            round: category.round,
            isFinalJeopardy: category.round === 'final',
            value: category.round === 'final' ? null : clue.value,
          })),
        })),
      };
      await commitJeopardyGame(config, normalized as unknown as Record<string, unknown>);
      showToast(`Pushed game ${normalized.gameId} (show #${normalized.showNumber}) to GitHub`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to push Jeopardy game');
    } finally {
      setSaving(false);
    }
  }

  function exportJeopardyGame() {
    const normalized: JeopardyGameData = {
      ...jeopardyGame,
      categories: jeopardyGame.categories.map((category) => ({
        ...category,
        clues: category.clues.map((clue, rowIndex) => ({
          ...clue,
          clueId: buildJeopardyClueId(jeopardyGame.gameId, category.round, category.position, rowIndex),
          rowIndex,
          category: category.name,
          round: category.round,
          isFinalJeopardy: category.round === 'final',
          value: category.round === 'final' ? null : clue.value,
        })),
      })),
    };

    const gameBlob = new Blob([JSON.stringify(normalized, null, 2)], { type: 'application/json' });
    const gameUrl = URL.createObjectURL(gameBlob);
    const gameAnchor = document.createElement('a');
    gameAnchor.href = gameUrl;
    gameAnchor.download = `game-${jeopardyGame.gameId}.json`;
    gameAnchor.click();
    URL.revokeObjectURL(gameUrl);

    const indexEntry = {
      gameId: normalized.gameId,
      showNumber: normalized.showNumber,
      airDate: normalized.airDate,
      season: normalized.season,
      isSpecial: normalized.isSpecial,
      tournamentType: normalized.tournamentType,
      file: `game-${normalized.gameId}.json`,
    };
    const indexBlob = new Blob([JSON.stringify(indexEntry, null, 2)], { type: 'application/json' });
    const indexUrl = URL.createObjectURL(indexBlob);
    const indexAnchor = document.createElement('a');
    indexAnchor.href = indexUrl;
    indexAnchor.download = `game-${normalized.gameId}.index-entry.json`;
    indexAnchor.click();
    URL.revokeObjectURL(indexUrl);

    showToast('Exported Jeopardy game + index entry');
  }

  function clearAll() {
    if (!confirm('Delete all questions? This cannot be undone.')) return;
    setQuestions([]);
    setSelectedIndex(null);
  }

  function handleImport(qs: AnyQuestion[]) {
    setQuestions((prev) => [...prev, ...qs]);
    showToast(`Imported ${qs.length} questions`);
  }

  const errors = current ? validate(current) : [];

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-xl z-50 animate-pulse">
          {toast}
        </div>
      )}

      {/* Modals */}
      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showGitHub && (
        <GitHubSettingsModal
          onClose={() => setShowGitHub(false)}
          onSaved={() => setGhConnected(isGitHubConfigured())}
        />
      )}
      {showLoader && (
        <ExistingLoaderModal
          onClose={() => setShowLoader(false)}
          onImportQuestions={(loadedQuestions) => {
            setQuestions((prev) => [...prev, ...loadedQuestions]);
            setMode('questions');
            showToast(`Loaded ${loadedQuestions.length} question${loadedQuestions.length === 1 ? '' : 's'}`);
          }}
          onLoadJeopardyGame={(game) => {
            setJeopardyGame(game);
            setMode('jeopardy');
            showToast(`Loaded Jeopardy episode ${game.gameId}`);
          }}
        />
      )}

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Menu</Link>
            <h1 className="text-xl font-bold">✏️ Creator</h1>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('questions')}
                className={`px-3 py-1 rounded-lg text-sm ${mode === 'questions' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                Questions
              </button>
              <button
                onClick={() => setMode('jeopardy')}
                className={`px-3 py-1 rounded-lg text-sm ${mode === 'jeopardy' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                Jeopardy Game
              </button>
            </div>
            {mode === 'questions' && <span className="text-sm text-gray-400">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowGitHub(true)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${ghConnected ? 'bg-green-700 hover:bg-green-600' : 'bg-yellow-700 hover:bg-yellow-600'}`}
            >{ghConnected ? '🔗 GitHub Connected' : '⚙️ Connect GitHub'}</button>
            {mode === 'questions' ? (
              <>
                <button onClick={() => setShowImport(true)}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium">Import</button>
                <button onClick={() => setShowLoader(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Load Existing</button>
                <button onClick={exportAll}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium">Export JSON</button>
                <button onClick={saveQuestionsToRepo} disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium">{saving ? 'Pushing…' : 'Push to GitHub'}</button>
                {questions.length > 0 && (
                  <button onClick={clearAll}
                    className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-medium">Clear All</button>
                )}
              </>
            ) : (
              <>
                <button onClick={() => setJeopardyGame(blankJeopardyGame())}
                  className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium">New Game</button>
                <button onClick={() => setShowLoader(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium">Load Existing</button>
                <button onClick={exportJeopardyGame}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium">Export Game JSON</button>
                <button onClick={saveJeopardyGameToRepo} disabled={saving}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm font-medium">{saving ? 'Pushing…' : 'Push Game to GitHub'}</button>
              </>
            )}
          </div>
        </div>
      </div>

      {mode === 'questions' ? (
        <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6" style={{ minHeight: 'calc(100vh - 60px)' }}>
        {/* Sidebar — question list */}
        <div className="w-80 shrink-0">
          <div className="sticky top-20">
            {/* Add new question */}
            <div className="mb-4">
              <label className="block text-xs text-gray-400 uppercase mb-2 font-bold">Add New Question</label>
              <div className="grid grid-cols-2 gap-2">
                {QUESTION_TYPES.map((t) => (
                  <button key={t.value} onClick={() => addQuestion(t.value)}
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 text-sm transition-colors">
                    <span>{t.icon}</span>
                    <span className="truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Existing questions */}
            <div className="space-y-2 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {questions.length === 0 && (
                <div className="text-center text-gray-500 py-8">
                  <div className="text-4xl mb-2">📝</div>
                  <p className="text-sm">No questions yet.<br />Click a type above to start!</p>
                </div>
              )}
              {questions.map((q, i) => (
                <QuestionCard
                  key={i}
                  q={q}
                  isSelected={selectedIndex === i}
                  onSelect={() => setSelectedIndex(i)}
                  onDelete={() => {
                    setQuestions((prev) => prev.filter((_, j) => j !== i));
                    if (selectedIndex === i) setSelectedIndex(null);
                    else if (selectedIndex !== null && selectedIndex > i) setSelectedIndex(selectedIndex - 1);
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex-1 min-w-0">
          {current ? (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-6">
              {/* Type & actions bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{QUESTION_TYPES.find((t) => t.value === current.type)?.icon}</span>
                  <select
                    value={current.type}
                    onChange={(e) => {
                      const newType = e.target.value as QType;
                      const q = blankQuestion(newType);
                      q.question = current.question;
                      q.difficulty = current.difficulty;
                      q.category = current.category;
                      updateCurrent(q);
                    }}
                    className="bg-gray-700 rounded-lg px-3 py-2 text-white font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button onClick={duplicateCurrent} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm" title="Duplicate">📋 Duplicate</button>
                  <button onClick={deleteCurrent} className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-sm" title="Delete">🗑️ Delete</button>
                </div>
              </div>

              {/* Common fields */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Question / Title</label>
                  <textarea
                    value={current.question}
                    onChange={(e) => updateCurrent({ ...current, question: e.target.value })}
                    rows={2}
                    className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500 resize-y"
                    placeholder="Enter your question…"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
                    <select
                      value={current.difficulty}
                      onChange={(e) => updateCurrent({ ...current, difficulty: e.target.value as Difficulty })}
                      className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Category</label>
                    <input
                      value={typeof current.category === 'string' ? current.category : (current.category as { name: string })?.name || ''}
                      onChange={(e) => updateCurrent({ ...current, category: e.target.value })}
                      list="category-list"
                      className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g. ancient-history"
                    />
                    <datalist id="category-list">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <hr className="border-gray-700" />

              {/* Type-specific fields */}
              <TypeEditor question={current} setQuestion={updateCurrent} />

              {/* Validation errors */}
              {errors.length > 0 && (
                <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                  <div className="text-red-400 text-sm font-bold mb-1">Issues:</div>
                  <ul className="list-disc list-inside text-red-300 text-sm space-y-1">
                    {errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}

              {/* JSON preview */}
              <details className="bg-gray-800 rounded-lg">
                <summary className="px-4 py-2 text-sm text-gray-400 cursor-pointer hover:text-gray-300">JSON Preview</summary>
                <pre className="px-4 pb-3 text-xs text-green-300 overflow-x-auto">{JSON.stringify(current, null, 2)}</pre>
              </details>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <div className="text-6xl mb-4">✏️</div>
                <h2 className="text-2xl font-bold mb-2">Question Creator</h2>
                <p className="text-gray-400 max-w-md">
                  Create trivia questions for all game types. Click a question type on the left to get started,
                  or import existing questions from JSON.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Game ID</label>
                <input
                  type="number"
                  value={jeopardyGame.gameId}
                  onChange={(e) => {
                    const nextGameId = Number(e.target.value) || jeopardyGame.gameId;
                    setJeopardyGame((prev) => ({
                      ...prev,
                      gameId: nextGameId,
                      categories: prev.categories.map((category) => ({
                        ...category,
                        clues: category.clues.map((clue, rowIndex) => ({
                          ...clue,
                          clueId: buildJeopardyClueId(nextGameId, category.round, category.position, rowIndex),
                        })),
                      })),
                    }));
                  }}
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Show Number</label>
                <input
                  type="number"
                  value={jeopardyGame.showNumber}
                  onChange={(e) => {
                    const nextShow = Number(e.target.value) || 0;
                    setJeopardyGame((prev) => ({
                      ...prev,
                      showNumber: nextShow,
                      gameId: nextShow,
                      categories: prev.categories.map((cat) => ({
                        ...cat,
                        clues: cat.clues.map((clue, ri) => ({
                          ...clue,
                          clueId: buildJeopardyClueId(nextShow, cat.round, cat.position, ri),
                        })),
                      })),
                    }));
                  }}
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Air Date</label>
                <input
                  value={jeopardyGame.airDate}
                  onChange={(e) => setJeopardyGame((prev) => ({ ...prev, airDate: e.target.value }))}
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                  placeholder="YYYY-MM-DD or long date"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Season (optional)</label>
                <input
                  type="number"
                  value={jeopardyGame.season ?? ''}
                  onChange={(e) => {
                    const next = e.target.value.trim();
                    setJeopardyGame((prev) => ({ ...prev, season: next ? Number(next) : null }));
                  }}
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Tournament Type (optional)</label>
                <input
                  value={jeopardyGame.tournamentType || ''}
                  onChange={(e) => setJeopardyGame((prev) => ({ ...prev, tournamentType: e.target.value || null }))}
                  className="w-full bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input
                    type="checkbox"
                    checked={jeopardyGame.isSpecial}
                    onChange={(e) => setJeopardyGame((prev) => ({ ...prev, isSpecial: e.target.checked }))}
                  />
                  Special Episode
                </label>
              </div>
            </div>

            {(['single', 'double', 'final'] as const).map((round) => {
              const roundCategories = jeopardyGame.categories
                .filter((category) => category.round === round)
                .sort((left, right) => left.position - right.position);

              return (
                <div key={round} className="space-y-4">
                  <h3 className="text-lg font-bold capitalize">{round} Round</h3>
                  {roundCategories.map((category) => (
                    <div key={`${round}-${category.position}`} className="bg-gray-800 rounded-xl p-4 space-y-3 border border-gray-700">
                      <div className="flex items-center gap-3">
                        <span className="text-xs uppercase text-gray-400">Category {category.position + 1}</span>
                        <input
                          value={category.name}
                          onChange={(e) => {
                            const name = e.target.value;
                            setJeopardyGame((prev) => ({
                              ...prev,
                              categories: prev.categories.map((item) => {
                                if (item.round !== round || item.position !== category.position) return item;
                                return {
                                  ...item,
                                  name,
                                  clues: item.clues.map((clue) => ({ ...clue, category: name })),
                                };
                              }),
                            }));
                          }}
                          className="flex-1 bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                          placeholder="Category name"
                        />
                      </div>

                      {category.clues.map((clue, rowIndex) => (
                        <div key={clue.clueId} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-start">
                          {round !== 'final' && (
                            <input
                              type="number"
                              value={clue.value ?? 0}
                              onChange={(e) => {
                                const value = Number(e.target.value) || 0;
                                setJeopardyGame((prev) => ({
                                  ...prev,
                                  categories: prev.categories.map((item) => {
                                    if (item.round !== round || item.position !== category.position) return item;
                                    return {
                                      ...item,
                                      clues: item.clues.map((existingClue, index) =>
                                        index === rowIndex ? { ...existingClue, value } : existingClue,
                                      ),
                                    };
                                  }),
                                }));
                              }}
                              className="md:col-span-2 bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                            />
                          )}
                          <textarea
                            value={clue.question}
                            onChange={(e) => {
                              const questionText = e.target.value;
                              setJeopardyGame((prev) => ({
                                ...prev,
                                categories: prev.categories.map((item) => {
                                  if (item.round !== round || item.position !== category.position) return item;
                                  return {
                                    ...item,
                                    clues: item.clues.map((existingClue, index) =>
                                      index === rowIndex ? { ...existingClue, question: questionText } : existingClue,
                                    ),
                                  };
                                }),
                              }));
                            }}
                            rows={2}
                            className={`${round === 'final' ? 'md:col-span-8' : 'md:col-span-6'} bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500`}
                            placeholder="Clue question"
                          />
                          <input
                            value={clue.answer}
                            onChange={(e) => {
                              const answerText = e.target.value;
                              setJeopardyGame((prev) => ({
                                ...prev,
                                categories: prev.categories.map((item) => {
                                  if (item.round !== round || item.position !== category.position) return item;
                                  return {
                                    ...item,
                                    clues: item.clues.map((existingClue, index) =>
                                      index === rowIndex ? { ...existingClue, answer: answerText } : existingClue,
                                    ),
                                  };
                                }),
                              }));
                            }}
                            className="md:col-span-4 bg-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:ring-2 focus:ring-purple-500"
                            placeholder="Correct answer"
                          />
                          <label className="md:col-span-12 flex flex-wrap gap-4 text-sm text-gray-300">
                            <span className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={clue.dailyDouble}
                                onChange={(e) => {
                                  const dailyDouble = e.target.checked;
                                  setJeopardyGame((prev) => ({
                                    ...prev,
                                    categories: prev.categories.map((item) => {
                                      if (item.round !== round || item.position !== category.position) return item;
                                      return {
                                        ...item,
                                        clues: item.clues.map((existingClue, index) =>
                                          index === rowIndex ? { ...existingClue, dailyDouble } : existingClue,
                                        ),
                                      };
                                    }),
                                  }));
                                }}
                              />
                              Daily Double
                            </span>
                            <span className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={clue.tripleStumper}
                                onChange={(e) => {
                                  const tripleStumper = e.target.checked;
                                  setJeopardyGame((prev) => ({
                                    ...prev,
                                    categories: prev.categories.map((item) => {
                                      if (item.round !== round || item.position !== category.position) return item;
                                      return {
                                        ...item,
                                        clues: item.clues.map((existingClue, index) =>
                                          index === rowIndex ? { ...existingClue, tripleStumper } : existingClue,
                                        ),
                                      };
                                    }),
                                  }));
                                }}
                              />
                              Triple Stumper
                            </span>
                          </label>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
