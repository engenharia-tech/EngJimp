import { AppSettings } from '../types';

/**
 * Calculates the number of active seconds between two dates, considering the workday settings.
 */
export function calcActiveSeconds(from: Date | string, to: Date | string, settings: AppSettings, isOvertime: boolean = false): number {
  const startDate = new Date(from);
  const endDate = new Date(to);
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  
  if (isNaN(startMs) || isNaN(endMs) || startMs >= endMs) return 0;

  // Ensure default business hours are consistent
  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";
  const lunchStartStr = settings.lunchStart || "12:00";
  const lunchEndStr = settings.lunchEnd || "13:00";
  const workdays = (settings.workdays || [1, 2, 3, 4, 5]).map(Number); // Ensure numbers

  const [startH, startM] = workdayStartStr.split(':').map(Number);
  const [endH, endM] = workdayEndStr.split(':').map(Number);
  const [lunchHS, lunchMS] = lunchStartStr.split(':').map(Number);
  const [lunchHE, lunchME] = lunchEndStr.split(':').map(Number);

  let totalMs = 0;
  let current = new Date(startDate);

  // We process day by day to correctly handle business hours and lunch breaks
  while (current.getTime() < endMs) {
    const dayOfWeek = current.getDay();
    
    // If overtime, we count every day. If not, only workdays.
    if (isOvertime || workdays.includes(dayOfWeek)) {
      const dayStartBoundary = new Date(current);
      const dayEndBoundary = new Date(current);
      
      if (isOvertime) {
        dayStartBoundary.setHours(0, 0, 0, 0);
        dayEndBoundary.setHours(23, 59, 59, 999);
      } else {
        dayStartBoundary.setHours(startH, startM, 0, 0);
        dayEndBoundary.setHours(endH, endM, 0, 0);
      }

      const overlapStart = Math.max(startMs, dayStartBoundary.getTime());
      const overlapEnd = Math.min(endMs, dayEndBoundary.getTime());

      if (overlapStart < overlapEnd) {
        let activeMs = overlapEnd - overlapStart;

        // Subtract lunch break if it overlaps and not in overtime
        if (!isOvertime) {
          const lStart = new Date(current);
          const lEnd = new Date(current);
          
          // Special override for May 4th, 2026 as requested by user
          const isMay4th2026 = current.getFullYear() === 2026 && current.getMonth() === 4 && current.getDate() === 4;
          
          if (isMay4th2026) {
            lStart.setHours(12, 30, 0, 0);
            lEnd.setHours(13, 30, 0, 0);
          } else {
            lStart.setHours(lunchHS, lunchMS, 0, 0);
            lEnd.setHours(lunchHE, lunchME, 0, 0);
          }

          const lunchOverlapStart = Math.max(overlapStart, lStart.getTime());
          const lunchOverlapEnd = Math.min(overlapEnd, lEnd.getTime());

          if (lunchOverlapStart < lunchOverlapEnd) {
            activeMs -= (lunchOverlapEnd - lunchOverlapStart);
          }
        }
        
        if (activeMs > 0) {
          totalMs += activeMs;
        }
      }
    }

    // Advance to next day at midnight
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  return Math.round(totalMs / 1000);
}

/**
 * Checks if a given date is within the configured workday.
 */
export function isWorkingHour(date: Date, settings: AppSettings, isOvertime: boolean = false): boolean {
  if (isOvertime) return true;

  const dayOfWeek = date.getDay();
  const workdays = (settings.workdays || [1, 2, 3, 4, 5]).map(Number); // Ensure numbers
  
  if (!workdays.includes(dayOfWeek)) return false;

  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";
  const lunchStartStr = settings.lunchStart || "12:00";
  const lunchEndStr = settings.lunchEnd || "13:00";

  const [startH, startM] = workdayStartStr.split(':').map(Number);
  const [endH, endM] = workdayEndStr.split(':').map(Number);

  let lStartH = 0, lStartM = 0, lEndH = 0, lEndM = 0;
  
  // Special override for May 4th, 2026 as requested by user
  if (date.getFullYear() === 2026 && date.getMonth() === 4 && date.getDate() === 4) {
    lStartH = 12; lStartM = 30;
    lEndH = 13; lEndM = 30;
  } else {
    const [lsH, lsM] = lunchStartStr.split(':').map(Number);
    const [leH, leM] = lunchEndStr.split(':').map(Number);
    lStartH = lsH; lStartM = lsM;
    lEndH = leH; lEndM = leM;
  }

  const startTotSeconds = (startH * 60 + startM) * 60;
  const endTotSeconds = (endH * 60 + endM) * 60;
  const lunchStartTotSeconds = (lStartH * 60 + lStartM) * 60;
  const lunchEndTotSeconds = (lEndH * 60 + lEndM) * 60;
  
  const currentTotSeconds = (date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds();

  // Check if it's lunch time
  if (currentTotSeconds >= lunchStartTotSeconds && currentTotSeconds < lunchEndTotSeconds) {
    return false;
  }

  return currentTotSeconds >= startTotSeconds && currentTotSeconds < endTotSeconds;
}
