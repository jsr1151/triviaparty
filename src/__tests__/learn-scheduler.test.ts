import { calculateNextSchedule } from '@/lib/learn-scheduler';

describe('learn scheduler', () => {
  it('grows intervals with consecutive correct reviews and marks mastered at 5', () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const first = calculateNextSchedule({ easeFactor: 2.5, intervalDays: 0, consecutiveCorrect: 0, lapseCount: 0 }, true, now);
    const second = calculateNextSchedule({ ...first, lapseCount: 0 }, true, now);
    const fifth = calculateNextSchedule({ easeFactor: 2.6, intervalDays: 7, consecutiveCorrect: 4, lapseCount: 0 }, true, now);

    expect(first.intervalDays).toBe(1);
    expect(second.intervalDays).toBe(3);
    expect(fifth.mastered).toBe(true);
  });

  it('resets interval and streak on lapse', () => {
    const now = new Date('2026-05-21T00:00:00.000Z');
    const next = calculateNextSchedule({ easeFactor: 2.5, intervalDays: 7, consecutiveCorrect: 3, lapseCount: 1 }, false, now);
    expect(next.intervalDays).toBe(0);
    expect(next.consecutiveCorrect).toBe(0);
    expect(next.lapseCount).toBe(2);
    expect(next.mastered).toBe(false);
  });
});
