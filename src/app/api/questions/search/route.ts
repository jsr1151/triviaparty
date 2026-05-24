import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import type { AnyQuestion } from '@/types/questions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SearchResultItem = {
  id: string;
  type: string;
  difficulty: string;
  category: string;
  question: string;
  preview: string;
};

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeCategory(category: AnyQuestion['category']): string {
  if (!category) return '';
  if (typeof category === 'string') return category.trim();
  return category.name?.trim() ?? '';
}

function toResultItem(item: {
  id: string;
  type: string;
  difficulty: string;
  category: string;
  question: string;
}): SearchResultItem {
  return {
    ...item,
    preview: item.question.length > 180 ? `${item.question.slice(0, 180)}…` : item.question,
  };
}

async function searchStaticQuestions(params: {
  q: string;
  type: string;
  category: string;
  difficulty: string;
  limit: number;
}): Promise<SearchResultItem[]> {
  const filePath = path.join(process.cwd(), 'public', 'data', 'questions', 'sheets-import-questions.json');
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw) as { questions?: AnyQuestion[] };
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];

  const normalizedQuery = params.q.toLowerCase();
  const normalizedCategory = params.category.toLowerCase();
  const categorySlug = slugify(params.category);
  const normalizedDifficulty = params.difficulty.toLowerCase();

  const filtered = questions.filter((question) => {
    const questionText = String(question.question || '').trim();
    if (!questionText) return false;
    if (normalizedQuery && !questionText.toLowerCase().includes(normalizedQuery)) return false;
    if (params.type && question.type !== params.type) return false;
    if (normalizedDifficulty && String(question.difficulty || '').toLowerCase() !== normalizedDifficulty) return false;
    if (normalizedCategory) {
      const categoryName = normalizeCategory(question.category);
      const categoryNameLower = categoryName.toLowerCase();
      if (categoryNameLower !== normalizedCategory && slugify(categoryName) !== categorySlug) return false;
    }
    return true;
  });

  return filtered.slice(0, params.limit).map((question, index) => toResultItem({
    id: String((question as { id?: string }).id || `static-${index}-${question.type}`),
    type: question.type,
    difficulty: String(question.difficulty || ''),
    category: normalizeCategory(question.category),
    question: String(question.question || ''),
  }));
}

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

    const dbResults = await prisma.question.findMany({
      where,
      include: {
        category: {
          select: { name: true, slug: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    }).catch(() => []);

    const fallbackResults = dbResults.length > 0
      ? []
      : await searchStaticQuestions({ q, type, category, difficulty, limit }).catch(() => []);

    const merged = [...dbResults.map((item) => toResultItem({
      id: item.id,
      type: item.type,
      difficulty: item.difficulty,
      category: item.category?.name || item.category?.slug || '',
      question: item.question,
    })), ...fallbackResults].slice(0, limit);

    return NextResponse.json({
      count: merged.length,
      results: merged,
    });
  } catch {
    return NextResponse.json({ count: 0, results: [] });
  }
}
