'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import type { AnyQuestion } from '@/types/questions';

type AnswerResult = { correct: boolean };

type Props = {
  question: AnyQuestion;
  onAnswer: (result: AnswerResult) => void;
  onRerollPrompt?: (prompt: string) => void;
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function isCloseMatch(input: string, target: string): boolean {
  const a = normalize(input);
  const b = normalize(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen <= 5) return dist <= 1;
  if (maxLen <= 10) return dist <= 2;
  return dist <= 3;
}

function parseYouTubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

function MultipleChoiceView({ question, onAnswer }: Props) {
  const q = question.type === 'multiple_choice' ? question : null;
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const correctAnswer = useMemo(() => {
    if (!q) return '';
    const parsed = (q.options || []).map((option) => ({
      text: option.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim(),
      starred: option.trim().startsWith('*') || option.trim().endsWith('*'),
    }));
    return (q.correctAnswer || parsed.find((x) => x.starred)?.text || '').trim();
  }, [q]);

  useEffect(() => {
    if (!q) return;
    const cleaned = (q.options || []).map((option) => option.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim()).filter(Boolean);
    setOptions(shuffle(cleaned));
    setSelected('');
    setSubmitted(false);
  }, [q?.id, q?.question, q]);

  if (!q) return null;

  return (
    <div className="space-y-3">
      {options.map((opt) => {
        const isCorrect = submitted && opt === correctAnswer;
        const isIncorrectChoice = submitted && selected === opt && opt !== correctAnswer;
        return (
          <button key={opt} onClick={() => !submitted && setSelected(opt)} className={`w-full text-left p-3 rounded-lg border ${isCorrect ? 'bg-green-800 border-green-500' : isIncorrectChoice ? 'bg-red-800 border-red-500' : selected === opt ? 'bg-blue-700 border-blue-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'}`}>
            {opt}
          </button>
        );
      })}
      <button disabled={!selected || submitted} onClick={() => { setSubmitted(true); onAnswer({ correct: selected === correctAnswer }); }} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold">
        Submit
      </button>
    </div>
  );
}

function OpenEndedView({ question, onAnswer }: Props) {
  const q = question.type === 'open_ended' ? question : null;
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setShowAnswer(false);
  }, [q?.id, q?.question]);

  if (!q) return null;
  const accepted = [q.answer || '', ...(q.acceptedAnswers || [])].filter(Boolean);

  return (
    <div className="space-y-3">
      <input value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted} placeholder="Type your answer" className="w-full bg-gray-700 rounded-lg p-3" />
      <div className="grid grid-cols-2 gap-2">
        <button disabled={submitted || !input.trim()} onClick={() => { const correct = accepted.some((ans) => isCloseMatch(input, ans)); setSubmitted(true); onAnswer({ correct }); }} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold">Submit</button>
        <button onClick={() => { setShowAnswer(true); if (!submitted) onAnswer({ correct: false }); }} className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold">Reveal Answer</button>
      </div>
      {showAnswer && <div className="text-yellow-300 font-bold">Answer: {q.answer}</div>}
    </div>
  );
}

function ListView({ question, onAnswer }: Props) {
  const q = question.type === 'list' ? question : null;
  const [input, setInput] = useState('');
  const [found, setFound] = useState<string[]>([]);
  const [attempts, setAttempts] = useState<Array<{ text: string; correct: boolean }>>([]);
  const [finished, setFinished] = useState(false);
  const [showAnswers, setShowAnswers] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    setInput('');
    setFound([]);
    setAttempts([]);
    setFinished(false);
    setShowAnswers(false);
    setSearch('');
  }, [q?.id, q?.question]);

  if (!q) return null;

  const answers = Array.isArray(q.answers) ? q.answers : [];
  const minRequired = q.minRequired || 1;

  function tryAdd() {
    const raw = input.trim();
    if (!raw || finished) return;
    const match = answers.find((ans) => isCloseMatch(raw, ans));
    const canonical = match || raw;
    const correct = Boolean(match) && !found.includes(canonical);
    if (correct) setFound((prev) => [...prev, canonical]);
    setAttempts((prev) => [...prev, { text: raw, correct }]);
    setInput('');
  }

  const filteredAnswers = answers.filter((ans) => normalize(ans).includes(normalize(search)));

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-300">Find at least {minRequired} answers.</div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryAdd()} disabled={finished} className="flex-1 bg-gray-700 rounded-lg p-3" placeholder="Type an item" />
        <button onClick={tryAdd} disabled={finished} className="px-4 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold">Check</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {attempts.slice(-8).map((attempt, index) => <span key={`${attempt.text}-${index}`} className={`px-2 py-1 rounded text-xs ${attempt.correct ? 'bg-green-700' : 'bg-red-700'}`}>{attempt.correct ? '✓' : '✗'} {attempt.text}</span>)}
      </div>
      <div className="text-sm">Found: <span className="text-green-300 font-bold">{found.length}</span> / {answers.length}</div>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={finished} onClick={() => { setFinished(true); onAnswer({ correct: found.length >= minRequired }); }} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold">Submit List</button>
        <button onClick={() => { setShowAnswers(true); if (!finished) { setFinished(true); onAnswer({ correct: found.length >= minRequired }); } }} className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold">Reveal Answers</button>
      </div>
      {showAnswers && (
        <div className="bg-gray-900 rounded-lg p-3 space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search answers" className="w-full bg-gray-700 rounded-lg p-2" />
          <div className="max-h-40 overflow-y-auto text-sm space-y-1">{filteredAnswers.map((ans) => <div key={ans} className={`${found.includes(ans) ? 'text-green-300' : 'text-gray-200'}`}>{ans}</div>)}</div>
        </div>
      )}
    </div>
  );
}

function GroupingView({ question, onAnswer }: Props) {
  const q = question.type === 'grouping' ? question : null;
  const [mode, setMode] = useState<'elimination' | 'continuous'>('elimination');
  const [gridItems, setGridItems] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    if (!q) return;
    const allItems = Array.isArray(q.items) ? q.items : [];
    const correctSet = new Set(Array.isArray(q.correctItems) ? q.correctItems : []);
    const correctPool = allItems.filter((x) => correctSet.has(x));
    const wrongPool = allItems.filter((x) => !correctSet.has(x));
    const needCorrect = Math.min(8, correctPool.length);
    const chosenCorrect = shuffle(correctPool).slice(0, needCorrect);
    const chosenWrong = shuffle(wrongPool).slice(0, Math.max(0, 16 - chosenCorrect.length));
    setGridItems(shuffle([...chosenCorrect, ...chosenWrong]).slice(0, 16));
    setSelected([]);
    setEnded(false);
    setMode('elimination');
  }, [q?.id, q?.question, q]);

  if (!q) return null;

  const correctSet = new Set(Array.isArray(q.correctItems) ? q.correctItems : []);
  const displayedCorrectCount = gridItems.filter((item) => correctSet.has(item)).length;

  function pick(item: string) {
    if (ended || selected.includes(item)) return;
    const isCorrect = correctSet.has(item);
    const next = [...selected, item];
    setSelected(next);
    if (mode === 'elimination' && !isCorrect) {
      setEnded(true);
      onAnswer({ correct: false });
      return;
    }
    if (mode === 'continuous' && next.length >= Math.max(1, displayedCorrectCount)) {
      const correctChosen = next.filter((x) => correctSet.has(x)).length;
      setEnded(true);
      onAnswer({ correct: correctChosen === displayedCorrectCount });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button disabled={selected.length > 0} onClick={() => setMode('elimination')} className={`px-3 py-1 rounded ${mode === 'elimination' ? 'bg-purple-600' : 'bg-gray-700'} disabled:opacity-50`}>Elimination</button>
        <button disabled={selected.length > 0} onClick={() => setMode('continuous')} className={`px-3 py-1 rounded ${mode === 'continuous' ? 'bg-purple-600' : 'bg-gray-700'} disabled:opacity-50`}>Continuous</button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {gridItems.map((item) => {
          const chosen = selected.includes(item);
          const isCorrect = correctSet.has(item);
          const className = ended ? isCorrect ? 'bg-green-800 border-green-500' : chosen ? 'bg-red-800 border-red-500' : 'bg-gray-700 border-gray-600 opacity-70' : chosen ? 'bg-blue-700 border-blue-400' : 'bg-gray-700 border-gray-600 hover:bg-gray-600';
          return <button key={item} onClick={() => pick(item)} className={`p-2 text-sm rounded border ${className}`}>{item}</button>;
        })}
      </div>
      {!ended && mode === 'continuous' && <div className="text-sm text-gray-300">Pick {displayedCorrectCount} items. Chosen: {selected.length}</div>}
      {!ended && <button onClick={() => { setEnded(true); const allChosenCorrect = selected.every((x) => correctSet.has(x)); const targetMet = mode === 'continuous' ? selected.length === displayedCorrectCount : allChosenCorrect; onAnswer({ correct: allChosenCorrect && targetMet }); }} className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-lg font-bold">Finish</button>}
    </div>
  );
}

function ThisOrThatView({ question, onAnswer }: Props) {
  const q = question.type === 'this_or_that' ? question : null;
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<'A' | 'B' | 'C' | null>(null);
  const [items, setItems] = useState<Array<{ text: string; answer: 'A' | 'B' | 'C' }>>([]);

  useEffect(() => {
    if (!q) return;
    const source = Array.isArray(q.items) ? q.items : [];
    setItems(shuffle(source).slice(0, 5));
    setIndex(0);
    setCorrectCount(0);
    setSelected(null);
  }, [q?.id, q?.question, q]);

  if (!q) return null;

  const categories = [q.categoryA, q.categoryB, q.categoryC].filter(Boolean) as string[];
  const current = items[index];
  if (!current) return <div className="text-gray-400">No this-or-that items available.</div>;

  function choose(answer: 'A' | 'B' | 'C') {
    if (selected) return;
    setSelected(answer);
    if (answer === current.answer) setCorrectCount((x) => x + 1);
  }

  function next() {
    if (index + 1 >= items.length) {
      const finalScore = correctCount + (selected === current.answer ? 1 : 0);
      onAnswer({ correct: finalScore >= Math.ceil(items.length / 2) });
      return;
    }
    setIndex((x) => x + 1);
    setSelected(null);
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-300">{index + 1} / {items.length} • Correct: {correctCount}</div>
      <div className="p-3 bg-gray-700 rounded-lg">{current.text.replace(/^[-\s]+/, '')}</div>
      <div className={`grid gap-2 ${categories.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {categories.map((label, idx) => {
          const answerKey = (idx === 0 ? 'A' : idx === 1 ? 'B' : 'C') as 'A' | 'B' | 'C';
          const isCorrect = selected && current.answer === answerKey;
          const isWrongChoice = selected === answerKey && current.answer !== answerKey;
          return <button key={label} onClick={() => choose(answerKey)} disabled={Boolean(selected)} className={`p-2 rounded-lg border ${isCorrect ? 'bg-green-800 border-green-500' : isWrongChoice ? 'bg-red-800 border-red-500' : 'bg-gray-700 border-gray-600 hover:bg-gray-600'} disabled:opacity-90`}>{label}</button>;
        })}
      </div>
      {selected && <button onClick={next} className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-lg font-bold">{index + 1 >= items.length ? 'Finish' : 'Next'}</button>}
    </div>
  );
}

function RankingView({ question, onAnswer }: Props) {
  const q = question.type === 'ranking' ? question : null;
  const [mode, setMode] = useState<'one_shot' | 'anchor_adjust'>('one_shot');
  const [attempts, setAttempts] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const parsedFromQuestion = useMemo(() => {
    if (!q) return [] as string[];
    const parts = q.question.split(':');
    if (parts.length < 2) return [];
    return parts.slice(1).join(':').split(',').map((x) => x.trim()).filter(Boolean);
  }, [q]);

  const correctOrder = useMemo(() => {
    if (!q) return [] as string[];
    if (Array.isArray(q.items) && q.items.length) return [...q.items].sort((a, b) => a.rank - b.rank).map((item) => item.text).filter(Boolean);
    return parsedFromQuestion;
  }, [parsedFromQuestion, q]);

  useEffect(() => {
    const start = parsedFromQuestion.length ? parsedFromQuestion : correctOrder;
    setOrder(shuffle(start));
    setAttempts(0);
    setSubmitted(false);
    setMode('one_shot');
    setDragIndex(null);
  }, [q?.id, q?.question, parsedFromQuestion, correctOrder]);

  if (!q) return null;

  function onDrop(targetIndex: number) {
    if (dragIndex == null || dragIndex === targetIndex) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  function submitOrder() {
    const exact = order.join('||') === correctOrder.join('||');
    setAttempts((x) => x + 1);
    if (mode === 'one_shot' || exact) {
      setSubmitted(true);
      onAnswer({ correct: exact });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setMode('one_shot')} className={`px-3 py-1 rounded ${mode === 'one_shot' ? 'bg-purple-600' : 'bg-gray-700'}`}>One-Shot</button>
        <button onClick={() => setMode('anchor_adjust')} className={`px-3 py-1 rounded ${mode === 'anchor_adjust' ? 'bg-purple-600' : 'bg-gray-700'}`}>Anchor/Adjust</button>
      </div>
      <div className="space-y-2">
        {order.map((item, index) => <button key={`${item}-${index}`} draggable={!submitted} onDragStart={() => setDragIndex(index)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(index)} className={`w-full text-left p-2 rounded border ${submitted ? (correctOrder[index] === item ? 'bg-green-800 border-green-500' : 'bg-red-800 border-red-500') : 'bg-gray-700 border-gray-600'}`}>{index + 1}. {item}</button>)}
      </div>
      {!submitted && <button onClick={submitOrder} className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-lg font-bold">Submit Ranking</button>}
      {mode === 'anchor_adjust' && <div className="text-sm text-gray-300">Attempts: {attempts}</div>}
    </div>
  );
}

function MediaView({ question, onAnswer }: Props) {
  const q = question.type === 'media' ? question : null;
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [obscure, setObscure] = useState(false);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setShowAnswer(false);
    setObscure(false);
  }, [q?.id, q?.question]);

  if (!q) return null;

  const accepted = [q.answer || '', ...(q.acceptedAnswers || [])].filter(Boolean);
  const mediaUrl = q.mediaUrl || '';
  const embedUrl = parseYouTubeEmbed(mediaUrl);
  const isImage = (q.mediaType || '').toLowerCase() === 'image' || /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(mediaUrl);
  const isVideo = (q.mediaType || '').toLowerCase() === 'video' || Boolean(embedUrl) || /\.(mp4|webm|ogg)(\?|$)/i.test(mediaUrl);

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-black aspect-video flex items-center justify-center overflow-hidden">
        {isImage && mediaUrl && (
          <Image
            src={mediaUrl}
            alt="Question media"
            width={1280}
            height={720}
            unoptimized
            className={`max-w-full max-h-full object-contain ${obscure ? 'blur-xl brightness-0' : ''}`}
          />
        )}
        {isVideo && embedUrl && <iframe src={embedUrl} title="Question media video" className={`w-full h-full ${obscure ? 'blur-xl brightness-50' : ''}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen />}
        {isVideo && !embedUrl && mediaUrl && <video src={mediaUrl} controls className={`w-full h-full object-contain ${obscure ? 'blur-xl brightness-50' : ''}`} />}
        {!mediaUrl && <div className="text-gray-400">No media URL found.</div>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={obscure} onChange={(e) => setObscure(e.target.checked)} />Obscure media</label>
      <input value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted} placeholder="Type your answer" className="w-full bg-gray-700 rounded-lg p-3" />
      <div className="grid grid-cols-2 gap-2">
        <button disabled={!input.trim() || submitted} onClick={() => { const correct = accepted.some((ans) => isCloseMatch(input, ans)); setSubmitted(true); onAnswer({ correct }); }} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold">Submit</button>
        <button onClick={() => { setShowAnswer(true); if (!submitted) onAnswer({ correct: false }); }} className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold">Reveal Answer</button>
      </div>
      {showAnswer && <div className="text-yellow-300 font-bold">Answer: {q.answer}</div>}
    </div>
  );
}

function PromptView({ question, onAnswer, onRerollPrompt }: Props) {
  const q = question.type === 'prompt' ? question : null;
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setShowAnswer(false);
  }, [q?.id, q?.question, q?.prompt]);

  if (!q) return null;

  const accepted = [q.answer || '', ...(q.acceptedAnswers || [])].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="bg-gray-700 rounded-lg p-3">
        <div className="text-xs text-gray-300 uppercase mb-1">Prompt</div>
        <div className="text-lg">{q.prompt || 'No prompt available.'}</div>
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted} placeholder="Type your answer" className="w-full bg-gray-700 rounded-lg p-3" />
      <div className="grid grid-cols-3 gap-2">
        <button disabled={!input.trim() || submitted} onClick={() => { const correct = accepted.some((ans) => isCloseMatch(input, ans)); setSubmitted(true); onAnswer({ correct }); }} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold">Submit</button>
        <button onClick={() => { setShowAnswer(true); if (!submitted) onAnswer({ correct: false }); }} className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold">Reveal</button>
        <button onClick={() => q.prompt && onRerollPrompt?.(q.prompt)} disabled={!q.prompt || !onRerollPrompt} className="bg-indigo-700 hover:bg-indigo-600 disabled:bg-gray-600 py-2 rounded-lg font-bold">Reroll Prompt</button>
      </div>
      {showAnswer && <div className="text-yellow-300 font-bold">Answer: {q.answer}</div>}
    </div>
  );
}

export default function QuestionRenderer(props: Props) {
  if (props.question.type === 'multiple_choice') return <MultipleChoiceView {...props} />;
  if (props.question.type === 'open_ended') return <OpenEndedView {...props} />;
  if (props.question.type === 'list') return <ListView {...props} />;
  if (props.question.type === 'grouping') return <GroupingView {...props} />;
  if (props.question.type === 'this_or_that') return <ThisOrThatView {...props} />;
  if (props.question.type === 'ranking') return <RankingView {...props} />;
  if (props.question.type === 'media') return <MediaView {...props} />;
  if (props.question.type === 'prompt') return <PromptView {...props} />;
  const unknown = props.question as unknown as { type?: string };
  return <div className="text-gray-400 italic">Unsupported question type: {unknown.type || 'unknown'}</div>;
}
