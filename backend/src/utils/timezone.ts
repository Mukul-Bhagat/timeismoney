// Backend timezone utilities
// All timestamps are stored in UTC

/**
 * Get current UTC timestamp
 */
export function getCurrentUTC(): Date {
  return new Date();
}

/**
 * Convert any date to UTC (ensures we store in UTC)
 */
export function toUTC(date: Date | string): Date {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  // If it's already a Date object, it's in UTC internally
  // Just ensure we return a proper Date object
  return new Date(dateObj.toISOString());
}

/**
 * Format date as ISO string (UTC)
 */
export function formatUTC(date: Date): string {
  return date.toISOString();
}

