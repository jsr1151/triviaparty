'use client';
import { useState, useEffect } from 'react';

interface JeopardyClue {
  id: string;
  question: string;
  answer: string;
  value: number | null;
  dailyDouble: boolean;
  category?: string;
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
  showNumber: number;
  airDate: string;
  categories: JeopardyCategory[];
}

type Cell = { revealed: boolean; clue: JeopardyClue };
type Board = Record<string, Record<number, Cell>>;

export default function JeopardyPage() {
  const [games, setGames] = useState<JeopardyGame[]>([]);
  const [selectedGame, setSelectedGame] = useState<JeopardyGame | null>(null);
  const [board, setBoard] = useState<Board>({});
  const [activeClue, setActiveClue] = useState<{ clue: JeopardyClue; catId: string; value: number } | null>(null);
  const [score, setScore] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [currentRound, setCurrentRound] = useState<'single' | 'double' | 'final'>('single');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jeopardy')
      .then(r => r.json())
      .then(data => { setGames(data.games || []); setLoading(false); })
      .catch(() => setLoading(false));
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
      [activeClue.catId]: { ...prev[activeClue.catId], [activeClue.value]: { ...prev[activeClue.catId][activeClue.value], revealed: true } },
    }));
    setActiveClue(null);
    setShowAnswer(false);
  }

  if (loading) return <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-2xl">Loading...</div>;

  if (!selectedGame) {
    return (
      <div className="min-h-screen bg-blue-950 text-white p-8">
        <h1 className="text-4xl font-bold text-yellow-400 mb-8 text-center">Jeopardy!</h1>
        {games.length === 0 ? (
          <div className="text-center text-gray-300">
            <p className="text-xl mb-4">No games loaded yet.</p>
            <p>Use the admin panel to scrape games from J-Archive.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {games.map(game => (
              <button key={game.id} onClick={() => loadGame(game)}
                className="bg-blue-800 hover:bg-blue-700 rounded-xl p-6 text-left transition-colors">
                <div className="text-xl font-bold">Show #{game.showNumber}</div>
                <div className="text-gray-300">{game.airDate}</div>
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
      <div className="flex justify-between items-center mb-6">
        <button onClick={() => setSelectedGame(null)} className="text-yellow-400 hover:underline">← Back</button>
        <h1 className="text-3xl font-bold text-yellow-400">Show #{selectedGame.showNumber}</h1>
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
          <div className="text-yellow-400 text-xl mb-4 uppercase">{activeClue.clue.category} - ${activeClue.value}</div>
          {activeClue.clue.dailyDouble && <div className="text-red-400 text-2xl font-bold mb-4">Daily Double!</div>}
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
                          className="w-full h-16 bg-blue-700 hover:bg-blue-600 text-yellow-400 font-bold text-xl rounded transition-colors">
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
