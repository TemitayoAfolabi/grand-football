import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { formatInTimeZone } from 'date-fns-tz';
import { format, isToday, isTomorrow } from 'date-fns';

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a kickoff time to UK timezone display.
 */
export function formatKickoffTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(d, 'Europe/London', 'EEE d MMM, HH:mm');
}

/**
 * Format kickoff date with relative label (Today, Tomorrow, or date).
 */
export function formatKickoffRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const time = formatInTimeZone(d, 'Europe/London', 'HH:mm');
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  return formatInTimeZone(d, 'Europe/London', 'EEE d MMM, HH:mm');
}

/**
 * Get the match outcome from scores.
 */
export function getOutcome(
  homeScore: number,
  awayScore: number,
): 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' {
  if (homeScore > awayScore) return 'HOME_WIN';
  if (homeScore < awayScore) return 'AWAY_WIN';
  return 'DRAW';
}

/**
 * Format a gameweek number as a label.
 */
export function getGameweekLabel(gameweek: number): string {
  return `Gameweek ${gameweek}`;
}

/**
 * Format a month date for display.
 */
export function formatMonth(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'MMMM yyyy');
}
