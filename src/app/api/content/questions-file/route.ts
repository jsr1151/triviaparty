import { NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AnyQuestion } from '@/types/questions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface QuestionFilePayload {
  questions: AnyQuestion[];
  count?: number;
}

function normalizeCategory(category: AnyQuestion['category']): string {
  if (!category) return '';
  if (typeof category === 'string') return category.trim();
  return category.name?.trim() ?? '';
}

function signature(question: AnyQuestion): string {
  const normalizedQuestion = (question.question || '').trim().toLowerCase();
  const normalizedCategory = normalizeCategory(question.category).toLowerCase();
  return `${question.type}|${normalizedCategory}|${normalizedQuestion}`;
}

async function readQuestionFile(filePath: string): Promise<QuestionFilePayload> {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as QuestionFilePayload;
  return {
    questions: Array.isArray(parsed.questions) ? parsed.questions : [],
    count: typeof parsed.count === 'number' ? parsed.count : undefined,
  };
}

async function writeQuestionFile(filePath: string, questions: AnyQuestion[]) {
  const payload: QuestionFilePayload = {
    count: questions.length,
    questions,
  };
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export async function GET() {
  return NextResponse.json({
    message: 'POST { questions: [...] } to append Creator questions into public/docs question files.',
    note: 'This writes repository files and is intended for local/server usage (not GitHub Pages static hosting).',
  });
}

export async function POST(req: Request) {
  if (process.env.GITHUB_PAGES === 'true') {
    return NextResponse.json(
      { error: 'File write API is disabled in GitHub Pages static mode.' },
      { status: 501 },
    );
  }

  let body: { questions?: AnyQuestion[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const incoming = Array.isArray(body.questions) ? body.questions : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: '"questions" must be a non-empty array' }, { status: 400 });
  }

  const root = process.cwd();
  const pubPath = path.join(root, 'public', 'data', 'questions', 'sheets-import-questions.json');
  const docsPath = path.join(root, 'docs', 'data', 'questions', 'sheets-import-questions.json');

  try {
    const current = await readQuestionFile(pubPath);
    const existingSigs = new Set(current.questions.map(signature));

    const toAppend: AnyQuestion[] = [];
    let skipped = 0;

    for (const question of incoming) {
      const sig = signature(question);
      if (!question?.type || !question?.question?.trim() || existingSigs.has(sig)) {
        skipped += 1;
        continue;
      }
      existingSigs.add(sig);
      toAppend.push(question);
    }

    const merged = [...current.questions, ...toAppend];
    await writeQuestionFile(pubPath, merged);
    await writeQuestionFile(docsPath, merged);

    return NextResponse.json({
      added: toAppend.length,
      skipped,
      total: merged.length,
      files: [
        'public/data/questions/sheets-import-questions.json',
        'docs/data/questions/sheets-import-questions.json',
      ],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write question files' },
      { status: 500 },
    );
  }
}
