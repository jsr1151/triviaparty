import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';

/**
 * GET /api/questions/details?id=<questionId>&type=<questionType>
 *
 * Returns the type-specific detail payload for a question.
 * Uses query params instead of dynamic path segments so this route
 * is compatible with `output: 'export'` (GitHub Pages).
 */
export async function GET(req: NextRequest) {
  let id: string | null = null;
  let type: string | null = null;

  if (process.env.GITHUB_PAGES !== 'true') {
    const { searchParams } = new URL(req.url);
    id = searchParams.get('id');
    type = searchParams.get('type');
  }

  if (!id || !type) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    switch (type) {
      case 'multiple_choice': {
        const data = await prisma.multipleChoiceQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ options: data.options, correctAnswer: data.correctAnswer });
      }
      case 'open_ended': {
        const data = await prisma.openEndedQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ answer: data.answer, acceptedAnswers: data.acceptedAnswers });
      }
      case 'list': {
        const data = await prisma.listQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ answers: data.answers, minRequired: data.minRequired });
      }
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
