import { OperationalActivity, AppSettings } from '../types';
import { calcActiveSeconds } from './workdayCalc';

/**
 * Checks if a running operational activity has been forgotten running
 * past the workday end of its start day (or subsequent days), and if so,
 * generates a list of split segments (completed and/or a new running one).
 * 
 * "as atividades que forem esquecidas dentro de desempenho rodando exemplo ir a fabrica, 
 * devem ser interrompidas no final do expediente e retomadas no dia seguinte"
 */
export function getCleanupSegmentsForActivity(
  act: OperationalActivity,
  settings: AppSettings,
  now: Date = new Date()
): {
  originalToUpdate: OperationalActivity;
  newSegmentsToCreate: Omit<OperationalActivity, 'id'>[];
  needsCorrection: boolean;
} | null {
  if (act.endTime) {
    return null; // Not running
  }

  const start = new Date(act.startTime);
  if (isNaN(start.getTime())) {
    return null; // Invalid date
  }

  const workdayStartStr = settings.workdayStart || "07:30";
  const workdayEndStr = settings.workdayEnd || "17:30";
  const workdays = (settings.workdays || [1, 2, 3, 4, 5]).map(Number);

  const [wsH, wsM] = workdayStartStr.split(':').map(Number);
  const [weH, weM] = workdayEndStr.split(':').map(Number);

  // End limit of the start day
  const workdayEndLimitOfStartDay = new Date(start);
  workdayEndLimitOfStartDay.setHours(weH, weM, 0, 0);

  const startMidnight = new Date(start);
  startMidnight.setHours(0, 0, 0, 0);

  const nowMidnight = new Date(now);
  nowMidnight.setHours(0, 0, 0, 0);

  // If the activity is marked as overtime, or was started after the work shift ended,
  // do not clean it up as long as we are still on the same calendar day.
  if (act.isOvertime || start.getTime() >= workdayEndLimitOfStartDay.getTime()) {
    if (nowMidnight.getTime() <= startMidnight.getTime()) {
      return null; // Keep running normally on the start day
    }
  } else {
    // Is "now" past the end of the shift of the start day?
    // If not, it means the activity is running normally on its starting day and hasn't exceeded the workday end of today yet.
    if (now.getTime() <= workdayEndLimitOfStartDay.getTime()) {
      return null; // No cleanup needed yet
    }
  }

  // We need correction!
  // We will iterate day-by-day from the start day of the activity through the day of "now"

  const days: Date[] = [];
  let current = new Date(startMidnight);
  while (current.getTime() <= nowMidnight.getTime()) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const calculatedSegments: {
    startTime: Date;
    endTime: Date | null;
    notes: string;
  }[] = [];

  for (const d of days) {
    const isStartDay = (d.getFullYear() === start.getFullYear() && d.getMonth() === start.getMonth() && d.getDate() === start.getDate());
    const isToday = (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate());
    const isWorkday = workdays.includes(d.getDay()) || !!act.isOvertime;

    if (isStartDay) {
      // The starting day: it always has a segment, even if it was a weekend
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const endOfShift = new Date(d);
      if (isWeekend && !act.isOvertime) {
        // If it started on a weekend with no overtime allowed, end it immediately at start time.
        endOfShift.setTime(start.getTime());
      } else {
        endOfShift.setHours(weH, weM, 0, 0);
      }

      calculatedSegments.push({
        startTime: start,
        endTime: endOfShift,
        notes: "Interrompida automaticamente no final do expediente (Esquecida)"
      });
    } else if (isWorkday) {
      // A subsequent workday (can be a middle day or today)
      const startOfShift = new Date(d);
      startOfShift.setHours(wsH, wsM, 0, 0);

      const endOfShift = new Date(d);
      endOfShift.setHours(weH, weM, 0, 0);

      if (isToday) {
        if (now.getTime() < startOfShift.getTime()) {
          // It is before today's shift start, so we don't start the activity today.
        } else if (now.getTime() >= startOfShift.getTime() && now.getTime() < endOfShift.getTime()) {
          // We are currently in today's shift! So we create a running segment for today.
          calculatedSegments.push({
            startTime: startOfShift,
            endTime: null, // Keep running
            notes: "Retomada automaticamente"
          });
        } else {
          // Today's shift is also closed.
          calculatedSegments.push({
            startTime: startOfShift,
            endTime: endOfShift,
            notes: "Retomada automaticamente | Interrompida automaticamente no final do expediente"
          });
        }
      } else {
        // A past middle workday
        calculatedSegments.push({
          startTime: startOfShift,
          endTime: endOfShift,
          notes: "Retomada automaticamente | Interrompida automaticamente no final do expediente"
        });
      }
    }
  }

  if (calculatedSegments.length === 0) {
    return null;
  }

  // The first segment will update the original activity
  const firstSeg = calculatedSegments[0];
  const origEndISO = firstSeg.endTime ? firstSeg.endTime.toISOString() : null;
  const originalToUpdate: OperationalActivity = {
    ...act,
    isFlagged: true,
    endTime: origEndISO,
    durationSeconds: origEndISO ? calcActiveSeconds(act.startTime, origEndISO, settings, !!act.isOvertime) : 0,
    notes: (act.notes ? act.notes + " | " : "") + firstSeg.notes
  };

  // The rest of the segments will be newly created activities
  const newSegmentsToCreate = calculatedSegments.slice(1).map(seg => {
    const startStr = seg.startTime.toISOString();
    const endStr = seg.endTime ? seg.endTime.toISOString() : null;
    const duration = endStr ? calcActiveSeconds(startStr, endStr, settings, !!act.isOvertime) : 0;

    return {
      userId: act.userId,
      activityTypeId: act.activityTypeId,
      activityName: act.activityName,
      startTime: startStr,
      endTime: endStr,
      durationSeconds: duration,
      notes: seg.notes,
      projectId: act.projectId,
      isFlagged: true,
      isOvertime: act.isOvertime
    };
  });

  return {
    originalToUpdate,
    newSegmentsToCreate,
    needsCorrection: true
  };
}
