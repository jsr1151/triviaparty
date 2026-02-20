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

The site shows the full UI with empty-state messages for game modes.
Game data is only available in a local or server deployment
(GitHub Pages is a static host — it cannot run the database or the J-Archive scraper).

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

## Deployment

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

### Running Tests

```bash
npm test
```

## Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Database**: Prisma + SQLite (easily swappable to PostgreSQL)
- **Scraping**: Axios + Cheerio
- **Testing**: Jest + ts-jest
