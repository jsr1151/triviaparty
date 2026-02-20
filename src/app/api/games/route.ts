import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

export async function GET(req: NextRequest) {
  let mode: string | null = null;
  let status: string | null = null;

  if (process.env.GITHUB_PAGES !== 'true') {
    const { searchParams } = new URL(req.url);
    mode = searchParams.get('mode');
    status = searchParams.get('status');
  }

  try {
    const where: Record<string, unknown> = {};
    if (mode) where.mode = mode;
    if (status) where.status = status;

    const games = await prisma.game.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({ games });
  } catch {
    return NextResponse.json({ games: [] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { mode, players } = body;

  if (!mode) {
    return NextResponse.json({ error: 'mode is required' }, { status: 400 });
  }

  const game = await prisma.game.create({
    data: {
      mode,
      status: 'waiting',
      players: players || [],
      score: {},
    },
  });

  revalidatePath('/api/games');
  return NextResponse.json(game, { status: 201 });
}
