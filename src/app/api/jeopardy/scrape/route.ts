import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { scrapeGame } from '@/lib/scraper';

export const dynamic = 'force-static';

// Placeholder GET so this segment is valid in a static export.
export async function GET() {
  return NextResponse.json({ message: 'POST to this endpoint to scrape a J-Archive game by gameId.' });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { gameId } = body;

  if (!gameId) {
    return NextResponse.json({ error: 'gameId is required' }, { status: 400 });
  }

  const scraped = await scrapeGame(gameId);
  if (!scraped) {
    return NextResponse.json({ error: 'Failed to scrape game' }, { status: 500 });
  }

  const game = await prisma.jeopardyGame.create({
    data: {
      showNumber: scraped.showNumber,
      airDate: scraped.airDate,
      season: scraped.season,
      categories: {
        create: scraped.categories.map(cat => ({
          name: cat.name,
          round: cat.round,
          position: cat.position,
          clues: {
            create: cat.clues.map(clue => ({
              question: clue.question,
              answer: clue.answer,
              value: clue.value,
              dailyDouble: clue.dailyDouble,
              airDate: scraped.airDate,
            })),
          },
        })),
      },
    },
    include: { categories: { include: { clues: true } } },
  });

  revalidatePath('/api/jeopardy');
  return NextResponse.json(game, { status: 201 });
}
