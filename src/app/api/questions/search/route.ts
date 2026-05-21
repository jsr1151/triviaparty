import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim() || '';
    const type = searchParams.get('type')?.trim() || '';
    const category = searchParams.get('category')?.trim() || '';
    const difficulty = searchParams.get('difficulty')?.trim() || '';
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 30)));

    const where: Record<string, unknown> = {};
    if (q) {
      where.question = { contains: q, mode: 'insensitive' };
    }
    if (type) where.type = type;
    if (difficulty) where.difficulty = difficulty;
    if (category) {
      where.category = {
        is: {
          OR: [
            { name: { equals: category, mode: 'insensitive' } },
            { slug: { equals: category.toLowerCase() } },
          ],
        },
      };
    }

    const results = await prisma.question.findMany({
      where,
      include: {
        category: {
          select: { name: true, slug: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({
      count: results.length,
      results: results.map((item) => ({
        id: item.id,
        type: item.type,
        difficulty: item.difficulty,
        category: item.category?.name || item.category?.slug || '',
        question: item.question,
        preview: item.question.length > 180 ? `${item.question.slice(0, 180)}…` : item.question,
      })),
    });
  } catch {
    return NextResponse.json({ count: 0, results: [] });
  }
}
