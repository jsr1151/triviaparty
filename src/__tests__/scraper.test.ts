import { scrapeGame, scrapeGameList } from '@/lib/scraper';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('scraper', () => {
  describe('scrapeGameList', () => {
    it('returns empty array when no game links found', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: '<html><body></body></html>' });
      const result = await scrapeGameList(1);
      expect(Array.isArray(result)).toBe(true);
    });

    it('parses game links from HTML', async () => {
      const html = `<html><body>
        <a href="showgame.php?game_id=8000">Show #8000 - 2024-01-01</a>
      </body></html>`;
      mockedAxios.get.mockResolvedValueOnce({ data: html });
      const result = await scrapeGameList(1);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].showNumber).toBeDefined();
    });
  });

  describe('scrapeGame', () => {
    it('returns null on error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      const result = await scrapeGame(8000);
      expect(result).toBeNull();
    });

    it('returns game data with all required fields', async () => {
      const html = `<html><body>
        <div id="game_title">Show #8000 - aired January 1, 2024</div>
        <a href="showindex.php?season=40">Season 40</a>
        <div id="jeopardy_round">
          <td class="category_name">SCIENCE</td>
        </div>
      </body></html>`;
      mockedAxios.get.mockResolvedValueOnce({ data: html });
      const result = await scrapeGame(8000);
      expect(result).not.toBeNull();
      expect(result?.showNumber).toBe(8000);
      // New fields
      expect(result).toHaveProperty('isSpecial');
      expect(result).toHaveProperty('tournamentType');
      expect(result?.season).toBe(40);
    });

    it('detects special/tournament episodes', async () => {
      const html = `<html><body>
        <div id="game_title">Tournament of Champions Show #8001 - aired May 15, 2024</div>
        <div id="jeopardy_round"></div>
      </body></html>`;
      mockedAxios.get.mockResolvedValueOnce({ data: html });
      const result = await scrapeGame(8001);
      expect(result?.isSpecial).toBe(true);
      expect(result?.tournamentType).toBeTruthy();
    });

    it('marks clues with tripleStumper and isFinalJeopardy fields', async () => {
      const html = `<html><body>
        <div id="game_title">Show #8002 - aired June 1, 2024</div>
        <div id="jeopardy_round">
          <td class="category_name">HISTORY</td>
          <td class="clue">
            <div id="clue_J_1_1" class="clue_text">Who was the first president?</div>
            <div class="clue_value">$200</div>
            <em class="correct_response">George Washington</em>
            <td class="wrong">Alex</td>
            <td class="wrong">Brad</td>
            <td class="wrong">Carl</td>
          </td>
        </div>
        <div id="final_jeopardy_round">
          <td class="category_name">FINAL</td>
          <td class="clue">
            <div class="clue_text">Final question text</div>
            <em class="correct_response">Final answer</em>
          </td>
        </div>
      </body></html>`;
      mockedAxios.get.mockResolvedValueOnce({ data: html });
      const result = await scrapeGame(8002);
      expect(result).not.toBeNull();

      // All clues from the single round should have tripleStumper and isFinalJeopardy fields
      const singleClues = result?.categories.filter(c => c.round === 'single').flatMap(c => c.clues) ?? [];
      singleClues.forEach(clue => {
        expect(clue).toHaveProperty('tripleStumper');
        expect(clue).toHaveProperty('isFinalJeopardy');
        expect(clue.isFinalJeopardy).toBe(false);
      });

      // Final Jeopardy clues should have isFinalJeopardy = true
      const finalClues = result?.categories.filter(c => c.round === 'final').flatMap(c => c.clues) ?? [];
      finalClues.forEach(clue => {
        expect(clue.isFinalJeopardy).toBe(true);
      });
    });
  });
});
