import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if ('error' in auth) return auth.error;

  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      email: true,
      isOwner: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}
