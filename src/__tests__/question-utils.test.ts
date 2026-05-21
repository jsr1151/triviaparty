import { buildThisOrThatPrompt, stripListLeadingCount } from '@/lib/question-utils';

describe('question-utils helpers', () => {
  it('removes leading list count for name-as-many mode', () => {
    expect(stripListLeadingCount('List 4 well-known chemists')).toBe('List well-known chemists');
    expect(stripListLeadingCount('List 10 U.S. states by population')).toBe('List U.S. states by population');
    expect(stripListLeadingCount('Name 5 capitals')).toBe('Name 5 capitals');
  });

  it('builds this-or-that prompt with all categories', () => {
    expect(buildThisOrThatPrompt(['Rock', 'Jazz'])).toBe('Is it Rock or Jazz?');
    expect(buildThisOrThatPrompt(['A', 'B', 'C'])).toBe('Is it A, B, or C?');
  });
});
