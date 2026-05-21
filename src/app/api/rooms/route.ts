import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';
import { createRoomCode } from '@/lib/multiplayer';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'jeopardy' ? 'jeopardy' : 'party';
  const gameConfig = body?.gameConfig ?? {};
  const hostName = String(body?.hostName || '').trim();
  const user = process.env.GITHUB_PAGES === 'true' ? null : await getUserFromRequest(req);

  for (let attempt = 0; attempt < 10; attempt++) {
    const code = createRoomCode(6);
    try {
      const hostPlayerName = hostName || user?.username || 'Host';
      const room = await prisma.multiplayerRoom.create({
        data: {
          code,
          mode,
          hostUserId: user?.id || null,
          gameConfig,
          players: [
            {
              id: user?.id || `guest-${randomUUID().slice(0, 8)}`,
              userId: user?.id,
              name: hostPlayerName,
              team: body?.team || null,
              isHost: true,
              joinedAt: new Date().toISOString(),
            },
          ],
          gameState: { scores: {}, phase: 'lobby' },
        },
      });
      return NextResponse.json({ room }, { status: 201 });
    } catch {
      // retry code collisions
    }
  }

  return NextResponse.json({ error: 'Failed to create room.' }, { status: 500 });
}
