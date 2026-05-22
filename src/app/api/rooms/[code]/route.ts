import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = await prisma.multiplayerRoom.findUnique({
    where: { code: code.toUpperCase() },
  });
  if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });
  return NextResponse.json({ room });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const room = await prisma.multiplayerRoom.findUnique({
    where: { code: code.toUpperCase() },
  });
  if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const user = process.env.GITHUB_PAGES === 'true' ? null : await getUserFromRequest(req);
  if (room.hostUserId && room.hostUserId !== user?.id) {
    return NextResponse.json({ error: 'Only the host can update room state.' }, { status: 403 });
  }

  const updated = await prisma.multiplayerRoom.update({
    where: { code: code.toUpperCase() },
    data: {
      status: body?.status || room.status,
      gameState: body?.gameState ?? room.gameState,
      gameConfig: body?.gameConfig && room.status === 'lobby' ? body.gameConfig : room.gameConfig,
    },
  });

  if (pusherServer) {
    await pusherServer.trigger(`game-${updated.code}`, 'state-updated', {
      roomCode: updated.code,
      status: updated.status,
      gameState: updated.gameState,
    });
  }

  return NextResponse.json({ room: updated });
}
