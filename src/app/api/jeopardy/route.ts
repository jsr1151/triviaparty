import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

export async function GET(req: NextRequest) {
  let limit = 10;
  let page = 1;

  if (process.env.GITHUB_PAGES !== 'true') {
    const { searchParams } = new URL(req.url);
    limit = parseInt(searchParams.get('limit') || '10');
    page = parseInt(searchParams.get('page') || '1');
  }

  try {
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
  } catch {
    return NextResponse.json({ games: [], total: 0, page, limit });
  }
}
