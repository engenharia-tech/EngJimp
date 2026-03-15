export const WORK_SCHEDULE = {
  morningStart: { hour: 7, minute: 45 },
  morningEnd: { hour: 12, minute: 0 },
  afternoonStart: { hour: 13, minute: 0 },
  afternoonEnd: { hour: 18, minute: 0 },
};

export function isWorkingHour(date: Date, isOvertime: boolean = false): boolean {
  if (isOvertime) return true;

  const day = date.getDay();
  const isWeekend = day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
  if (isWeekend) return false;

  const hour = date.getHours();
  const minute = date.getMinutes();
  const currentTimeInMinutes = hour * 60 + minute;

  const morningStart = WORK_SCHEDULE.morningStart.hour * 60 + WORK_SCHEDULE.morningStart.minute;
  const morningEnd = WORK_SCHEDULE.morningEnd.hour * 60 + WORK_SCHEDULE.morningEnd.minute;
  const afternoonStart = WORK_SCHEDULE.afternoonStart.hour * 60 + WORK_SCHEDULE.afternoonStart.minute;
  const afternoonEnd = WORK_SCHEDULE.afternoonEnd.hour * 60 + WORK_SCHEDULE.afternoonEnd.minute;

  const isInMorning = currentTimeInMinutes >= morningStart && currentTimeInMinutes < morningEnd;
  const isInAfternoon = currentTimeInMinutes >= afternoonStart && currentTimeInMinutes < afternoonEnd;

  return isInMorning || isInAfternoon;
}

export function getWorkingSeconds(startDate: Date, endDate: Date, isOvertime: boolean = false): number {
  if (startDate >= endDate) return 0;

  // If it's overtime, we don't filter by schedule, just return total wall-clock seconds
  if (isOvertime) {
    return Math.floor((endDate.getTime() - startDate.getTime()) / 1000);
  }

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

    const day = currentDay.getDay();
    const isWeekend = day === 0 || day === 6;

    if (!isWeekend) {
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
      const morningOverlap = getOverlapSeconds(startDate, endDate, morningStart, morningEnd);
      totalSeconds += morningOverlap;

      // Calculate overlap with Afternoon
      const afternoonOverlap = getOverlapSeconds(startDate, endDate, afternoonStart, afternoonEnd);
      totalSeconds += afternoonOverlap;
    }

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
