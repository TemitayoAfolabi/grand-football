import { format, isToday, isTomorrow } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

/** Format a kickoff time in the UK timezone. */
export function formatKickoffTime(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(value, 'Europe/London', 'EEE d MMM, HH:mm');
}

/** Format a kickoff with a short relative label when possible. */
export function formatKickoffRelative(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  const time = formatInTimeZone(value, 'Europe/London', 'HH:mm');

  if (isToday(value)) return `Today, ${time}`;
  if (isTomorrow(value)) return `Tomorrow, ${time}`;
  return formatInTimeZone(value, 'Europe/London', 'EEE d MMM, HH:mm');
}

/** Format a date as a full month and year. */
export function formatMonth(date: string | Date): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return format(value, 'MMMM yyyy');
}
