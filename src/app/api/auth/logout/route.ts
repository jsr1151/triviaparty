import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookieHeader, deleteSessionByToken } from '@/lib/auth';

export const dynamic = 'force-static';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('triviaparty_session')?.value;
  await deleteSessionByToken(token);

  return NextResponse.json(
    { ok: true },
    {
      headers: {
        'Set-Cookie': clearSessionCookieHeader(),
      },
    },
  );
}
