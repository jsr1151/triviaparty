#!/usr/bin/env ts-node
/**
 * scripts/import-questions.ts
 *
 * Bulk-import questions from a JSON file directly into the database.
 * Run this locally when you want to seed questions without going through the API.
 *
 * Usage:
 *   npx ts-node scripts/import-questions.ts path/to/questions.json
 *   # or via npm script:
 *   npm run import -- path/to/questions.json
 *
 * The JSON file must be an array of question objects. See the format below.
 *
 * Example questions.json:
 * [
 *   {
 *     "type": "multiple_choice",
 *     "question": "What is the capital of France?",
 *     "difficulty": "easy",
 *     "category": "geography",
 *     "options": ["Paris", "London", "Berlin", "Rome"],
 *     "correctAnswer": "Paris"
 *   },
 *   {
 *     "type": "open_ended",
 *     "question": "Who painted the Mona Lisa?",
 *     "difficulty": "easy",
 *     "category": "art",
 *     "answer": "Leonardo da Vinci",
 *     "acceptedAnswers": ["da Vinci", "Leonardo"]
 *   },
 *   {
 *     "type": "list",
 *     "question": "Name as many planets in our solar system as you can.",
 *     "difficulty": "medium",
 *     "category": "science",
 *     "answers": ["Mercury","Venus","Earth","Mars","Jupiter","Saturn","Uranus","Neptune"],
 *     "minRequired": 4
 *   }
 * ]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

const [,, filePath, baseUrl = 'http://localhost:3000'] = process.argv;

if (!filePath) {
  console.error('Usage: ts-node scripts/import-questions.ts <path/to/questions.json> [baseUrl]');
  console.error('');
  console.error('Examples:');
  console.error('  ts-node scripts/import-questions.ts ./my-questions.json');
  console.error('  ts-node scripts/import-questions.ts ./my-questions.json https://myapp.vercel.app');
  process.exit(1);
}

const resolved = path.resolve(filePath);
if (!fs.existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

let questions: unknown[];
try {
  const raw = fs.readFileSync(resolved, 'utf-8');
  const parsed = JSON.parse(raw);
  questions = Array.isArray(parsed) ? parsed : parsed.questions;
  if (!Array.isArray(questions)) {
    throw new Error('JSON must be an array of question objects (or { questions: [...] })');
  }
} catch (err) {
  console.error(`Failed to parse JSON: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

console.log(`Loaded ${questions.length} questions from ${resolved}`);
console.log(`Posting to ${baseUrl}/api/questions/import ...`);

const CHUNK = 100; // send in batches to avoid hitting body size limits

async function postChunk(chunk: unknown[]): Promise<{ imported: number; skipped: number; errors: string[] }> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ questions: chunk });
    const url = new URL(`${baseUrl}/api/questions/import`);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  let totalImported = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (let i = 0; i < questions.length; i += CHUNK) {
    const chunk = questions.slice(i, i + CHUNK);
    process.stdout.write(`  Batch ${Math.floor(i / CHUNK) + 1}/${Math.ceil(questions.length / CHUNK)} (${chunk.length} questions)... `);
    try {
      const result = await postChunk(chunk);
      totalImported += result.imported ?? 0;
      totalSkipped += result.skipped ?? 0;
      allErrors.push(...(result.errors ?? []));
      console.log(`✓  imported: ${result.imported}, skipped: ${result.skipped}`);
    } catch (err) {
      console.log('✗  FAILED');
      console.error(`  Error: ${err instanceof Error ? err.message : err}`);
      totalSkipped += chunk.length;
    }
  }

  console.log('');
  console.log(`Done. Total imported: ${totalImported} | Total skipped: ${totalSkipped}`);
  if (allErrors.length > 0) {
    console.log('Warnings/errors:');
    allErrors.forEach(e => console.log(' ', e));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
