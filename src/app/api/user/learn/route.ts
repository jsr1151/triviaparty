import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { getLearnQueueForUser, gradeLearnStudyItem } from '@/lib/server-learn';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json({ clues: [] });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ clues: [] }, { status: 401 });
  }

  const includeNonJeopardy = req.nextUrl.searchParams.get('includeNonJeopardy') === 'true';
  const limit = Math.max(1, Math.min(100, Number(req.nextUrl.searchParams.get('limit') ?? '40') || 40));
  const payload = await getLearnQueueForUser(user.id, includeNonJeopardy, limit);
  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json({ ok: true });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const action = String(body.action ?? '');
    if (action !== 'grade') {
      return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }

    const itemId = String(body.itemId ?? '');
    const correct = Boolean(body.correct);
    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required.' }, { status: 400 });
    }

    const item = await gradeLearnStudyItem({ userId: user.id, itemId, correct });
    if (!item) {
      return NextResponse.json({ error: 'Study item not found.' }, { status: 404 });
    }

    return NextResponse.json({ item });
  } catch {
    return NextResponse.json({ error: 'Failed to update learn item.' }, { status: 500 });
  }
}
