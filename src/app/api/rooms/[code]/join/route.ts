import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';
import { parsePlayers } from '@/lib/multiplayer';
import { pusherServer } from '@/lib/pusher';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const roomCode = code.toUpperCase();
  const room = await prisma.multiplayerRoom.findUnique({ where: { code: roomCode } });
  if (!room) return NextResponse.json({ error: 'Room not found.' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const user = process.env.GITHUB_PAGES === 'true' ? null : await getUserFromRequest(req);
  const displayName = String(body?.displayName || user?.username || '').trim();
  const team = String(body?.team || '').trim();

  if (!displayName) {
    return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });
  }

  const existingPlayers = parsePlayers(room.players);
  const playerId = user?.id || `guest-${randomUUID().slice(0, 8)}`;
  const already = existingPlayers.find((player) => player.userId ? player.userId === user?.id : player.name === displayName);
  const nextPlayers = already
    ? existingPlayers.map((player) => (player === already ? { ...player, name: displayName, team: team || undefined } : player))
    : [...existingPlayers, { id: playerId, userId: user?.id, name: displayName, team: team || undefined, joinedAt: new Date().toISOString() }];

  const updated = await prisma.multiplayerRoom.update({
    where: { code: roomCode },
    data: { players: nextPlayers },
  });

  if (pusherServer) {
    await pusherServer.trigger(`game-${roomCode}`, 'player-joined', {
      roomCode,
      players: nextPlayers,
    });
  }

  return NextResponse.json({ room: updated, playerId });
}
