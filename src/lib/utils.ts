import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with proper conflict resolution.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the match outcome from scores.
 */
export function getOutcome(homeScore: number, awayScore: number): 'HOME_WIN' | 'AWAY_WIN' | 'DRAW' {
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
