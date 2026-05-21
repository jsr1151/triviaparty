import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import type { JeopardyEpisodeMode } from '@/lib/jeopardy-episode-progress';
import {
  completeEpisodeProgress,
  listEpisodeProgressForUser,
  restartEpisodeProgress,
  revealEpisodeClue,
  startEpisodeProgress,
  updateEpisodeSessionState,
} from '@/lib/server-jeopardy-progress';

export const dynamic = 'force-dynamic';

const VALID_MODES: JeopardyEpisodeMode[] = ['practice', 'competition', 'learn'];

function parseMode(mode: unknown): JeopardyEpisodeMode | null {
  if (typeof mode !== 'string') return null;
  return VALID_MODES.includes(mode as JeopardyEpisodeMode) ? (mode as JeopardyEpisodeMode) : null;
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ progress: [] }, { status: 401 });

  try {
    const progress = await listEpisodeProgressForUser(user.id);
    return NextResponse.json({ progress });
  } catch {
    return NextResponse.json({ error: 'Failed to load Jeopardy progress.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  try {
    const body = await req.json();
    const action = String(body.action ?? '');
    const episodeKey = String(body.episodeKey ?? '');
    const mode = parseMode(body.mode);
    const showNumber = body.showNumber != null ? Number(body.showNumber) : null;
    const totalClues = Number(body.totalClues ?? 0);

    if (!episodeKey || !mode) {
      return NextResponse.json({ error: 'Invalid episode progress payload.' }, { status: 400 });
    }

    if (action === 'reveal') {
      const clueId = String(body.clueId ?? '');
      if (!clueId) return NextResponse.json({ error: 'clueId is required.' }, { status: 400 });
      const progress = await revealEpisodeClue({ userId: user.id, episodeKey, mode, clueId });
      return NextResponse.json({ progress });
    }

    if (action === 'state') {
      const progress = await updateEpisodeSessionState({
        userId: user.id,
        episodeKey,
        mode,
        sessionState: body.sessionState && typeof body.sessionState === 'object' ? body.sessionState : {},
      });
      return NextResponse.json({ progress });
    }

    if (!Number.isFinite(totalClues) || totalClues < 0) {
      return NextResponse.json({ error: 'totalClues is required.' }, { status: 400 });
    }

    if (action === 'start') {
      const progress = await startEpisodeProgress({
        userId: user.id,
        episodeKey,
        showNumber: Number.isFinite(showNumber) ? showNumber : null,
        mode,
        totalClues,
      });
      return NextResponse.json({ progress });
    }

    if (action === 'restart') {
      const progress = await restartEpisodeProgress({
        userId: user.id,
        episodeKey,
        showNumber: Number.isFinite(showNumber) ? showNumber : null,
        mode,
        totalClues,
      });
      return NextResponse.json({ progress });
    }

    if (action === 'complete') {
      const progress = await completeEpisodeProgress({
        userId: user.id,
        episodeKey,
        mode,
        totalClues,
      });
      return NextResponse.json({ progress });
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to update Jeopardy progress.' }, { status: 500 });
  }
}
