/**
 * github-commit.ts
 *
 * Commit files to a GitHub repo directly from the browser using the
 * GitHub Contents API + a Personal Access Token stored in localStorage.
 *
 * No server needed — works from any device including GitHub Pages.
 */

const LS_KEY = 'triviaparty-github-config';

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}

/* ─── config persistence ─── */

export function getGitHubConfig(): GitHubConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GitHubConfig;
    if (!parsed.token || !parsed.owner || !parsed.repo) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGitHubConfig(config: GitHubConfig): void {
  localStorage.setItem(LS_KEY, JSON.stringify(config));
}

export function clearGitHubConfig(): void {
  localStorage.removeItem(LS_KEY);
}

export function isGitHubConfigured(): boolean {
  return getGitHubConfig() !== null;
}

/* ─── GitHub Contents API helpers ─── */

interface GitHubFileInfo {
  sha: string;
  content: string; // base64
}

interface GitHubContentResponse {
  sha?: string;
  content?: string;
  git_url?: string;
  size?: number;
}

const API = 'https://api.github.com';

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

/** Fetch a file from the repo. Returns null if file doesn't exist. */
async function getFile(
  config: GitHubConfig,
  filePath: string,
): Promise<GitHubFileInfo | null> {
  const url = `${API}/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const res = await fetch(url, { headers: headers(config.token) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error fetching ${filePath}: ${res.status} ${body}`);
  }
  const data = await res.json() as GitHubContentResponse;

  if (!data.sha) {
    throw new Error(`GitHub API response for ${filePath} is missing SHA`);
  }

  let content = typeof data.content === 'string' ? data.content : '';

  if (!content && data.git_url) {
    const blobRes = await fetch(data.git_url, { headers: headers(config.token) });
    if (!blobRes.ok) {
      const blobBody = await blobRes.text();
      throw new Error(`GitHub blob API error fetching ${filePath}: ${blobRes.status} ${blobBody}`);
    }
    const blobData = await blobRes.json() as GitHubContentResponse;
    content = typeof blobData.content === 'string' ? blobData.content : '';
  }

  if (!content) {
    throw new Error(
      `GitHub did not return file content for ${filePath} (size=${data.size ?? 'unknown'}). ` +
      'Aborting to prevent accidental overwrite of existing data.',
    );
  }

  return { sha: data.sha, content };
}

/** Decode base64 content from GitHub API (handles unicode). */
function decodeContent(base64: string): string {
  const cleaned = base64.replace(/\n/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/** Encode string to base64 for GitHub API (handles unicode). */
function encodeContent(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Create or update a file in the repo.
 * If `sha` is provided, it's an update; otherwise it's a create.
 */
async function putFile(
  config: GitHubConfig,
  filePath: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  const url = `${API}/repos/${config.owner}/${config.repo}/contents/${filePath}`;
  const body: Record<string, string> = {
    message,
    content: encodeContent(content),
  };
  if (sha) body.sha = sha;

  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(config.token),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const responseBody = await res.text();
    throw new Error(`GitHub API error writing ${filePath}: ${res.status} ${responseBody}`);
  }
}

/* ─── High-level commit operations ─── */

/**
 * Read a JSON file from the repo, apply a transform, and commit the result.
 * Writes to both public/ and docs/ mirrors.
 */
export async function commitJsonUpdate<T>(
  config: GitHubConfig,
  relativePath: string, // e.g. "data/questions/sheets-import-questions.json"
  message: string,
  transform: (current: T | null) => T,
): Promise<void> {
  const pubPath = `public/${relativePath}`;
  const docsPath = `docs/${relativePath}`;

  // Read current file from public/
  const existing = await getFile(config, pubPath);
  let currentData: T | null = null;
  if (existing) {
    try {
      currentData = JSON.parse(decodeContent(existing.content)) as T;
    } catch {
      throw new Error(`Failed to parse existing JSON at ${pubPath}. Aborting update to avoid data loss.`);
    }
  }

  // Apply transform
  const updated = transform(currentData);
  const newContent = JSON.stringify(updated, null, 2) + '\n';

  // Write public/ file
  await putFile(config, pubPath, newContent, message, existing?.sha);

  // Write docs/ mirror
  const docsExisting = await getFile(config, docsPath);
  await putFile(config, docsPath, newContent, message, docsExisting?.sha);
}

/**
 * Commit a standalone file (e.g. a new Jeopardy game JSON).
 * Writes to both public/ and docs/ mirrors.
 */
export async function commitFile(
  config: GitHubConfig,
  relativePath: string,
  content: string,
  message: string,
): Promise<void> {
  const pubPath = `public/${relativePath}`;
  const docsPath = `docs/${relativePath}`;

  const pubExisting = await getFile(config, pubPath);
  await putFile(config, pubPath, content, message, pubExisting?.sha);

  const docsExisting = await getFile(config, docsPath);
  await putFile(config, docsPath, content, message, docsExisting?.sha);
}

/* ─── Domain-specific commit functions ─── */

interface QuestionFilePayload {
  count: number;
  questions: unknown[];
}

/**
 * Append new questions to the question pool, deduplicating by signature.
 */
export async function commitQuestions(
  config: GitHubConfig,
  newQuestions: unknown[],
): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  function questionSig(q: Record<string, unknown>): string {
    const questionText = ((q.question as string) || '').trim().toLowerCase();
    const cat = typeof q.category === 'string'
      ? q.category.trim().toLowerCase()
      : ((q.category as { name?: string })?.name || '').trim().toLowerCase();
    return `${q.type}|${cat}|${questionText}`;
  }

  await commitJsonUpdate<QuestionFilePayload>(
    config,
    'data/questions/sheets-import-questions.json',
    `feat: add ${newQuestions.length} question(s) via Creator`,
    (current) => {
      const existing = current?.questions || [];
      const sigs = new Set(existing.map((q) => questionSig(q as Record<string, unknown>)));

      const toAdd: unknown[] = [];
      for (const q of newQuestions) {
        const rec = q as Record<string, unknown>;
        if (!rec.type || !rec.question) { skipped++; continue; }
        const sig = questionSig(rec);
        if (sigs.has(sig)) { skipped++; continue; }
        sigs.add(sig);
        toAdd.push(q);
      }

      added = toAdd.length;
      const merged = [...existing, ...toAdd];
      return { count: merged.length, questions: merged };
    },
  );

  return { added, skipped };
}

interface JeopardyIndex {
  gameId: number;
  showNumber: number;
  airDate: string;
  season: number | null;
  isSpecial: boolean;
  tournamentType: string | null;
  file: string;
}

/**
 * Save a Jeopardy game and upsert index.json.
 */
export async function commitJeopardyGame(
  config: GitHubConfig,
  game: Record<string, unknown>,
): Promise<void> {
  const gameId = game.gameId as number;
  const fileName = `game-${gameId}.json`;
  const gameContent = JSON.stringify(game, null, 2) + '\n';

  // Write game file
  await commitFile(
    config,
    `data/jeopardy/${fileName}`,
    gameContent,
    `feat: add/update Jeopardy game ${gameId} via Creator`,
  );

  // Upsert index
  const indexEntry: JeopardyIndex = {
    gameId,
    showNumber: (game.showNumber as number) || 0,
    airDate: (game.airDate as string) || '',
    season: (game.season as number | null) ?? null,
    isSpecial: (game.isSpecial as boolean) || false,
    tournamentType: (game.tournamentType as string | null) ?? null,
    file: fileName,
  };

  await commitJsonUpdate<JeopardyIndex[]>(
    config,
    'data/jeopardy/index.json',
    `feat: update Jeopardy index for game ${gameId}`,
    (current) => {
      const entries = Array.isArray(current) ? current : [];
      const filtered = entries.filter((e) => e.gameId !== gameId);
      return [indexEntry, ...filtered].sort((a, b) => b.gameId - a.gameId);
    },
  );
}

interface JeopardyGameFile {
  gameId: number;
  categories: Array<{
    clues: Array<{
      clueId: string;
      topicTags?: string[];
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

/**
 * Persist clue tags into the Jeopardy game JSON file.
 */
export async function commitClueTags(
  config: GitHubConfig,
  clueId: string,
  tags: string[],
): Promise<void> {
  const match = /^g(\d+)-/.exec(clueId);
  if (!match) throw new Error(`Invalid clueId format: ${clueId}`);
  const gameId = Number(match[1]);

  await commitJsonUpdate<JeopardyGameFile>(
    config,
    `data/jeopardy/game-${gameId}.json`,
    `feat: update tags for clue ${clueId}`,
    (current) => {
      if (!current) throw new Error(`Game file for game-${gameId} not found`);
      return {
        ...current,
        categories: current.categories.map((cat) => ({
          ...cat,
          clues: cat.clues.map((clue) => {
            if (clue.clueId !== clueId) return clue;
            return { ...clue, topicTags: tags };
          }),
        })),
      };
    },
  );
}

/**
 * Test if the stored token/config can access the repo.
 */
export async function testGitHubConnection(config: GitHubConfig): Promise<boolean> {
  try {
    const url = `${API}/repos/${config.owner}/${config.repo}`;
    const res = await fetch(url, { headers: headers(config.token) });
    return res.ok;
  } catch {
    return false;
  }
}
