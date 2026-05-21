import {
  applyBuzzerBeater,
  applyRace,
  applyComboBreaker,
  partialCredit,
  bestFitPoints,
  basePointsForDifficulty,
} from '@/lib/multiplayer-scoring';

describe('multiplayer scoring', () => {
  it('uses expected base points by difficulty', () => {
    expect(basePointsForDifficulty('easy')).toBe(100);
    expect(basePointsForDifficulty('medium')).toBe(200);
    expect(basePointsForDifficulty('hard')).toBe(350);
  });

  it('applies race and combo multipliers', () => {
    expect(applyRace(200, 1)).toBe(200);
    expect(applyRace(200, 2)).toBe(160);
    expect(applyComboBreaker(200, 4)).toBe(400);
  });

  it('supports partial and best fit scoring', () => {
    expect(partialCredit(200, 2, 4)).toBe(100);
    expect(bestFitPoints(200, 0)).toBe(200);
    expect(bestFitPoints(200, 2)).toBeLessThan(200);
  });

  it('scales buzzer beater down over time', () => {
    const fast = applyBuzzerBeater(200, 1000, 10000);
    const slow = applyBuzzerBeater(200, 9000, 10000);
    expect(fast).toBeGreaterThan(slow);
  });
});
