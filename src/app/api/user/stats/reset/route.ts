import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/auth';
import { resetUserTrackedProgress } from '@/lib/server-user-stats';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json({ ok: true });
  }

  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  try {
    await resetUserTrackedProgress(user.id);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed to reset statistics.' }, { status: 500 });
  }
}
