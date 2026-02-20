import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const category = searchParams.get('category');
  const difficulty = searchParams.get('difficulty');
  const limit = parseInt(searchParams.get('limit') || '10');
  const page = parseInt(searchParams.get('page') || '1');

  const where: Record<string, unknown> = {};
  if (type) where.type = type;
  if (difficulty) where.difficulty = difficulty;
  if (category) where.category = { slug: category };

  const [questions, total] = await Promise.all([
    prisma.question.findMany({
      where,
      include: { category: true },
      take: limit,
      skip: (page - 1) * limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.question.count({ where }),
  ]);

  return NextResponse.json({ questions, total, page, limit });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, categoryId, difficulty, question, explanation } = body;

  if (!type || !question) {
    return NextResponse.json({ error: 'type and question are required' }, { status: 400 });
  }

  const created = await prisma.question.create({
    data: { type, categoryId, difficulty: difficulty || 'medium', question, explanation },
    include: { category: true },
  });

  return NextResponse.json(created, { status: 201 });
}
