/**
 * Date utilities for reporting periods
 * YTD: January 1 - December 31 of current year
 * Weekly: Friday - Thursday (for Friday meetings)
 */

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Get YTD (Year-to-Date) range: Jan 1 to Dec 31 of current year
 */
export function getYTDRange(): DateRange {
  const now = new Date();
  const year = now.getFullYear();
  
  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0), // Jan 1
    end: new Date(year, 11, 31, 23, 59, 59, 999), // Dec 31
  };
}

/**
 * Get current week range: Friday - Thursday
 * Week starts on Friday and ends on Thursday
 */
export function getCurrentWeekRange(): DateRange {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  
  // Calculate days since last Friday
  // If today is Friday (5), daysSinceFriday = 0
  // If today is Saturday (6), daysSinceFriday = 1
  // If today is Sunday (0), daysSinceFriday = 2
  // If today is Monday (1), daysSinceFriday = 3
  // etc.
  let daysSinceFriday = (dayOfWeek - 5 + 7) % 7;
  
  const friday = new Date(today);
  friday.setDate(today.getDate() - daysSinceFriday);
  friday.setHours(0, 0, 0, 0);
  
  const thursday = new Date(friday);
  thursday.setDate(friday.getDate() + 6);
  thursday.setHours(23, 59, 59, 999);
  
  return { start: friday, end: thursday };
}

/**
 * Get previous week range (Friday - Thursday of last week)
 */
export function getPreviousWeekRange(): DateRange {
  const current = getCurrentWeekRange();
  
  const prevFriday = new Date(current.start);
  prevFriday.setDate(prevFriday.getDate() - 7);
  
  const prevThursday = new Date(current.end);
  prevThursday.setDate(prevThursday.getDate() - 7);
  
  return { start: prevFriday, end: prevThursday };
}

/**
 * Format a date range for display
 */
export function formatDateRange(range: DateRange): string {
  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = range.start.toLocaleDateString('en-US', options);
  const endStr = range.end.toLocaleDateString('en-US', options);
  return `${startStr} - ${endStr}`;
}

/**
 * Format date for display
 */
export function formatDate(date: Date | string | null): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Check if a date string falls within a date range
 */
export function isInRange(dateStr: string | null, range: DateRange): boolean {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  return date >= range.start && date <= range.end;
}

/**
 * Get ISO date strings for Supabase queries
 */
export function getRangeForQuery(range: DateRange): { start: string; end: string } {
  return {
    start: range.start.toISOString(),
    end: range.end.toISOString(),
  };
}
