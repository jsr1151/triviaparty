import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ categories });
  } catch {
    return NextResponse.json({ categories: [] });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, slug, description } = body;

  if (!name || !slug) {
    return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
  }

  const category = await prisma.category.create({
    data: { name, slug, description },
  });

  revalidatePath('/api/categories');
  return NextResponse.json(category, { status: 201 });
}
