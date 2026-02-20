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

    it('returns game data from HTML', async () => {
      const html = `<html><body>
        <div id="game_title">Show #8000 - aired January 1, 2024</div>
        <div id="jeopardy_round">
          <td class="category_name">SCIENCE</td>
        </div>
      </body></html>`;
      mockedAxios.get.mockResolvedValueOnce({ data: html });
      const result = await scrapeGame(8000);
      expect(result).not.toBeNull();
      expect(result?.showNumber).toBe(8000);
    });
  });
});
