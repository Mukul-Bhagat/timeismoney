import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

// Frontend timezone: IST (Asia/Kolkata)
const DISPLAY_TIMEZONE = 'Asia/Kolkata';

/**
 * Convert UTC date to IST for display
 */
export function utcToIST(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return toZonedTime(dateObj, DISPLAY_TIMEZONE);
}

/**
 * Format date in IST timezone
 */
export function formatInIST(
  date: Date | string,
  format: string = 'PPpp'
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return formatInTimeZone(dateObj, DISPLAY_TIMEZONE, format);
}

/**
 * Format date as "MMM dd, yyyy HH:mm IST"
 */
export function formatDateTimeIST(date: Date | string): string {
  return formatInIST(date, 'MMM dd, yyyy HH:mm');
}

/**
 * Format date as "MMM dd, yyyy" or custom format
 */
export function formatDateIST(date: Date | string, format?: string): string {
  return formatInIST(date, format || 'MMM dd, yyyy');
}

/**
 * Get current time in IST
 */
export function getCurrentIST(): Date {
  return toZonedTime(new Date(), DISPLAY_TIMEZONE);
}

