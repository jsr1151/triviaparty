'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { JeopardyClueData, JeopardyFilter, JeopardyGameData, JeopardyIndexEntry } from '@/types/jeopardy';
import { buildCustomBoard, buildRandomBoard, getClueUserData, searchClues } from '@/lib/clue-store';
import {
  getEpisodeStats,
  getLearnCluesLocal,
  getOverallStats,
  initEpisodeStats,
  markEpisodeCompleted,
  recordEpisodeOutcome,
} from '@/lib/local-tracker';
import ClueModal from './components/ClueModal';

interface JeopardyClue extends JeopardyClueData {
  id: string;
}

interface JeopardyCategory {
  id: string;
  name: string;
  round: 'single' | 'double' | 'triple' | 'final';
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

type Round = 'single' | 'double' | 'triple' | 'final';
type JeopardyMethod = 'replay' | 'random' | 'custom' | 'learn';
type SessionType = 'competition' | 'practice';
type GameKind = 'replay' | 'random' | 'custom' | 'learn';
type TeamScore = { name: string; score: number };
type Cell = { revealed: boolean; clue: JeopardyClue };
type Board = Record<string, Record<number, Cell>>;

type AuthUser = { id: string; email: string; username: string };
type UserStats = {
  gamesPlayed: number;
  averageEndMoney: number;
  episodesCompleted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  skippedQuestions: number;
};

type LearnClue = {
  clueId: string;
  question: string;
  answer: string;
  value: number | null;
  dailyDouble: boolean;
  tripleStumper: boolean;
  isFinalJeopardy: boolean;
  category: string;
  round: string;
};

const VALUES_SINGLE = [200, 400, 600, 800, 1000];
const VALUES_DOUBLE = [400, 800, 1200, 1600, 2000];
const VALUES_TRIPLE = [600, 1200, 1800, 2400, 3000];

function normaliseApiGame(g: Record<string, unknown>): JeopardyGame {
  const cats = ((g.categories as Record<string, unknown>[]) ?? []).map(cat => ({
    id: String(cat.id ?? Math.random()),
    name: String(cat.name ?? ''),
    round: String(cat.round ?? 'single') as 'single' | 'double' | 'final',
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
      round: (String(cat.round ?? 'single') as 'single' | 'double' | 'final'),
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
    categories: cats as JeopardyCategory[],
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
    })) as JeopardyCategory[],
  };
}

function getEffectiveSeason(game: Pick<JeopardyGame, 'season' | 'airDate'>): number | null {
  if (game.season != null) return game.season;
  const parsed = new Date(game.airDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth();
  const estimated = year - 1984 + (month >= 8 ? 1 : 0);
  return estimated > 0 ? estimated : null;
}

async function postJson(url: string, payload: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Request failed');
  }
  return res.json().catch(() => ({}));
}

export default function JeopardyPage() {
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'api' | 'files-index' | 'empty'>('api');
  const [displayGames, setDisplayGames] = useState<JeopardyGame[]>([]);
  const [indexEntries, setIndexEntries] = useState<JeopardyIndexEntry[]>([]);
  const [allGames, setAllGames] = useState<JeopardyGameData[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [libraryProgress, setLibraryProgress] = useState({ loaded: 0, total: 0 });

  const [sessionType, setSessionType] = useState<SessionType>('competition');
  const [method, setMethod] = useState<JeopardyMethod>('replay');
  const [showSettings, setShowSettings] = useState(false);

  const [selectedGame, setSelectedGame] = useState<JeopardyGame | null>(null);
  const [selectedGameKind, setSelectedGameKind] = useState<GameKind | null>(null);
  const [currentRound, setCurrentRound] = useState<Round>('single');
  const [board, setBoard] = useState<Board>({});
  const [activeClue, setActiveClue] = useState<{
    clue: JeopardyClue;
    catId: string;
    boardValue: number;
    scoreValue: number;
    respondentTeamIndex: number | null;
    respondentLocked: boolean;
  } | null>(null);

  const [episodeKey, setEpisodeKey] = useState<string | null>(null);
  const [showWinScreen, setShowWinScreen] = useState(false);
  const revealedClueIdsRef = useRef<Set<string>>(new Set());

  const [score, setScore] = useState(0);
  const [teamNamesInput, setTeamNamesInput] = useState('Team 1, Team 2');
  const [teamScores, setTeamScores] = useState<TeamScore[]>([]);
  const [chooserTeamIndex, setChooserTeamIndex] = useState(0);

  const [normalizeTripleStumperColor, setNormalizeTripleStumperColor] = useState(false);

  const [randomCategoryCount, setRandomCategoryCount] = useState(6);
  const [randomIncludeDouble, setRandomIncludeDouble] = useState(true);
  const [randomIncludeTriple, setRandomIncludeTriple] = useState(false);
  const [randomIncludeFinal, setRandomIncludeFinal] = useState(true);

  const [customSearch, setCustomSearch] = useState('');
  const [customFilter, setCustomFilter] = useState<JeopardyFilter>({});
  const [customBuilding, setCustomBuilding] = useState(false);

  const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
  const [includeRegularEpisodes, setIncludeRegularEpisodes] = useState(true);
  const [selectedSpecialTypes, setSelectedSpecialTypes] = useState<string[]>([]);

  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [localOverallStats, setLocalOverallStats] = useState(getOverallStats());
  const [localEpisodeStats, setLocalEpisodeStats] = useState<ReturnType<typeof getEpisodeStats> | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const requested = new URLSearchParams(window.location.search).get('method');
    if (requested && ['replay', 'random', 'custom', 'learn'].includes(requested)) {
      setMethod(requested as JeopardyMethod);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const data = await res.json();
        setAuthUser(data.user ?? null);
        setUserStats(data.stats ?? null);
      } catch {
      }
    })();
  }, []);

  useEffect(() => {
    setLocalOverallStats(getOverallStats());
  }, []);

  useEffect(() => {
    async function loadGames() {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const isStaticPages = Boolean(base);

      if (!isStaticPages) {
        try {
          const res = await fetch('/api/jeopardy?limit=300');
          const data = await res.json();
          const apiGames = (data.games ?? []).map(normaliseApiGame);
          if (apiGames.length > 0) {
            setDisplayGames(apiGames);
            setDataSource('api');
            setLoading(false);
            return;
          }
        } catch {
        }
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

    loadGames();
  }, []);

  async function ensureAllGamesLoaded(): Promise<JeopardyGameData[]> {
    if (allGames.length > 0) return allGames;

    if (dataSource === 'api') {
      const converted: JeopardyGameData[] = displayGames.map(game => ({
        gameId: game.gameId ?? 0,
        showNumber: game.showNumber,
        airDate: game.airDate,
        season: game.season,
        isSpecial: game.isSpecial,
        tournamentType: game.tournamentType,
        categories: game.categories.map(cat => ({
          name: cat.name,
          round: cat.round === 'triple' ? 'double' : cat.round,
          position: cat.position,
          clues: cat.clues,
        })) as JeopardyGameData['categories'],
      }));
      setAllGames(converted);
      return converted;
    }

    setLoadingLibrary(true);
    setLibraryProgress({ loaded: 0, total: indexEntries.length });

    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const games: JeopardyGameData[] = [];

    const batchSize = 12;
    for (let start = 0; start < indexEntries.length; start += batchSize) {
      const batch = indexEntries.slice(start, start + batchSize);
      const batchResults = await Promise.all(
        batch.map(async entry => {
          const res = await fetch(`${base}/data/jeopardy/${entry.file}`);
          const game = (await res.json()) as JeopardyGameData;
          return game;
        }),
      );
      games.push(...batchResults);
      setLibraryProgress(prev => ({ ...prev, loaded: Math.min(indexEntries.length, prev.loaded + batchResults.length) }));
    }

    setAllGames(games);
    setLoadingLibrary(false);
    return games;
  }

  function parsedTeams(): TeamScore[] {
    const names = teamNamesInput.split(',').map(n => n.trim()).filter(Boolean).slice(0, 8);
    if (!names.length) return [{ name: 'Team 1', score: 0 }, { name: 'Team 2', score: 0 }];
    return names.map(name => ({ name, score: 0 }));
  }

  function buildBoard(game: JeopardyGame, round: Round) {
    const cats = game.categories.filter(c => c.round === round);
    const values = round === 'double' ? VALUES_DOUBLE : round === 'triple' ? VALUES_TRIPLE : round === 'final' ? [0] : VALUES_SINGLE;
    const nextBoard: Board = {};

    cats.forEach(cat => {
      nextBoard[cat.id] = {};
      cat.clues.forEach((clue, idx) => {
        const value = round === 'final' ? 0 : values[idx] ?? (idx + 1) * 200;
        nextBoard[cat.id][value] = { revealed: false, clue };
      });
    });

    setBoard(nextBoard);
    setCurrentRound(round);
    setActiveClue(null);
  }

  async function startReplay(game: JeopardyGame) {
    let resolvedGame = game;
    if (dataSource === 'files-index' && game.categories.length === 0 && game.sourceFile) {
      const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const res = await fetch(`${base}/data/jeopardy/${game.sourceFile}`);
      const raw = (await res.json()) as JeopardyGameData;
      resolvedGame = normaliseJsonGame(raw, game.sourceFile);
    }

    if (!resolvedGame.categories.length) return;

    setSelectedGame(resolvedGame);
    setSelectedGameKind('replay');
    setScore(0);
    setTeamScores(sessionType === 'competition' ? parsedTeams() : []);
    setChooserTeamIndex(0);
    setShowWinScreen(false);
    revealedClueIdsRef.current = new Set();

    const key = `replay:${resolvedGame.showNumber || resolvedGame.id}`;
    setEpisodeKey(key);
    const totalClues = resolvedGame.categories.reduce((sum, c) => sum + c.clues.length, 0);
    initEpisodeStats({
      episodeKey: key,
      showNumber: resolvedGame.showNumber || null,
      mode: sessionType,
      totalClues,
    });
    setLocalEpisodeStats(getEpisodeStats(key));
    buildBoard(resolvedGame, 'single');
  }

  const availableSpecialTypes = useMemo(
    () => Array.from(new Set(displayGames.filter(g => g.isSpecial).map(g => g.tournamentType || 'Other Special'))).sort(),
    [displayGames],
  );

  function toggleSeason(season: number) {
    setSelectedSeasons(prev => prev.includes(season) ? prev.filter(s => s !== season) : [...prev, season].sort((a, b) => a - b));
  }

  function toggleSpecialType(type: string) {
    setSelectedSpecialTypes(prev => prev.includes(type) ? prev.filter(s => s !== type) : [...prev, type]);
  }

  function filteredReplayGames() {
    return displayGames.filter(game => {
      const effectiveSeason = getEffectiveSeason(game);
      if (selectedSeasons.length > 0 && (effectiveSeason == null || !selectedSeasons.includes(effectiveSeason))) return false;

      if (game.isSpecial) {
        const specialType = game.tournamentType || 'Other Special';
        if (selectedSpecialTypes.length > 0 && !selectedSpecialTypes.includes(specialType)) return false;
        if (!includeRegularEpisodes && selectedSpecialTypes.length === 0) return true;
      }

      if (!game.isSpecial && !includeRegularEpisodes) return false;
      return true;
    });
  }

  async function startRandomReplayFromFilters() {
    const pool = filteredReplayGames();
    if (!pool.length) {
      alert('No episodes match your replay filters.');
      return;
    }

    const index = Math.floor(Math.random() * pool.length);
    await startReplay(pool[index]);
  }

  async function replayNextEpisode() {
    if (!selectedGame?.showNumber) return;
    const ordered = [...filteredReplayGames()].sort((a, b) => a.showNumber - b.showNumber);
    const idx = ordered.findIndex(g => g.showNumber === selectedGame.showNumber);
    if (idx >= 0 && idx < ordered.length - 1) {
      await startReplay(ordered[idx + 1]);
    } else {
      alert('No next episode in current filter.');
    }
  }

  async function startRandom() {
    const sourceGames = await ensureAllGamesLoaded();
    if (!sourceGames.length) return;

    const categories: JeopardyCategory[] = [];

    const single = buildRandomBoard(sourceGames, randomCategoryCount, 5, 'single').map((cat, i) => ({
      id: `rnd-s-${i}`,
      name: cat.name,
      round: 'single' as const,
      position: i,
      clues: cat.clues.map((cl, j) => ({ ...cl, id: cl.clueId || `rnd-s-${i}-${j}` })),
    }));
    categories.push(...single);

    if (randomIncludeDouble) {
      const doubles = buildRandomBoard(sourceGames, randomCategoryCount, 5, 'double').map((cat, i) => ({
        id: `rnd-d-${i}`,
        name: cat.name,
        round: 'double' as const,
        position: i,
        clues: cat.clues.map((cl, j) => ({ ...cl, id: cl.clueId || `rnd-d-${i}-${j}` })),
      }));
      categories.push(...doubles);
    }

    if (randomIncludeTriple) {
      const triples = buildRandomBoard(sourceGames, randomCategoryCount, 5, 'double').map((cat, i) => ({
        id: `rnd-t-${i}`,
        name: cat.name,
        round: 'triple' as const,
        position: i,
        clues: cat.clues.map((cl, j) => ({ ...cl, id: cl.clueId || `rnd-t-${i}-${j}` })),
      }));
      categories.push(...triples);
    }

    if (randomIncludeFinal) {
      const finalPool = sourceGames.flatMap(g => g.categories).filter(c => c.round === 'final').flatMap(c => c.clues);
      if (finalPool.length > 0) {
        const clue = finalPool[Math.floor(Math.random() * finalPool.length)];
        categories.push({
          id: 'rnd-final-0',
          name: clue.category || 'Final Jeopardy',
          round: 'final',
          position: 0,
          clues: [{ ...clue, id: clue.clueId || 'rnd-final-clue' }],
        });
      }
    }

    const game: JeopardyGame = {
      id: `random-${Date.now()}`,
      showNumber: 0,
      airDate: '',
      season: null,
      isSpecial: false,
      tournamentType: null,
      categories,
    };

    setSelectedGame(game);
    setSelectedGameKind('random');
    setScore(0);
    setTeamScores(sessionType === 'competition' ? parsedTeams() : []);
    setChooserTeamIndex(0);
    setShowWinScreen(false);
    revealedClueIdsRef.current = new Set();

    const key = `random:${Date.now()}`;
    setEpisodeKey(key);
    const totalClues = game.categories.reduce((sum, c) => sum + c.clues.length, 0);
    initEpisodeStats({ episodeKey: key, showNumber: null, mode: sessionType, totalClues });
    setLocalEpisodeStats(getEpisodeStats(key));
    buildBoard(game, 'single');
  }

  async function startCustom() {
    setCustomBuilding(true);
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
    const filter: JeopardyFilter = { ...customFilter, search: customSearch || undefined };

    try {
      const results = await searchClues(base, filter, 300);
      const rawCats = buildCustomBoard(results, randomCategoryCount, 5);
      if (!rawCats.length) {
        alert('No clues matched your custom filters.');
        setCustomBuilding(false);
        return;
      }

      const game: JeopardyGame = {
        id: `custom-${Date.now()}`,
        showNumber: 0,
        airDate: '',
        season: null,
        isSpecial: false,
        tournamentType: null,
        categories: rawCats.map((cat, i) => ({
          id: `custom-${i}`,
          name: cat.name,
          round: cat.round,
          position: cat.position,
          clues: cat.clues.map((cl, j) => ({ ...cl, id: cl.clueId || `custom-${i}-${j}` })),
        })) as JeopardyCategory[],
      };

      setSelectedGame(game);
      setSelectedGameKind('custom');
      setScore(0);
      setTeamScores(sessionType === 'competition' ? parsedTeams() : []);
      setChooserTeamIndex(0);
      setShowWinScreen(false);
      revealedClueIdsRef.current = new Set();

      const key = `custom:${Date.now()}`;
      setEpisodeKey(key);
      const totalClues = game.categories.reduce((sum, c) => sum + c.clues.length, 0);
      initEpisodeStats({ episodeKey: key, showNumber: null, mode: sessionType, totalClues });
      setLocalEpisodeStats(getEpisodeStats(key));
      buildBoard(game, 'single');
    } catch {
      alert('Error building custom game.');
    }

    setCustomBuilding(false);
  }

  async function startLearnMode() {
    try {
      const learn: LearnClue[] = getLearnCluesLocal();

      if (!learn.length) {
        alert('No missed clues yet. Miss or skip clues first, then come back to Learn mode.');
        return;
      }

      const grouped = new Map<string, JeopardyClue[]>();
      learn.forEach(item => {
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
      });

      const categories: JeopardyCategory[] = [...grouped.entries()].slice(0, randomCategoryCount).map(([name, clues], i) => ({
        id: `learn-${i}`,
        name,
        round: 'single',
        position: i,
        clues: clues.slice(0, 5).map((clue, rowIndex) => ({ ...clue, rowIndex })),
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
      setSelectedGameKind('learn');
      setScore(0);
      setTeamScores([]);
      setShowWinScreen(false);
      revealedClueIdsRef.current = new Set();

      const key = `learn:${Date.now()}`;
      setEpisodeKey(key);
      const totalClues = game.categories.reduce((sum, c) => sum + c.clues.length, 0);
      initEpisodeStats({ episodeKey: key, showNumber: null, mode: 'learn' , totalClues });
      setLocalEpisodeStats(getEpisodeStats(key));
      buildBoard(game, 'single');
    } catch {
      alert('Could not load your Learn clues.');
    }
  }

  function selectClue(clue: JeopardyClue, catId: string, value: number) {
    let wageredValue = value;
    let respondentTeamIndex: number | null = null;
    let respondentLocked = false;

    if (clue.dailyDouble && currentRound !== 'final') {
      const chooserName = teamScores[chooserTeamIndex]?.name ?? 'Chooser';
      const input = window.prompt(`Daily Double! ${chooserName}, enter wager:`, String(Math.max(200, value)));
      const parsed = input ? Number(input.replace(/[^\d]/g, '')) : NaN;
      if (!Number.isNaN(parsed) && parsed > 0) wageredValue = parsed;
      if (sessionType === 'competition') {
        respondentTeamIndex = chooserTeamIndex;
        respondentLocked = true;
      }
    }

    setActiveClue({
      clue,
      catId,
      boardValue: value,
      scoreValue: wageredValue,
      respondentTeamIndex,
      respondentLocked,
    });
  }

  function revealClue() {
    if (!activeClue) return;
    setBoard(prev => ({
      ...prev,
      [activeClue.catId]: {
        ...prev[activeClue.catId],
        [activeClue.boardValue]: {
          ...prev[activeClue.catId][activeClue.boardValue],
          revealed: true,
        },
      },
    }));

    setActiveClue(null);

    if (!selectedGame) return;
    const totalClues = selectedGame.categories.reduce((sum, c) => sum + c.clues.length, 0);
    revealedClueIdsRef.current.add(activeClue.clue.id);
    if (revealedClueIdsRef.current.size >= totalClues) {
      if (episodeKey) {
        markEpisodeCompleted(episodeKey);
        setLocalEpisodeStats(getEpisodeStats(episodeKey));
        setLocalOverallStats(getOverallStats());
      }
      setShowWinScreen(true);
    }
  }

  function applyScore(delta: number, responderIndex: number | null) {
    if (sessionType === 'competition') {
      const target = responderIndex ?? chooserTeamIndex;
      setTeamScores(prev => prev.map((team, i) => (i === target ? { ...team, score: team.score + delta } : team)));
      return;
    }
    setScore(prev => prev + delta);
  }

  async function recordOutcome(outcome: 'correct' | 'incorrect' | 'skip') {
    if (!activeClue) return;

    if (episodeKey) {
      recordEpisodeOutcome({
        episodeKey,
        outcome,
        clue: activeClue.clue,
      });
      setLocalEpisodeStats(getEpisodeStats(episodeKey));
      setLocalOverallStats(getOverallStats());
    }

    if (!authUser) return;
    try {
      await postJson('/api/user/progress', {
        outcome,
        clue: {
          clueId: activeClue.clue.clueId,
          question: activeClue.clue.question,
          answer: activeClue.clue.answer,
          value: activeClue.clue.value,
          dailyDouble: activeClue.clue.dailyDouble,
          tripleStumper: activeClue.clue.tripleStumper,
          isFinalJeopardy: activeClue.clue.isFinalJeopardy,
          category: activeClue.clue.category,
          round: activeClue.clue.round,
        },
      });
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const me = await meRes.json();
        setUserStats(me.stats ?? null);
      }
    } catch {
    }
  }

  async function handleCorrect() {
    if (!activeClue) return;
    const responder = activeClue.respondentTeamIndex;
    await recordOutcome('correct');
    applyScore(activeClue.scoreValue, responder);
    if (sessionType === 'competition' && responder != null) {
      setChooserTeamIndex(responder);
    }
    revealClue();
  }

  async function handleIncorrect() {
    if (!activeClue) return;
    const responder = activeClue.respondentTeamIndex;
    await recordOutcome('incorrect');
    applyScore(-activeClue.scoreValue, responder);
    revealClue();
  }

  async function handleSkip() {
    await recordOutcome('skip');
    revealClue();
  }

  async function finishGameAndBack() {
    if (authUser) {
      try {
        await postJson('/api/user/game-complete', {
          endMoney: sessionType === 'competition' ? 0 : score,
          showNumber: selectedGame?.showNumber ?? null,
        });
        const meRes = await fetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setUserStats(me.stats ?? null);
        }
      } catch {
      }
    }

    setSelectedGame(null);
    setSelectedGameKind(null);
    setActiveClue(null);
    setShowWinScreen(false);
    setEpisodeKey(null);
    setLocalEpisodeStats(null);
    revealedClueIdsRef.current = new Set();
  }

  function getWinningTeamName() {
    if (sessionType !== 'competition' || teamScores.length === 0) return null;
    const sorted = [...teamScores].sort((a, b) => b.score - a.score);
    return sorted[0]?.name ?? null;
  }

  function renderBoard() {
    if (!selectedGame) return null;
    const roundCats = selectedGame.categories.filter(c => c.round === currentRound);
    const values = currentRound === 'double' ? VALUES_DOUBLE : currentRound === 'triple' ? VALUES_TRIPLE : currentRound === 'final' ? [0] : VALUES_SINGLE;

    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {roundCats.map(cat => (
                <th key={cat.id} className="bg-blue-800 p-3 text-center text-sm font-bold uppercase border border-blue-900">{cat.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map(value => (
              <tr key={value}>
                {roundCats.map(cat => {
                  const cell = board[cat.id]?.[value];
                  if (!cell) {
                    return <td key={cat.id} className="border border-blue-900 p-1"><div className="w-full h-16 bg-blue-900 rounded" /></td>;
                  }

                  const userData = cell.clue.clueId ? getClueUserData(cell.clue.clueId) : null;
                  const tripleClass = normalizeTripleStumperColor
                    ? 'bg-blue-700 hover:bg-blue-600 text-yellow-400'
                    : 'bg-orange-800 hover:bg-orange-700 text-yellow-400';

                  return (
                    <td key={cat.id} className="border border-blue-900 p-1">
                      {!cell.revealed ? (
                        <button
                          onClick={() => selectClue(cell.clue, cat.id, value)}
                          className={`w-full h-16 font-bold text-xl rounded transition-colors relative ${
                            cell.clue.tripleStumper ? tripleClass : 'bg-blue-700 hover:bg-blue-600 text-yellow-400'
                          }`}>
                          {currentRound === 'final' ? 'FINAL' : `$${value}`}
                          {(userData?.flagged || userData?.mediaFlag) && (
                            <span className="absolute top-1 right-1 text-xs">
                              {userData.flagged ? '🚩' : ''}
                              {userData.mediaFlag ? '🎬' : ''}
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

  if (loading) {
    return <div className="min-h-screen bg-blue-950 flex items-center justify-center text-white text-2xl">Loading…</div>;
  }

  if (selectedGame) {
    const hasDouble = selectedGame.categories.some(c => c.round === 'double');
    const hasTriple = selectedGame.categories.some(c => c.round === 'triple');
    const hasFinal = selectedGame.categories.some(c => c.round === 'final');

    return (
      <div className="min-h-screen bg-blue-950 text-white p-4">
        {showWinScreen && (
          <div className="fixed inset-0 z-50 bg-blue-950/95 flex items-center justify-center p-6">
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 60 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute text-2xl animate-bounce"
                  style={{ left: `${(i * 17) % 100}%`, top: `${(i * 13) % 100}%`, animationDelay: `${(i % 10) * 0.1}s` }}>
                  🎉
                </span>
              ))}
            </div>
            <div className="relative bg-blue-900 border border-blue-700 rounded-2xl p-8 w-full max-w-2xl text-center">
              <h2 className="text-4xl font-bold text-yellow-300 mb-3">Game Complete!</h2>
              {sessionType === 'competition' ? (
                <p className="text-xl mb-4">🏆 Winner: <span className="font-bold text-yellow-300">{getWinningTeamName()}</span></p>
              ) : (
                <p className="text-xl mb-4">Final score: <span className="font-bold text-yellow-300">${score.toLocaleString()}</span></p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedGameKind === 'replay' && (
                  <>
                    <button onClick={replayNextEpisode} className="bg-yellow-400 text-blue-950 px-4 py-3 rounded-xl font-bold">Replay next episode</button>
                    <button onClick={startRandomReplayFromFilters} className="bg-yellow-400 text-blue-950 px-4 py-3 rounded-xl font-bold">Replay random episode</button>
                    <button onClick={() => { setShowWinScreen(false); setSelectedGame(null); setSelectedGameKind(null); }} className="bg-blue-700 px-4 py-3 rounded-xl font-bold">Choose episode</button>
                    <Link href="/" className="bg-blue-700 px-4 py-3 rounded-xl font-bold">Main Menu</Link>
                  </>
                )}

                {selectedGameKind !== 'replay' && (
                  <>
                    <button
                      onClick={() => {
                        setShowWinScreen(false);
                        if (selectedGameKind === 'random') void startRandom();
                        if (selectedGameKind === 'custom') void startCustom();
                        if (selectedGameKind === 'learn') void startLearnMode();
                      }}
                      className="bg-yellow-400 text-blue-950 px-4 py-3 rounded-xl font-bold">
                      {selectedGameKind === 'random' ? 'Create new episode' : 'Play again'}
                    </button>
                    <Link href="/" className="bg-blue-700 px-4 py-3 rounded-xl font-bold">Main Menu</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mb-4 gap-3">
            <div className="flex items-center gap-3">
              <button onClick={finishGameAndBack} className="text-yellow-400 hover:underline">← Back</button>
              <Link href="/" className="text-blue-300 hover:text-blue-200 font-bold">Main Menu</Link>
            </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold text-yellow-400">{selectedGame.showNumber ? `Show #${selectedGame.showNumber}` : 'Jeopardy'}</h1>
            <div className="text-sm text-gray-300">{sessionType === 'competition' ? 'Competition' : 'Practice'} mode</div>
          </div>
          {sessionType === 'competition' ? (
            <div className="text-right">
              {teamScores.map((team, index) => (
                <div key={`${team.name}-${index}`} className={`text-sm ${index === chooserTeamIndex ? 'text-yellow-300 font-bold' : 'text-white'}`}>
                  {team.name}: ${team.score.toLocaleString()}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-right">
              <div className="text-2xl font-bold">${score.toLocaleString()}</div>
              {localEpisodeStats && (
                <div className="text-xs text-blue-200">Episode C/W/S: {localEpisodeStats.correctAnswers}/{localEpisodeStats.incorrectAnswers}/{localEpisodeStats.skippedQuestions}</div>
              )}
              <div className="text-xs text-blue-300">Overall C/W/S: {localOverallStats.correctAnswers}/{localOverallStats.incorrectAnswers}/{localOverallStats.skippedQuestions}</div>
            </div>
          )}
        </div>

        <div className="mb-3 flex gap-2">
          <button onClick={() => setShowSettings(prev => !prev)} className="px-3 py-2 rounded-lg bg-blue-800 hover:bg-blue-700 text-sm font-bold">Settings</button>
          {sessionType === 'competition' && teamScores[chooserTeamIndex] && (
            <div className="text-sm text-blue-200 py-2">Category control: <span className="text-yellow-300 font-bold">{teamScores[chooserTeamIndex].name}</span></div>
          )}
        </div>

        {showSettings && (
          <div className="max-w-3xl bg-blue-900 rounded-xl p-3 mb-4">
            <label className="text-sm text-blue-200 flex items-center gap-2">
              <input type="checkbox" checked={normalizeTripleStumperColor} onChange={e => setNormalizeTripleStumperColor(e.target.checked)} />
              Triple stumper as blue
            </label>
          </div>
        )}

        {sessionType === 'competition' && teamScores.length > 0 && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm text-blue-300">Category chooser:</label>
            <select value={chooserTeamIndex} onChange={e => setChooserTeamIndex(Number(e.target.value))} className="bg-blue-800 border border-blue-600 rounded px-2 py-1 text-sm">
              {teamScores.map((team, index) => (
                <option key={`${team.name}-${index}`} value={index}>{team.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 mb-4 flex-wrap">
          <button onClick={() => buildBoard(selectedGame, 'single')} className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'single' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>Jeopardy!</button>
          {hasDouble && <button onClick={() => buildBoard(selectedGame, 'double')} className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'double' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>Double Jeopardy!</button>}
          {hasTriple && <button onClick={() => buildBoard(selectedGame, 'triple')} className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'triple' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>Triple Jeopardy!</button>}
          {hasFinal && <button onClick={() => buildBoard(selectedGame, 'final')} className={`px-4 py-2 rounded-lg font-bold ${currentRound === 'final' ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800'}`}>Final Jeopardy</button>}
        </div>

        {activeClue && (
          <ClueModal
            clue={activeClue.clue}
            value={activeClue.scoreValue}
            onCorrect={handleCorrect}
            onIncorrect={handleIncorrect}
            onSkip={handleSkip}
            respondentLabel={sessionType === 'competition' && activeClue.respondentTeamIndex != null ? teamScores[activeClue.respondentTeamIndex]?.name : undefined}
            teamOptions={sessionType === 'competition' ? teamScores.map(t => t.name) : undefined}
            respondentIndex={activeClue.respondentTeamIndex}
            onRespondentChange={index => setActiveClue(prev => prev ? { ...prev, respondentTeamIndex: index } : prev)}
            lockRespondent={activeClue.respondentLocked}
          />
        )}

        {renderBoard()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 text-white p-8">
      <div className="max-w-5xl mx-auto mb-3">
        <Link href="/" className="text-blue-300 hover:text-blue-200 font-bold">← Main Menu</Link>
      </div>
      <h1 className="text-4xl font-bold text-yellow-400 mb-2 text-center">Jeopardy!</h1>

      <div className="max-w-5xl mx-auto bg-blue-900 rounded-xl p-4 mb-5 text-sm">
        {authUser ? (
          <div className="grid md:grid-cols-2 gap-3 items-center">
            <div>Signed in as <span className="text-yellow-300 font-bold">{authUser.username}</span></div>
            {userStats && (
              <div className="grid grid-cols-3 gap-2 text-blue-200 text-xs md:text-sm">
                <div>Games: {userStats.gamesPlayed}</div>
                <div>Avg $: {userStats.averageEndMoney}</div>
                <div>Episodes: {userStats.episodesCompleted}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-blue-200">Sign in on the home page to sync stats and Learn mode across devices.</div>
        )}
      </div>

      <div className="flex justify-center gap-2 mb-4">
        {(['competition', 'practice'] as SessionType[]).map(type => (
          <button key={type} onClick={() => setSessionType(type)} className={`px-5 py-2 rounded-lg font-bold capitalize ${sessionType === type ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'}`}>{type}</button>
        ))}
      </div>

      {sessionType === 'competition' && (
        <div className="max-w-3xl mx-auto bg-blue-900 rounded-xl p-4 mb-5">
          <label className="block text-sm font-bold text-blue-300 mb-1">Players/teams (comma separated)</label>
          <input value={teamNamesInput} onChange={e => setTeamNamesInput(e.target.value)} className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2" placeholder="Team 1, Team 2" />
        </div>
      )}

      <div className="max-w-5xl mx-auto flex items-center justify-center gap-2 mb-5 flex-wrap">
        {(['replay', 'random', 'custom', 'learn'] as JeopardyMethod[]).map(m => (
          <button key={m} onClick={() => setMethod(m)} className={`px-4 py-2 rounded-lg font-bold capitalize ${method === m ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'}`}>{m}</button>
        ))}
        <button onClick={() => setShowSettings(prev => !prev)} className="px-4 py-2 rounded-lg font-bold bg-blue-800 hover:bg-blue-700">Settings</button>
      </div>

      {showSettings && (
        <div className="max-w-3xl mx-auto bg-blue-900 rounded-xl p-4 mb-5">
          <label className="text-sm text-blue-200 flex items-center gap-2">
            <input type="checkbox" checked={normalizeTripleStumperColor} onChange={e => setNormalizeTripleStumperColor(e.target.checked)} />
            Triple stumper as blue
          </label>
        </div>
      )}

      {method === 'replay' && (
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="bg-blue-900 rounded-xl p-4">
            <div className="text-sm text-blue-200 mb-2">Seasons</div>
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setSelectedSeasons(Array.from({ length: 42 }, (_, i) => i + 1))}
                className="px-3 py-1 rounded text-xs font-bold bg-blue-800 hover:bg-blue-700">
                All
              </button>
              <button
                onClick={() => setSelectedSeasons([])}
                className="px-3 py-1 rounded text-xs font-bold bg-blue-800 hover:bg-blue-700">
                None
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {Array.from({ length: 42 }).map((_, i) => {
                const season = i + 1;
                const active = selectedSeasons.includes(season);
                return (
                  <button key={season} onClick={() => toggleSeason(season)} className={`px-2 py-1 rounded text-xs font-bold ${active ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'}`}>
                    {season}
                  </button>
                );
              })}
            </div>

            <div className="text-sm text-blue-200 mb-2">Episode type</div>
            <div className="flex flex-wrap gap-2 mb-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={includeRegularEpisodes} onChange={e => setIncludeRegularEpisodes(e.target.checked)} />
                Regular episodes
              </label>
              {availableSpecialTypes.map(type => (
                <button key={type} onClick={() => toggleSpecialType(type)} className={`px-3 py-1 rounded text-xs font-bold ${selectedSpecialTypes.includes(type) ? 'bg-yellow-400 text-blue-950' : 'bg-blue-800 hover:bg-blue-700'}`}>
                  {type}
                </button>
              ))}
            </div>

            <button onClick={startRandomReplayFromFilters} className="bg-yellow-400 text-blue-950 font-bold rounded px-4 py-2">Random replay episode</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReplayGames().map(game => (
              <button key={game.id} onClick={() => startReplay(game)} className="bg-blue-800 hover:bg-blue-700 rounded-xl p-6 text-left">
                <div className="text-xl font-bold">Show #{game.showNumber}</div>
                <div className="text-sm text-blue-300">{game.airDate}</div>
                {getEffectiveSeason(game) && <div className="text-sm text-blue-300">Season {getEffectiveSeason(game)}</div>}
                {game.isSpecial && <div className="text-xs mt-1 text-yellow-300">{game.tournamentType || 'Other Special'}</div>}
              </button>
            ))}
          </div>
        </div>
      )}

      {method === 'random' && (
        <div className="max-w-xl mx-auto bg-blue-900 rounded-xl p-6 space-y-3">
          <label className="block text-sm text-blue-300">Number of categories</label>
          <input type="number" min={2} max={8} value={randomCategoryCount} onChange={e => setRandomCategoryCount(Math.max(2, Math.min(8, Number(e.target.value) || 6)))} className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomIncludeDouble} onChange={e => setRandomIncludeDouble(e.target.checked)} /> Enable Double Jeopardy</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomIncludeTriple} onChange={e => setRandomIncludeTriple(e.target.checked)} /> Enable Triple Jeopardy (third board)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomIncludeFinal} onChange={e => setRandomIncludeFinal(e.target.checked)} /> Add Final Jeopardy</label>
          <button onClick={startRandom} disabled={loadingLibrary} className="w-full bg-yellow-400 text-blue-950 font-bold py-3 rounded-xl disabled:opacity-60">
            {loadingLibrary ? `Loading clue library… ${libraryProgress.loaded}/${libraryProgress.total}` : 'Build Random Game'}
          </button>
        </div>
      )}

      {method === 'custom' && (
        <div className="max-w-2xl mx-auto bg-blue-900 rounded-xl p-6 space-y-4">
          <input type="text" value={customSearch} onChange={e => setCustomSearch(e.target.value)} placeholder="Search clues, answers, categories" className="w-full bg-blue-800 border border-blue-600 rounded px-3 py-2" />
          <div className="grid md:grid-cols-2 gap-3">
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.dailyDoublesOnly)} onChange={e => setCustomFilter(prev => ({ ...prev, dailyDoublesOnly: e.target.checked || undefined }))} /> Daily Doubles only</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.tripleStumpersOnly)} onChange={e => setCustomFilter(prev => ({ ...prev, tripleStumpersOnly: e.target.checked || undefined }))} /> Triple stumpers only</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.finalOnly)} onChange={e => setCustomFilter(prev => ({ ...prev, finalOnly: e.target.checked || undefined }))} /> Final only</label>
            <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={Boolean(customFilter.flaggedOnly)} onChange={e => setCustomFilter(prev => ({ ...prev, flaggedOnly: e.target.checked || undefined }))} /> Flagged only</label>
          </div>
          <button onClick={startCustom} disabled={customBuilding} className="w-full bg-yellow-400 text-blue-950 font-bold py-3 rounded-xl disabled:opacity-60">{customBuilding ? 'Building…' : 'Build Custom Game'}</button>
        </div>
      )}

      {method === 'learn' && (
        <div className="max-w-xl mx-auto text-center bg-blue-900 rounded-xl p-6">
          <p className="text-blue-200 mb-4">Study your missed and skipped clues from your local tracker history.</p>
          <button onClick={startLearnMode} className="bg-yellow-400 text-blue-950 px-8 py-3 rounded-xl font-bold">Start Learn Game</button>
        </div>
      )}

      {dataSource === 'empty' && <p className="text-center mt-6 text-blue-300">No Jeopardy data loaded yet.</p>}
    </div>
  );
}
