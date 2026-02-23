import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JeopardyGameData, JeopardyIndexEntry } from '@/types/jeopardy';

export const runtime = 'nodejs';
export const dynamic = 'force-static';

function clueId(gameId: number, round: 'single' | 'double' | 'final', categoryPosition: number, rowIndex: number) {
  const roundKey = round === 'single' ? 's' : round === 'double' ? 'd' : 'f';
  return `g${gameId}-${roundKey}-c${categoryPosition}-r${rowIndex}`;
}

function normalizeGame(game: JeopardyGameData): JeopardyGameData {
  return {
    ...game,
    categories: (game.categories || []).map((category) => ({
      ...category,
      clues: (category.clues || []).map((clue, rowIndex) => ({
        ...clue,
        clueId: clueId(game.gameId, category.round, category.position, rowIndex),
        rowIndex,
        category: category.name,
        round: category.round,
        isFinalJeopardy: category.round === 'final',
        value: category.round === 'final' ? null : clue.value,
      })),
    })),
  };
}

async function writeJson(filePath: string, payload: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readIndex(indexPath: string): Promise<JeopardyIndexEntry[]> {
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw) as JeopardyIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function upsertIndexEntry(entries: JeopardyIndexEntry[], entry: JeopardyIndexEntry): JeopardyIndexEntry[] {
  const filtered = entries.filter((existing) => existing.gameId !== entry.gameId);
  return [entry, ...filtered].sort((left, right) => right.gameId - left.gameId);
}

export async function GET() {
  return NextResponse.json({
    message: 'POST { game } to write a Jeopardy game JSON file and upsert index.json.',
    note: 'This writes repository files and is intended for local/server usage (not GitHub Pages static hosting).',
  });
}

export async function POST(req: Request) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json(
      { error: 'File write API is disabled in GitHub Pages static mode.' },
      { status: 501 },
    );
  }

  let body: { game?: JeopardyGameData };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const incoming = body.game;
  if (!incoming || !Number.isFinite(incoming.gameId) || !Array.isArray(incoming.categories)) {
    return NextResponse.json({ error: '"game" must be a valid JeopardyGameData object' }, { status: 400 });
  }

  const normalized = normalizeGame(incoming);
  const fileName = `game-${normalized.gameId}.json`;
  const indexEntry: JeopardyIndexEntry = {
    gameId: normalized.gameId,
    showNumber: normalized.showNumber,
    airDate: normalized.airDate,
    season: normalized.season,
    isSpecial: normalized.isSpecial,
    tournamentType: normalized.tournamentType,
    file: fileName,
  };

  const root = process.cwd();
  const pubGamePath = path.join(root, 'public', 'data', 'jeopardy', fileName);
  const docsGamePath = path.join(root, 'docs', 'data', 'jeopardy', fileName);
  const pubIndexPath = path.join(root, 'public', 'data', 'jeopardy', 'index.json');
  const docsIndexPath = path.join(root, 'docs', 'data', 'jeopardy', 'index.json');

  try {
    await writeJson(pubGamePath, normalized);
    await writeJson(docsGamePath, normalized);

    const pubIndex = await readIndex(pubIndexPath);
    const mergedIndex = upsertIndexEntry(pubIndex, indexEntry);

    await writeJson(pubIndexPath, mergedIndex);
    await writeJson(docsIndexPath, mergedIndex);

    return NextResponse.json({
      gameId: normalized.gameId,
      file: `public/data/jeopardy/${fileName}`,
      updatedIndex: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write Jeopardy game files' },
      { status: 500 },
    );
  }
}
