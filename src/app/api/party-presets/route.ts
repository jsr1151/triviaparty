import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const presets = await prisma.partyModePreset.findMany({
    orderBy: [{ isBuiltIn: 'desc' }, { updatedAt: 'desc' }],
  });
  return NextResponse.json({ presets });
}

export async function POST(req: NextRequest) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json({ error: 'Saving global presets requires a server deployment.' }, { status: 403 });
  }

  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ error: 'Only owners can save global presets.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const description = String(body?.description || '').trim();
  const config = body?.config;

  if (!name || !config) {
    return NextResponse.json({ error: 'Preset name and config are required.' }, { status: 400 });
  }

  const preset = await prisma.partyModePreset.create({
    data: {
      name,
      description: description || null,
      config,
      createdBy: user.id,
    },
  });

  return NextResponse.json({ preset }, { status: 201 });
}
