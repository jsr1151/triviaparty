import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/questions/details?id=<questionId>&type=<questionType>
 *
 * Returns the type-specific detail payload for a question, along with the
 * base question fields (question text, difficulty, category) so the caller
 * can reconstruct a full AnyQuestion object.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const type = searchParams.get('type');

  if (!id || !type) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    // Fetch the base Question row so we always return question/difficulty/category
    const base = await prisma.question.findUnique({
      where: { id },
      include: { category: { select: { name: true, slug: true } } },
    }).catch(() => null);

    const baseFields = base
      ? {
          id: base.id,
          question: base.question,
          difficulty: base.difficulty,
          category: base.category?.name || '',
        }
      : null;

    switch (type) {
      case 'multiple_choice': {
        const data = await prisma.multipleChoiceQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, options: data.options, correctAnswer: data.correctAnswer });
      }
      case 'open_ended': {
        const data = await prisma.openEndedQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, answer: data.answer, acceptedAnswers: data.acceptedAnswers });
      }
      case 'list': {
        const data = await prisma.listQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, answers: data.answers, minRequired: data.minRequired });
      }
      case 'grouping': {
        const data = await prisma.groupingQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, groupName: data.groupName, items: data.items, correctItems: data.correctItems });
      }
      case 'this_or_that': {
        const data = await prisma.thisOrThatQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, categoryA: data.categoryA, categoryB: data.categoryB, categoryC: data.categoryC, items: data.items });
      }
      case 'ranking': {
        const data = await prisma.rankingQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, criteria: data.criteria, items: data.items });
      }
      case 'media': {
        const data = await prisma.mediaQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, mediaType: data.mediaType, mediaUrl: data.mediaUrl, answer: data.answer, acceptedAnswers: data.acceptedAnswers });
      }
      case 'prompt': {
        const data = await prisma.promptQuestion.findUnique({ where: { questionId: id } });
        if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        return NextResponse.json({ ...baseFields, prompt: data.prompt, answer: data.answer, acceptedAnswers: data.acceptedAnswers });
      }
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
