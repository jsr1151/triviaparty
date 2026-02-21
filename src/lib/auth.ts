import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const SESSION_COOKIE = 'triviaparty_session';
const SESSION_DAYS = 30;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

export function createPasswordRecord(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, hash: string) {
  const attempted = hashPassword(password, salt);
  const attemptedBuffer = Buffer.from(attempted, 'hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  if (attemptedBuffer.length !== hashBuffer.length) return false;
  return timingSafeEqual(attemptedBuffer, hashBuffer);
}

export function makeSessionCookieHeader(token: string) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const tokenHash = sha256(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { token, expiresAt };
}

export async function deleteSessionByToken(token: string | null | undefined) {
  if (!token) return;
  await prisma.userSession.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}

export async function getUserFromRequest(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.userSession.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.userSession.delete({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

export function sanitizeAuthUser(user: { id: string; email: string; username: string; createdAt: Date }) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    createdAt: user.createdAt,
  };
}

export const authCookieName = SESSION_COOKIE;
