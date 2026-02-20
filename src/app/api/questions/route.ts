import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

// force-static lets this route be included in `output: 'export'`.
// revalidatePath() in the POST handler ensures the server cache is
// invalidated after mutations so fresh data is served on the next GET.
export const dynamic = 'force-static';

export async function GET(req: NextRequest) {
  // process.env.GITHUB_PAGES is baked in at build time.
  // During the static-export pre-render this guard prevents accessing
  // req.url (dynamic context), satisfying Next.js's static renderer.
  let type: string | null = null;
  let category: string | null = null;
  let difficulty: string | null = null;
  let limit = 10;
  let page = 1;

  if (process.env.GITHUB_PAGES !== 'true') {
    const { searchParams } = new URL(req.url);
    type = searchParams.get('type');
    category = searchParams.get('category');
    difficulty = searchParams.get('difficulty');
    limit = parseInt(searchParams.get('limit') || '10');
    page = parseInt(searchParams.get('page') || '1');
  }

  try {
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
  } catch {
    return NextResponse.json({ questions: [], total: 0, page, limit });
  }
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

  revalidatePath('/api/questions');
  return NextResponse.json(created, { status: 201 });
}
