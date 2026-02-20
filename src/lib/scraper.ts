import axios from 'axios';
import * as cheerio from 'cheerio';

const BASE_URL = 'https://j-archive.com';

export interface ScrapedClue {
  question: string;
  answer: string;
  value: number | null;
  dailyDouble: boolean;
  category: string;
  round: 'single' | 'double' | 'final';
}

export interface ScrapedCategory {
  name: string;
  round: 'single' | 'double' | 'final';
  position: number;
  clues: ScrapedClue[];
}

export interface ScrapedGame {
  showNumber: number;
  airDate: string;
  season: number | null;
  categories: ScrapedCategory[];
}

export async function scrapeGameList(page = 1): Promise<{ showNumber: number; airDate: string; url: string }[]> {
  const { data } = await axios.get(`${BASE_URL}/showindex.php?season=${page}`, {
    headers: { 'User-Agent': 'TriviaParty/1.0 (educational use)' },
    timeout: 10000,
  });
  const $ = cheerio.load(data);
  const games: { showNumber: number; airDate: string; url: string }[] = [];
  $('a[href*="showgame.php"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    const showMatch = href.match(/game_id=(\d+)/);
    const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
    const showNumMatch = text.match(/#(\d+)/);
    if (showMatch) {
      games.push({
        showNumber: showNumMatch ? parseInt(showNumMatch[1]) : parseInt(showMatch[1]),
        airDate: dateMatch ? dateMatch[1] : '',
        url: href.startsWith('http') ? href : `${BASE_URL}/${href}`,
      });
    }
  });
  return games;
}

export async function scrapeGame(gameId: number): Promise<ScrapedGame | null> {
  try {
    const { data } = await axios.get(`${BASE_URL}/showgame.php?game_id=${gameId}`, {
      headers: { 'User-Agent': 'TriviaParty/1.0 (educational use)' },
      timeout: 10000,
    });
    const $ = cheerio.load(data);

    const titleText = $('#game_title').text();
    const showNumMatch = titleText.match(/#(\d+)/);
    const dateMatch = titleText.match(/(\w+ \d+, \d{4})/);
    const showNumber = showNumMatch ? parseInt(showNumMatch[1]) : gameId;
    const airDate = dateMatch ? dateMatch[1] : '';

    const categories: ScrapedCategory[] = [];

    const roundNames: Array<'single' | 'double' | 'final'> = ['single', 'double', 'final'];
    const roundIds = ['#jeopardy_round', '#double_jeopardy_round', '#final_jeopardy_round'];

    roundIds.forEach((roundId, roundIdx) => {
      const round = roundNames[roundIdx];
      const roundEl = $(roundId);
      if (!roundEl.length) return;

      if (round === 'final') {
        const catName = roundEl.find('.category_name').first().text().trim();
        const clueText = roundEl.find('.clue_text').first().text().trim();
        const answerEl = roundEl.find('.correct_response').first();
        const answer = answerEl.text().trim();
        if (catName || clueText) {
          categories.push({
            name: catName,
            round: 'final',
            position: 0,
            clues: clueText ? [{ question: clueText, answer, value: null, dailyDouble: false, category: catName, round: 'final' }] : [],
          });
        }
        return;
      }

      const catElements = roundEl.find('.category_name');
      const catNames: string[] = [];
      catElements.each((_, el) => { catNames.push($(el).text().trim()); });

      catNames.forEach((catName, catIdx) => {
        const cat: ScrapedCategory = { name: catName, round, position: catIdx, clues: [] };
        categories.push(cat);
      });

      roundEl.find('.clue').each((_, clueEl) => {
        const clueText = $(clueEl).find('.clue_text').first().text().trim();
        if (!clueText) return;
        const valueText = $(clueEl).find('.clue_value, .clue_value_daily_double').text().trim();
        const isDailyDouble = $(clueEl).find('.clue_value_daily_double').length > 0;
        const value = valueText ? parseInt(valueText.replace(/[^0-9]/g, '')) : null;
        const answerEl = $(clueEl).find('.correct_response');
        const answer = answerEl.text().trim();
        const orderAttr = $(clueEl).find('[id*="clue_"]').attr('id') || '';
        const colMatch = orderAttr.match(/clue_[JD]_(\d+)/);
        const catIdx = colMatch ? parseInt(colMatch[1]) - 1 : 0;
        const targetCat = categories.find(c => c.round === round && c.position === catIdx);
        if (targetCat && clueText) {
          targetCat.clues.push({ question: clueText, answer, value: isNaN(value as number) ? null : value, dailyDouble: isDailyDouble, category: targetCat.name, round });
        }
      });
    });

    return { showNumber, airDate, season: null, categories };
  } catch (err) {
    console.error('Error scraping game:', err);
    return null;
  }
}
