'use client';

import { useEffect, useMemo, useState } from 'react';
import Image, { type ImageLoaderProps } from 'next/image';
import type { AnyQuestion } from '@/types/questions';
import { getQuestionPossiblePoints, getRankingPromptText, inferRankingDirection } from '@/lib/question-utils';

export type AnswerResult = {
  correct: boolean;
  pointsEarned: number;
  pointsPossible: number;
  type: AnyQuestion['type'];
};

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

function tokens(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}

function isCloseMatch(input: string, target: string): boolean {
  const a = normalize(input);
  const b = normalize(target);
  if (!a || !b) return false;
  if (a === b) return true;

  if (a.length < 2) return false;

  const aTokens = tokens(a);
  const bTokens = tokens(b);

  if (aTokens.length === 1 && bTokens.includes(aTokens[0]) && aTokens[0].length >= 3) return true;

  if (a.length >= 3 && b.length >= 3) {
    const dist = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    const threshold = maxLen <= 6 ? 1 : maxLen <= 12 ? 2 : 3;
    if (dist <= threshold) return true;
  }

  if (aTokens.length >= 2) {
    const overlap = aTokens.filter((t) => bTokens.includes(t)).length;
    if (overlap >= Math.min(2, aTokens.length)) return true;
  }

  return false;
}

function parseYouTubeEmbed(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/clip/')) {
      return null;
    }
    if (parsed.hostname.includes('youtu.be')) {
      const id = parsed.pathname.replace('/', '').split('?')[0];
      const start = parsed.searchParams.get('t') || parsed.searchParams.get('start');
      const end = parsed.searchParams.get('end');
      const startValue = start ? start.replace(/s$/, '') : '';
      return id
        ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1${startValue ? `&start=${encodeURIComponent(startValue)}` : ''}${end ? `&end=${encodeURIComponent(end)}` : ''}`
        : null;
    }
    if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.replace('/shorts/', '').split('/')[0];
        return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1` : null;
      }
      if (parsed.pathname.startsWith('/embed/')) {
        const id = parsed.pathname.replace('/embed/', '').split('/')[0];
        const start = parsed.searchParams.get('start');
        const end = parsed.searchParams.get('end');
        return id
          ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1${start ? `&start=${encodeURIComponent(start)}` : ''}${end ? `&end=${encodeURIComponent(end)}` : ''}`
          : null;
      }
      const id = parsed.searchParams.get('v');
      const start = parsed.searchParams.get('t') || parsed.searchParams.get('start');
      const end = parsed.searchParams.get('end');
      const startValue = start ? start.replace(/s$/, '') : '';
      return id
        ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1${startValue ? `&start=${encodeURIComponent(startValue)}` : ''}${end ? `&end=${encodeURIComponent(end)}` : ''}`
        : null;
    }
    return null;
  } catch {
    return null;
  }
}

function passthroughImageLoader({ src }: ImageLoaderProps): string {
  return src;
}

function finalizeOnce(
  locked: boolean,
  setLocked: (v: boolean) => void,
  onAnswer: Props['onAnswer'],
  question: AnyQuestion,
  pointsEarned: number,
  pointsPossible: number,
  correct: boolean,
) {
  if (locked) return;
  setLocked(true);
  onAnswer({
    correct,
    pointsEarned,
    pointsPossible,
    type: question.type,
  });
}

function MultipleChoiceView({ question, onAnswer }: Props) {
  const q = question.type === 'multiple_choice' ? question : null;
  const [options, setOptions] = useState<string[]>([]);
  const [selected, setSelected] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

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
    const cleaned = (q.options || [])
      .map((option) => option.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim())
      .filter(Boolean);
    setOptions(shuffle(cleaned));
    setSelected('');
    setSubmitted(false);
    setLocked(false);
  }, [q]);

  if (!q) return null;

  return (
    <div className="space-y-3">
      {options.map((opt) => {
        const isCorrect = submitted && opt === correctAnswer;
        const isIncorrectChoice = submitted && selected === opt && opt !== correctAnswer;
        return (
          <button
            key={opt}
            onClick={() => !submitted && setSelected(opt)}
            className={`w-full text-left p-3 rounded-lg border ${
              isCorrect
                ? 'bg-green-800 border-green-500'
                : isIncorrectChoice
                  ? 'bg-red-800 border-red-500'
                  : selected === opt
                    ? 'bg-blue-700 border-blue-400'
                    : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
            }`}
          >
            {opt}
          </button>
        );
      })}
      <button
        disabled={!selected || submitted}
        onClick={() => {
          setSubmitted(true);
          const correct = selected === correctAnswer;
          finalizeOnce(locked, setLocked, onAnswer, question, correct ? pointsPossible : 0, pointsPossible, correct);
        }}
        className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold"
      >
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
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setShowAnswer(false);
    setLocked(false);
  }, [q?.id, q?.question]);

  if (!q) return null;
  const accepted = [q.answer || '', ...(q.acceptedAnswers || [])].filter(Boolean);

  return (
    <div className="space-y-3">
      <input value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted} placeholder="Type your answer" className="w-full bg-gray-700 rounded-lg p-3" />
      <div className="grid grid-cols-2 gap-2">
        <button
          disabled={submitted || !input.trim()}
          onClick={() => {
            const correct = accepted.some((ans) => isCloseMatch(input, ans));
            setSubmitted(true);
            finalizeOnce(locked, setLocked, onAnswer, question, correct ? pointsPossible : 0, pointsPossible, correct);
          }}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold"
        >
          Submit
        </button>
        <button
          onClick={() => {
            setShowAnswer(true);
            if (!submitted) {
              finalizeOnce(locked, setLocked, onAnswer, question, 0, pointsPossible, false);
            }
          }}
          className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold"
        >
          Reveal Answer
        </button>
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
  const [mode, setMode] = useState<'timed' | 'strikes' | 'unlimited'>('timed');
  const [scoringMode, setScoringMode] = useState<'target' | 'as_many'>('target');
  const [timeLeft, setTimeLeft] = useState(30);
  const [strikes, setStrikes] = useState(0);
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

  useEffect(() => {
    setInput('');
    setFound([]);
    setAttempts([]);
    setFinished(false);
    setShowAnswers(false);
    setSearch('');
    setMode('timed');
    setScoringMode('target');
    setLocked(false);
    const hard = q?.difficulty === 'hard' || q?.difficulty === 'very_hard';
    setTimeLeft(hard ? 60 : 30);
    setStrikes(0);
  }, [q]);

  useEffect(() => {
    if (mode !== 'timed' || finished) return;
    if (timeLeft <= 0) {
      setFinished(true);
      const foundCount = found.length;
      const minRequired = q?.minRequired || 1;
      const selfScore = (Array.isArray(q?.answers) ? q.answers : []).some((ans) => /self\s*-?\s*score/i.test(ans)) || /self\s*-?\s*score/i.test(q?.question || '');
      const points = scoringMode === 'as_many'
        ? { earned: selfScore ? 0 : Math.min(pointsPossible, foundCount), correct: selfScore ? false : foundCount > 0 }
        : {
            earned: selfScore ? 0 : Math.round(pointsPossible * Math.min(1, foundCount / Math.max(1, minRequired))),
            correct: selfScore ? false : foundCount >= minRequired,
          };
      finalizeOnce(locked, setLocked, onAnswer, question, points.earned, pointsPossible, points.correct);
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [mode, finished, timeLeft, found.length, locked, onAnswer, pointsPossible, question, scoringMode, q]);

  if (!q) return null;

  const parsedFromQuestion = q.question.includes(':')
    ? q.question
        .split(':')
        .slice(1)
        .join(':')
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const answers = Array.from(new Set([...(Array.isArray(q.answers) ? q.answers : []), ...parsedFromQuestion]));
  const minRequired = q.minRequired || 1;
  const isSelfScore = answers.some((ans) => /self\s*-?\s*score/i.test(ans)) || /self\s*-?\s*score/i.test(q.question);
  const expectsDoubleO = /two\s+o'?s|double\s+o|\boo\b|side\s*by\s*side/i.test(q.question.toLowerCase());

  function calcPoints(foundCount: number): { earned: number; correct: boolean } {
    if (isSelfScore) {
      return { earned: 0, correct: false };
    }
    if (scoringMode === 'as_many') {
      const earned = Math.min(pointsPossible, foundCount);
      return { earned, correct: foundCount > 0 };
    }
    const ratio = Math.min(1, foundCount / Math.max(1, minRequired));
    const earned = Math.round(pointsPossible * ratio);
    return { earned, correct: foundCount >= minRequired };
  }

  function finalize() {
    if (finished) return;
    setFinished(true);
    const points = calcPoints(found.length);
    finalizeOnce(locked, setLocked, onAnswer, question, points.earned, pointsPossible, points.correct);
  }

  function tryAdd() {
    const raw = input.trim();
    if (!raw || finished) return;
    const generatedMatch = expectsDoubleO && /oo/i.test(raw) ? raw : null;
    const match = answers.find((ans) => isCloseMatch(raw, ans)) || generatedMatch;
    const canonical = match || raw;
    const correct = Boolean(match) && !found.includes(canonical);
    if (correct) setFound((prev) => [...prev, canonical]);
    else if (mode === 'strikes') {
      const nextStrikes = strikes + 1;
      setStrikes(nextStrikes);
      if (nextStrikes >= 3) {
        setAttempts((prev) => [...prev, { text: raw, correct }]);
        setInput('');
        finalize();
        return;
      }
    }
    setAttempts((prev) => [...prev, { text: raw, correct }]);
    setInput('');
  }

  const filteredAnswers = answers.filter((ans) => normalize(ans).includes(normalize(search)));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'timed' | 'strikes' | 'unlimited')} disabled={attempts.length > 0} className="bg-gray-700 rounded-lg p-2 text-sm disabled:opacity-50">
          <option value="timed">Timed</option>
          <option value="strikes">3 Strikes</option>
          <option value="unlimited">Unlimited</option>
        </select>
        <select value={scoringMode} onChange={(e) => setScoringMode(e.target.value as 'target' | 'as_many')} disabled={attempts.length > 0} className="bg-gray-700 rounded-lg p-2 text-sm disabled:opacity-50">
          <option value="target">Target (meet minimum)</option>
          <option value="as_many">Name as many</option>
        </select>
      </div>

      <div className="text-sm text-gray-300">
        {scoringMode === 'target' ? `Find at least ${minRequired} answers.` : 'Name as many answers as you can.'}
        {isSelfScore ? ' Self-score round: no points awarded.' : ''}
        {mode === 'timed' ? ` Time left: ${timeLeft}s` : ''}
        {mode === 'strikes' ? ` Strikes: ${strikes}/3` : ''}
      </div>

      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && tryAdd()} disabled={finished} className="flex-1 bg-gray-700 rounded-lg p-3" placeholder="Type an item" />
        <button onClick={tryAdd} disabled={finished} className="px-4 bg-purple-600 hover:bg-purple-500 rounded-lg font-bold">Check</button>
      </div>

      <div className="rounded-lg bg-gray-900 p-2 max-h-28 overflow-y-auto">
        <div className="text-xs text-gray-400 mb-1">Guessed so far</div>
        <div className="space-y-1">
          {attempts.map((attempt, index) => (
            <div key={`${attempt.text}-${index}`} className={`text-xs ${attempt.correct ? 'text-green-300' : 'text-red-300'}`}>
              {attempt.correct ? '✓' : '✗'} {attempt.text}
            </div>
          ))}
        </div>
      </div>

      <div className="text-sm">Found: <span className="text-green-300 font-bold">{found.length}</span> / {answers.length}</div>
      <div className="grid grid-cols-2 gap-2">
        <button disabled={finished} onClick={finalize} className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold">Submit List</button>
        <button
          onClick={() => {
            setShowAnswers(true);
            if (!finished) finalize();
          }}
          className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold"
        >
          Reveal Answers
        </button>
      </div>

      {showAnswers && (
        <div className="bg-gray-900 rounded-lg p-3 space-y-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search answers" className="w-full bg-gray-700 rounded-lg p-2" />
          <div className="max-h-40 overflow-y-auto text-sm space-y-1">
            {filteredAnswers.map((ans) => (
              <div key={ans} className={`${found.includes(ans) ? 'text-green-300' : 'text-gray-200'}`}>{ans}</div>
            ))}
          </div>
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
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

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
    setLocked(false);
  }, [q]);

  if (!q) return null;

  const correctSet = new Set(Array.isArray(q.correctItems) ? q.correctItems : []);
  const displayedCorrectCount = gridItems.filter((item) => correctSet.has(item)).length;

  function finish(nextSelected = selected) {
    if (ended) return;
    const correctChosen = nextSelected.filter((x) => correctSet.has(x)).length;
    const earned = Math.round((pointsPossible * correctChosen) / Math.max(1, displayedCorrectCount));
    setEnded(true);
    finalizeOnce(locked, setLocked, onAnswer, question, earned, pointsPossible, correctChosen === displayedCorrectCount);
  }

  function pick(item: string) {
    if (ended || selected.includes(item)) return;
    const isCorrect = correctSet.has(item);
    const next = [...selected, item];
    setSelected(next);
    if (mode === 'elimination' && !isCorrect) {
      finish(next);
      return;
    }
    if (mode === 'continuous' && next.length >= Math.max(1, displayedCorrectCount)) {
      finish(next);
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
          const className = ended
            ? isCorrect
              ? chosen
                ? 'bg-green-700 border-yellow-300'
                : 'bg-green-900 border-green-500'
              : chosen
                ? 'bg-red-800 border-red-500'
                : 'bg-gray-700 border-gray-600 opacity-60'
            : chosen
              ? 'bg-blue-700 border-blue-400'
              : 'bg-gray-700 border-gray-600 hover:bg-gray-600';
          return (
            <button key={item} onClick={() => pick(item)} className={`p-2 text-sm rounded border ${className}`}>
              {item}
              {ended && chosen && <span className="ml-1 text-xs">(picked)</span>}
            </button>
          );
        })}
      </div>
      {!ended && mode === 'continuous' && <div className="text-sm text-gray-300">Pick {displayedCorrectCount} items. Chosen: {selected.length}</div>}
      {!ended && <button onClick={() => finish()} className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-lg font-bold">Finish</button>}
    </div>
  );
}

function ThisOrThatView({ question, onAnswer }: Props) {
  const q = question.type === 'this_or_that' ? question : null;
  const [mode, setMode] = useState<'standard' | 'elimination'>('standard');
  const [index, setIndex] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [selected, setSelected] = useState<'A' | 'B' | 'C' | null>(null);
  const [items, setItems] = useState<Array<{ text: string; answer: 'A' | 'B' | 'C' }>>([]);
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

  useEffect(() => {
    if (!q) return;
    const source = Array.isArray(q.items) ? q.items : [];
    setItems(shuffle(source).slice(0, 5));
    setIndex(0);
    setCorrectCount(0);
    setSelected(null);
    setMode('standard');
    setLocked(false);
  }, [q]);

  if (!q) return null;

  const categories = [q.categoryA, q.categoryB, q.categoryC].filter(Boolean) as string[];
  const current = items[index];
  if (!current) return <div className="text-gray-400">No this-or-that items available.</div>;

  function choose(answer: 'A' | 'B' | 'C') {
    if (selected) return;
    setSelected(answer);
    const right = answer === current.answer;
    if (mode === 'elimination' && !right) {
      const earned = Math.round((pointsPossible * correctCount) / Math.max(1, items.length));
      finalizeOnce(locked, setLocked, onAnswer, question, earned, pointsPossible, false);
    }
  }

  function next() {
    const answeredCorrect = selected === current.answer ? 1 : 0;
    const runningCorrect = correctCount + answeredCorrect;
    setCorrectCount(runningCorrect);
    if (index + 1 >= items.length || (mode === 'elimination' && selected !== current.answer)) {
      const earned = Math.round((pointsPossible * runningCorrect) / Math.max(1, items.length));
      finalizeOnce(locked, setLocked, onAnswer, question, earned, pointsPossible, runningCorrect > 0);
      return;
    }
    setIndex((x) => x + 1);
    setSelected(null);
  }

  const buttonColors = ['bg-blue-700 hover:bg-blue-600', 'bg-emerald-700 hover:bg-emerald-600', 'bg-violet-700 hover:bg-violet-600'];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button disabled={index > 0} onClick={() => setMode('standard')} className={`px-3 py-1 rounded ${mode === 'standard' ? 'bg-purple-600' : 'bg-gray-700'} disabled:opacity-50`}>Standard</button>
        <button disabled={index > 0} onClick={() => setMode('elimination')} className={`px-3 py-1 rounded ${mode === 'elimination' ? 'bg-purple-600' : 'bg-gray-700'} disabled:opacity-50`}>Elimination</button>
      </div>
      <div className="text-sm text-gray-300">{index + 1} / {items.length} • Correct: {correctCount}</div>
      <div className="p-3 bg-gray-700 rounded-lg">{current.text.replace(/^[-\s]+/, '')}</div>
      <div className={`grid gap-2 ${categories.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {categories.map((label, idx) => {
          const answerKey = (idx === 0 ? 'A' : idx === 1 ? 'B' : 'C') as 'A' | 'B' | 'C';
          const isCorrect = selected && current.answer === answerKey;
          const isWrongChoice = selected === answerKey && current.answer !== answerKey;
          return (
            <button
              key={label}
              onClick={() => choose(answerKey)}
              disabled={Boolean(selected)}
              className={`p-4 text-lg font-bold rounded-xl border ${isCorrect ? 'bg-green-800 border-green-500' : isWrongChoice ? 'bg-red-800 border-red-500' : `${buttonColors[idx] || 'bg-gray-700 hover:bg-gray-600'} border-transparent`} disabled:opacity-90`}
            >
              {label}
            </button>
          );
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
  const [lockedIndices, setLockedIndices] = useState<Set<number>>(new Set());
  const [showSolution, setShowSolution] = useState(false);
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

  const parsedFromQuestion = useMemo(() => {
    if (!q) return [] as string[];
    const parts = q.question.split(':');
    if (parts.length < 2) return [];
    return parts.slice(1).join(':').split(',').map((x) => x.trim()).filter(Boolean);
  }, [q]);

  const sortedItems = useMemo(() => {
    if (!q || !Array.isArray(q.items)) return [] as Array<{ text: string; rank: number; value?: string }>;
    return [...q.items].sort((a, b) => a.rank - b.rank);
  }, [q]);

  const correctOrder = useMemo(() => {
    if (sortedItems.length) return sortedItems.map((item) => item.text).filter(Boolean);
    return parsedFromQuestion;
  }, [parsedFromQuestion, sortedItems]);

  const promptText = useMemo(() => getRankingPromptText(q?.question || ''), [q?.question]);
  const direction = useMemo(() => inferRankingDirection(promptText), [promptText]);
  const topLabel = useMemo(() => direction.topLabel.replace(/\bN\b/g, String(correctOrder.length || 1)), [direction.topLabel, correctOrder.length]);
  const bottomLabel = useMemo(() => direction.bottomLabel.replace(/\bN\b/g, String(correctOrder.length || 1)), [direction.bottomLabel, correctOrder.length]);

  useEffect(() => {
    const start = parsedFromQuestion.length ? parsedFromQuestion : correctOrder;
    setOrder(shuffle(start));
    setAttempts(0);
    setSubmitted(false);
    setMode('one_shot');
    setDragIndex(null);
    setLockedIndices(new Set());
    setShowSolution(false);
    setLocked(false);
  }, [q?.id, q?.question, parsedFromQuestion, correctOrder]);

  if (!q) return null;

  function onDrop(targetIndex: number) {
    if (dragIndex == null || dragIndex === targetIndex) return;
    if (lockedIndices.has(dragIndex) || lockedIndices.has(targetIndex)) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDragIndex(null);
  }

  function submitOrder() {
    const correctPositions = order.reduce((count, item, index) => (item === correctOrder[index] ? count + 1 : count), 0);
    const nextAttempts = attempts + 1;
    setAttempts(nextAttempts);

    if (mode === 'one_shot') {
      const earned = Math.round((pointsPossible * correctPositions) / Math.max(1, correctOrder.length));
      setSubmitted(true);
      setShowSolution(true);
      finalizeOnce(locked, setLocked, onAnswer, question, earned, pointsPossible, correctPositions === correctOrder.length);
      return;
    }

    const nextLocks = new Set<number>();
    order.forEach((item, index) => {
      if (item === correctOrder[index]) nextLocks.add(index);
    });
    setLockedIndices(nextLocks);

    if (nextLocks.size === correctOrder.length) {
      const earned = Math.max(0, pointsPossible - (nextAttempts - 1));
      setSubmitted(true);
      setShowSolution(true);
      finalizeOnce(locked, setLocked, onAnswer, question, earned, pointsPossible, true);
    }
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-300">
        <div className="font-bold text-gray-200">{promptText}</div>
        <div>{topLabel}</div>
        <div>{bottomLabel}</div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setMode('one_shot')} disabled={attempts > 0} className={`px-3 py-1 rounded ${mode === 'one_shot' ? 'bg-purple-600' : 'bg-gray-700'} disabled:opacity-50`}>One-Shot</button>
        <button onClick={() => setMode('anchor_adjust')} disabled={attempts > 0} className={`px-3 py-1 rounded ${mode === 'anchor_adjust' ? 'bg-purple-600' : 'bg-gray-700'} disabled:opacity-50`}>Anchor/Adjust</button>
      </div>

      <div className="space-y-2">
        {order.map((item, index) => {
          const isLocked = lockedIndices.has(index);
          const correct = submitted && item === correctOrder[index];
          const incorrect = submitted && item !== correctOrder[index];
          return (
            <button
              key={`${item}-${index}`}
              draggable={!submitted && !isLocked}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(index)}
              className={`w-full text-left p-2 rounded border cursor-grab active:cursor-grabbing ${
                isLocked ? 'bg-green-900 border-green-500' : correct ? 'bg-green-800 border-green-500' : incorrect ? 'bg-red-800 border-red-500' : 'bg-gray-700 border-gray-600'
              }`}
            >
              {index + 1}. {item} {isLocked && mode === 'anchor_adjust' ? '🔒' : '↕'}
            </button>
          );
        })}
      </div>

      {!submitted && <button onClick={submitOrder} className="w-full bg-purple-600 hover:bg-purple-500 py-2 rounded-lg font-bold">Submit Ranking</button>}

      {mode === 'anchor_adjust' && <div className="text-sm text-gray-300">Attempts: {attempts} • Locked: {lockedIndices.size}/{correctOrder.length} • Current score: {Math.max(0, pointsPossible - Math.max(0, attempts - 1))}</div>}

      {(showSolution || submitted) && (
        <div className="bg-gray-900 rounded-lg p-3">
          <div className="text-sm text-gray-300 mb-1">Correct order:</div>
          <div className="space-y-1 text-sm">
            {correctOrder.map((item, index) => {
              const value = sortedItems[index]?.value;
              return (
                <div key={`${item}-${index}`}>
                  {index + 1}. {item}{value ? ` (${value})` : ''}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MediaView({ question, onAnswer }: Props) {
  const q = question.type === 'media' ? question : null;
  const [input, setInput] = useState('');
  const [selectedOption, setSelectedOption] = useState('');
  const [choiceSubmitted, setChoiceSubmitted] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [obscure, setObscure] = useState(false);
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

  useEffect(() => {
    setInput('');
    setSelectedOption('');
    setChoiceSubmitted(false);
    setSubmitted(false);
    setShowAnswer(false);
    setObscure(false);
    setLocked(false);
  }, [q?.id, q?.question]);

  if (!q) return null;

  const accepted = [q.answer || '', ...(q.acceptedAnswers || [])].filter(Boolean);
  const multilineAnswerLines = (q.answer || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const hasStarredMultipleChoice = multilineAnswerLines.length >= 2 && multilineAnswerLines.some((line) => /\*/.test(line));
  const mcParsed = multilineAnswerLines
    .map((line) => {
      const starred = /^\*+\s*|\s*\*+$/.test(line) || line.includes('*');
      const text = line.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').replace(/\*/g, '').trim();
      return { text, starred };
    })
    .filter((item) => item.text);
  const mcOptions = hasStarredMultipleChoice ? shuffle(Array.from(new Set(mcParsed.map((item) => item.text)))) : [];
  const mcCorrectAnswer = hasStarredMultipleChoice ? (mcParsed.find((item) => item.starred)?.text || '') : '';
  const mediaUrl = q.mediaUrl || '';
  const embedUrl = parseYouTubeEmbed(mediaUrl);
  const isImage = (q.mediaType || '').toLowerCase() === 'image' || /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(mediaUrl);
  const isDirectVideoFile = /\.(mp4|webm|ogg)(\?|$)/i.test(mediaUrl);
  const isVideo = (q.mediaType || '').toLowerCase() === 'video' || Boolean(embedUrl) || isDirectVideoFile;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-black aspect-video flex items-center justify-center overflow-hidden relative">
        {isImage && mediaUrl && (
          <Image
            loader={passthroughImageLoader}
            unoptimized
            src={mediaUrl}
            alt="Question media"
            width={1280}
            height={720}
            className="max-w-full max-h-full object-contain"
          />
        )}
        {isVideo && embedUrl && (
          <iframe
            src={embedUrl}
            title="Question media video"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}
        {isVideo && !embedUrl && mediaUrl && isDirectVideoFile && <video src={mediaUrl} controls className="w-full h-full object-contain" />}
        {obscure && <div className="absolute inset-0 bg-black pointer-events-none" />}
        {!mediaUrl && <div className="text-gray-400">No media URL found.</div>}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={obscure} onChange={(e) => setObscure(e.target.checked)} />Obscure media</label>
      {hasStarredMultipleChoice ? (
        <>
          <div className="space-y-2">
            {mcOptions.map((option) => {
              const isCorrect = choiceSubmitted && option === mcCorrectAnswer;
              const isWrongChoice = choiceSubmitted && selectedOption === option && option !== mcCorrectAnswer;
              return (
                <button
                  key={option}
                  onClick={() => !choiceSubmitted && setSelectedOption(option)}
                  className={`w-full text-left p-3 rounded-lg border ${
                    isCorrect
                      ? 'bg-green-800 border-green-500'
                      : isWrongChoice
                        ? 'bg-red-800 border-red-500'
                        : selectedOption === option
                          ? 'bg-blue-700 border-blue-400'
                          : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!selectedOption || choiceSubmitted}
              onClick={() => {
                setChoiceSubmitted(true);
                const correct = selectedOption === mcCorrectAnswer;
                finalizeOnce(locked, setLocked, onAnswer, question, correct ? pointsPossible : 0, pointsPossible, correct);
              }}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold"
            >
              Submit
            </button>
            <button
              onClick={() => {
                setShowAnswer(true);
                if (!choiceSubmitted) {
                  setChoiceSubmitted(true);
                  finalizeOnce(locked, setLocked, onAnswer, question, 0, pointsPossible, false);
                }
              }}
              className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold"
            >
              Reveal Answer
            </button>
          </div>
          {showAnswer && <div className="text-yellow-300 font-bold">Answer: {mcCorrectAnswer || q.answer}</div>}
        </>
      ) : (
        <>
          <input value={input} onChange={(e) => setInput(e.target.value)} disabled={submitted} placeholder="Type your answer" className="w-full bg-gray-700 rounded-lg p-3" />
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={!input.trim() || submitted}
              onClick={() => {
                const correct = accepted.some((ans) => isCloseMatch(input, ans));
                setSubmitted(true);
                finalizeOnce(locked, setLocked, onAnswer, question, correct ? pointsPossible : 0, pointsPossible, correct);
              }}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold"
            >
              Submit
            </button>
            <button
              onClick={() => {
                setShowAnswer(true);
                if (!submitted) {
                  finalizeOnce(locked, setLocked, onAnswer, question, 0, pointsPossible, false);
                }
              }}
              className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold"
            >
              Reveal Answer
            </button>
          </div>
          {showAnswer && <div className="text-yellow-300 font-bold">Answer: {q.answer}</div>}
        </>
      )}
    </div>
  );
}

function PromptView({ question, onAnswer, onRerollPrompt }: Props) {
  const q = question.type === 'prompt' ? question : null;
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [locked, setLocked] = useState(false);

  const pointsPossible = getQuestionPossiblePoints(question);

  useEffect(() => {
    setInput('');
    setSubmitted(false);
    setShowAnswer(false);
    setLocked(false);
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
        <button
          disabled={!input.trim() || submitted}
          onClick={() => {
            const correct = accepted.some((ans) => isCloseMatch(input, ans));
            setSubmitted(true);
            finalizeOnce(locked, setLocked, onAnswer, question, correct ? pointsPossible : 0, pointsPossible, correct);
          }}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 py-2 rounded-lg font-bold"
        >
          Submit
        </button>
        <button
          onClick={() => {
            setShowAnswer(true);
            if (!submitted) finalizeOnce(locked, setLocked, onAnswer, question, 0, pointsPossible, false);
          }}
          className="bg-blue-700 hover:bg-blue-600 py-2 rounded-lg font-bold"
        >
          Reveal
        </button>
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
  return <div className="text-gray-400 italic">Unsupported question type.</div>;
}
