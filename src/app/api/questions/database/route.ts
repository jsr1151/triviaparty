import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

function buildTags(question: {
  type: string;
  difficulty: string;
  category: { slug: string; name: string } | null;
}) {
  const tags = [question.type, question.difficulty];
  if (question.category?.slug) tags.push(`category:${question.category.slug}`);
  if (question.category?.name) tags.push(`category-name:${question.category.name.toLowerCase()}`);
  return tags;
}

export async function GET(req: NextRequest) {
  let type: string | null = null;
  let category: string | null = null;
  let difficulty: string | null = null;
  let search: string | null = null;
  let limit = 50;
  let page = 1;

  if (process.env.GITHUB_PAGES !== 'true') {
    const { searchParams } = new URL(req.url);
    type = searchParams.get('type');
    category = searchParams.get('category');
    difficulty = searchParams.get('difficulty');
    search = searchParams.get('search');
    limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  }

  try {
    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (difficulty) where.difficulty = difficulty;
    if (category) where.category = { slug: category };
    if (search) {
      where.OR = [
        { question: { contains: search } },
        { explanation: { contains: search } },
      ];
    }

    const include = {
      category: true,
      multipleChoice: true,
      openEnded: true,
      listQuestion: true,
      groupingQuestion: true,
      thisOrThat: true,
      rankingQuestion: true,
      mediaQuestion: true,
      promptQuestion: true,
    } as const;

    const [rows, total] = await Promise.all([
      prisma.question.findMany({
        where,
        include,
        take: limit,
        skip: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.question.count({ where }),
    ]);

    const questions = rows.map((q) => ({
      id: q.id,
      type: q.type,
      difficulty: q.difficulty,
      question: q.question,
      explanation: q.explanation,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      category: q.category,
      tags: buildTags(q),
      details: {
        multipleChoice: q.multipleChoice,
        openEnded: q.openEnded,
        listQuestion: q.listQuestion,
        groupingQuestion: q.groupingQuestion,
        thisOrThat: q.thisOrThat,
        rankingQuestion: q.rankingQuestion,
        mediaQuestion: q.mediaQuestion,
        promptQuestion: q.promptQuestion,
      },
    }));

    return NextResponse.json({ questions, total, page, limit });
  } catch {
    return NextResponse.json({ questions: [], total: 0, page, limit });
  }
}
