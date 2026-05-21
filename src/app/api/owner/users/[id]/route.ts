import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireOwner } from '@/lib/owner';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireOwner(req);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const nextIsOwner = Boolean(body?.isOwner);

  if (id === auth.user.id) {
    return NextResponse.json({ error: 'You cannot change your own owner status.' }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isOwner: nextIsOwner },
    select: {
      id: true,
      username: true,
      email: true,
      isOwner: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: updated });
}
