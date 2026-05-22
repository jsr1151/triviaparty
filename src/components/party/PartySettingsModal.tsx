'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { AnyQuestion } from '@/types/questions';
import { PARTY_TYPES, createDefaultSettings, createPresetSettings, type PartySettings } from '@/lib/party-mode';

export type SavedPreset = {
  id: string;
  name: string;
  description?: string;
  config: PartySettings;
  source: 'global' | 'local';
};

const DEFAULT_SLOT_CATEGORY_STRATEGY = 'any' as const;
const DEFAULT_GROUPING_MODE = 'elimination';
const DEFAULT_RANKING_MODE = 'anchor_adjust';

function getSlotGridColumns(slotType: AnyQuestion['type']): string {
  return slotType === 'list' ? 'md:grid-cols-8' : 'md:grid-cols-7';
}

function createDefaultConfiguredSlot(id: string, count: number) {
  return {
    id,
    type: 'multiple_choice' as const,
    count,
    order: 'fixed' as const,
    listMode: 'timed' as const,
    listScoring: 'target' as const,
    categoryStrategy: DEFAULT_SLOT_CATEGORY_STRATEGY,
  };
}

export function PartySettingsModal({
  settings,
  setSettings,
  startGame,
  startMultiplayerHost,
  savePreset,
  loadPreset,
  savedPresets,
  isOwner,
  hasQuestions,
  title = '🎉 Party Mode Settings',
  backHref = '/',
  showPresetControls = true,
  footerContent,
  hideDefaultActionButtons = false,
}: {
  settings: PartySettings;
  setSettings: (value: PartySettings) => void;
  startGame: () => void;
  startMultiplayerHost: () => void;
  savePreset: (name: string, description: string) => Promise<void>;
  loadPreset: (preset: SavedPreset) => void;
  savedPresets: SavedPreset[];
  isOwner: boolean;
  hasQuestions: boolean;
  title?: string;
  backHref?: string;
  showPresetControls?: boolean;
  footerContent?: ReactNode;
  hideDefaultActionButtons?: boolean;
}) {
  const totalQuestions = settings.rounds.reduce((sum, round) => sum + Math.max(1, round.questionCount), 0);
  const [presetName, setPresetName] = useState('');
  const [presetDescription, setPresetDescription] = useState('');

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-purple-300">{title}</h1>
          <Link href={backHref} className="text-purple-300 hover:text-purple-200 font-bold">← Main Menu</Link>
        </div>

        <div className="bg-gray-800 rounded-2xl p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              ['Pursuit (Short)', 'pursuit-short'],
              ['Pursuit (Long)', 'pursuit-long'],
              ['Lightning Round', 'lightning-round'],
              ['Variety Pack', 'variety-pack'],
              ['Expert Challenge', 'expert-challenge'],
            ].map(([label, key]) => (
              <button key={key} onClick={() => setSettings(createPresetSettings(key))} className="bg-indigo-700 hover:bg-indigo-600 px-3 py-2 rounded-lg text-sm font-bold">
                {label}
              </button>
            ))}
            <button onClick={() => setSettings(createDefaultSettings())} className="bg-sky-700 hover:bg-sky-600 px-3 py-2 rounded-lg text-sm font-bold">
              Custom Game
            </button>
          </div>

          {showPresetControls && (
            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="text-sm font-bold text-purple-300">Saved Presets ({isOwner ? 'global save enabled' : 'saved locally'})</div>
              <div className="grid md:grid-cols-[1fr_1fr_auto] gap-2">
                <input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name" className="bg-gray-700 rounded p-2" />
                <input value={presetDescription} onChange={(e) => setPresetDescription(e.target.value)} placeholder="Description (optional)" className="bg-gray-700 rounded p-2" />
                <button
                  onClick={async () => {
                    await savePreset(presetName, presetDescription);
                    setPresetName('');
                    setPresetDescription('');
                  }}
                  className="bg-emerald-700 hover:bg-emerald-600 px-3 py-2 rounded-lg text-sm font-bold"
                >
                  Save
                </button>
              </div>
              {!!savedPresets.length && (
                <div className="flex flex-wrap gap-2">
                  {savedPresets.map((preset) => (
                    <button key={`${preset.source}-${preset.id}`} onClick={() => loadPreset(preset)} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-xs">
                      {preset.name} <span className="text-gray-400">({preset.source})</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="font-bold text-purple-300">Difficulty: Game Level / Per Round</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={settings.difficultyScope} onChange={(e) => setSettings({ ...settings, difficultyScope: e.target.value as 'game' | 'round' })} className="bg-gray-700 rounded p-2">
                  <option value="game">Game level</option>
                  <option value="round">Per round</option>
                </select>
                <select value={settings.difficultyMode} onChange={(e) => setSettings({ ...settings, difficultyMode: e.target.value as PartySettings['difficultyMode'] })} className="bg-gray-700 rounded p-2">
                  <option value="set">Set</option>
                  <option value="scaling_incremental">Scaling – Incremental</option>
                  <option value="scaling_performance">Scaling – Performance-based</option>
                  <option value="random">Random</option>
                </select>
              </div>
              {settings.difficultyMode === 'set' && (
                <select value={settings.fixedDifficulty} onChange={(e) => setSettings({ ...settings, fixedDifficulty: e.target.value as PartySettings['fixedDifficulty'] })} className="bg-gray-700 rounded p-2 w-full">
                  <option value="very_easy">Very Easy</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="very_hard">Very Hard</option>
                </select>
              )}
            </div>
            <div className="bg-gray-900 rounded-lg p-3 space-y-2">
              <div className="font-bold text-purple-300">Categories: Game Level / Per Round</div>
              <div className="grid grid-cols-2 gap-2">
                <select value={settings.categoryScope} onChange={(e) => setSettings({ ...settings, categoryScope: e.target.value as 'game' | 'round' })} className="bg-gray-700 rounded p-2">
                  <option value="game">Game level</option>
                  <option value="round">Per round</option>
                </select>
                <select value={settings.categoryMode} onChange={(e) => setSettings({ ...settings, categoryMode: e.target.value as PartySettings['categoryMode'] })} className="bg-gray-700 rounded p-2">
                  <option value="balanced">Balanced</option>
                  <option value="cycle">Cycle</option>
                  <option value="random">Random</option>
                  <option value="choice">Choice</option>
                </select>
              </div>
              <input
                value={settings.categoryTheme}
                onChange={(e) => setSettings({ ...settings, categoryTheme: e.target.value })}
                placeholder="Theme category (optional)"
                className="bg-gray-700 rounded p-2 w-full"
              />
              <input
                value={settings.categoryOptions.join(', ')}
                onChange={(e) => setSettings({ ...settings, categoryOptions: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                placeholder="Choice options (comma separated)"
                className="bg-gray-700 rounded p-2 w-full"
              />
              <input
                value={settings.excludedCategories.join(', ')}
                onChange={(e) => setSettings({ ...settings, excludedCategories: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) })}
                placeholder="Excluded categories (comma separated)"
                className="bg-gray-700 rounded p-2 w-full"
              />
            </div>
          </div>

          <div className="space-y-3">
            {settings.rounds.map((round, roundIndex) => (
              <div key={round.id} className="bg-gray-900 rounded-xl p-3 space-y-2">
                <div className="flex flex-wrap gap-2 items-center">
                  <input value={round.name} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, name: e.target.value };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2 font-bold" />
                  <select value={round.mode} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, mode: e.target.value as typeof round.mode };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2">
                    <option value="configured">Configured</option>
                    <option value="fully_random">Fully Random</option>
                    <option value="player_choice">Player&apos;s Choice</option>
                    <option value="random_from_options">Random from Options</option>
                  </select>
                  <select value={round.order} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, order: e.target.value as typeof round.order };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2">
                    <option value="fixed">Fixed order</option>
                    <option value="randomized">Randomized order</option>
                  </select>
                  <input type="number" min={1} max={50} value={round.questionCount} onChange={(e) => {
                    const next = [...settings.rounds];
                    next[roundIndex] = { ...round, questionCount: Math.max(1, Number(e.target.value || 1)) };
                    setSettings({ ...settings, rounds: next });
                  }} className="bg-gray-700 rounded p-2 w-20" />
                  <button
                    onClick={() => setSettings({ ...settings, rounds: settings.rounds.filter((_, i) => i !== roundIndex) })}
                    className="bg-red-700 hover:bg-red-600 px-3 py-2 rounded text-sm"
                  >
                    Remove
                  </button>
                </div>

                {(settings.difficultyScope === 'round' || settings.categoryScope === 'round') && (
                  <div className="grid md:grid-cols-2 gap-2">
                    {settings.difficultyScope === 'round' && (
                      <select
                        value={round.difficulty || 'mixed'}
                        onChange={(e) => {
                          const next = [...settings.rounds];
                          next[roundIndex] = { ...round, difficulty: e.target.value as typeof round.difficulty };
                          setSettings({ ...settings, rounds: next });
                        }}
                        className="bg-gray-700 rounded p-2"
                      >
                        <option value="mixed">Round difficulty: Mixed</option>
                        <option value="very_easy">Round difficulty: Very Easy</option>
                        <option value="easy">Round difficulty: Easy</option>
                        <option value="medium">Round difficulty: Medium</option>
                        <option value="hard">Round difficulty: Hard</option>
                        <option value="very_hard">Round difficulty: Very Hard</option>
                      </select>
                    )}
                    {settings.categoryScope === 'round' && (
                      <select
                        value={round.categoryMode || 'random'}
                        onChange={(e) => {
                          const next = [...settings.rounds];
                          next[roundIndex] = { ...round, categoryMode: e.target.value as PartySettings['categoryMode'] };
                          setSettings({ ...settings, rounds: next });
                        }}
                        className="bg-gray-700 rounded p-2"
                      >
                        <option value="balanced">Round categories: Balanced</option>
                        <option value="cycle">Round categories: Cycle</option>
                        <option value="random">Round categories: Random</option>
                        <option value="choice">Round categories: Choice</option>
                      </select>
                    )}
                  </div>
                )}

                {(round.mode === 'player_choice' || round.mode === 'random_from_options') && (
                  <input
                    value={round.options.join(', ')}
                    onChange={(e) => {
                      const options = e.target.value.split(',').map((value) => value.trim() as AnyQuestion['type']).filter((value) => PARTY_TYPES.includes(value));
                      const next = [...settings.rounds];
                      next[roundIndex] = { ...round, options };
                      setSettings({ ...settings, rounds: next });
                    }}
                    placeholder="Options (comma separated question types)"
                    className="bg-gray-700 rounded p-2 w-full"
                  />
                )}

                {round.mode === 'configured' && (
                  <div className="space-y-2">
                    {round.slots.map((slot, slotIndex) => (
                      <div key={slot.id} className={`grid gap-2 ${getSlotGridColumns(slot.type)}`}>
                        <select value={slot.type} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, type: e.target.value as AnyQuestion['type'] };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          {PARTY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                        </select>
                        <input type="number" min={1} max={30} value={slot.count} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, count: Math.max(1, Number(e.target.value || 1)) };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2" />
                        <select value={slot.order} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, order: e.target.value as typeof slot.order };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          <option value="fixed">Fixed</option>
                          <option value="randomized">Randomized</option>
                        </select>
                        {slot.type === 'list' && (
                          <>
                            <select value={slot.listMode} onChange={(e) => {
                              const rounds = [...settings.rounds];
                              const slots = [...round.slots];
                              slots[slotIndex] = { ...slot, listMode: e.target.value as typeof slot.listMode };
                              rounds[roundIndex] = { ...round, slots };
                              setSettings({ ...settings, rounds });
                            }} className="bg-gray-700 rounded p-2">
                              <option value="timed">List: Timed</option>
                              <option value="strikes">List: 3 Strikes</option>
                              <option value="unlimited">List: Unlimited</option>
                              <option value="random">List: Random</option>
                            </select>
                            <select value={slot.listScoring} onChange={(e) => {
                              const rounds = [...settings.rounds];
                              const slots = [...round.slots];
                              slots[slotIndex] = { ...slot, listScoring: e.target.value as typeof slot.listScoring };
                              rounds[roundIndex] = { ...round, slots };
                              setSettings({ ...settings, rounds });
                            }} className="bg-gray-700 rounded p-2">
                              <option value="target">Goal: Target</option>
                              <option value="as_many">Goal: Name as Many</option>
                              <option value="random">Goal: Random</option>
                            </select>
                          </>
                        )}
                        {slot.type === 'grouping' && (
                          <select value={slot.groupingMode ?? DEFAULT_GROUPING_MODE} onChange={(e) => {
                            const rounds = [...settings.rounds];
                            const slots = [...round.slots];
                            slots[slotIndex] = { ...slot, groupingMode: e.target.value as NonNullable<typeof slot.groupingMode> };
                            rounds[roundIndex] = { ...round, slots };
                            setSettings({ ...settings, rounds });
                          }} className="bg-gray-700 rounded p-2">
                            <option value="elimination">Grouping: Elimination</option>
                            <option value="continuous">Grouping: Continuous</option>
                            <option value="turns">Grouping: Turns</option>
                            <option value="blitz">Grouping: Blitz</option>
                          </select>
                        )}
                        {slot.type === 'ranking' && (
                          <select value={slot.rankingMode ?? DEFAULT_RANKING_MODE} onChange={(e) => {
                            const rounds = [...settings.rounds];
                            const slots = [...round.slots];
                            slots[slotIndex] = { ...slot, rankingMode: e.target.value as NonNullable<typeof slot.rankingMode> };
                            rounds[roundIndex] = { ...round, slots };
                            setSettings({ ...settings, rounds });
                          }} className="bg-gray-700 rounded p-2">
                            <option value="anchor_adjust">Ranking: Anchor Adjust</option>
                            <option value="one_shot">Ranking: One Shot</option>
                            <option value="turns">Ranking: Turns</option>
                            <option value="blitz">Ranking: Blitz</option>
                          </select>
                        )}
                        <select value={slot.categoryStrategy ?? DEFAULT_SLOT_CATEGORY_STRATEGY} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          slots[slotIndex] = { ...slot, categoryStrategy: e.target.value as NonNullable<typeof slot.categoryStrategy> };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} className="bg-gray-700 rounded p-2">
                          <option value="any">Category: Any</option>
                          <option value="same_round">Category: Same as Round</option>
                          <option value="unique_round">Category: Unique per Round</option>
                          <option value="rotate_round">Category: Rotate</option>
                          <option value="player_choice">Category: Player Chooses</option>
                        </select>
                        <input type="number" min={0} max={300} value={slot.timeLimitSec || 0} onChange={(e) => {
                          const rounds = [...settings.rounds];
                          const slots = [...round.slots];
                          const parsed = Number(e.target.value || 0);
                          slots[slotIndex] = { ...slot, timeLimitSec: parsed > 0 ? parsed : undefined };
                          rounds[roundIndex] = { ...round, slots };
                          setSettings({ ...settings, rounds });
                        }} placeholder="Time (sec)" className="bg-gray-700 rounded p-2" />
                        {slot.type === 'this_or_that' && (
                          <div className="text-xs text-blue-200 md:col-span-2">
                            For This or That, this time limit applies to each item.
                          </div>
                        )}
                        <button onClick={() => {
                          const rounds = [...settings.rounds];
                          rounds[roundIndex] = { ...round, slots: round.slots.filter((_, i) => i !== slotIndex) };
                          setSettings({ ...settings, rounds });
                        }} className="bg-red-700 hover:bg-red-600 rounded p-2">
                          Remove
                        </button>
                      </div>
                    ))}
                    <button onClick={() => {
                      const rounds = [...settings.rounds];
                      rounds[roundIndex] = {
                        ...round,
                        slots: [
                          ...round.slots,
                          createDefaultConfiguredSlot(`${round.id}-slot-${round.slots.length + 1}`, 1),
                        ],
                      };
                      setSettings({ ...settings, rounds });
                    }} className="bg-purple-700 hover:bg-purple-600 px-3 py-2 rounded-lg text-sm">
                      + Add slot
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                if (settings.rounds.length >= 10) return;
                setSettings({
                  ...settings,
                  rounds: [
                    ...settings.rounds,
                    {
                      id: `round-${settings.rounds.length + 1}`,
                      name: `Round ${settings.rounds.length + 1}`,
                      mode: 'configured',
                      order: 'fixed',
                      questionCount: 10,
                      slots: [createDefaultConfiguredSlot(`round-${settings.rounds.length + 1}-slot-1`, 10)],
                      options: ['multiple_choice', 'open_ended', 'list'],
                      difficulty: 'mixed',
                      categoryMode: 'random',
                    },
                  ],
                });
              }}
              className="bg-purple-700 hover:bg-purple-600 px-4 py-2 rounded-lg font-bold"
            >
              + Add Round
            </button>
            {!hideDefaultActionButtons && (
              <>
                <button
                  onClick={startGame}
                  disabled={!hasQuestions}
                  className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 px-4 py-2 rounded-lg font-bold"
                >
                  Start Party ({totalQuestions} planned)
                </button>
                <button
                  onClick={startMultiplayerHost}
                  disabled={!hasQuestions}
                  className="bg-cyan-700 hover:bg-cyan-600 disabled:bg-gray-700 px-4 py-2 rounded-lg font-bold"
                >
                  Host Multiplayer (Room Code)
                </button>
              </>
            )}
            {footerContent}
          </div>
        </div>
      </div>
    </div>
  );
}
