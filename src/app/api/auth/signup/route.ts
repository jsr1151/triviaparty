import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createPasswordRecord, createSession, makeSessionCookieHeader, sanitizeAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');

    if (!email || !username || password.length < 6) {
      return NextResponse.json({ error: 'Email, username, and password (min 6 chars) are required.' }, { status: 400 });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });

    if (existing) {
      return NextResponse.json({ error: 'An account with that email or username already exists.' }, { status: 409 });
    }

    const { salt, hash } = createPasswordRecord(password);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordSalt: salt,
        passwordHash: hash,
        stats: { create: { completedEpisodes: [] } },
      },
    });

    const session = await createSession(user.id);
    return NextResponse.json(
      { user: sanitizeAuthUser(user) },
      {
        status: 201,
        headers: {
          'Set-Cookie': makeSessionCookieHeader(session.token),
        },
      },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to create account.' }, { status: 500 });
  }
}
