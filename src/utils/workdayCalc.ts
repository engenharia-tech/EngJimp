import { AppSettings } from '../types';

/**
 * Calculates the number of active seconds between two dates, considering the workday settings.
 */
export function calcActiveSeconds(from: Date, to: Date, settings: AppSettings, isOvertime: boolean = false): number {
  const start = from.getTime();
  const end = to.getTime();
  
  if (start >= end) return 0;

  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";
  const lunchStartStr = settings.lunchStart || "12:00";
  const lunchEndStr = settings.lunchEnd || "13:00";
  const workdays = settings.workdays || [1, 2, 3, 4, 5];

  const [startH, startM] = workdayStartStr.split(':').map(Number);
  const [endH, endM] = workdayEndStr.split(':').map(Number);
  const [lunchStartH, lunchStartM] = lunchStartStr.split(':').map(Number);
  const [lunchEndH, lunchEndM] = lunchEndStr.split(':').map(Number);

  let totalSeconds = 0;
  
  // Start from the 'from' date
  let current = new Date(from);
  
  // We process day by day
  while (current.getTime() < end) {
    const dayOfWeek = current.getDay();
    
    // If overtime, we count every day. If not, only workdays.
    if (isOvertime || workdays.includes(dayOfWeek)) {
      // Define the workday boundaries for the current day
      const dayStart = new Date(current);
      const dayEnd = new Date(current);

      if (isOvertime) {
          // In overtime mode, the whole day is potentially active
          dayStart.setHours(0, 0, 0, 0);
          dayEnd.setHours(23, 59, 59, 999);
      } else {
          dayStart.setHours(startH, startM, 0, 0);
          dayEnd.setHours(endH, endM, 0, 0);
      }

      // Calculate the intersection of [from, to] and [dayStart, dayEnd]
      const overlapStart = Math.max(start, dayStart.getTime());
      const overlapEnd = Math.min(end, dayEnd.getTime());

      if (overlapStart < overlapEnd) {
        let activeMs = overlapEnd - overlapStart;

        // Subtract lunch break if it overlaps
        const lunchStart = new Date(current);
        lunchStart.setHours(lunchStartH, lunchStartM, 0, 0);
        const lunchEnd = new Date(current);
        lunchEnd.setHours(lunchEndH, lunchEndM, 0, 0);

        const lunchOverlapStart = Math.max(overlapStart, lunchStart.getTime());
        const lunchOverlapEnd = Math.min(overlapEnd, lunchEnd.getTime());

        if (lunchOverlapStart < lunchOverlapEnd) {
          activeMs -= (lunchOverlapEnd - lunchOverlapStart);
        }

        totalSeconds += activeMs / 1000;
      }
    }

    // Advance to the next day at 00:00:00
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return Math.round(totalSeconds);
}

/**
 * Checks if a given date is within the configured workday.
 */
export function isWorkingHour(date: Date, settings: AppSettings, isOvertime: boolean = false): boolean {
  const dayOfWeek = date.getDay();
  const workdays = settings.workdays || [1, 2, 3, 4, 5];
  
  if (!isOvertime && !workdays.includes(dayOfWeek)) return false;

  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";
  const lunchStartStr = settings.lunchStart || "12:00";
  const lunchEndStr = settings.lunchEnd || "13:00";

  const [startH, startM] = workdayStartStr.split(':').map(Number);
  const [endH, endM] = workdayEndStr.split(':').map(Number);
  const [lStartH, lStartM] = lunchStartStr.split(':').map(Number);
  const [lEndH, lEndM] = lunchEndStr.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const lunchStartMinutes = lStartH * 60 + lStartM;
  const lunchEndMinutes = lEndH * 60 + lEndM;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  const isLunch = currentMinutes >= lunchStartMinutes && currentMinutes < lunchEndMinutes;

  if (isOvertime) return !isLunch;

  return currentMinutes >= startMinutes && currentMinutes < endMinutes && !isLunch;
}
