/**
 * Property name normalization utilities
 * Centralizes property name handling to prevent matching issues
 */

/**
 * Normalize property names for comparison
 * Handles legacy naming variations like "N. Clark" vs "North Clark"
 * Returns a canonical form for consistent matching
 */
export function normalizePropertyName(name: string): string {
  const normalized = name.toLowerCase().trim();
  
  // Handle North Clark variations
  if (normalized === 'n. clark' || normalized === 'n clark' || normalized === 'north clark') {
    return 'north clark';
  }
  // Handle West Montrose variations
  if (normalized === 'w. montrose' || normalized === 'w montrose' || normalized === 'west montrose') {
    return 'w. montrose';
  }
  // Handle West Chicago variations
  if (normalized === 'w. chicago' || normalized === 'w chicago' || normalized === 'west chicago') {
    return 'w. chicago';
  }
  // Handle Countryside variations - check specific suffixes
  if (normalized.includes('countryside')) {
    if (normalized.endsWith(' t') || normalized.includes('townhouse') || normalized === 'countryside_t') {
      return 'countryside t';
    }
    if (normalized.endsWith(' c') || normalized.includes('court') || normalized === 'countryside_c') {
      return 'countryside c';
    }
    return normalized;
  }
  // Handle Green Bay variations (address numbers can be prefix or suffix)
  if (normalized.includes('green bay') || normalized.includes('greenbay') || /\d+.*green\s*bay|green\s*bay.*\d+/.test(normalized)) {
    if (normalized.includes('246')) return 'green bay 246';
    if (normalized.includes('440')) return 'green bay 440';
    if (normalized.includes('546')) return 'green bay 546';
  }
  
  return normalized;
}

/**
 * Get the display name for a property (Title Case)
 * Use this when showing property names to users
 */
export function getPropertyDisplayName(name: string): string {
  const normalized = name.toLowerCase().trim();
  
  // Handle North Clark variations
  if (normalized === 'n. clark' || normalized === 'n clark' || normalized === 'north clark') {
    return 'North Clark';
  }
  // Handle West Montrose variations
  if (normalized === 'w. montrose' || normalized === 'w montrose' || normalized === 'west montrose') {
    return 'W. Montrose';
  }
  // Handle West Chicago variations
  if (normalized === 'w. chicago' || normalized === 'w chicago' || normalized === 'west chicago') {
    return 'W. Chicago';
  }
  // Handle Countryside variations
  if (normalized.includes('countryside')) {
    if (normalized.endsWith(' t') || normalized.includes('townhouse') || normalized === 'countryside_t') {
      return 'Countryside T';
    }
    if (normalized.endsWith(' c') || normalized.includes('court') || normalized === 'countryside_c') {
      return 'Countryside C';
    }
  }
  // Handle Green Bay variations
  if (normalized.includes('green bay') || normalized.includes('greenbay') || /\d+.*green\s*bay|green\s*bay.*\d+/.test(normalized)) {
    if (normalized.includes('246')) return 'Green Bay 246';
    if (normalized.includes('440')) return 'Green Bay 440';
    if (normalized.includes('546')) return 'Green Bay 546';
  }
  
  return name; // Return original if no normalization needed
}

/**
 * Check if two property names refer to the same property
 */
export function propertiesMatch(prop1: string, prop2: string): boolean {
  return normalizePropertyName(prop1) === normalizePropertyName(prop2);
}
