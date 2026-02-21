import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { recordGameCompletedServer } from '@/lib/server-user-stats';

export const dynamic = 'force-static';

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const endMoney = Number(body.endMoney ?? 0);
    const showNumber = body.showNumber != null ? Number(body.showNumber) : null;

    await recordGameCompletedServer(user.id, Number.isFinite(endMoney) ? endMoney : 0, showNumber);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to record game result.' }, { status: 500 });
  }
}
