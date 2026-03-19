import { AppSettings } from '../types';

/**
 * Calculates the number of active seconds between two dates, considering the workday settings.
 */
export function calcActiveSeconds(from: Date, to: Date, settings: AppSettings, isOvertime: boolean = false): number {
  const start = from.getTime();
  const end = to.getTime();
  
  if (start >= end) return 0;

  // If it's overtime, we don't filter by schedule, just return total wall-clock seconds
  if (isOvertime) {
    return Math.floor((end - start) / 1000);
  }

  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";
  const workdays = settings.workdays || [1, 2, 3, 4, 5];

  const [startH, startM] = workdayStartStr.split(':').map(Number);
  const [endH, endM] = workdayEndStr.split(':').map(Number);

  let totalSeconds = 0;
  
  // Start from the 'from' date
  let current = new Date(from);
  
  // We process day by day
  while (current.getTime() < end) {
    const dayOfWeek = current.getDay();
    
    if (workdays.includes(dayOfWeek)) {
      // Define the workday boundaries for the current day
      const dayStart = new Date(current);
      dayStart.setHours(startH, startM, 0, 0);
      
      const dayEnd = new Date(current);
      dayEnd.setHours(endH, endM, 0, 0);

      // Calculate the intersection of [from, to] and [dayStart, dayEnd]
      const overlapStart = Math.max(start, dayStart.getTime());
      const overlapEnd = Math.min(end, dayEnd.getTime());

      if (overlapStart < overlapEnd) {
        totalSeconds += (overlapEnd - overlapStart) / 1000;
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
  if (isOvertime) return true;

  const dayOfWeek = date.getDay();
  const workdays = settings.workdays || [1, 2, 3, 4, 5];
  
  if (!workdays.includes(dayOfWeek)) return false;

  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";

  const [startH, startM] = workdayStartStr.split(':').map(Number);
  const [endH, endM] = workdayEndStr.split(':').map(Number);

  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;
  const currentMinutes = date.getHours() * 60 + date.getMinutes();

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}
