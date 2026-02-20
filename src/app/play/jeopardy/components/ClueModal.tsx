'use client';
import { useState, useEffect, useCallback } from 'react';
import type { JeopardyClueData } from '@/types/jeopardy';
import {
  getClueUserData,
  updateClueFlags,
  updateClueTags,
  getAllTags,
} from '@/lib/clue-store';

interface Props {
  clue: JeopardyClueData & { id: string };
  value: number;
  onCorrect: () => void;
  onIncorrect: () => void;
  onSkip: () => void;
}

export default function ClueModal({ clue, value, onCorrect, onIncorrect, onSkip }: Props) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showTagger, setShowTagger] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [mediaFlag, setMediaFlag] = useState(false);
  const [topicTags, setTopicTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);

  // Load user data when clue changes
  useEffect(() => {
    if (!clue.clueId) return;
    const ud = getClueUserData(clue.clueId);
    setFlagged(ud.flagged);
    setMediaFlag(ud.mediaFlag);
    setTopicTags(ud.topicTags);
    setAllTags(getAllTags());
    setShowAnswer(false);
    setShowTagger(false);
    setTagInput('');
  }, [clue.clueId]);

  const saveFlags = useCallback(
    (f: boolean, m: boolean) => {
      if (!clue.clueId) return;
      setFlagged(f);
      setMediaFlag(m);
      updateClueFlags(clue.clueId, { flagged: f, mediaFlag: m });
    },
    [clue.clueId],
  );

  const saveTags = useCallback(
    (tags: string[]) => {
      if (!clue.clueId) return;
      setTopicTags(tags);
      updateClueTags(clue.clueId, tags);
      setAllTags(getAllTags());
    },
    [clue.clueId],
  );

  function addTag(tag: string) {
    const clean = tag.trim().toLowerCase();
    if (!clean || topicTags.includes(clean)) return;
    saveTags([...topicTags, clean]);
    setTagInput('');
  }

  function removeTag(tag: string) {
    saveTags(topicTags.filter(t => t !== tag));
  }

  const suggestions = allTags.filter(
    t => t.includes(tagInput.toLowerCase()) && !topicTags.includes(t),
  );

  return (
    <div className="fixed inset-0 bg-blue-950 flex flex-col items-center justify-center z-50 p-6 overflow-y-auto">
      {/* Category + value header */}
      <div className="text-yellow-400 text-lg mb-2 uppercase tracking-wide text-center">
        {clue.category} — ${value}
      </div>

      {/* Badges row */}
      <div className="flex flex-wrap gap-2 justify-center mb-4">
        {clue.dailyDouble && (
          <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            Daily Double!
          </span>
        )}
        {clue.tripleStumper && (
          <span className="bg-orange-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            Triple Stumper
          </span>
        )}
        {clue.isFinalJeopardy && (
          <span className="bg-purple-600 text-white text-xs font-bold px-3 py-1 rounded-full">
            Final Jeopardy
          </span>
        )}
        {flagged && (
          <span className="bg-yellow-500 text-blue-950 text-xs font-bold px-3 py-1 rounded-full">
            🚩 Flagged
          </span>
        )}
        {mediaFlag && (
          <span className="bg-gray-500 text-white text-xs font-bold px-3 py-1 rounded-full">
            🎬 Media
          </span>
        )}
        {topicTags.map(tag => (
          <span key={tag} className="bg-blue-700 text-white text-xs font-bold px-3 py-1 rounded-full">
            #{tag}
          </span>
        ))}
      </div>

      {/* Clue text */}
      <div className="text-white text-2xl md:text-3xl text-center font-bold max-w-3xl mb-6 leading-snug">
        {clue.question}
      </div>

      {/* Answer */}
      {showAnswer && (
        <div className="text-yellow-300 text-xl md:text-2xl text-center mb-6 italic max-w-3xl">
          {`"${clue.answer}"`}
        </div>
      )}

      {/* Tagger panel (collapsible) */}
      {showTagger && (
        <div className="bg-blue-900 rounded-xl p-4 mb-4 w-full max-w-lg">
          <div className="flex flex-wrap gap-2 mb-3">
            {topicTags.map(tag => (
              <span key={tag}
                className="bg-blue-700 text-white text-sm px-2 py-1 rounded-full flex items-center gap-1">
                #{tag}
                <button onClick={() => removeTag(tag)} className="text-blue-300 hover:text-white">×</button>
              </span>
            ))}
          </div>

          {/* Tag input */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag(tagInput); }}
              placeholder="Add topic tag…"
              className="flex-1 bg-blue-800 text-white placeholder-blue-400 border border-blue-600 rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={() => addTag(tagInput)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-bold">
              Add
            </button>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && tagInput.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {suggestions.slice(0, 8).map(s => (
                <button key={s} onClick={() => addTag(s)}
                  className="bg-blue-800 hover:bg-blue-700 text-blue-200 text-xs px-2 py-1 rounded">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Flag toggles */}
          <div className="flex gap-3">
            <button
              onClick={() => saveFlags(!flagged, mediaFlag)}
              className={`flex items-center gap-1 text-sm px-3 py-2 rounded-lg font-bold transition-colors ${
                flagged ? 'bg-yellow-500 text-blue-950' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
              }`}>
              🚩 {flagged ? 'Flagged' : 'Flag'}
            </button>
            <button
              onClick={() => saveFlags(flagged, !mediaFlag)}
              className={`flex items-center gap-1 text-sm px-3 py-2 rounded-lg font-bold transition-colors ${
                mediaFlag ? 'bg-gray-400 text-blue-950' : 'bg-blue-800 text-blue-200 hover:bg-blue-700'
              }`}>
              🎬 {mediaFlag ? 'Media Flagged' : 'Media Flag'}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3 justify-center">
        {!showAnswer ? (
          <>
            <button onClick={() => setShowAnswer(true)}
              className="bg-yellow-400 text-blue-950 px-8 py-3 rounded-xl font-bold text-xl">
              Show Answer
            </button>
            <button onClick={() => setShowTagger(s => !s)}
              className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm">
              🏷️ Tags
            </button>
          </>
        ) : (
          <>
            <button onClick={onCorrect}
              className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-xl font-bold text-xl">
              ✓ Correct
            </button>
            <button onClick={onIncorrect}
              className="bg-red-600 hover:bg-red-500 px-8 py-3 rounded-xl font-bold text-xl">
              ✗ Wrong
            </button>
            <button onClick={onSkip}
              className="bg-gray-600 hover:bg-gray-500 px-8 py-3 rounded-xl font-bold text-xl">
              Skip
            </button>
            <button onClick={() => setShowTagger(s => !s)}
              className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm">
              🏷️ Tags
            </button>
          </>
        )}
      </div>
    </div>
  );
}
