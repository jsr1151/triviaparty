import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ clues: [] }, { status: 401 });
  }

  const clues = await prisma.userClueProgress.findMany({
    where: {
      userId: user.id,
      OR: [{ lastOutcome: 'incorrect' }, { lastOutcome: 'skip' }],
    },
    orderBy: { updatedAt: 'desc' },
    take: 400,
  });

  return NextResponse.json({ clues });
}
