/**
 * Utility functions for approval page
 */
import { formatDateIST } from './timezone';

/**
 * Extract name from email (before @)
 */
export function getNameFromEmail(email: string): string {
  return email.split('@')[0];
}

/**
 * Generate date range array from start_date to end_date
 */
export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * Format date for display (e.g., "Jan 15") - using IST timezone
 */
export function formatDate(dateStr: string): string {
  return formatDateIST(dateStr, 'MMM dd');
}

/**
 * Calculate total hours from day hours object
 */
export function calculateTotalHours(dayHours: { [date: string]: number }): number {
  return Object.values(dayHours).reduce((sum, hours) => sum + hours, 0);
}

/**
 * Calculate total amount from approval rows
 */
export function calculateTotalAmount(rows: Array<{ amount: number }>): number {
  return rows.reduce((sum, row) => sum + row.amount, 0);
}

/**
 * Calculate total hours from approval rows
 */
export function calculateTotalHoursFromRows(rows: Array<{ total_hours: number }>): number {
  return rows.reduce((sum, row) => sum + row.total_hours, 0);
}

/**
 * Calculate total quote amount from approval rows
 */
export function calculateTotalQuote(rows: Array<{ quote_amount: number | null }>): number {
  return rows.reduce((sum, row) => sum + (row.quote_amount || 0), 0);
}

