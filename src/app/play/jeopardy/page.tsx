'use client';
import { useState, useEffect } from 'react';
import type { JeopardyGameData, JeopardyIndexEntry, JeopardyClueData } from '@/types/jeopardy';

// Re-use the same shape for games coming from either the API or JSON files
interface JeopardyClue extends JeopardyClueData {
  id: string;   // synthetic id used only as React key
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

type Cell = { revealed: boolean; clue: JeopardyClue };
type Board = Record<string, Record<number, Cell>>;

/** Normalise an API response object to our unified JeopardyGame shape */
function normaliseApiGame(g: Record<string, unknown>): JeopardyGame {
  const cats = ((g.categories as Record<string, unknown>[]) ?? []).map(cat => ({
    id: String(cat.id ?? Math.random()),
    name: String(cat.name ?? ''),
    round: String(cat.round ?? 'single'),
    position: Number(cat.position ?? 0),
    clues: ((cat.clues as Record<string, unknown>[]) ?? []).map(cl => ({
      id: String(cl.id ?? Math.random()),
      question: String(cl.question ?? ''),
      answer: String(cl.answer ?? ''),
      value: cl.value != null ? Number(cl.value) : null,
      dailyDouble: Boolean(cl.dailyDouble),
      tripleStumper: Boolean(cl.tripleStumper),
      isFinalJeopardy: String(cat.round) === 'final',
      category: String(cat.name ?? ''),
      round: String(cat.round ?? 'single') as 'single' | 'double' | 'final',
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

/** Convert a JeopardyGameData (from JSON file) to the unified shape */
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
        id: `${g.gameId}-${ci}-${li}`,
        ...cl,
      })),
    })),
  };
}

export default function JeopardyPage() {
  const [games, setGames] = useState<JeopardyGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<JeopardyGame | null>(null);
  const [board, setBoard] = useState<Board>({});
  const [activeClue, setActiveClue] = useState<{ clue: JeopardyClue; catId: string; value: number } | null>(null);
  const [score, setScore] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [currentRound, setCurrentRound] = useState<'single' | 'double' | 'final'>('single');
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'api' | 'files' | 'empty'>('api');

  useEffect(() => {
    async function loadGames() {
      // 1. Try the API (works on Vercel / local server with a DB)
      try {
        const res = await fetch('/api/jeopardy');
        const data = await res.json();
        const apiGames: JeopardyGame[] = (data.games ?? []).map(normaliseApiGame);
        if (apiGames.length > 0) {
          setGames(apiGames);
          setSource('api');
          setLoading(false);
          return;
        }
      } catch { /* fall through */ }

      // 2. Fall back to static JSON files in public/data/jeopardy/
      //    (works on GitHub Pages — no server needed)
      try {
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        const idxRes = await fetch(`${base}/data/jeopardy/index.json`);
        const index: JeopardyIndexEntry[] = await idxRes.json();
        if (index.length > 0) {
          const loaded: JeopardyGame[] = [];
          for (const entry of index) {
            const gRes = await fetch(`${base}/data/jeopardy/${entry.file}`);
            const gData: JeopardyGameData = await gRes.json();
            loaded.push(normaliseJsonGame(gData));
          }
          setGames(loaded);
          setSource('files');
          setLoading(false);
          return;
        }
      } catch { /* fall through */ }

      setSource('empty');
      setLoading(false);
    }
    loadGames();
  }, []);

  const VALUES = { single: [200, 400, 600, 800, 1000], double: [400, 800, 1200, 1600, 2000] };

  function loadGame(game: JeopardyGame) {
    setSelectedGame(game);
    setCurrentRound('single');
    buildBoard(game, 'single');
    setScore(0);
  }

  function buildBoard(game: JeopardyGame, round: 'single' | 'double' | 'final') {
    const cats = game.categories.filter(c => c.round === round);
    const newBoard: Board = {};
    cats.forEach(cat => {
      newBoard[cat.id] = {};
      const vals = round === 'double' ? VALUES.double : VALUES.single;
      cat.clues.forEach((clue, idx) => {
        newBoard[cat.id][vals[idx] || (idx + 1) * 200] = { revealed: false, clue };
      });
    });
    setBoard(newBoard);
    setActiveClue(null);
    setShowAnswer(false);
  }

  function selectClue(clue: JeopardyClue, catId: string, value: number) {
    setActiveClue({ clue, catId, value });
    setShowAnswer(false);
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
    setShowAnswer(false);
  }

  if (loading) {
    return <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-2xl">Loading...</div>;
  }

  if (!selectedGame) {
    return (
      <div className="min-h-screen bg-blue-950 text-white p-8">
        <h1 className="text-4xl font-bold text-yellow-400 mb-2 text-center">Jeopardy!</h1>
        {source === 'files' && (
          <p className="text-center text-blue-300 text-sm mb-6">Loaded from local JSON files</p>
        )}
        {games.length === 0 ? (
          <div className="text-center text-gray-300 max-w-xl mx-auto">
            <p className="text-xl mb-4">No games loaded yet.</p>
            <p className="mb-2">To play, scrape some J-Archive games and commit the JSON files:</p>
            <pre className="bg-blue-900 rounded-xl p-4 text-left text-sm text-yellow-200 mt-4 overflow-x-auto">
{`# Scrape individual games
npm run scrape -- 8000 8001 8002

# Or scrape a whole season
npm run scrape -- --season 40

# Then commit the files so GitHub Pages serves them
git add public/data/jeopardy/
git commit -m "feat: add scraped games"
git push`}
            </pre>
            <p className="mt-4 text-sm text-blue-300">
              Or, deploy to Vercel and use the scrape API to store games in a database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {games.map(game => (
              <button key={game.id} onClick={() => loadGame(game)}
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
                {game.season && (
                  <div className="text-blue-300 text-sm">Season {game.season}</div>
                )}
                <div className="text-sm text-blue-300 mt-2">{game.categories.length} categories</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const roundCats = selectedGame.categories.filter(c => c.round === currentRound);
  const vals = currentRound === 'double' ? VALUES.double : VALUES.single;

  return (
    <div className="min-h-screen bg-blue-950 text-white p-4">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => setSelectedGame(null)} className="text-yellow-400 hover:underline">← Back</button>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-yellow-400">Show #{selectedGame.showNumber}</h1>
          <div className="text-sm text-gray-300">
            {selectedGame.airDate}
            {selectedGame.season && ` · Season ${selectedGame.season}`}
            {selectedGame.isSpecial && (
              <span className="ml-2 bg-yellow-400 text-blue-950 text-xs font-bold px-2 py-0.5 rounded-full">
                {selectedGame.tournamentType ?? 'Special'}
              </span>
            )}
          </div>
        </div>
        <div className="text-2xl font-bold">${score.toLocaleString()}</div>
      </div>

      <div className="flex gap-2 mb-4">
        {(['single', 'double'] as const).map(r => (
          <button key={r} onClick={() => { setCurrentRound(r); buildBoard(selectedGame, r); }}
            className={`px-4 py-2 rounded-lg font-bold ${currentRound === r ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>
            {r === 'single' ? 'Jeopardy!' : 'Double Jeopardy!'}
          </button>
        ))}
      </div>

      {activeClue && (
        <div className="fixed inset-0 bg-blue-950 flex flex-col items-center justify-center z-50 p-8">
          <div className="text-yellow-400 text-lg mb-3 uppercase tracking-wide">
            {activeClue.clue.category} — ${activeClue.value}
          </div>
          <div className="flex gap-2 mb-4">
            {activeClue.clue.dailyDouble && (
              <span className="bg-red-600 text-white text-sm font-bold px-3 py-1 rounded-full">Daily Double!</span>
            )}
            {activeClue.clue.tripleStumper && (
              <span className="bg-orange-600 text-white text-sm font-bold px-3 py-1 rounded-full">Triple Stumper</span>
            )}
          </div>
          <div className="text-white text-3xl text-center font-bold max-w-2xl mb-8">{activeClue.clue.question}</div>
          {showAnswer ? (
            <>
              <div className="text-yellow-300 text-2xl text-center mb-8 italic">{`"${activeClue.clue.answer}"`}</div>
              <div className="flex gap-4">
                <button onClick={handleCorrect} className="bg-green-600 hover:bg-green-500 px-8 py-3 rounded-xl font-bold text-xl">✓ Correct</button>
                <button onClick={handleIncorrect} className="bg-red-600 hover:bg-red-500 px-8 py-3 rounded-xl font-bold text-xl">✗ Wrong</button>
                <button onClick={revealClue} className="bg-gray-600 hover:bg-gray-500 px-8 py-3 rounded-xl font-bold text-xl">Skip</button>
              </div>
            </>
          ) : (
            <button onClick={() => setShowAnswer(true)} className="bg-yellow-400 text-blue-950 px-8 py-3 rounded-xl font-bold text-xl">Show Answer</button>
          )}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {roundCats.map(cat => (
                <th key={cat.id} className="bg-blue-800 p-3 text-center text-sm font-bold uppercase border border-blue-900">
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
                  return (
                    <td key={cat.id} className="border border-blue-900 p-1">
                      {cell && !cell.revealed ? (
                        <button onClick={() => selectClue(cell.clue, cat.id, val)}
                          className={`w-full h-16 font-bold text-xl rounded transition-colors
                            ${cell.clue.tripleStumper
                              ? 'bg-orange-800 hover:bg-orange-700 text-yellow-400'
                              : 'bg-blue-700 hover:bg-blue-600 text-yellow-400'}`}>
                          ${val}
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
    </div>
  );
}
