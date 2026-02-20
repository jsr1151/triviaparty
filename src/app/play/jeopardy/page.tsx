'use client';
import { useState, useEffect, useCallback } from 'react';
import type {
  JeopardyGameData,
  JeopardyIndexEntry,
  JeopardyClueData,
  JeopardyFilter,
} from '@/types/jeopardy';
import {
  buildReplayBoard,
  buildRandomBoard,
  buildCustomBoard,
  searchClues,
  getClueUserData,
} from '@/lib/clue-store';
import ClueModal from './components/ClueModal';

// ── Internal UI types ────────────────────────────────────────────────────────

interface JeopardyClue extends JeopardyClueData {
  id: string;   // React key (= clueId when available, else synthetic)
}

interface JeopardyCategory {
  id: string;
  name: string;
  round: string;
  position: number;
  clues: JeopardyClue[];
}

interface JeopardyGame {
  id: string;
  gameId?: number;
  showNumber: number;
  airDate: string;
  season: number | null;
  isSpecial: boolean;
  tournamentType: string | null;
  categories: JeopardyCategory[];
}

type GameMode = 'replay' | 'random' | 'custom';
type Cell = { revealed: boolean; clue: JeopardyClue };
type Board = Record<string, Record<number, Cell>>;

// ── Normalisation helpers ────────────────────────────────────────────────────

function normaliseApiGame(g: Record<string, unknown>): JeopardyGame {
  const cats = ((g.categories as Record<string, unknown>[]) ?? []).map(cat => ({
    id: String(cat.id ?? Math.random()),
    name: String(cat.name ?? ''),
    round: String(cat.round ?? 'single'),
    position: Number(cat.position ?? 0),
    clues: ((cat.clues as Record<string, unknown>[]) ?? []).map((cl, i) => ({
      id: String(cl.id ?? cl.clueId ?? Math.random()),
      clueId: String(cl.clueId ?? ''),
      question: String(cl.question ?? ''),
      answer: String(cl.answer ?? ''),
      value: cl.value != null ? Number(cl.value) : null,
      dailyDouble: Boolean(cl.dailyDouble),
      tripleStumper: Boolean(cl.tripleStumper),
      isFinalJeopardy: String(cat.round) === 'final',
      category: String(cat.name ?? ''),
      round: String(cat.round ?? 'single') as 'single' | 'double' | 'final',
      rowIndex: Number(cl.rowIndex ?? i),
    })),
  }));
  return {
    id: String(g.id ?? Math.random()),
    gameId: g.gameId != null ? Number(g.gameId) : undefined,
    showNumber: Number(g.showNumber ?? 0),
    airDate: String(g.airDate ?? ''),
    season: g.season != null ? Number(g.season) : null,
    isSpecial: Boolean(g.isSpecial),
    tournamentType: g.tournamentType != null ? String(g.tournamentType) : null,
    categories: cats,
  };
}

function normaliseJsonGame(g: JeopardyGameData): JeopardyGame {
  return {
    id: String(g.gameId),
    gameId: g.gameId,
    showNumber: g.showNumber,
    airDate: g.airDate,
    season: g.season,
    isSpecial: g.isSpecial,
    tournamentType: g.tournamentType,
    categories: g.categories.map((cat, ci) => ({
      id: `${g.gameId}-${ci}`,
      name: cat.name,
      round: cat.round,
      position: cat.position,
      clues: cat.clues.map((cl, li) => ({
        ...cl,
        id: cl.clueId || `${g.gameId}-${ci}-${li}`,
      })),
    })),
  };
}

// ── Main page ────────────────────────────────────────────────────────────────

const VALUES_SINGLE = [200, 400, 600, 800, 1000];
const VALUES_DOUBLE = [400, 800, 1200, 1600, 2000];

export default function JeopardyPage() {
  // ── Data loading
  const [allGames, setAllGames] = useState<JeopardyGameData[]>([]);
  const [displayGames, setDisplayGames] = useState<JeopardyGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'api' | 'files' | 'empty'>('api');

  // ── Mode selection
  const [gameMode, setGameMode] = useState<GameMode>('replay');

  // ── Active board
  const [selectedGame, setSelectedGame] = useState<JeopardyGame | null>(null);
  const [board, setBoard] = useState<Board>({});
  const [activeClue, setActiveClue] = useState<{ clue: JeopardyClue; catId: string; value: number } | null>(null);
  const [score, setScore] = useState(0);
  const [currentRound, setCurrentRound] = useState<'single' | 'double' | 'final'>('single');

  // ── Custom mode filter state
  const [customFilter, setCustomFilter] = useState<JeopardyFilter>({});
  const [customSearch, setCustomSearch] = useState('');
  const [customBuilding, setCustomBuilding] = useState(false);

  // ── Load all games on mount ──────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

      // 1. Try static JSON files first (works for GitHub Pages and local scraped data)
      try {
        const idxRes = await fetch(`${base}/data/jeopardy/index.json`, { cache: 'no-store' });
        const index: JeopardyIndexEntry[] = await idxRes.json();
        if (index.length > 0) {
          const rawGames: JeopardyGameData[] = [];
          const uiGames: JeopardyGame[] = [];
          for (const entry of index) {
            try {
              const gRes = await fetch(`${base}/data/jeopardy/${entry.file}`, { cache: 'no-store' });
              if (!gRes.ok) continue;
              const gData: JeopardyGameData = await gRes.json();
              rawGames.push(gData);
              uiGames.push(normaliseJsonGame(gData));
            } catch {
              continue;
            }
          }
          if (uiGames.length > 0) {
            setAllGames(rawGames);
            setDisplayGames(uiGames);
            setDataSource('files');
            setLoading(false);
            return;
          }
        }
      } catch { /* fall through */ }

      // 2. Fall back to API (Vercel / local server with DB)
      try {
        const res = await fetch('/api/jeopardy');
        const data = await res.json();
        const apiGames: JeopardyGame[] = (data.games ?? []).map(normaliseApiGame);
        if (apiGames.length > 0) {
          setDisplayGames(apiGames);
          setDataSource('api');
          setLoading(false);
          return;
        }
      } catch { /* fall through */ }

      setDataSource('empty');
      setLoading(false);
    }
    load();
  }, []);

  // ── Board builders ───────────────────────────────────────────────────────

  function buildBoard(game: JeopardyGame, round: 'single' | 'double' | 'final') {
    const cats = game.categories.filter(c => c.round === round);
    const vals = round === 'double' ? VALUES_DOUBLE : VALUES_SINGLE;
    const newBoard: Board = {};
    cats.forEach(cat => {
      newBoard[cat.id] = {};
      cat.clues.forEach((clue, idx) => {
        newBoard[cat.id][vals[idx] ?? (idx + 1) * 200] = { revealed: false, clue };
      });
    });
    setBoard(newBoard);
    setActiveClue(null);
    setCurrentRound(round);
  }

  function startReplay(game: JeopardyGame) {
    setSelectedGame(game);
    buildBoard(game, 'single');
    setScore(0);
  }

  function startRandom() {
    if (allGames.length === 0) return;
    const rawCats = buildRandomBoard(allGames);
    const fakeGame: JeopardyGame = {
      id: 'random-' + Date.now(),
      showNumber: 0,
      airDate: '',
      season: null,
      isSpecial: false,
      tournamentType: null,
      categories: rawCats.map((cat, ci) => ({
        id: `rnd-${ci}`,
        name: cat.name,
        round: cat.round,
        position: cat.position,
        clues: cat.clues.map((cl, li) => ({
          ...cl,
          id: cl.clueId || `rnd-${ci}-${li}`,
        })),
      })),
    };
    setSelectedGame(fakeGame);
    buildBoard(fakeGame, 'single');
    setScore(0);
  }

  async function startCustom() {
    setCustomBuilding(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const filter: JeopardyFilter = {
      ...customFilter,
      search: customSearch || undefined,
    };
    try {
      const results = await searchClues(base, filter, 300);
      const rawCats = buildCustomBoard(results);
      if (rawCats.length === 0) {
        alert('No clues matched your filter. Try relaxing the criteria.');
        setCustomBuilding(false);
        return;
      }
      const fakeGame: JeopardyGame = {
        id: 'custom-' + Date.now(),
        showNumber: 0,
        airDate: '',
        season: null,
        isSpecial: false,
        tournamentType: null,
        categories: rawCats.map((cat, ci) => ({
          id: `cst-${ci}`,
          name: cat.name,
          round: cat.round,
          position: cat.position,
          clues: cat.clues.map((cl, li) => ({
            ...cl,
            id: cl.clueId || `cst-${ci}-${li}`,
          })),
        })),
      };
      setSelectedGame(fakeGame);
      buildBoard(fakeGame, 'single');
      setScore(0);
    } catch {
      alert('Error building custom game. Make sure games are loaded.');
    }
    setCustomBuilding(false);
  }

  // ── Clue interaction ─────────────────────────────────────────────────────

  function selectClue(clue: JeopardyClue, catId: string, value: number) {
    setActiveClue({ clue, catId, value });
  }

  function handleCorrect() {
    setScore(s => s + (activeClue?.value || 0));
    revealClue();
  }

  function handleIncorrect() {
    setScore(s => s - (activeClue?.value || 0));
    revealClue();
  }

  function revealClue() {
    if (!activeClue) return;
    setBoard(prev => ({
      ...prev,
      [activeClue.catId]: {
        ...prev[activeClue.catId],
        [activeClue.value]: { ...prev[activeClue.catId][activeClue.value], revealed: true },
      },
    }));
    setActiveClue(null);
  }

  // ── Render helpers ───────────────────────────────────────────────────────

  function renderBoard() {
    if (!selectedGame) return null;
    const roundCats = selectedGame.categories.filter(c => c.round === currentRound);
    const vals = currentRound === 'double' ? VALUES_DOUBLE : VALUES_SINGLE;

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {roundCats.map(cat => (
                <th key={cat.id}
                  className="bg-blue-800 p-3 text-center text-sm font-bold uppercase border border-blue-900">
                  {cat.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vals.map(val => (
              <tr key={val}>
                {roundCats.map(cat => {
                  const cell = board[cat.id]?.[val];
                  if (!cell) return <td key={cat.id} className="border border-blue-900 p-1"><div className="w-full h-16 bg-blue-900 rounded" /></td>;
                  const ud = cell.clue.clueId ? getClueUserData(cell.clue.clueId) : null;
                  const isFlagged = ud?.flagged;
                  const isMediaFlagged = ud?.mediaFlag;
                  return (
                    <td key={cat.id} className="border border-blue-900 p-1">
                      {!cell.revealed ? (
                        <button onClick={() => selectClue(cell.clue, cat.id, val)}
                          className={`w-full h-16 font-bold text-xl rounded transition-colors relative
                            ${cell.clue.tripleStumper
                              ? 'bg-orange-800 hover:bg-orange-700 text-yellow-400'
                              : 'bg-blue-700 hover:bg-blue-600 text-yellow-400'}`}>
                          ${val}
                          {(isFlagged || isMediaFlagged) && (
                            <span className="absolute top-1 right-1 text-xs">
                              {isFlagged ? '🚩' : ''}{isMediaFlagged ? '🎬' : ''}
                            </span>
                          )}
                        </button>
                      ) : (
                        <div className="w-full h-16 bg-blue-900 rounded" />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-2xl">
        Loading…
      </div>
    );
  }

  // ── Active board ─────────────────────────────────────────────────────────

  if (selectedGame) {
    const isRandom = selectedGame.id.startsWith('random-');
    const isCustom = selectedGame.id.startsWith('custom-');
    const title = isRandom
      ? 'Random Game'
      : isCustom
        ? 'Custom Game'
        : `Show #${selectedGame.showNumber}`;

    return (
      <div className="min-h-screen bg-blue-950 text-white p-4">
        <div className="flex justify-between items-center mb-4">
          <button onClick={() => setSelectedGame(null)} className="text-yellow-400 hover:underline">
            ← Back
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-yellow-400">{title}</h1>
            {!isRandom && !isCustom && (
              <div className="text-sm text-gray-300">
                {selectedGame.airDate}
                {selectedGame.season && ` · Season ${selectedGame.season}`}
                {selectedGame.isSpecial && (
                  <span className="ml-2 bg-yellow-400 text-blue-950 text-xs font-bold px-2 py-0.5 rounded-full">
                    {selectedGame.tournamentType ?? 'Special'}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="text-2xl font-bold">${score.toLocaleString()}</div>
        </div>

        {!isRandom && !isCustom && (
          <div className="flex gap-2 mb-4">
            {(['single', 'double'] as const).map(r => (
              <button key={r}
                onClick={() => buildBoard(selectedGame, r)}
                className={`px-4 py-2 rounded-lg font-bold ${currentRound === r ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>
                {r === 'single' ? 'Jeopardy!' : 'Double Jeopardy!'}
              </button>
            ))}
          </div>
        )}

        {activeClue && (
          <ClueModal
            clue={activeClue.clue}
            value={activeClue.value}
            onCorrect={handleCorrect}
            onIncorrect={handleIncorrect}
            onSkip={revealClue}
          />
        )}

        {renderBoard()}
      </div>
    );
  }

  // ── Game selection / mode screen ─────────────────────────────────────────

  return (
    <div className="min-h-screen bg-blue-950 text-white p-8">
      <h1 className="text-4xl font-bold text-yellow-400 mb-2 text-center">Jeopardy!</h1>
      {dataSource === 'files' && (
        <p className="text-center text-blue-300 text-sm mb-4">
          {displayGames.length} game{displayGames.length !== 1 ? 's' : ''} loaded from local JSON files
        </p>
      )}

      {/* Mode tabs */}
      <div className="flex justify-center gap-2 mb-8">
        {(['replay', 'random', 'custom'] as GameMode[]).map(m => (
          <button key={m}
            onClick={() => setGameMode(m)}
            className={`px-5 py-2 rounded-lg font-bold capitalize transition-colors ${
              gameMode === m ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'
            }`}>
            {m === 'replay' ? '📼 Replay' : m === 'random' ? '🎲 Random' : '🔧 Custom'}
          </button>
        ))}
      </div>

      {/* ── REPLAY MODE ── */}
      {gameMode === 'replay' && (
        <>
          {displayGames.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
              {displayGames.map(game => (
                <button key={game.id} onClick={() => startReplay(game)}
                  className="bg-blue-800 hover:bg-blue-700 rounded-xl p-6 text-left transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xl font-bold">Show #{game.showNumber}</span>
                    {game.isSpecial && (
                      <span className="bg-yellow-400 text-blue-950 text-xs font-bold px-2 py-0.5 rounded-full">
                        {game.tournamentType ?? 'Special'}
                      </span>
                    )}
                  </div>
                  <div className="text-gray-300 text-sm">{game.airDate}</div>
                  {game.season && <div className="text-blue-300 text-sm">Season {game.season}</div>}
                  <div className="text-sm text-blue-300 mt-2">{game.categories.length} categories</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── RANDOM MODE ── */}
      {gameMode === 'random' && (
        <div className="max-w-lg mx-auto text-center">
          {allGames.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="text-gray-300 mb-6">
                Picks 6 random categories and 5 random clues from each, drawn from all {allGames.length} loaded game{allGames.length !== 1 ? 's' : ''}.
              </p>
              <button onClick={startRandom}
                className="bg-yellow-400 text-blue-950 px-10 py-4 rounded-xl font-bold text-xl hover:bg-yellow-300 transition-colors">
                🎲 Build Random Game
              </button>
            </>
          )}
        </div>
      )}

      {/* ── CUSTOM MODE ── */}
      {gameMode === 'custom' && (
        <div className="max-w-2xl mx-auto">
          {allGames.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <p className="text-gray-300 mb-4 text-center">
                Filter clues across all {allGames.length} game{allGames.length !== 1 ? 's' : ''} and build a custom board.
              </p>

              <div className="bg-blue-900 rounded-xl p-6 space-y-4 mb-6">
                {/* Text search */}
                <div>
                  <label className="block text-sm font-bold text-blue-300 mb-1">Search clues</label>
                  <input
                    type="text"
                    value={customSearch}
                    onChange={e => setCustomSearch(e.target.value)}
                    placeholder="Search question text, answer, or category…"
                    className="w-full bg-blue-800 text-white placeholder-blue-400 border border-blue-600 rounded-lg px-3 py-2"
                  />
                </div>

                {/* Boolean filters */}
                <div>
                  <label className="block text-sm font-bold text-blue-300 mb-2">Clue type</label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { key: 'tripleStumpersOnly', label: '🔴 Triple Stumpers' },
                      { key: 'dailyDoublesOnly', label: '⭐ Daily Doubles' },
                      { key: 'finalOnly', label: '🎯 Final Jeopardy only' },
                      { key: 'flaggedOnly', label: '🚩 My Flagged' },
                      { key: 'mediaFlaggedOnly', label: '🎬 Media Flagged' },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(customFilter[key as keyof JeopardyFilter])}
                          onChange={e => setCustomFilter(f => ({ ...f, [key]: e.target.checked || undefined }))}
                          className="w-4 h-4 rounded"
                        />
                        <span className="text-sm">{label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Value range */}
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-blue-300 mb-1">Min value ($)</label>
                    <input
                      type="number"
                      step="200"
                      min="0"
                      value={customFilter.minValue ?? ''}
                      onChange={e => setCustomFilter(f => ({ ...f, minValue: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder="e.g. 800"
                      className="w-full bg-blue-800 text-white placeholder-blue-400 border border-blue-600 rounded-lg px-3 py-2"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-sm font-bold text-blue-300 mb-1">Max value ($)</label>
                    <input
                      type="number"
                      step="200"
                      min="0"
                      value={customFilter.maxValue ?? ''}
                      onChange={e => setCustomFilter(f => ({ ...f, maxValue: e.target.value ? Number(e.target.value) : undefined }))}
                      placeholder="e.g. 2000"
                      className="w-full bg-blue-800 text-white placeholder-blue-400 border border-blue-600 rounded-lg px-3 py-2"
                    />
                  </div>
                </div>

                {/* Topic tags */}
                <div>
                  <label className="block text-sm font-bold text-blue-300 mb-1">Topic tags (must have all)</label>
                  <input
                    type="text"
                    placeholder="e.g. art, history (comma-separated)"
                    defaultValue={(customFilter.topicTags ?? []).join(', ')}
                    onChange={e => {
                      const tags = e.target.value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
                      setCustomFilter(f => ({ ...f, topicTags: tags.length ? tags : undefined }));
                    }}
                    className="w-full bg-blue-800 text-white placeholder-blue-400 border border-blue-600 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={startCustom}
                disabled={customBuilding}
                className="w-full bg-yellow-400 text-blue-950 py-4 rounded-xl font-bold text-xl hover:bg-yellow-300 transition-colors disabled:opacity-50">
                {customBuilding ? 'Building…' : '🔧 Build Custom Game'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Empty state component ─────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="text-center text-gray-300 max-w-xl mx-auto">
      <p className="text-xl mb-4">No games loaded yet.</p>
      <p className="mb-2">Scrape J-Archive games and commit the JSON files:</p>
      <pre className="bg-blue-900 rounded-xl p-4 text-left text-sm text-yellow-200 mt-4 overflow-x-auto">
{`# Scrape individual games
npm run scrape -- 8000 8001 8002

# Or scrape a whole season
npm run scrape -- --season 40

# Commit and push to publish on GitHub Pages
git add public/data/jeopardy/
git commit -m "feat: add scraped games"
git push`}
      </pre>
    </div>
  );
}
