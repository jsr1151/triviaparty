export interface StudyScheduleState {
  easeFactor: number;
  intervalDays: number;
  consecutiveCorrect: number;
  lapseCount: number;
}

export function calculateNextSchedule(state: StudyScheduleState, correct: boolean, now = new Date()) {
  const nextEase = correct
    ? Math.min(2.8, Number((state.easeFactor + 0.05).toFixed(2)))
    : Math.max(1.3, Number((state.easeFactor - 0.2).toFixed(2)));

  let nextIntervalDays = state.intervalDays;
  let nextConsecutiveCorrect = state.consecutiveCorrect;
  let nextLapseCount = state.lapseCount;
  let nextDueAt = new Date(now.getTime() + 10 * 60 * 1000);
  let mastered = false;

  if (correct) {
    nextConsecutiveCorrect += 1;
    if (nextConsecutiveCorrect === 1) nextIntervalDays = 1;
    else if (nextConsecutiveCorrect === 2) nextIntervalDays = 3;
    else if (nextConsecutiveCorrect === 3) nextIntervalDays = 7;
    else nextIntervalDays = Math.max(7, Math.round(state.intervalDays * nextEase));

    nextDueAt = new Date(now);
    nextDueAt.setUTCDate(nextDueAt.getUTCDate() + nextIntervalDays);
    mastered = nextConsecutiveCorrect >= 5;
  } else {
    nextConsecutiveCorrect = 0;
    nextIntervalDays = 0;
    nextLapseCount += 1;
  }

  return {
    easeFactor: nextEase,
    intervalDays: nextIntervalDays,
    consecutiveCorrect: nextConsecutiveCorrect,
    lapseCount: nextLapseCount,
    nextDueAt,
    mastered,
  };
}
