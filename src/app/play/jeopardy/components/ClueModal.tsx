'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { JeopardyClueData } from '@/types/jeopardy';
import {
  getClueUserData,
  updateClueFlags,
  updateClueTags,
  getAllTags,
} from '@/lib/clue-store';
import {
  formatQuestionTagLabel,
  getQuestionTagGroups,
  guessQuestionTagsForClue,
  isKnownQuestionTag,
} from '@/lib/question-tags';

interface Props {
  clue: JeopardyClueData & { id: string };
  value: number;
  onCorrect: () => void;
  onIncorrect: () => void;
  onSkip: () => void;
  respondentLabel?: string;
  teamOptions?: string[];
  respondentIndex?: number | null;
  onRespondentChange?: (index: number) => void;
  lockRespondent?: boolean;
}

export default function ClueModal({
  clue,
  value,
  onCorrect,
  onIncorrect,
  onSkip,
  respondentLabel,
  teamOptions,
  respondentIndex,
  onRespondentChange,
  lockRespondent,
}: Props) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [showTagger, setShowTagger] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [mediaFlag, setMediaFlag] = useState(false);
  const [topicTags, setTopicTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(['science', 'arts']);
  const [persistingTags, setPersistingTags] = useState(false);

  const predefinedGroups = useMemo(() => getQuestionTagGroups(), []);
  const autoTagSuggestions = useMemo(
    () => guessQuestionTagsForClue(clue).filter(tag => !topicTags.includes(tag)),
    [clue, topicTags],
  );

  // Load user data when clue changes
  useEffect(() => {
    if (!clue.clueId) return;
    const ud = getClueUserData(clue.clueId);
    const mergedTags = Array.from(new Set([...(clue.topicTags ?? []), ...(ud.topicTags ?? [])]));
    setFlagged(ud.flagged);
    setMediaFlag(ud.mediaFlag);
    setTopicTags(mergedTags);
    setAllTags(Array.from(new Set([...getAllTags(), ...(clue.topicTags ?? [])])));
    setShowAnswer(false);
    setShowTagger(false);
    setTagInput('');
    setExpandedGroups(['science', 'arts']);
  }, [clue.clueId, clue.topicTags]);

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

  function toggleTag(tag: string) {
    if (topicTags.includes(tag)) {
      saveTags(topicTags.filter(t => t !== tag));
      return;
    }
    saveTags([...topicTags, tag]);
  }

  function applyAutoTags() {
    if (autoTagSuggestions.length === 0) return;
    saveTags(Array.from(new Set([...topicTags, ...autoTagSuggestions])));
  }

  function toggleGroup(groupId: string) {
    setExpandedGroups(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]);
  }

  function removeTag(tag: string) {
    saveTags(topicTags.filter(t => t !== tag));
  }

  async function persistTagsToAppFiles() {
    if (!clue.clueId) return;
    setPersistingTags(true);
    try {
      const response = await fetch('/api/content/clue-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clueId: clue.clueId, tags: topicTags }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to persist tags');
      }
      window.alert('Saved clue tags to app files. Commit and push to publish.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Failed to persist tags');
    } finally {
      setPersistingTags(false);
    }
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
          <span className="bg-red-600 text-white text-sm md:text-base font-bold px-4 py-2 rounded-full animate-pulse">
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
            {formatQuestionTagLabel(tag)}
          </span>
        ))}
      </div>

      {/* Clue text */}
      <div className="text-white text-2xl md:text-3xl text-center font-bold max-w-3xl mb-6 leading-snug">
        {clue.question}
      </div>

      {respondentLabel && (
        <div className="text-blue-200 text-sm md:text-base mb-4">
          Responding: <span className="text-yellow-300 font-bold">{respondentLabel}</span>
        </div>
      )}

      {showAnswer && teamOptions && teamOptions.length > 0 && onRespondentChange && (
        <div className="mb-4 w-full max-w-sm">
          <label className="block text-sm text-blue-200 mb-1">Who buzzed in?</label>
          <select
            disabled={Boolean(lockRespondent)}
            value={respondentIndex ?? ''}
            onChange={e => onRespondentChange(Number(e.target.value))}
            className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2 text-sm">
            {respondentIndex == null && <option value="" disabled>Select team</option>}
            {teamOptions.map((team, index) => (
              <option key={`${team}-${index}`} value={index}>{team}</option>
            ))}
          </select>
        </div>
      )}

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
                {formatQuestionTagLabel(tag)}
                <button onClick={() => removeTag(tag)} className="text-blue-300 hover:text-white">×</button>
              </span>
            ))}
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-blue-200 font-bold">Auto-tag suggestions</div>
              <button
                onClick={applyAutoTags}
                disabled={autoTagSuggestions.length === 0}
                className="bg-yellow-400 text-blue-950 px-3 py-1 rounded text-xs font-bold disabled:opacity-50">
                Apply auto-tags
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {autoTagSuggestions.length === 0 && (
                <span className="text-xs text-blue-300">No strong keyword matches found.</span>
              )}
              {autoTagSuggestions.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className="bg-blue-800 hover:bg-blue-700 text-blue-100 text-xs px-2 py-1 rounded-full">
                  + {formatQuestionTagLabel(tag)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 mb-4">
            {predefinedGroups.map(group => {
              const isOpen = expandedGroups.includes(group.id) || group.options.some(option => topicTags.includes(option.id));
              return (
                <div key={group.id} className="bg-blue-900/40 border border-blue-800 rounded-lg">
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="w-full px-3 py-2 text-left text-sm font-bold text-blue-100 flex items-center justify-between">
                    <span>{group.emoji} {group.label}</span>
                    <span className="text-blue-300">{isOpen ? '−' : '+'}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 flex flex-wrap gap-2">
                      {group.options.map(option => {
                        const active = topicTags.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            onClick={() => toggleTag(option.id)}
                            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                              active
                                ? 'bg-yellow-400 text-blue-950 border-yellow-300'
                                : 'bg-blue-800 text-blue-100 border-blue-700 hover:bg-blue-700'
                            }`}>
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tag input */}
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTag(tagInput); }}
              placeholder="Add custom tag…"
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
                  {isKnownQuestionTag(s) ? formatQuestionTagLabel(s) : s}
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
            <button
              onClick={persistTagsToAppFiles}
              disabled={persistingTags}
              className="flex items-center gap-1 text-sm px-3 py-2 rounded-lg font-bold transition-colors bg-emerald-700 text-white hover:bg-emerald-600 disabled:opacity-60">
              💾 {persistingTags ? 'Saving…' : 'Save Tags to App Files'}
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
              disabled={teamOptions && teamOptions.length > 0 && respondentIndex == null}
              className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-xl font-bold text-xl">
              ✓ Correct
            </button>
            <button onClick={onIncorrect}
              disabled={teamOptions && teamOptions.length > 0 && respondentIndex == null}
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
