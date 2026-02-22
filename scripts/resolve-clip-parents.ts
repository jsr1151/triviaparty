#!/usr/bin/env ts-node

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

type Question = {
  type?: string;
  question?: string;
  category?: string | { name?: string };
  mediaUrl?: string;
  needsMediaReview?: boolean;
  mediaReviewReason?: string;
};

type FlaggedItem = {
  question?: string;
  category?: string | { name?: string };
  mediaUrl?: string;
  reason?: string;
};

type QuestionsPayload = {
  questions: Question[];
};

type FlaggedPayload = {
  count: number;
  items: FlaggedItem[];
};

const CLIP_REGEX = /youtube\.com\/clip\//i;

const cookiePath = process.argv[2] || 'data/youtube-cookies.txt';
const resolvedCookiePath = path.resolve(cookiePath);

if (!fs.existsSync(resolvedCookiePath)) {
  console.error(`Cookie file not found: ${resolvedCookiePath}`);
  process.exit(1);
}

const questionsPath = path.resolve('public/data/questions/sheets-import-questions.json');
const flaggedPath = path.resolve('public/data/questions/flagged-media-questions.json');
const docsQuestionsPath = path.resolve('docs/data/questions/sheets-import-questions.json');
const docsFlaggedPath = path.resolve('docs/data/questions/flagged-media-questions.json');

const questionsPayload = JSON.parse(fs.readFileSync(questionsPath, 'utf8')) as QuestionsPayload;
const flaggedPayload = JSON.parse(fs.readFileSync(flaggedPath, 'utf8')) as FlaggedPayload;

const mediaQuestions = (questionsPayload.questions || []).filter((q) => q.type === 'media' && CLIP_REGEX.test(q.mediaUrl || ''));

function toSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return null;
}

function buildWatchUrl(videoId: string, startSeconds: number | null, endSeconds: number | null): string {
  const params = new URLSearchParams({ v: videoId });
  if (startSeconds !== null) params.set('start', String(startSeconds));
  if (endSeconds !== null && endSeconds > 0) params.set('end', String(endSeconds));
  return `https://www.youtube.com/watch?${params.toString()}`;
}

function resolveClip(clipUrl: string): { watchUrl: string; videoId: string } | null {
  const ytdlpBin = process.env.HOME ? path.join(process.env.HOME, '.local/bin/yt-dlp') : 'yt-dlp';
  const args = ['-J', '--cookies', resolvedCookiePath, clipUrl];
  const result = spawnSync(ytdlpBin, args, { encoding: 'utf8', timeout: 120000 });

  if (result.status !== 0 || !result.stdout.trim()) {
    return null;
  }

  try {
    const data = JSON.parse(result.stdout) as Record<string, unknown>;
    const videoId = typeof data.id === 'string' ? data.id : '';
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

    const startSeconds =
      toSeconds(data.start_time) ??
      toSeconds(data.section_start) ??
      toSeconds(data.clip_start) ??
      toSeconds(data.timestamp);

    const endSeconds =
      toSeconds(data.end_time) ??
      toSeconds(data.section_end) ??
      toSeconds(data.clip_end);

    const watchUrl = buildWatchUrl(videoId, startSeconds, endSeconds);
    return { watchUrl, videoId };
  } catch {
    return null;
  }
}

const replacements = new Map<string, string>();
let resolvedCount = 0;

for (const question of mediaQuestions) {
  const clipUrl = question.mediaUrl || '';
  if (replacements.has(clipUrl)) {
    question.mediaUrl = replacements.get(clipUrl);
    question.needsMediaReview = false;
    question.mediaReviewReason = 'resolved_clip_parent_url';
    continue;
  }

  const resolved = resolveClip(clipUrl);
  if (!resolved) continue;

  replacements.set(clipUrl, resolved.watchUrl);
  question.mediaUrl = resolved.watchUrl;
  question.needsMediaReview = false;
  question.mediaReviewReason = 'resolved_clip_parent_url';
  resolvedCount += 1;
}

let flaggedUpdated = 0;
for (const item of flaggedPayload.items || []) {
  const original = item.mediaUrl || '';
  const replacement = replacements.get(original);
  if (!replacement) continue;
  item.mediaUrl = replacement;
  item.reason = 'resolved_clip_parent_url';
  flaggedUpdated += 1;
}

flaggedPayload.count = (flaggedPayload.items || []).length;

fs.writeFileSync(questionsPath, JSON.stringify(questionsPayload, null, 2) + '\n');
fs.writeFileSync(flaggedPath, JSON.stringify(flaggedPayload, null, 2) + '\n');
fs.copyFileSync(questionsPath, docsQuestionsPath);
fs.copyFileSync(flaggedPath, docsFlaggedPath);

console.log(`clip_questions: ${mediaQuestions.length}`);
console.log(`resolved_questions: ${resolvedCount}`);
console.log(`flagged_updated: ${flaggedUpdated}`);
console.log(`cookie_file: ${resolvedCookiePath}`);
