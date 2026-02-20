# TriviaParty

A trivia game hosting site with multiple game modes, powered by J-Archive data and a rich question bank.

## Live Demo

🌐 **[https://jsr1151.github.io/triviaparty/](https://jsr1151.github.io/triviaparty/)**

> **⚠️ One-time setup required — do this once to make the URL live:**
> 1. Go to your repo on GitHub → **Settings → Pages**
> 2. Under **Build and deployment**, set **Source** to **Deploy from a branch**
> 3. Set **Branch** to `copilot/build-trivia-game-site` and folder to **`/docs`**, then click **Save**
>
> The static site is already committed to the `docs/` folder in this branch, so the page will
> go live within ~1 minute of clicking Save — **no CI run or further action needed.**

The site shows the full UI.  **Jeopardy games are loaded directly from JSON files committed to the repository** — no server or database needed, even on GitHub Pages.

## Features

- **Jeopardy Mode** – Play classic Jeopardy! games scraped from [J-Archive](https://j-archive.com/) with the original board, categories, clues, and scoring.
- **Party Mode** – Play a mix of all question types in random order.
- **Random Questions** – Get random questions filtered by type, difficulty, or category.

### Supported Question Types

| Type | Description |
|------|-------------|
| Multiple Choice | Choose the correct answer from options |
| Open Ended | Type in your answer |
| List | Name as many correct answers as you can from a pool |
| Grouping | Pick all items that belong to a given group |
| This or That | Assign items to one of two categories |
| Ranking | Sort items by the given criteria |
| Media | Answer a question about an image or video |
| Prompt | Puzzle-style question with a hint/prompt |

## J-Archive Jeopardy Games (no database needed!)

Jeopardy games are scraped from [J-Archive](https://j-archive.com/) and saved as **plain JSON files**
in `public/data/jeopardy/`. The app reads these files directly — they work on GitHub Pages, locally,
and on Vercel **without any database**.

### Scraped data per clue

| Field | Description |
|---|---|
| Season | Season number (e.g. 40) |
| Show # / Episode | Episode number (e.g. #8000) |
| Air date | Original broadcast date |
| Special episode | Whether it's a tournament/championship/celebrity episode |
| Tournament type | Name of the tournament (e.g. "Tournament of Champions") |
| Category | Category name |
| Dollar value | Clue value ($200–$2000) |
| Question text | The clue as read on TV |
| Answer | Correct response |
| Daily Double | Whether the clue was a Daily Double |
| Triple Stumper | Whether all contestants answered incorrectly |
| Final Jeopardy | Whether the clue is a Final Jeopardy question |

### Scraping games

#### Option A — GitHub Codespaces (fastest, no install needed)

Open a free cloud terminal in your browser — no local Node.js, no merging required:

1. Go to **[https://github.com/jsr1151/triviaparty/tree/copilot/build-trivia-game-site](https://github.com/jsr1151/triviaparty/tree/copilot/build-trivia-game-site)**
2. Click the green **`<> Code`** button → **Codespaces** tab → **Create codespace on copilot/build-trivia-game-site**
3. Wait ~60 seconds for the environment to start (Node.js is pre-installed, `npm install` runs automatically)
4. In the Codespaces terminal, run:

```bash
# Scrape all of Season 1 (~79 games)
npm run scrape -- --season 1

# Or scrape a single episode
npm run scrape -- 173

# Commit and push the JSON files
git add public/data/jeopardy/
git commit -m "feat: add Season 1 Jeopardy games"
git push
```

The scraped games appear on the live site at `https://jsr1151.github.io/triviaparty/` within seconds of pushing.

---

#### Option B — GitHub Actions (after merging the PR)

> **⚠️ This workflow only appears in the Actions tab once the PR is merged to `main`.**
>
> **How to merge the PR** (4 steps on the GitHub website):
> 1. Go to **[https://github.com/jsr1151/triviaparty/pull/1](https://github.com/jsr1151/triviaparty/pull/1)**
> 2. Scroll to the bottom — click **"Ready for review"** (the PR is currently a *draft*; this button converts it to a regular PR)
> 3. Click **"Merge pull request"**
> 4. Click **"Confirm merge"**
>
> After merging, go to **Actions → Scrape J-Archive Games → Run workflow**.

**To scrape once the workflow is visible:**
- Full season: fill in the **season** field (e.g. `1` for Season 1 — ~79 games), leave **game_ids** blank
- Specific episodes: leave **season** blank, fill **game_ids** with space-separated IDs (e.g. `173 174 175`)
- Click **Run workflow**

The workflow commits the JSON files to the repo automatically. The Jeopardy page picks them up on next load.

**Season 1 info:** 79 episodes, game IDs mostly in the range 170–250. The first episode (Show #1, 1984-09-10) is game ID **173**.

#### Option C — locally (requires Node.js)

```bash
# Install dependencies first
npm install

# Scrape one or more games by J-Archive game_id
npm run scrape -- 173 174 175

# Scrape every game in a season
npm run scrape -- --season 1

# Scrape a range of IDs
npm run scrape -- --from 170 --to 180
```

Output is saved to `public/data/jeopardy/game-<id>.json` and the index is updated at
`public/data/jeopardy/index.json`.

Commit and push the resulting files to publish them:

```bash
git add public/data/jeopardy/
git commit -m "feat: add scraped Jeopardy games"
git push
```

#### Known game IDs (Season 1)

Season 1 aired 1984–1985. J-Archive game IDs for Season 1 are mostly in the range 170–250.

| Show # | Air Date | Game ID |
|--------|----------|---------|
| 1 | 1984-09-10 | 173 |
| 2 | 1984-09-11 | 174 |
| 3 | 1984-09-12 | 175 |

> For a full season, use `--season 1` (Option A or B) — no need to look up individual IDs.

### JSON file format

Each game file follows this schema (all 12 fields listed above are included per clue):

```json
{
  "gameId": 8000,
  "showNumber": 4532,
  "airDate": "January 1, 2024",
  "season": 40,
  "isSpecial": false,
  "tournamentType": null,
  "categories": [
    {
      "name": "FAMOUS PAINTINGS",
      "round": "single",
      "position": 0,
      "clues": [
        {
          "question": "This Spaniard painted Guernica in 1937",
          "answer": "Picasso",
          "value": 200,
          "dailyDouble": false,
          "tripleStumper": false,
          "isFinalJeopardy": false,
          "category": "FAMOUS PAINTINGS",
          "round": "single"
        }
      ]
    }
  ]
}
```

## Accessing the Application


### Option A — GitHub Pages (live, no setup required)

Open **[https://jsr1151.github.io/triviaparty/](https://jsr1151.github.io/triviaparty/)** in any browser.

> **If you see a 404:** go to **Settings → Pages** and set:
> - **Source** → `Deploy from a branch`
> - **Branch** → `copilot/build-trivia-game-site`, folder → `/docs` → **Save**
>
> The static site is pre-built and committed in `docs/` — it goes live within ~1 minute of saving, no CI needed.

The site shows the full UI with empty-state messages for game modes.

> **Note:** GitHub Pages is a static host. To load real game data you need a local or server deployment (Option B or C below).

---

### Option B — Local development (with full data support)

#### Prerequisites
- **Node.js 18+** – [Download here](https://nodejs.org/)
- **npm** (bundled with Node.js)

```bash
# 1. Clone the repository
git clone https://github.com/jsr1151/triviaparty.git
cd triviaparty

# 2. Install dependencies (also auto-generates the Prisma client)
npm install

# 3. Set up your environment file
cp .env.example .env

# 4. Create the database and run migrations
npm run db:migrate
# When prompted for a migration name, press Enter to accept the default (or type any name)

# 5. Start the development server
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser. 🎉

---

### Pages

| URL | Description |
|-----|-------------|
| `/` | Home – choose a game mode |
| `/play/jeopardy` | Jeopardy board game |
| `/play/party` | Party mode (mixed question types) |
| `/play/random` | Random questions with filters |

---

### Loading Jeopardy Games (Optional)

The Jeopardy board is empty until you scrape games from J-Archive.  
Each game on J-Archive has a numeric ID in its URL (e.g. `showgame.php?game_id=8000`).

```bash
# Scrape a specific game (server must be running)
curl -X POST http://localhost:3000/api/jeopardy/scrape \
  -H "Content-Type: application/json" \
  -d '{"gameId": 8000}'
```

---

### Option C — Production server build

```bash
npm run build   # compile for production
npm start       # start the production server on http://localhost:3000
```

---

## Storing Questions (Database Options)

The GitHub Pages site is a **static demo only** — it cannot save data because it has no server.
To persist questions and use the full app, you need a backend. Here are the two supported options:

---

### Option 1 — Vercel + Turso (recommended, both free)

This gives you a fully-live URL where questions are stored permanently in a cloud database.

#### A. Set up Turso (free hosted database)

```bash
# Install the Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Log in / sign up (free, no credit card)
turso auth login

# Create your database
turso db create triviaparty

# Get your connection URL
turso db show triviaparty --url
# → libsql://triviaparty-<yourname>.turso.io

# Create an auth token
turso db tokens create triviaparty
# → paste this as TURSO_AUTH_TOKEN
```

#### B. Deploy to Vercel (free)

1. Push this branch to GitHub (or fork the repo)
2. Go to [vercel.com](https://vercel.com) → **New Project** → import this repo
3. Add these environment variables in Vercel's project settings:
   - `DATABASE_URL` = `libsql://triviaparty-<yourname>.turso.io`
   - `TURSO_AUTH_TOKEN` = `<your-token>`
4. Click **Deploy**

Vercel runs `prisma migrate deploy && next build` automatically (via `vercel.json`).  
Your app will be live at `https://triviaparty-<yourname>.vercel.app`.

---

### Option 2 — Local server (full control, no cloud account needed)

Run the app on your own machine (or a VPS). See **Option B** in the Accessing section above.

---

### Loading Questions

#### From J-Archive (Jeopardy games)

```bash
# Scrape a specific game by its J-Archive ID (server must be running)
curl -X POST https://your-vercel-url.vercel.app/api/jeopardy/scrape \
  -H "Content-Type: application/json" \
  -d '{"gameId": 8000}'
```

#### From your personal question bank (bulk import)

Create a JSON file with your questions:

```json
[
  {
    "type": "multiple_choice",
    "question": "What is the capital of France?",
    "difficulty": "easy",
    "category": "geography",
    "options": ["Paris", "London", "Berlin", "Rome"],
    "correctAnswer": "Paris"
  },
  {
    "type": "open_ended",
    "question": "Who painted the Mona Lisa?",
    "difficulty": "easy",
    "category": "art",
    "answer": "Leonardo da Vinci",
    "acceptedAnswers": ["da Vinci", "Leonardo"]
  },
  {
    "type": "list",
    "question": "Name all 8 planets in our solar system.",
    "difficulty": "medium",
    "category": "science",
    "answers": ["Mercury","Venus","Earth","Mars","Jupiter","Saturn","Uranus","Neptune"],
    "minRequired": 4
  }
]
```

Then import via the API or CLI script:

```bash
# Via API (POST directly)
curl -X POST https://your-vercel-url.vercel.app/api/questions/import \
  -H "Content-Type: application/json" \
  -d @my-questions.json

# Via CLI script (runs locally, posts to your running server)
npm run import -- ./my-questions.json https://your-vercel-url.vercel.app

# GET /api/questions/import to see the full format reference
```

**Supported question types in the import format:**

| `type` value | Required extra fields |
|---|---|
| `multiple_choice` | `options` (array), `correctAnswer` |
| `open_ended` | `answer`, `acceptedAnswers` (array) |
| `list` | `answers` (array), `minRequired` (number) |
| `grouping` | `groupName`, `items` (array), `correctItems` (array) |
| `this_or_that` | `categoryA`, `categoryB`, `items` (array of `{text, answer: "A"\|"B"}`) |
| `ranking` | `items` (array of `{text, rank}`), `criteria` |
| `media` | `mediaType` (`image`\|`video`), `mediaUrl`, `answer`, `acceptedAnswers` |
| `prompt` | `prompt`, `answer`, `acceptedAnswers`, `hints` (array) |

All types also accept: `difficulty` (`easy`\|`medium`\|`hard`), `category` (slug, auto-created), `explanation`.



### GitHub Pages

The static site is pre-built and committed to the `docs/` folder in this branch.
GitHub Pages serves it directly — no CI run required.

**One-time setup:**
1. Go to **Settings → Pages** in this repository
2. Set **Source** to **Deploy from a branch**
3. Set **Branch** to `copilot/build-trivia-game-site`, folder to **`/docs`**, then click **Save**
4. The site will be live at `https://jsr1151.github.io/triviaparty/` within ~1 minute

**Keeping `docs/` up to date:**  
When the CI workflow is permitted to run (Actions → approve pending runs), it will
automatically rebuild `docs/` and commit the update on every push.

### Manual GitHub Pages build

```bash
GITHUB_PAGES=true npm run build
# Static files are in out/
```

---

## Development Reference

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile production build |
| `npm start` | Run production server |
| `npm test` | Run test suite |
| `npm run lint` | Lint source files |
| `npm run db:migrate` | Create and apply a new database migration |
| `npm run db:generate` | Regenerate the Prisma client (after schema changes) |
| `npm run scrape -- <args>` | Scrape J-Archive games to JSON files (see J-Archive section) |
| `npm run import -- <file> [url]` | Bulk-import questions from a JSON file |

### Running Tests

```bash
npm test
```

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Database**: Prisma + SQLite (local) / Turso LibSQL (cloud)
- **Scraping**: Axios + Cheerio
- **Testing**: Jest + ts-jest
