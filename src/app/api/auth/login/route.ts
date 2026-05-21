import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createSession, makeSessionCookieHeader, sanitizeAuthUser, verifyPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const login = String(body.login ?? body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');

    if (!login || !password) {
      return NextResponse.json({ error: 'Username/email and password are required.' }, { status: 400 });
    }

    // Accept login by username (case-insensitive) OR email
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: login }, { username: { equals: login, mode: 'insensitive' } }] },
      include: { stats: true },
    });

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid username/email or password.' }, { status: 401 });
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
