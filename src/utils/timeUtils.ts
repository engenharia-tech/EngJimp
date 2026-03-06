export const WORK_SCHEDULE = {
  morningStart: { hour: 7, minute: 30 },
  morningEnd: { hour: 12, minute: 0 },
  afternoonStart: { hour: 13, minute: 0 },
  afternoonEnd: { hour: 18, minute: 0 },
};

export function getWorkingSeconds(startDate: Date, endDate: Date): number {
  if (startDate >= endDate) return 0;

  let totalSeconds = 0;
  
  // Clone to avoid modifying original and set to start of the day
  let currentDay = new Date(startDate);
  currentDay.setHours(0,0,0,0);

  const endTimestamp = endDate.getTime();

  // Safety break to prevent infinite loops if dates are wild
  let iterations = 0;
  const MAX_ITERATIONS = 365 * 5; // 5 years max

  while (currentDay.getTime() <= endTimestamp && iterations < MAX_ITERATIONS) {
    iterations++;

    // Define working intervals for the current day
    const morningStart = new Date(currentDay);
    morningStart.setHours(WORK_SCHEDULE.morningStart.hour, WORK_SCHEDULE.morningStart.minute, 0, 0);

    const morningEnd = new Date(currentDay);
    morningEnd.setHours(WORK_SCHEDULE.morningEnd.hour, WORK_SCHEDULE.morningEnd.minute, 0, 0);

    const afternoonStart = new Date(currentDay);
    afternoonStart.setHours(WORK_SCHEDULE.afternoonStart.hour, WORK_SCHEDULE.afternoonStart.minute, 0, 0);

    const afternoonEnd = new Date(currentDay);
    afternoonEnd.setHours(WORK_SCHEDULE.afternoonEnd.hour, WORK_SCHEDULE.afternoonEnd.minute, 0, 0);

    // Calculate overlap with Morning
    totalSeconds += getOverlapSeconds(startDate, endDate, morningStart, morningEnd);

    // Calculate overlap with Afternoon
    totalSeconds += getOverlapSeconds(startDate, endDate, afternoonStart, afternoonEnd);

    // Move to next day
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return Math.floor(totalSeconds);
}

function getOverlapSeconds(periodStart: Date, periodEnd: Date, intervalStart: Date, intervalEnd: Date): number {
  const start = Math.max(periodStart.getTime(), intervalStart.getTime());
  const end = Math.min(periodEnd.getTime(), intervalEnd.getTime());
  
  if (start < end) {
    return (end - start) / 1000;
  }
  return 0;
}
