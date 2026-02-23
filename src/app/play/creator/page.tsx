'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import type { AnyQuestion, Difficulty } from '@/types/questions';

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

/* ─── per-type editors ─── */
function MultipleChoiceEditor({ q, set }: { q: AnyQuestion & { type: 'multiple_choice' }; set: (q: AnyQuestion) => void }) {
  const options = q.options || ['', '', '', ''];
  const setOpt = (i: number, v: string) => {
    const next = [...options];
    next[i] = v;
    set({ ...q, options: next });
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm text-gray-400">Options (mark the correct one with the radio button)</label>
      {options.map((opt, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="radio"
            name="correctAnswer"
            checked={q.correctAnswer === opt && opt !== ''}
            onChange={() => set({ ...q, correctAnswer: opt })}
            className="accent-green-500"
          />
          <input
            value={opt}
            onChange={(e) => { setOpt(i, e.target.value); if (q.correctAnswer === opt) set({ ...q, options: (() => { const n = [...options]; n[i] = e.target.value; return n; })(), correctAnswer: e.target.value }); }}
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
      const md = q as AnyQuestion & { type: 'media' };
      if (!md.mediaUrl?.trim()) errors.push('Media URL is required');
      if (!md.answer?.trim()) errors.push('Answer is required');
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

/* ─── main page ─── */
export default function CreatorPage() {
  const [questions, setQuestions] = useState<AnyQuestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

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

      {/* Import Modal */}
      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-purple-300 hover:text-purple-200 font-bold">← Menu</Link>
            <h1 className="text-xl font-bold">✏️ Creator</h1>
            <span className="text-sm text-gray-400">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowImport(true)}
              className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium">Import</button>
            <button onClick={exportAll}
              className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium">Export JSON</button>
            {questions.length > 0 && (
              <button onClick={clearAll}
                className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 text-sm font-medium">Clear All</button>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
