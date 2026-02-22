#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';

type Question = {
  id?: string;
  type?: string;
  question?: string;
  difficulty?: string;
  category?: string;
};

type RandomIndexEntry = {
  id: string;
  type: string;
  question: string;
  difficulty: string;
  category?: string;
};

const sourceFile = path.resolve('data/sheets-import-questions.json');
const outDir = path.resolve('public/data/questions');
const randomIndexFile = path.join(outDir, 'random-index.json');
const metadataFile = path.join(outDir, 'metadata.json');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function main() {
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Missing source file: ${sourceFile}`);
  }

  const raw = fs.readFileSync(sourceFile, 'utf-8');
  const parsed = JSON.parse(raw) as { questions?: Question[] };
  const all = Array.isArray(parsed.questions) ? parsed.questions : [];

  const randomIndex: RandomIndexEntry[] = all
    .filter((q) => q && q.type && q.question && q.difficulty)
    .map((q, index) => ({
      id: q.id || `static-${index}`,
      type: String(q.type),
      question: String(q.question),
      difficulty: String(q.difficulty),
      category: q.category ? String(q.category) : undefined,
    }));

  const byType: Record<string, number> = {};
  const byDifficulty: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const q of randomIndex) {
    byType[q.type] = (byType[q.type] || 0) + 1;
    byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] || 0) + 1;
    const c = q.category || 'uncategorized';
    byCategory[c] = (byCategory[c] || 0) + 1;
  }

  ensureDir(outDir);
  fs.writeFileSync(randomIndexFile, JSON.stringify({ questions: randomIndex }, null, 2));
  fs.writeFileSync(
    metadataFile,
    JSON.stringify(
      {
        total: randomIndex.length,
        byType,
        byDifficulty,
        byCategory,
      },
      null,
      2,
    ),
  );

  console.log(`Wrote ${randomIndex.length} entries to ${randomIndexFile}`);
  console.log(`Wrote metadata to ${metadataFile}`);
}

main();
