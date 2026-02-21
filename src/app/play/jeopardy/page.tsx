'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  JeopardyClueData,
  JeopardyFilter,
  JeopardyGameData,
  JeopardyIndexEntry,
} from '@/types/jeopardy';
import { buildCustomBoard, buildRandomBoard, searchClues, getClueUserData } from '@/lib/clue-store';
import {
  ensureUser,
  getActiveUsername,
  getLearnClues,
  getUserStats,
  listUsers,
  recordClueOutcome,
  recordGameCompleted,
  setActiveUsername,
} from '@/lib/stats-store';
import ClueModal from './components/ClueModal';

interface JeopardyClue extends JeopardyClueData {
  id: string;
}

interface JeopardyCategory {
  id: string;
  name: string;
  round: 'single' | 'double' | 'final';
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
  sourceFile?: string;
  categories: JeopardyCategory[];
}

type Round = 'single' | 'double' | 'final';
type JeopardyMethod = 'replay' | 'random' | 'custom' | 'learn';
type SessionType = 'competition' | 'practice';
type Cell = { revealed: boolean; clue: JeopardyClue };
type Board = Record<string, Record<number, Cell>>;
type TeamScore = { name: string; score: number };

const VALUES_SINGLE = [200, 400, 600, 800, 1000];
const VALUES_DOUBLE = [400, 800, 1200, 1600, 2000];

function normaliseApiGame(g: Record<string, unknown>): JeopardyGame {
  const cats = ((g.categories as Record<string, unknown>[]) ?? []).map(cat => ({
    id: String(cat.id ?? Math.random()),
    name: String(cat.name ?? ''),
    round: String(cat.round ?? 'single') as Round,
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
      round: String(cat.round ?? 'single') as Round,
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

function normaliseJsonGame(g: JeopardyGameData, file?: string): JeopardyGame {
  return {
    id: String(g.gameId),
    gameId: g.gameId,
    showNumber: g.showNumber,
    airDate: g.airDate,
    season: g.season,
    isSpecial: g.isSpecial,
    tournamentType: g.tournamentType,
    sourceFile: file,
    categories: g.categories.map((cat, ci) => ({
      id: `${g.gameId}-${cat.round}-${ci}`,
      name: cat.name,
      round: cat.round,
      position: cat.position,
      clues: cat.clues.map((cl, li) => ({ ...cl, id: cl.clueId || `${g.gameId}-${ci}-${li}` })),
    })),
  };
}

export default function JeopardyPage() {
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'api' | 'files-index' | 'empty'>('api');
  const [displayGames, setDisplayGames] = useState<JeopardyGame[]>([]);
  const [indexEntries, setIndexEntries] = useState<JeopardyIndexEntry[]>([]);
  const [allGames, setAllGames] = useState<JeopardyGameData[]>([]);
  const [loadingAllGames, setLoadingAllGames] = useState(false);

  const [sessionType, setSessionType] = useState<SessionType>('competition');
  const [method, setMethod] = useState<JeopardyMethod>('replay');

  const [selectedGame, setSelectedGame] = useState<JeopardyGame | null>(null);
  const [currentRound, setCurrentRound] = useState<Round>('single');
  const [board, setBoard] = useState<Board>({});
  const [activeClue, setActiveClue] = useState<{ clue: JeopardyClue; catId: string; value: number } | null>(null);

  const [score, setScore] = useState(0);
  const [teamNamesInput, setTeamNamesInput] = useState('Team 1, Team 2');
  const [teamScores, setTeamScores] = useState<TeamScore[]>([]);
  const [activeTeamIndex, setActiveTeamIndex] = useState(0);

  const [normalizeTripleStumperColor, setNormalizeTripleStumperColor] = useState(false);
  const [customFilter, setCustomFilter] = useState<JeopardyFilter>({});
  const [customSearch, setCustomSearch] = useState('');
  const [customBuilding, setCustomBuilding] = useState(false);

  const [randomCategoryCount, setRandomCategoryCount] = useState(6);
  const [randomIncludeDouble, setRandomIncludeDouble] = useState(true);
  const [randomIncludeFinal, setRandomIncludeFinal] = useState(true);
  const [randomTripleStumperOnly, setRandomTripleStumperOnly] = useState(false);

  const [randomSeasonMin, setRandomSeasonMin] = useState('');
  const [randomSeasonMax, setRandomSeasonMax] = useState('');
  const [randomIncludeSpecials, setRandomIncludeSpecials] = useState(true);

  const [loginInput, setLoginInput] = useState('');
  const [activeUsername, setActiveUsernameState] = useState<string | null>(null);
  const [savedUsers, setSavedUsers] = useState<string[]>([]);

  const userStats = useMemo(
    () => (activeUsername ? getUserStats(activeUsername) : null),
    [activeUsername],
  );

  useEffect(() => {
    const active = getActiveUsername();
    setActiveUsernameState(active);
    setSavedUsers(listUsers().map(u => u.username));
  }, []);

  useEffect(() => {
    async function load() {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

      try {
        const res = await fetch('/api/jeopardy?limit=200');
        const data = await res.json();
        const apiGames: JeopardyGame[] = (data.games ?? []).map(normaliseApiGame);
        if (apiGames.length > 0) {
          setDisplayGames(apiGames);
          setDataSource('api');
          setLoading(false);
          return;
        }
      } catch {
      }

      try {
        const idxRes = await fetch(`${base}/data/jeopardy/index.json`);
        const index: JeopardyIndexEntry[] = await idxRes.json();
        if (index.length > 0) {
          setIndexEntries(index);
          setDisplayGames(
            index.map(entry => ({
              id: String(entry.gameId),
              gameId: entry.gameId,
              showNumber: entry.showNumber,
              airDate: entry.airDate,
              season: entry.season,
              isSpecial: entry.isSpecial,
              tournamentType: entry.tournamentType,
              sourceFile: entry.file,
              categories: [],
            })),
          );
          setDataSource('files-index');
          setLoading(false);
          return;
        }
      } catch {
      }

      setDataSource('empty');
      setLoading(false);
    }

    load();
  }, []);

  async function ensureAllGamesLoaded(): Promise<JeopardyGameData[]> {
    if (allGames.length > 0) return allGames;
    setLoadingAllGames(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const games: JeopardyGameData[] = [];
    for (const entry of indexEntries) {
      const res = await fetch(`${base}/data/jeopardy/${entry.file}`);
      games.push(await res.json());
    }
    setAllGames(games);
    setLoadingAllGames(false);
    return games;
  }

  function parsedTeams(): TeamScore[] {
    const names = teamNamesInput
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
      .slice(0, 8);
    if (names.length === 0) return [{ name: 'Team 1', score: 0 }, { name: 'Team 2', score: 0 }];
    return names.map(name => ({ name, score: 0 }));
  }

  function buildBoard(game: JeopardyGame, round: Round) {
    const cats = game.categories.filter(c => c.round === round);
    const vals = round === 'double' ? VALUES_DOUBLE : round === 'final' ? [0] : VALUES_SINGLE;
    const newBoard: Board = {};

    cats.forEach(cat => {
      newBoard[cat.id] = {};
      cat.clues.forEach((clue, idx) => {
        const value = round === 'final' ? 0 : vals[idx] ?? (idx + 1) * (round === 'double' ? 400 : 200);
        newBoard[cat.id][value] = { revealed: false, clue };
      });
    });

    setBoard(newBoard);
    setCurrentRound(round);
    setActiveClue(null);
  }

  function finishGameAndBack() {
    if (activeUsername) {
      recordGameCompleted(activeUsername, { endMoney: sessionType === 'competition' ? 0 : score, showNumber: selectedGame?.showNumber ?? null });
    }
    setSelectedGame(null);
    setActiveClue(null);
  }

  async function startReplay(game: JeopardyGame) {
    let resolvedGame = game;

    if (dataSource === 'files-index' && game.categories.length === 0 && game.sourceFile) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const res = await fetch(`${base}/data/jeopardy/${game.sourceFile}`);
      const raw: JeopardyGameData = await res.json();
      resolvedGame = normaliseJsonGame(raw, game.sourceFile);
    }

    if (resolvedGame.categories.length === 0) return;

    setSelectedGame(resolvedGame);
    setScore(0);
    setTeamScores(sessionType === 'competition' ? parsedTeams() : []);
    setActiveTeamIndex(0);
    buildBoard(resolvedGame, 'single');
  }

  function filteredReplayGames() {
    const min = randomSeasonMin ? Number(randomSeasonMin) : null;
    const max = randomSeasonMax ? Number(randomSeasonMax) : null;
    return displayGames.filter(game => {
      if (!randomIncludeSpecials && game.isSpecial) return false;
      if (min != null && (game.season == null || game.season < min)) return false;
      if (max != null && (game.season == null || game.season > max)) return false;
      return true;
    });
  }

  async function startRandomReplayFromFilters() {
    const pool = filteredReplayGames();
    if (pool.length === 0) {
      alert('No episodes match those replay filters.');
      return;
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    await startReplay(pick);
  }

  async function startRandom() {
    const sourceGames = dataSource === 'api' ? displayGames.map(g => ({
      gameId: g.gameId ?? 0,
      showNumber: g.showNumber,
      airDate: g.airDate,
      season: g.season,
      isSpecial: g.isSpecial,
      tournamentType: g.tournamentType,
      categories: g.categories.map(c => ({ name: c.name, round: c.round, position: c.position, clues: c.clues })),
    })) : await ensureAllGamesLoaded();

    if (!sourceGames.length) return;

    const rounds: JeopardyCategory[] = [];
    const single = buildRandomBoard(sourceGames as JeopardyGameData[], randomCategoryCount, 5, 'single')
      .map((cat, ci) => ({
        id: `rnd-s-${ci}`,
        name: cat.name,
        round: 'single' as const,
        position: ci,
        clues: cat.clues
          .filter(cl => (randomTripleStumperOnly ? cl.tripleStumper : true))
          .map((cl, li) => ({ ...cl, id: cl.clueId || `rnd-s-${ci}-${li}` })),
      }));

    rounds.push(...single);

    if (randomIncludeDouble) {
      const doubles = buildRandomBoard(sourceGames as JeopardyGameData[], randomCategoryCount, 5, 'double')
        .map((cat, ci) => ({
          id: `rnd-d-${ci}`,
          name: cat.name,
          round: 'double' as const,
          position: ci,
          clues: cat.clues
            .filter(cl => (randomTripleStumperOnly ? cl.tripleStumper : true))
            .map((cl, li) => ({ ...cl, id: cl.clueId || `rnd-d-${ci}-${li}` })),
        }));
      rounds.push(...doubles);
    }

    if (randomIncludeFinal) {
      const finalClues = (sourceGames as JeopardyGameData[])
        .flatMap(g => g.categories)
        .filter(c => c.round === 'final')
        .flatMap(c => c.clues);

      if (finalClues.length > 0) {
        const clue = finalClues[Math.floor(Math.random() * finalClues.length)];
        rounds.push({
          id: 'rnd-final',
          name: clue.category || 'Final Jeopardy',
          round: 'final',
          position: 0,
          clues: [{ ...clue, id: clue.clueId || 'rnd-final-0' }],
        });
      }
    }

    const fakeGame: JeopardyGame = {
      id: `random-${Date.now()}`,
      showNumber: 0,
      airDate: '',
      season: null,
      isSpecial: false,
      tournamentType: null,
      categories: rounds,
    };

    setSelectedGame(fakeGame);
    setScore(0);
    setTeamScores(sessionType === 'competition' ? parsedTeams() : []);
    setActiveTeamIndex(0);
    buildBoard(fakeGame, 'single');
  }

  async function startCustom() {
    setCustomBuilding(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const filter: JeopardyFilter = { ...customFilter, search: customSearch || undefined };
    try {
      const results = await searchClues(base, filter, 300);
      const rawCats = buildCustomBoard(results, randomCategoryCount, 5);
      if (rawCats.length === 0) {
        alert('No clues matched your custom filter.');
        setCustomBuilding(false);
        return;
      }
      const fakeGame: JeopardyGame = {
        id: `custom-${Date.now()}`,
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
          clues: cat.clues.map((cl, li) => ({ ...cl, id: cl.clueId || `cst-${ci}-${li}` })),
        })),
      };
      setSelectedGame(fakeGame);
      setScore(0);
      setTeamScores(sessionType === 'competition' ? parsedTeams() : []);
      setActiveTeamIndex(0);
      buildBoard(fakeGame, 'single');
    } catch {
      alert('Error building custom game.');
    }
    setCustomBuilding(false);
  }

  function startLearnMode() {
    if (!activeUsername) {
      alert('Log in first to use Learn mode.');
      return;
    }

    const learn = getLearnClues(activeUsername);
    if (learn.length === 0) {
      alert('No missed clues yet. Miss or skip clues in play to build your Learn deck.');
      return;
    }

    const grouped = new Map<string, JeopardyClue[]>();
    for (const item of learn) {
      if (!grouped.has(item.category)) grouped.set(item.category, []);
      grouped.get(item.category)!.push({
        id: item.clueId,
        clueId: item.clueId,
        question: item.question,
        answer: item.answer,
        value: item.value,
        dailyDouble: item.dailyDouble,
        tripleStumper: item.tripleStumper,
        isFinalJeopardy: item.isFinalJeopardy,
        category: item.category,
        round: 'single',
        rowIndex: 0,
      });
    }

    const categories: JeopardyCategory[] = [...grouped.entries()]
      .slice(0, randomCategoryCount)
      .map(([name, clues], index) => ({
        id: `learn-${index}`,
        name,
        round: 'single',
        position: index,
        clues: clues.slice(0, 5).map((cl, rowIndex) => ({ ...cl, rowIndex })),
      }));

    const game: JeopardyGame = {
      id: `learn-${Date.now()}`,
      showNumber: 0,
      airDate: '',
      season: null,
      isSpecial: false,
      tournamentType: null,
      categories,
    };

    setSelectedGame(game);
    setScore(0);
    setTeamScores([]);
    buildBoard(game, 'single');
  }

  function selectClue(clue: JeopardyClue, catId: string, value: number) {
    let resolvedValue = value;
    if (clue.dailyDouble && currentRound !== 'final') {
      const wagerInput = window.prompt('Daily Double! Enter your wager:', String(Math.max(200, value)));
      const parsed = wagerInput ? Number(wagerInput.replace(/[^\d]/g, '')) : NaN;
      if (!Number.isNaN(parsed) && parsed > 0) resolvedValue = parsed;
    }
    setActiveClue({ clue, catId, value: resolvedValue });
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

  function applyScore(delta: number) {
    if (sessionType === 'competition') {
      setTeamScores(prev => prev.map((team, i) => (i === activeTeamIndex ? { ...team, score: team.score + delta } : team)));
      return;
    }
    setScore(prev => prev + delta);
  }

  function handleCorrect() {
    if (!activeClue) return;
    if (activeUsername) recordClueOutcome(activeUsername, activeClue.clue, 'correct');
    applyScore(activeClue.value);
    revealClue();
  }

  function handleIncorrect() {
    if (!activeClue) return;
    if (activeUsername) recordClueOutcome(activeUsername, activeClue.clue, 'incorrect');
    applyScore(-activeClue.value);
    revealClue();
  }

  function handleSkip() {
    if (!activeClue) return;
    if (activeUsername) recordClueOutcome(activeUsername, activeClue.clue, 'skip');
    revealClue();
  }

  function renderBoard() {
    if (!selectedGame) return null;
    const roundCats = selectedGame.categories.filter(c => c.round === currentRound);
    const vals = currentRound === 'double' ? VALUES_DOUBLE : currentRound === 'final' ? [0] : VALUES_SINGLE;

    return (
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
                  if (!cell) {
                    return (
                      <td key={cat.id} className="border border-blue-900 p-1">
                        <div className="w-full h-16 bg-blue-900 rounded" />
                      </td>
                    );
                  }
                  const ud = cell.clue.clueId ? getClueUserData(cell.clue.clueId) : null;
                  const isFlagged = ud?.flagged;
                  const isMediaFlagged = ud?.mediaFlag;
                  const tripleClass = normalizeTripleStumperColor
                    ? 'bg-blue-700 hover:bg-blue-600 text-yellow-400'
                    : 'bg-orange-800 hover:bg-orange-700 text-yellow-400';
                  return (
                    <td key={cat.id} className="border border-blue-900 p-1">
                      {!cell.revealed ? (
                        <button
                          onClick={() => selectClue(cell.clue, cat.id, val)}
                          className={`w-full h-16 font-bold text-xl rounded transition-colors relative ${
                            cell.clue.tripleStumper ? tripleClass : 'bg-blue-700 hover:bg-blue-600 text-yellow-400'
                          }`}>
                          {currentRound === 'final' ? 'FINAL' : `$${val}`}
                          {(isFlagged || isMediaFlagged) && (
                            <span className="absolute top-1 right-1 text-xs">
                              {isFlagged ? '🚩' : ''}
                              {isMediaFlagged ? '🎬' : ''}
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

  function login(username: string) {
    const clean = username.trim();
    if (!clean) return;
    ensureUser(clean);
    setActiveUsername(clean);
    setActiveUsernameState(clean);
    setSavedUsers(listUsers().map(u => u.username));
    setLoginInput('');
  }

  if (loading) {
    return <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-2xl">Loading…</div>;
  }

  if (selectedGame) {
    const hasFinal = selectedGame.categories.some(c => c.round === 'final');
    const hasDouble = selectedGame.categories.some(c => c.round === 'double');

    return (
      <div className="min-h-screen bg-blue-950 text-white p-4">
        <div className="flex justify-between items-center mb-4 gap-3">
          <button onClick={finishGameAndBack} className="text-yellow-400 hover:underline">
            ← Back
          </button>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-yellow-400">
              {selectedGame.showNumber ? `Show #${selectedGame.showNumber}` : 'Jeopardy'}
            </h1>
            <div className="text-sm text-gray-300">{sessionType === 'competition' ? 'Competition' : 'Practice'} mode</div>
          </div>
          {sessionType === 'competition' ? (
            <div className="text-right">
              {teamScores.map((team, i) => (
                <div key={team.name} className={`text-sm ${i === activeTeamIndex ? 'text-yellow-300 font-bold' : 'text-white'}`}>
                  {team.name}: ${team.score.toLocaleString()}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-2xl font-bold">${score.toLocaleString()}</div>
          )}
        </div>

        {sessionType === 'competition' && teamScores.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-blue-300">Responding team:</label>
            <select
              value={activeTeamIndex}
              onChange={e => setActiveTeamIndex(Number(e.target.value))}
              className="bg-blue-800 border border-blue-600 rounded px-2 py-1 text-sm">
              {teamScores.map((team, i) => (
                <option key={team.name + i} value={i}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => buildBoard(selectedGame, 'single')}
            className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'single' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>
            Jeopardy!
          </button>
          {hasDouble && (
            <button
              onClick={() => buildBoard(selectedGame, 'double')}
              className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'double' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>
              Double Jeopardy!
            </button>
          )}
          {hasFinal && (
            <button
              onClick={() => buildBoard(selectedGame, 'final')}
              className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'final' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>
              Final Jeopardy
            </button>
          )}
        </div>

        {activeClue && (
          <ClueModal
            clue={activeClue.clue}
            value={activeClue.value}
            onCorrect={handleCorrect}
            onIncorrect={handleIncorrect}
            onSkip={handleSkip}
            respondentLabel={sessionType === 'competition' ? teamScores[activeTeamIndex]?.name ?? undefined : undefined}
          />
        )}

        {renderBoard()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 text-white p-8">
      <h1 className="text-4xl font-bold text-yellow-400 mb-2 text-center">Jeopardy!</h1>

      <div className="max-w-4xl mx-auto bg-blue-900 rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={loginInput}
            onChange={e => setLoginInput(e.target.value)}
            placeholder="Enter username"
            className="bg-blue-800 border border-blue-600 rounded px-3 py-2 text-sm flex-1"
          />
          <button onClick={() => login(loginInput)} className="bg-yellow-400 text-blue-950 font-bold px-4 py-2 rounded">
            Log In
          </button>
          {savedUsers.map(name => (
            <button key={name} onClick={() => login(name)} className="bg-blue-800 hover:bg-blue-700 text-sm px-3 py-2 rounded">
              {name}
            </button>
          ))}
        </div>
        {activeUsername && userStats && (
          <div className="mt-3 text-sm text-blue-200 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div>User: <span className="text-yellow-300 font-bold">{activeUsername}</span></div>
            <div>Games: {userStats.gamesPlayed}</div>
            <div>Avg end money: ${userStats.averageEndMoney.toLocaleString()}</div>
            <div>Episodes done: {userStats.episodesCompleted}</div>
            <div>Correct: {userStats.correctAnswers}</div>
            <div>Wrong: {userStats.incorrectAnswers}</div>
            <div>Skipped: {userStats.skippedQuestions}</div>
          </div>
        )}
      </div>

      <div className="flex justify-center gap-2 mb-4">
        {(['competition', 'practice'] as SessionType[]).map(type => (
          <button
            key={type}
            onClick={() => setSessionType(type)}
            className={`px-5 py-2 rounded-lg font-bold capitalize ${sessionType === type ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'}`}>
            {type}
          </button>
        ))}
      </div>

      {sessionType === 'competition' && (
        <div className="max-w-3xl mx-auto bg-blue-900 rounded-xl p-4 mb-6">
          <label className="block text-sm font-bold text-blue-300 mb-1">Players/teams (comma separated)</label>
          <input
            value={teamNamesInput}
            onChange={e => setTeamNamesInput(e.target.value)}
            placeholder="Team 1, Team 2"
            className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2"
          />
        </div>
      )}

      <div className="max-w-3xl mx-auto flex items-center justify-center gap-2 mb-5 flex-wrap">
        {(['replay', 'random', 'custom', 'learn'] as JeopardyMethod[]).map(m => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`px-4 py-2 rounded-lg font-bold capitalize ${method === m ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'}`}>
            {m}
          </button>
        ))}
        <label className="text-sm text-blue-300 flex items-center gap-2 ml-3">
          <input type="checkbox" checked={normalizeTripleStumperColor} onChange={e => setNormalizeTripleStumperColor(e.target.checked)} />
          Triple Stumper as blue
        </label>
      </div>

      {method === 'replay' && (
        <div className="max-w-5xl mx-auto">
          <div className="bg-blue-900 rounded-xl p-4 mb-4 grid md:grid-cols-4 gap-3">
            <input
              value={randomSeasonMin}
              onChange={e => setRandomSeasonMin(e.target.value)}
              placeholder="Min season"
              className="bg-blue-800 border border-blue-600 rounded px-3 py-2 text-sm"
            />
            <input
              value={randomSeasonMax}
              onChange={e => setRandomSeasonMax(e.target.value)}
              placeholder="Max season"
              className="bg-blue-800 border border-blue-600 rounded px-3 py-2 text-sm"
            />
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={randomIncludeSpecials} onChange={e => setRandomIncludeSpecials(e.target.checked)} />
              Include specials
            </label>
            <button onClick={startRandomReplayFromFilters} className="bg-yellow-400 text-blue-950 font-bold rounded px-3 py-2">
              Random replay episode
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayGames.map(game => (
              <button key={game.id} onClick={() => startReplay(game)} className="bg-blue-800 hover:bg-blue-700 rounded-xl p-6 text-left">
                <div className="text-xl font-bold">Show #{game.showNumber}</div>
                <div className="text-sm text-blue-300">{game.airDate}</div>
                {game.season && <div className="text-sm text-blue-300">Season {game.season}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {method === 'random' && (
        <div className="max-w-xl mx-auto bg-blue-900 rounded-xl p-6 space-y-3">
          <label className="block text-sm text-blue-300">Number of categories</label>
          <input
            type="number"
            min={2}
            max={8}
            value={randomCategoryCount}
            onChange={e => setRandomCategoryCount(Math.max(2, Math.min(8, Number(e.target.value) || 6)))}
            className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2"
          />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomIncludeDouble} onChange={e => setRandomIncludeDouble(e.target.checked)} /> Enable Double Jeopardy</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomTripleStumperOnly} onChange={e => setRandomTripleStumperOnly(e.target.checked)} /> Triple Jeopardy (triple stumpers only)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomIncludeFinal} onChange={e => setRandomIncludeFinal(e.target.checked)} /> Add Final Jeopardy</label>
          <button onClick={startRandom} disabled={loadingAllGames} className="w-full bg-yellow-400 text-blue-950 font-bold py-3 rounded-xl disabled:opacity-60">
            {loadingAllGames ? 'Loading clue library…' : 'Build Random Game'}
          </button>
        </div>
      )}

      {method === 'custom' && (
        <div className="max-w-2xl mx-auto bg-blue-900 rounded-xl p-6 space-y-4">
          <input
            type="text"
            value={customSearch}
            onChange={e => setCustomSearch(e.target.value)}
            placeholder="Search clues, answers, categories"
            className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2"
          />
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.dailyDoublesOnly)} onChange={e => setCustomFilter(f => ({ ...f, dailyDoublesOnly: e.target.checked || undefined }))} /> Daily Doubles only</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.tripleStumpersOnly)} onChange={e => setCustomFilter(f => ({ ...f, tripleStumpersOnly: e.target.checked || undefined }))} /> Triple stumpers only</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.finalOnly)} onChange={e => setCustomFilter(f => ({ ...f, finalOnly: e.target.checked || undefined }))} /> Final only</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.flaggedOnly)} onChange={e => setCustomFilter(f => ({ ...f, flaggedOnly: e.target.checked || undefined }))} /> Flagged only</label>
          </div>
          <button onClick={startCustom} disabled={customBuilding} className="w-full bg-yellow-400 text-blue-950 font-bold py-3 rounded-xl disabled:opacity-60">
            {customBuilding ? 'Building…' : 'Build Custom Game'}
          </button>
        </div>
      )}

      {method === 'learn' && (
        <div className="max-w-xl mx-auto text-center bg-blue-900 rounded-xl p-6">
          <p className="text-blue-200 mb-4">Study from your missed and skipped clues.</p>
          <button onClick={startLearnMode} className="bg-yellow-400 text-blue-950 px-8 py-3 rounded-xl font-bold">
            Start Learn Game
          </button>
        </div>
      )}

      {dataSource === 'empty' && <p className="text-center mt-6 text-blue-300">No Jeopardy data loaded yet.</p>}
    </div>
  );
}
