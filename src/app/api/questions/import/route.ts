import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-static';
// force-static is intentional: it satisfies Next.js's static-export (GitHub Pages)
// pre-render for the GET handler. POST requests are only handled on a live server
// (Vercel / local) and are not pre-rendered at build time.

// Placeholder GET for static-export compatibility.
export async function GET() {
  return NextResponse.json({
    message: 'POST an array of questions to this endpoint to bulk-import your question bank.',
    format: {
      questions: [
        {
          type: 'multiple_choice | open_ended | list | grouping | this_or_that | ranking | media | prompt',
          question: 'Question text (required)',
          difficulty: 'easy | medium | hard (default: medium)',
          category: 'Category slug (optional, auto-created if missing)',
          explanation: 'Optional explanation shown after answering',
          // For multiple_choice:
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: 'Option A',
          // For open_ended:
          answer: 'Correct answer',
          acceptedAnswers: ['alternate spelling', 'alias'],
          // For list:
          answers: ['item1', 'item2', 'item3'],
          minRequired: 3,
          // For grouping:
          groupName: 'Group name',
          items: ['item1', 'item2', 'item3', 'wrong1'],
          correctItems: ['item1', 'item2', 'item3'],
          // For this_or_that:
          categoryA: 'Category A name',
          categoryB: 'Category B name',
          // items: [{ text: 'item', answer: 'A' | 'B' }]
          // For ranking:
          criteria: 'Sort by year, ascending',
          // items: [{ text: 'item', rank: 1 }]
          // For media:
          mediaType: 'image | video',
          mediaUrl: 'https://...',
          // For prompt:
          prompt: 'Hint or prompt text',
          hints: ['hint1', 'hint2'],
        },
      ],
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { questions?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { questions } = body;
  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: '"questions" must be a non-empty array' }, { status: 400 });
  }

  const results: { imported: number; skipped: number; errors: string[] } = {
    imported: 0,
    skipped: 0,
    errors: [],
  };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i] as Record<string, unknown>;
    try {
      const { type, question, difficulty, category: categorySlug, explanation, ...rest } = q;

      if (!type || !question) {
        results.skipped++;
        results.errors.push(`[${i}] Skipped: "type" and "question" are required`);
        continue;
      }

      // Resolve or create the category
      let categoryId: string | undefined;
      if (categorySlug && typeof categorySlug === 'string') {
        const existing = await prisma.category.findUnique({
          where: { slug: categorySlug },
        });
        if (existing) {
          categoryId = existing.id;
        } else {
          const created = await prisma.category.create({
            data: {
              name: categorySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              slug: categorySlug,
            },
          });
          categoryId = created.id;
        }
      }

      const base = await prisma.question.create({
        data: {
          type: type as string,
          question: question as string,
          difficulty: (difficulty as string) || 'medium',
          explanation: explanation as string | undefined,
          categoryId,
        },
      });

      // Create the type-specific sub-record
      switch (type) {
        case 'multiple_choice': {
          const { options, correctAnswer } = rest;
          if (!options || !correctAnswer) {
            results.errors.push(`[${i}] Warning: multiple_choice missing options/correctAnswer`);
            break;
          }
          await prisma.multipleChoiceQuestion.create({
            data: {
              questionId: base.id,
              options: JSON.stringify(options),
              correctAnswer: correctAnswer as string,
            },
          });
          break;
        }
        case 'open_ended': {
          const { answer, acceptedAnswers } = rest;
          if (!answer) {
            results.errors.push(`[${i}] Warning: open_ended missing answer`);
            break;
          }
          await prisma.openEndedQuestion.create({
            data: {
              questionId: base.id,
              answer: answer as string,
              acceptedAnswers: JSON.stringify(acceptedAnswers || []),
            },
          });
          break;
        }
        case 'list': {
          const { answers, minRequired } = rest;
          if (!answers) {
            results.errors.push(`[${i}] Warning: list missing answers`);
            break;
          }
          await prisma.listQuestion.create({
            data: {
              questionId: base.id,
              answers: JSON.stringify(answers),
              minRequired: (minRequired as number) || 1,
            },
          });
          break;
        }
        case 'grouping': {
          const { groupName, items, correctItems } = rest;
          if (!groupName || !items || !correctItems) {
            results.errors.push(`[${i}] Warning: grouping missing groupName/items/correctItems`);
            break;
          }
          await prisma.groupingQuestion.create({
            data: {
              questionId: base.id,
              groupName: groupName as string,
              items: JSON.stringify(items),
              correctItems: JSON.stringify(correctItems),
            },
          });
          break;
        }
        case 'this_or_that': {
          const { categoryA, categoryB, items } = rest;
          if (!categoryA || !categoryB || !items) {
            results.errors.push(`[${i}] Warning: this_or_that missing categoryA/categoryB/items`);
            break;
          }
          await prisma.thisOrThatQuestion.create({
            data: {
              questionId: base.id,
              categoryA: categoryA as string,
              categoryB: categoryB as string,
              items: JSON.stringify(items),
            },
          });
          break;
        }
        case 'ranking': {
          const { items, criteria } = rest;
          if (!items || !criteria) {
            results.errors.push(`[${i}] Warning: ranking missing items/criteria`);
            break;
          }
          await prisma.rankingQuestion.create({
            data: {
              questionId: base.id,
              items: JSON.stringify(items),
              criteria: criteria as string,
            },
          });
          break;
        }
        case 'media': {
          const { mediaType, mediaUrl, answer, acceptedAnswers } = rest;
          if (!mediaType || !mediaUrl || !answer) {
            results.errors.push(`[${i}] Warning: media missing mediaType/mediaUrl/answer`);
            break;
          }
          await prisma.mediaQuestion.create({
            data: {
              questionId: base.id,
              mediaType: mediaType as string,
              mediaUrl: mediaUrl as string,
              answer: answer as string,
              acceptedAnswers: JSON.stringify(acceptedAnswers || []),
            },
          });
          break;
        }
        case 'prompt': {
          const { prompt, answer, acceptedAnswers, hints } = rest;
          if (!prompt || !answer) {
            results.errors.push(`[${i}] Warning: prompt missing prompt/answer`);
            break;
          }
          await prisma.promptQuestion.create({
            data: {
              questionId: base.id,
              prompt: prompt as string,
              answer: answer as string,
              acceptedAnswers: JSON.stringify(acceptedAnswers || []),
              hints: JSON.stringify(hints || []),
            },
          });
          break;
        }
        default:
          results.errors.push(`[${i}] Warning: unknown type "${type}" — base question saved without sub-record`);
      }

      results.imported++;
    } catch (err) {
      results.skipped++;
      results.errors.push(`[${i}] Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  revalidatePath('/api/questions');
  return NextResponse.json(
    {
      message: `Import complete: ${results.imported} imported, ${results.skipped} skipped`,
      ...results,
    },
    { status: results.imported > 0 ? 201 : 400 },
  );
}
