import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { scrapeGame } from '@/lib/scraper';

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

  return NextResponse.json(game, { status: 201 });
}
