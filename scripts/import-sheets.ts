#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import * as XLSX from 'xlsx';

type Difficulty = 'very_easy' | 'easy' | 'medium' | 'hard' | 'very_hard';
type ImportDifficulty = Difficulty;

type ImportQuestion = {
  type: 'multiple_choice' | 'open_ended' | 'list' | 'grouping' | 'this_or_that' | 'ranking' | 'media' | 'prompt';
  question: string;
  difficulty: ImportDifficulty;
  category?: string;
  explanation?: string;
  options?: string[];
  correctAnswer?: string;
  answer?: string;
  acceptedAnswers?: string[];
  answers?: string[];
  minRequired?: number;
  groupName?: string;
  items?: unknown;
  correctItems?: string[];
  categoryA?: string;
  categoryB?: string;
  categoryC?: string;
  criteria?: string;
  mediaType?: string;
  mediaUrl?: string;
  prompt?: string;
  hints?: string[];
  meta?: Record<string, unknown>;
};

type GroupPool = {
  prompt: string;
  categorySlug: string;
  difficulty: Difficulty;
  correct: Set<string>;
  wrong: Set<string>;
};

const DEFAULT_SHEET_IDS = [
  '1Dj0R8DIKCslcwdcqUgAYWgBg0QlkLYGQTweI-QbH03E',
  '120PDfSLFJ0NO2EBMnIzB0ovYada_dexSXnSTS-7n8m8',
  '19kcjn2fGIVZJMQVjGnELOPMPb_0n1laX4xa6LxY4YqU',
  '141SzAyWYX5FwmRHFnSdclW6FVm4otb7mRZlYs-CnrVM',
  '19g3s9JeA9xLfKAGfTgHdqhJ0qtRnUsSStrDmF2gAblg',
  '1PCr2AA-ekcjF1FJeYhShUIfJCOhk2eg7RY0ucE8svN4',
  '10fcswk-zW7LihfQVxpu1NguRMKEgd3bqri6tIm9xgpQ',
  '1d_3KDDgB47Un4WAkMtnblhjH4Ozs-AHlEYJrGnquJtw',
];

const [,, outArg, idsArg] = process.argv;
const outputFile = path.resolve(outArg || 'data/imported-sheets-questions.json');
const sheetIds = idsArg ? idsArg.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_SHEET_IDS;

const warnings: string[] = [];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function toImportDifficulty(level: Difficulty): ImportDifficulty {
  return level;
}

function guessDifficultyFromCell(cell: XLSX.CellObject | undefined): Difficulty | null {
  const style = (cell as XLSX.CellObject & { s?: { fgColor?: { rgb?: string }; bgColor?: { rgb?: string } } })?.s;
  const rgb = style?.fgColor?.rgb || style?.bgColor?.rgb;
  if (!rgb) return null;
  const hex = rgb.replace(/^FF/, '').toUpperCase();

  if (hex === '92D050' || hex === '00B050') return 'very_easy';
  if (hex === 'D9EAD3') return 'very_easy';
  if (hex === 'FFFF00' || hex === 'FFD966') return 'easy';
  if (hex === 'FFF2CC') return 'easy';
  if (hex === 'F4B183' || hex === 'ED7D31') return 'medium';
  if (hex === 'FCE5CD') return 'medium';
  if (hex === 'FF0000' || hex === 'C00000') return 'hard';
  if (hex === 'F4CCCC') return 'hard';
  if (hex === '7F0000' || hex === '800000') return 'very_hard';
  if (hex === 'DD7E6B') return 'very_hard';

  return null;
}

function nonEmpty(value: unknown): string {
  return String(value ?? '').replace(/\u00A0/g, ' ').trim();
}

function splitItems(raw: string): string[] {
  if (!raw) return [];
  const normalized = raw
    .replace(/[•●▪◦]/g, '\n')
    .replace(/\t+/g, ' ')
    .replace(/\r/g, '\n');

  const splitByLine = normalized
    .split(/\n+/)
    .map(x => x.trim())
    .filter(Boolean);

  if (splitByLine.length > 1) return splitByLine;

  return normalized
    .split(/\s*[|;]\s*|\s*,\s*/)
    .map(x => x.trim())
    .filter(Boolean);
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.map(v => v.trim()).filter(Boolean)));
}

function parseMultipleChoice(raw: string): { options: string[]; correctAnswer: string | null } {
  const options = splitItems(raw);
  let correctAnswer: string | null = null;
  const cleanOptions = options.map(item => {
    const hasStar = item.startsWith('*') || item.endsWith('*');
    const stripped = item.replace(/^\*+\s*/, '').replace(/\s*\*+$/, '').trim();
    if (hasStar && !correctAnswer) correctAnswer = stripped;
    return stripped;
  }).filter(Boolean);

  if (!correctAnswer && cleanOptions.length) {
    const fallback = cleanOptions.find(x => /^\([A-D]\)/i.test(x));
    if (fallback) correctAnswer = fallback;
  }

  return { options: cleanOptions, correctAnswer };
}

function parsePromptAndItems(raw: string): { prompt: string; items: string[] } {
  const value = nonEmpty(raw);
  if (!value) return { prompt: '', items: [] };

  const parts = value.split(':');
  if (parts.length === 1) return { prompt: value, items: [] };

  const prompt = parts.shift()!.trim();
  const itemText = parts.join(':').trim();
  const items = splitItems(itemText);
  return { prompt, items };
}

function parseVsCategories(raw: string): string[] {
  return nonEmpty(raw)
    .split(/\s+vs\.?\s+/i)
    .map(x => x.trim())
    .filter(Boolean);
}

function parseThisOrThatBucket(raw: string): { label: string; items: string[] } | null {
  const lines = splitItems(raw);
  if (!lines.length) return null;
  const label = lines[0];
  const items = lines.slice(1);
  if (!items.length) return null;
  return { label, items };
}

function parseRanking(rawQuestion: string, rawAnswer: string): { criteria: string; items: Array<{ text: string; rank: number; value?: string }> } {
  const question = nonEmpty(rawQuestion);
  const answer = nonEmpty(rawAnswer);

  const qParts = question.split(':');
  const criteria = qParts[0]?.trim() || question;

  const rankedItems = splitItems(answer).map((item, index) => {
    const match = item.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (match) {
      return { text: match[1].trim(), rank: index + 1, value: match[2].trim() };
    }
    return { text: item, rank: index + 1 };
  }).filter(x => x.text);

  return { criteria, items: rankedItems };
}

function detectMediaType(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com') || lower.includes('youtu.be') || lower.includes('vimeo.com')) return 'video';
  if (lower.match(/\.(mp3|wav|ogg|m4a)(\?|$)/)) return 'audio';
  return 'image';
}

function normalizeGroupPrompt(prompt: string): string {
  return prompt.replace(/\s+\d+\s*$/g, '').trim();
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function downloadBuffer(url: string, redirectsLeft = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    lib.get(url, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) {
          reject(new Error(`Too many redirects for ${url}`));
          return;
        }
        const nextUrl = new URL(res.headers.location, url).toString();
        downloadBuffer(nextUrl, redirectsLeft - 1).then(resolve).catch(reject);
        return;
      }

      if (!res.statusCode || res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function getCell(sheet: XLSX.WorkSheet, col: string, rowNumber: number): XLSX.CellObject | undefined {
  return sheet[`${col}${rowNumber}`];
}

function getCellText(sheet: XLSX.WorkSheet, col: string, rowNumber: number): string {
  return nonEmpty(getCell(sheet, col, rowNumber)?.w ?? getCell(sheet, col, rowNumber)?.v);
}

function getSheetRowBounds(sheet: XLSX.WorkSheet): { start: number; end: number } {
  const ref = sheet['!ref'];
  if (!ref) return { start: 1, end: 0 };
  const range = XLSX.utils.decode_range(ref);
  return { start: range.s.r + 1, end: range.e.r + 1 };
}

async function processSpreadsheet(sheetId: string): Promise<ImportQuestion[]> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`;
  const buf = await downloadBuffer(url);
  const workbook = XLSX.read(buf, { type: 'buffer', cellStyles: true, cellDates: false, cellHTML: false });

  const questions: ImportQuestion[] = [];
  const groupPools = new Map<string, GroupPool>();

  const subSheets = workbook.SheetNames.filter((name, index) => {
    if (index === 0) return false;
    return !/stats?\s*(\/|&|and|\+)?\s*subs?/i.test(name);
  });

  for (const tabName of subSheets) {
    const sheet = workbook.Sheets[tabName];
    if (!sheet) continue;

    const categorySlug = slugify(tabName);
    const bounds = getSheetRowBounds(sheet);

    for (let row = Math.max(2, bounds.start); row <= bounds.end; row++) {
      const rowDifficulty =
        guessDifficultyFromCell(getCell(sheet, 'A', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'C', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'E', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'G', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'I', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'M', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'O', row)) ||
        guessDifficultyFromCell(getCell(sheet, 'U', row)) ||
        'medium';

      const difficulty = toImportDifficulty(rowDifficulty);

      const mcQuestion = getCellText(sheet, 'A', row);
      const mcAnswer = getCellText(sheet, 'B', row);
      if (mcQuestion && mcAnswer) {
        const parsed = parseMultipleChoice(mcAnswer);
        if (parsed.options.length >= 2 && parsed.correctAnswer) {
          questions.push({
            type: 'multiple_choice',
            question: mcQuestion,
            difficulty,
            category: categorySlug,
            options: parsed.options,
            correctAnswer: parsed.correctAnswer,
          });
        } else {
          warnings.push(`[${sheetId}:${tabName}:${row}] Skipped MC; could not parse options/correct answer`);
        }
      }

      const openQuestion = getCellText(sheet, 'C', row);
      const openAnswer = getCellText(sheet, 'D', row);
      if (openQuestion && openAnswer) {
        questions.push({
          type: 'open_ended',
          question: openQuestion,
          difficulty,
          category: categorySlug,
          answer: openAnswer,
          acceptedAnswers: dedupe(splitItems(openAnswer)),
        });
      }

      const listQuestion = getCellText(sheet, 'E', row);
      const listAnswersRaw = getCellText(sheet, 'F', row);
      if (listQuestion && listAnswersRaw) {
        const answers = dedupe(splitItems(listAnswersRaw));
        if (answers.length) {
          const minHint = listQuestion.match(/(?:name|list|give)\s+(\d+)/i);
          const minRequired = Math.max(1, Math.min(answers.length, minHint ? Number(minHint[1]) : Math.min(4, answers.length)));
          questions.push({
            type: 'list',
            question: listQuestion,
            difficulty,
            category: categorySlug,
            answers,
            minRequired,
          });
        }
      }

      const groupRaw = getCellText(sheet, 'G', row);
      const wrongRaw = getCellText(sheet, 'H', row);
      if (groupRaw) {
        const parsed = parsePromptAndItems(groupRaw);
        const wrongItems = dedupe(splitItems(wrongRaw));
        if (parsed.prompt) {
          const key = `${categorySlug}::${normalizeGroupPrompt(parsed.prompt).toLowerCase()}`;
          if (!groupPools.has(key)) {
            groupPools.set(key, {
              prompt: normalizeGroupPrompt(parsed.prompt),
              categorySlug,
              difficulty: rowDifficulty,
              correct: new Set<string>(),
              wrong: new Set<string>(),
            });
          }
          const pool = groupPools.get(key)!;
          parsed.items.forEach(item => pool.correct.add(item));
          wrongItems.forEach(item => pool.wrong.add(item));
        }
      }

      const vsRaw = getCellText(sheet, 'I', row);
      const bucketJ = parseThisOrThatBucket(getCellText(sheet, 'J', row));
      const bucketK = parseThisOrThatBucket(getCellText(sheet, 'K', row));
      const bucketL = parseThisOrThatBucket(getCellText(sheet, 'L', row));
      if (vsRaw && (bucketJ || bucketK || bucketL)) {
        const categories = parseVsCategories(vsRaw);
        const buckets = [bucketJ, bucketK, bucketL];

        if (categories.length >= 2) {
          const a = categories[0];
          const b = categories[1];
          const c = categories[2];

          const items: Array<{ text: string; answer: 'A' | 'B' | 'C' }> = [];

          buckets.forEach((bucket, bucketIndex) => {
            if (!bucket) return;
            const labelLower = bucket.label.toLowerCase();
            const mappedCategory = categories.find(c => c.toLowerCase() === labelLower) ?? categories[bucketIndex] ?? categories[0];
            let answer: 'A' | 'B' | 'C' = 'A';
            if (mappedCategory.toLowerCase() === b.toLowerCase()) answer = 'B';
            if (c && mappedCategory.toLowerCase() === c.toLowerCase()) answer = 'C';
            bucket.items.forEach(item => items.push({ text: item, answer }));
          });

          const uniqueItems = dedupe(items.map(x => `${x.answer}:::${x.text}`)).map(key => {
            const [answer, text] = key.split(':::');
            return { text, answer: answer as 'A' | 'B' | 'C' };
          });

          if (uniqueItems.length > 0) {
            questions.push({
              type: 'this_or_that',
              question: `${a} vs ${b}`,
              difficulty,
              category: categorySlug,
              categoryA: a,
              categoryB: b,
              categoryC: c || undefined,
              items: uniqueItems,
              meta: { sourceCategories: categories },
            });
          }
        }
      }

      const rankPrompt = getCellText(sheet, 'M', row);
      const rankAnswer = getCellText(sheet, 'N', row);
      if (rankPrompt && rankAnswer) {
        const ranked = parseRanking(rankPrompt, rankAnswer);
        if (ranked.items.length >= 2) {
          questions.push({
            type: 'ranking',
            question: rankPrompt,
            difficulty,
            category: categorySlug,
            criteria: ranked.criteria,
            items: ranked.items,
          });
        }
      }

      const mediaQuestion = getCellText(sheet, 'O', row);
      const mediaAnswer = getCellText(sheet, 'P', row);
      const mediaCell = getCell(sheet, 'O', row) as XLSX.CellObject & { l?: { Target?: string } };
      const mediaUrl = nonEmpty(mediaCell?.l?.Target);
      if (mediaQuestion && mediaAnswer && mediaUrl) {
        questions.push({
          type: 'media',
          question: mediaQuestion,
          difficulty,
          category: categorySlug,
          mediaType: detectMediaType(mediaUrl),
          mediaUrl,
          answer: mediaAnswer,
          acceptedAnswers: dedupe(splitItems(mediaAnswer)),
        });
      }

      const promptClue = getCellText(sheet, 'U', row);
      const promptQuestion = getCellText(sheet, 'V', row);
      const promptAnswer = getCellText(sheet, 'W', row);
      if (promptClue && promptQuestion && promptAnswer) {
        questions.push({
          type: 'prompt',
          question: promptQuestion,
          difficulty,
          category: categorySlug,
          prompt: promptClue,
          answer: promptAnswer,
          acceptedAnswers: dedupe(splitItems(promptAnswer)),
        });
      }
    }
  }

  for (const pool of groupPools.values()) {
    const correctItems = Array.from(pool.correct);
    const wrongItems = Array.from(pool.wrong);

    if (correctItems.length < 8 || wrongItems.length < 8) {
      warnings.push(
        `[${sheetId}] Grouping "${pool.prompt}" has ${correctItems.length} correct / ${wrongItems.length} wrong (target >= 8 each). Imported anyway.`,
      );
    }

    questions.push({
      type: 'grouping',
      question: pool.prompt,
      difficulty: toImportDifficulty(pool.difficulty),
      category: pool.categorySlug,
      groupName: pool.prompt,
      correctItems,
      items: dedupe([...correctItems, ...wrongItems]),
      meta: {
        correctPoolSize: correctItems.length,
        wrongPoolSize: wrongItems.length,
      },
    });
  }

  return questions;
}

async function processSpreadsheetWithRetry(sheetId: string, retries = 2): Promise<ImportQuestion[]> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await processSpreadsheet(sheetId);
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 800 * (attempt + 1)));
      }
    }
  }
  throw lastError;
}

async function main() {
  if (sheetIds.length === 0) {
    console.error('No sheet IDs provided.');
    process.exit(1);
  }

  const allQuestions: ImportQuestion[] = [];

  for (const id of sheetIds) {
    console.log(`Processing sheet ${id} ...`);
    try {
      const questions = await processSpreadsheetWithRetry(id, 2);
      console.log(`  → ${questions.length} questions parsed`);
      allQuestions.push(...questions);
    } catch (err) {
      console.error(`  ✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  ensureDir(outputFile);
  fs.writeFileSync(outputFile, JSON.stringify({ questions: allQuestions }, null, 2));

  const typeCounts = allQuestions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] || 0) + 1;
    return acc;
  }, {});

  console.log(`\nWrote ${allQuestions.length} questions to ${outputFile}`);
  console.log('Type counts:', typeCounts);

  if (warnings.length > 0) {
    const warnFile = outputFile.replace(/\.json$/i, '.warnings.txt');
    fs.writeFileSync(warnFile, warnings.join('\n'));
    console.log(`Warnings: ${warnings.length} (saved to ${warnFile})`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
