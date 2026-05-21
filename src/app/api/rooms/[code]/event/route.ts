import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set([
  'answer-submitted',
  'grouping-selection',
  'ranking-selection',
  'buzz-in',
  'wager-submitted',
  'answer-revealed',
  'score-updated',
  'state-updated',
]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const room = await prisma.multiplayerRoom.findUnique({ where: { code: roomCode } });
  if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const event = String(body?.event || '').trim();
  const payload = body?.payload ?? {};

  if (!ALLOWED_EVENTS.has(event)) {
    return NextResponse.json({ error: 'Unsupported event.' }, { status: 400 });
  }

  if (!pusherServer) {
    return NextResponse.json({ error: 'Pusher is not configured.' }, { status: 503 });
  }

  if (event === 'score-updated' || event === 'buzz-in' || event === 'wager-submitted') {
    const currentState = (room.gameState && typeof room.gameState === 'object') ? room.gameState as Record<string, unknown> : {};
    const updatedState: Record<string, unknown> = { ...currentState };
    if (event === 'score-updated' && payload && typeof payload === 'object') {
      updatedState.scores = (payload as { scores?: unknown }).scores ?? currentState.scores ?? {};
    }
    if (event === 'buzz-in') {
      updatedState.buzz = { ...(payload as object), lockedAt: new Date().toISOString() };
    }
    if (event === 'wager-submitted') {
      const wagers = (currentState.wagers && typeof currentState.wagers === 'object') ? currentState.wagers as Record<string, unknown> : {};
      const submittedBy = String((payload as { playerId?: string }).playerId || 'unknown');
      updatedState.wagers = { ...wagers, [submittedBy]: payload };
    }
    await prisma.multiplayerRoom.update({
      where: { code: roomCode },
      data: { gameState: updatedState as Prisma.InputJsonValue },
    });
  }

  await pusherServer.trigger(`game-${roomCode}`, event, {
    roomCode,
    ...payload,
  });

  return NextResponse.json({ ok: true });
}
