import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

export async function isOwner(userId: string): Promise<boolean> {
  if (!userId) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isOwner: true },
  });
  return Boolean(user?.isOwner);
}

export async function requireOwner(req: NextRequest) {
  if (process.env.GITHUB_PAGES === 'true') {
    return { error: NextResponse.json({ error: 'Owner routes require a server deployment.' }, { status: 403 }) };
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return { error: NextResponse.json({ error: 'Authentication required.' }, { status: 401 }) };
  }

  if (!user.isOwner && !(await isOwner(user.id))) {
    return { error: NextResponse.json({ error: 'Owner access required.' }, { status: 403 }) };
  }

  return { user };
}
