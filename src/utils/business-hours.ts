export const BUSINESS_START_HOUR = 9;
export const BUSINESS_END_HOUR = 18;
export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || "Asia/Kolkata";

export interface ZonedTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
}

export function getZonedTime(date: Date, timeZone: string = BUSINESS_TIMEZONE): ZonedTime {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    weekday: "short",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hourRaw = parseInt(map.hour || "0", 10);
  return {
    year: parseInt(map.year || "1970", 10),
    month: parseInt(map.month || "1", 10),
    day: parseInt(map.day || "1", 10),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: parseInt(map.minute || "0", 10),
    dayOfWeek: weekdayMap[map.weekday || "Sun"] ?? 0,
  };
}

export function createUtcFromZoned(year: number, month: number, day: number, hour: number, minute: number, timeZone: string = BUSINESS_TIMEZONE): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  for (let i = 0; i < 3; i++) {
    const zoned = getZonedTime(guess, timeZone);
    const diffMinutes = (hour - zoned.hour) * 60 + (minute - zoned.minute) + (day - zoned.day) * 1440;
    if (diffMinutes === 0) break;
    guess = new Date(guess.getTime() + diffMinutes * 60 * 1000);
  }
  return guess;
}

export function isHoliday(date: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): boolean {
  const z = getZonedTime(date, timeZone);
  for (const h of holidays) {
    const hz = getZonedTime(h, timeZone);
    if (z.year === hz.year && z.month === hz.month && z.day === hz.day) return true;
  }
  return false;
}

export function isBusinessDay(date: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): boolean {
  const z = getZonedTime(date, timeZone);
  if (z.dayOfWeek === 0 || z.dayOfWeek === 6) return false;
  return !isHoliday(date, holidays, timeZone);
}

export function snapToNextBusinessPeriod(date: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): Date {
  let current = new Date(date.getTime());
  while (true) {
    const z = getZonedTime(current, timeZone);
    const isWorkingDay = isBusinessDay(current, holidays, timeZone);
    if (isWorkingDay) {
      if (z.hour < BUSINESS_START_HOUR) return createUtcFromZoned(z.year, z.month, z.day, BUSINESS_START_HOUR, 0, timeZone);
      if (z.hour < BUSINESS_END_HOUR) return current;
    }
    const nextDayUtc = new Date(current.getTime() + 24 * 3600 * 1000);
    const nz = getZonedTime(nextDayUtc, timeZone);
    current = createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone);
  }
}

export function addBusinessHours(startUtc: Date, businessHours: number, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): Date {
  let remainingMinutes = Math.round(businessHours * 60);
  let current = snapToNextBusinessPeriod(startUtc, holidays, timeZone);
  while (remainingMinutes > 0) {
    const z = getZonedTime(current, timeZone);
    const minutesLeftToday = (BUSINESS_END_HOUR - z.hour) * 60 - z.minute;
    if (remainingMinutes <= minutesLeftToday) {
      const targetTotalMinutes = z.hour * 60 + z.minute + remainingMinutes;
      return createUtcFromZoned(z.year, z.month, z.day, Math.floor(targetTotalMinutes / 60), targetTotalMinutes % 60, timeZone);
    }
    remainingMinutes -= minutesLeftToday;
    const nextDay = new Date(current.getTime() + 24 * 3600 * 1000);
    const nz = getZonedTime(nextDay, timeZone);
    current = snapToNextBusinessPeriod(createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone), holidays, timeZone);
  }
  return current;
}

export function getBusinessMinutesBetween(startUtc: Date, endUtc: Date, holidays: Date[], timeZone: string = BUSINESS_TIMEZONE): number {
  if (startUtc >= endUtc) return 0;
  let current = snapToNextBusinessPeriod(startUtc, holidays, timeZone);
  if (current >= endUtc) return 0;
  let totalMinutes = 0;
  while (current < endUtc) {
    const z = getZonedTime(current, timeZone);
    if (!isBusinessDay(current, holidays, timeZone)) {
      const nextDay = new Date(current.getTime() + 24 * 3600 * 1000);
      const nz = getZonedTime(nextDay, timeZone);
      current = createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone);
      continue;
    }
    const dayEndUtc = createUtcFromZoned(z.year, z.month, z.day, BUSINESS_END_HOUR, 0, timeZone);
    const segmentEnd = endUtc < dayEndUtc ? endUtc : dayEndUtc;
    if (current < segmentEnd) {
      const sz = getZonedTime(segmentEnd, timeZone);
      const minutes = (sz.hour - z.hour) * 60 + (sz.minute - z.minute);
      if (minutes > 0) totalMinutes += minutes;
    }
    const nextDay = new Date(current.getTime() + 24 * 3600 * 1000);
    const nz = getZonedTime(nextDay, timeZone);
    current = createUtcFromZoned(nz.year, nz.month, nz.day, BUSINESS_START_HOUR, 0, timeZone);
  }
  return totalMinutes;
}
