import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '10');
  const page = parseInt(searchParams.get('page') || '1');

  const [games, total] = await Promise.all([
    prisma.jeopardyGame.findMany({
      include: { categories: { include: { clues: true } } },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { airDate: 'desc' },
    }),
    prisma.jeopardyGame.count(),
  ]);

  return NextResponse.json({ games, total, page, limit });
}
