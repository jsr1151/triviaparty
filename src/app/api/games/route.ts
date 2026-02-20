import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('mode');
  const status = searchParams.get('status');

  const where: Record<string, unknown> = {};
  if (mode) where.mode = mode;
  if (status) where.status = status;

  const games = await prisma.game.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ games });
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

  return NextResponse.json(game, { status: 201 });
}
