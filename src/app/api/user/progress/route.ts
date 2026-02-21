import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { recordClueOutcomeServer } from '@/lib/server-user-stats';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const outcome = body.outcome as 'correct' | 'incorrect' | 'skip';
    const clue = body.clue as {
      clueId: string;
      question: string;
      answer: string;
      value: number | null;
      dailyDouble: boolean;
      tripleStumper: boolean;
      isFinalJeopardy: boolean;
      category: string;
      round: string;
    };

    if (!clue?.clueId || !['correct', 'incorrect', 'skip'].includes(outcome)) {
      return NextResponse.json({ error: 'Invalid clue payload.' }, { status: 400 });
    }

    await recordClueOutcomeServer(user.id, clue, outcome);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record clue outcome.' }, { status: 500 });
  }
}
