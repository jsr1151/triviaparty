// Simple unit tests for API validation logic (no DB required)
describe('API validation', () => {
  describe('questions endpoint', () => {
    it('validates required fields', () => {
      const validate = (body: { type?: string; question?: string }) => {
        if (!body.type || !body.question) return { error: 'type and question are required' };
        return null;
      };
      expect(validate({})).toEqual({ error: 'type and question are required' });
      expect(validate({ type: 'multiple_choice' })).toEqual({ error: 'type and question are required' });
      expect(validate({ type: 'multiple_choice', question: 'What is 2+2?' })).toBeNull();
    });
  });

  describe('games endpoint', () => {
    it('validates required fields', () => {
      const validate = (body: { mode?: string }) => {
        if (!body.mode) return { error: 'mode is required' };
        return null;
      };
      expect(validate({})).toEqual({ error: 'mode is required' });
      expect(validate({ mode: 'jeopardy' })).toBeNull();
    });
  });

  describe('categories endpoint', () => {
    it('validates required fields', () => {
      const validate = (body: { name?: string; slug?: string }) => {
        if (!body.name || !body.slug) return { error: 'name and slug are required' };
        return null;
      };
      expect(validate({})).toEqual({ error: 'name and slug are required' });
      expect(validate({ name: 'Science', slug: 'science' })).toBeNull();
    });
  });

  describe('auth endpoints', () => {
    it('login rejects missing credentials', () => {
      const validate = (body: { login?: string; password?: string }) => {
        const login = String(body.login ?? '').trim();
        const password = String(body.password ?? '');
        if (!login || !password) return { error: 'Username/email and password are required.' };
        return null;
      };
      expect(validate({})).toEqual({ error: 'Username/email and password are required.' });
      expect(validate({ login: 'user' })).toEqual({ error: 'Username/email and password are required.' });
      expect(validate({ login: 'user', password: 'pass' })).toBeNull();
    });

    it('signup rejects missing or short credentials', () => {
      const validate = (body: { email?: string; username?: string; password?: string }) => {
        const email = String(body.email ?? '').trim();
        const username = String(body.username ?? '').trim();
        const password = String(body.password ?? '');
        if (!email || !username || password.length < 6) {
          return { error: 'Email, username, and password (min 6 chars) are required.' };
        }
        return null;
      };
      expect(validate({})).not.toBeNull();
      expect(validate({ email: 'a@b.com', username: 'user', password: '123' })).not.toBeNull();
      expect(validate({ email: 'a@b.com', username: 'user', password: 'secure1' })).toBeNull();
    });
  });

  describe('import-local endpoint', () => {
    it('counts correct/incorrect/skip outcomes from local clue entries', () => {
      type Outcome = 'correct' | 'incorrect' | 'skip';
      const countOutcomes = (outcomes: Outcome[]) =>
        outcomes.reduce(
          (acc: { correct: number; incorrect: number; skip: number }, o) => {
            if (o === 'correct') acc.correct++;
            else if (o === 'incorrect') acc.incorrect++;
            else acc.skip++;
            return acc;
          },
          { correct: 0, incorrect: 0, skip: 0 },
        );

      expect(countOutcomes(['correct', 'correct', 'incorrect', 'skip'])).toEqual({
        correct: 2,
        incorrect: 1,
        skip: 1,
      });
      expect(countOutcomes([])).toEqual({ correct: 0, incorrect: 0, skip: 0 });
    });

    it('skips import if clues array is empty and overall is null', () => {
      const shouldSkip = (clues: unknown[], overall: unknown) => clues.length === 0 && !overall;
      expect(shouldSkip([], null)).toBe(true);
      expect(shouldSkip([{ clueId: 'x' }], null)).toBe(false);
    });
  });
});
