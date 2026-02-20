import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-static';

function buildDbTags(question: {
  type: string;
  difficulty: string;
  category: { slug: string; name: string } | null;
}) {
  const tags = [question.type, question.difficulty];
  if (question.category?.slug) tags.push(`category:${question.category.slug}`);
  if (question.category?.name) tags.push(`category-name:${question.category.name.toLowerCase()}`);
  return tags;
}

interface JeopardyIndexEntry {
  gameId: number;
  showNumber: number;
  airDate: string;
  season: number | null;
  file: string;
}

interface JeopardyClueData {
  clueId?: string;
  question?: string;
  answer?: string;
  value?: number | null;
  dailyDouble?: boolean;
  tripleStumper?: boolean;
  isFinalJeopardy?: boolean;
  category?: string;
  round?: 'single' | 'double' | 'final';
  rowIndex?: number;
}

interface JeopardyCategoryData {
  name: string;
  round: 'single' | 'double' | 'final';
  clues: JeopardyClueData[];
}

interface JeopardyGameData {
  gameId: number;
  showNumber: number;
  airDate: string;
  season: number | null;
  categories: JeopardyCategoryData[];
}

function loadJeopardyRows() {
  const dataDir = path.join(process.cwd(), 'public', 'data', 'jeopardy');
  const indexFile = path.join(dataDir, 'index.json');
  if (!fs.existsSync(indexFile)) return [] as Array<Record<string, unknown>>;

  let index: JeopardyIndexEntry[] = [];
  try {
    index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
  } catch {
    return [];
  }

  const rows: Array<Record<string, unknown>> = [];

  for (const entry of index) {
    const gameFile = path.join(dataDir, entry.file);
    if (!fs.existsSync(gameFile)) continue;

    let game: JeopardyGameData | null = null;
    try {
      game = JSON.parse(fs.readFileSync(gameFile, 'utf-8'));
    } catch {
      game = null;
    }
    if (!game) continue;

    for (const category of game.categories ?? []) {
      for (const clue of category.clues ?? []) {
        if (!clue.clueId) continue;

        rows.push({
          id: clue.clueId,
          source: 'jeopardy',
          type: 'jeopardy',
          difficulty: 'n/a',
          question: clue.question ?? '',
          explanation: clue.answer ?? null,
          createdAt: null,
          updatedAt: null,
          category: {
            slug: category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            name: category.name,
          },
          tags: [
            'jeopardy',
            `season:${game.season ?? 'unknown'}`,
            `show:${game.showNumber}`,
            `round:${clue.round ?? category.round}`,
            clue.dailyDouble ? 'daily-double' : 'not-daily-double',
            clue.tripleStumper ? 'triple-stumper' : 'not-triple-stumper',
          ],
          details: {
            multipleChoice: null,
            openEnded: null,
            listQuestion: null,
            groupingQuestion: null,
            thisOrThat: null,
            rankingQuestion: null,
            mediaQuestion: null,
            promptQuestion: null,
            jeopardy: {
              clueId: clue.clueId,
              gameId: game.gameId,
              showNumber: game.showNumber,
              airDate: game.airDate,
              season: game.season,
              value: clue.value ?? null,
              round: clue.round ?? category.round,
              rowIndex: clue.rowIndex ?? null,
              dailyDouble: Boolean(clue.dailyDouble),
              tripleStumper: Boolean(clue.tripleStumper),
              isFinalJeopardy: Boolean(clue.isFinalJeopardy),
              answer: clue.answer ?? '',
              category: category.name,
            },
          },
        });
      }
    }
  }

  return rows;
}

export async function GET(req: NextRequest) {
  let type: string | null = null;
  let category: string | null = null;
  let difficulty: string | null = null;
  let search: string | null = null;
  let source: string | null = null;
  let limit = 50;
  let page = 1;

  if (process.env.GITHUB_PAGES !== 'true') {
    const { searchParams } = new URL(req.url);
    type = searchParams.get('type');
    category = searchParams.get('category');
    difficulty = searchParams.get('difficulty');
    search = searchParams.get('search');
    source = searchParams.get('source');
    limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  }

  try {
    const where: Record<string, unknown> = {};
    const includeJeopardy = !source || source === 'all' || source === 'jeopardy';
    const includeDatabase = !source || source === 'all' || source === 'database';

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

    if (type && type !== 'jeopardy' && type !== 'all') where.type = type;
    if (difficulty && difficulty !== 'n/a' && difficulty !== 'all') where.difficulty = difficulty;
    if (category) where.category = { slug: category };
    if (search) {
      where.OR = [
        { question: { contains: search } },
        { explanation: { contains: search } },
      ];
    }

    let dbRows: Array<{
      id: string;
      type: string;
      difficulty: string;
      question: string;
      explanation: string | null;
      createdAt: Date;
      updatedAt: Date;
      category: { slug: string; name: string } | null;
      multipleChoice: unknown;
      openEnded: unknown;
      listQuestion: unknown;
      groupingQuestion: unknown;
      thisOrThat: unknown;
      rankingQuestion: unknown;
      mediaQuestion: unknown;
      promptQuestion: unknown;
    }> = [];

    if (includeDatabase) {
      try {
        dbRows = await prisma.question.findMany({ where, include, orderBy: { createdAt: 'desc' } });
      } catch {
        dbRows = [];
      }
    }

    const databaseQuestions = dbRows.map((q) => ({
      id: q.id,
      source: 'database',
      type: q.type,
      difficulty: q.difficulty,
      question: q.question,
      explanation: q.explanation,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      category: q.category,
      tags: buildDbTags(q),
      details: {
        multipleChoice: q.multipleChoice,
        openEnded: q.openEnded,
        listQuestion: q.listQuestion,
        groupingQuestion: q.groupingQuestion,
        thisOrThat: q.thisOrThat,
        rankingQuestion: q.rankingQuestion,
        mediaQuestion: q.mediaQuestion,
        promptQuestion: q.promptQuestion,
        jeopardy: null,
      },
    }));

    let jeopardyQuestions = includeJeopardy ? loadJeopardyRows() : [];

    if (type && type !== 'all') {
      jeopardyQuestions = jeopardyQuestions.filter((q) => q.type === type);
    }
    if (difficulty && difficulty !== 'all') {
      jeopardyQuestions = jeopardyQuestions.filter((q) => q.difficulty === difficulty);
    }
    if (category) {
      jeopardyQuestions = jeopardyQuestions.filter((q) => {
        const cat = q.category as { slug?: string } | null;
        return cat?.slug === category;
      });
    }
    if (search) {
      const s = search.toLowerCase();
      jeopardyQuestions = jeopardyQuestions.filter((q) => {
        const questionText = String(q.question ?? '').toLowerCase();
        const answerText = String(q.explanation ?? '').toLowerCase();
        return questionText.includes(s) || answerText.includes(s);
      });
    }

    const allQuestions = [...databaseQuestions, ...jeopardyQuestions];
    const total = allQuestions.length;
    const offset = (page - 1) * limit;
    const questions = allQuestions.slice(offset, offset + limit);

    return NextResponse.json({ questions, total, page, limit });
  } catch {
    return NextResponse.json({ questions: [], total: 0, page, limit });
  }
}
