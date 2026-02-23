import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { JeopardyGameData } from '@/types/jeopardy';

export const dynamic = 'force-static';

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const cleaned = tags
    .map(tag => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(cleaned));
}

function extractGameId(clueId: string): number | null {
  const match = /^g(\d+)-/.exec(clueId);
  if (!match) return null;
  const gameId = Number(match[1]);
  return Number.isFinite(gameId) ? gameId : null;
}

async function persistTagsInGameFile(filePath: string, clueId: string, tags: string[]): Promise<boolean> {
  const raw = await fs.readFile(filePath, 'utf8');
  const game = JSON.parse(raw) as JeopardyGameData;

  let updated = false;
  game.categories = game.categories.map(category => ({
    ...category,
    clues: category.clues.map(clue => {
      if (clue.clueId !== clueId) return clue;
      updated = true;
      return { ...clue, topicTags: tags };
    }),
  }));

  if (!updated) return false;
  await fs.writeFile(filePath, `${JSON.stringify(game, null, 2)}\n`, 'utf8');
  return true;
}

export async function GET() {
  return NextResponse.json({
    message: 'POST { clueId, tags } to persist topic tags into Jeopardy game JSON files.',
    note: 'Intended for local/server usage where repository files are writable.',
  });
}

export async function POST(req: Request) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json(
      { error: 'File write API is disabled in GitHub Pages static mode.' },
      { status: 501 },
    );
  }

  let body: { clueId?: string; tags?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clueId = (body.clueId || '').trim();
  if (!clueId) {
    return NextResponse.json({ error: '"clueId" is required' }, { status: 400 });
  }

  const gameId = extractGameId(clueId);
  if (!gameId) {
    return NextResponse.json({ error: 'Invalid clueId format' }, { status: 400 });
  }

  const tags = normalizeTags(body.tags);
  const root = process.cwd();
  const pubPath = path.join(root, 'public', 'data', 'jeopardy', `game-${gameId}.json`);
  const docsPath = path.join(root, 'docs', 'data', 'jeopardy', `game-${gameId}.json`);

  try {
    const pubUpdated = await persistTagsInGameFile(pubPath, clueId, tags);
    if (!pubUpdated) {
      return NextResponse.json({ error: `Clue ${clueId} not found in game-${gameId}.json` }, { status: 404 });
    }
    await persistTagsInGameFile(docsPath, clueId, tags);

    return NextResponse.json({
      clueId,
      tags,
      files: [
        `public/data/jeopardy/game-${gameId}.json`,
        `docs/data/jeopardy/game-${gameId}.json`,
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to persist tags' },
      { status: 500 },
    );
  }
}
