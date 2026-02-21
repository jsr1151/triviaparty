import { NextRequest, NextResponse } from 'next/server';
import { getUserFromRequest, sanitizeAuthUser } from '@/lib/auth';
import { ensureUserStats } from '@/lib/server-user-stats';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const stats = await ensureUserStats(user.id);

  return NextResponse.json({
    user: sanitizeAuthUser(user),
    stats,
  });
}
