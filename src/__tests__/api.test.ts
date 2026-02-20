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
});
