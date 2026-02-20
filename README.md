# TriviaParty

A trivia game hosting site with multiple game modes, powered by J-Archive data and a rich question bank.

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

## Getting Started

### Prerequisites
- Node.js 18+
- npm

### Setup

```bash
# Install dependencies
npm install

# Copy environment file and configure database
cp .env.example .env

# Generate Prisma client and run migrations
npx prisma migrate dev --name init

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

### Scraping J-Archive Data

To load Jeopardy games, use the scrape API endpoint:

```bash
# Scrape a specific game by its J-Archive game ID
curl -X POST http://localhost:3000/api/jeopardy/scrape \
  -H "Content-Type: application/json" \
  -d '{"gameId": 8000}'
```

### Running Tests

```bash
npm test
```

### Building for Production

```bash
npm run build
npm start
```

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS
- **Database**: Prisma + SQLite (easily swappable to PostgreSQL)
- **Scraping**: Axios + Cheerio
- **Testing**: Jest + ts-jest
