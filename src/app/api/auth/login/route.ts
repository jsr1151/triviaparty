import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, makeSessionCookieHeader, sanitizeAuthUser, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-static';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { stats: true },
    });

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const session = await createSession(user.id);
    return NextResponse.json(
      {
        user: sanitizeAuthUser(user),
        stats: user.stats,
      },
      {
        headers: {
          'Set-Cookie': makeSessionCookieHeader(session.token),
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 });
  }
}
