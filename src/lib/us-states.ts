export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export type USState = typeof US_STATES[number];

/**
 * Attempt to extract a US state abbreviation from a vendor/location string.
 * Common patterns: "PILOT DALLAS TX", "TA FORT WORTH TX", "LOVES #123 GA"
 */
export function extractJurisdictionFromVendor(vendor: string | null): string | null {
  if (!vendor) return null;
  
  const upper = vendor.toUpperCase().trim();
  
  // Try to find a two-letter state code at the end of the string
  const trailingMatch = upper.match(/\b([A-Z]{2})\s*$/);
  if (trailingMatch && US_STATES.includes(trailingMatch[1] as any)) {
    return trailingMatch[1];
  }
  
  // Try to find a state code preceded by a comma or space pattern like ", TX" or " TX "
  const commaMatch = upper.match(/,\s*([A-Z]{2})\b/);
  if (commaMatch && US_STATES.includes(commaMatch[1] as any)) {
    return commaMatch[1];
  }

  // Try to find any standalone two-letter state code (word boundary)
  // Search from right to left for the last match (most likely to be the state)
  const allMatches = upper.match(/\b([A-Z]{2})\b/g);
  if (allMatches) {
    for (let i = allMatches.length - 1; i >= 0; i--) {
      if (US_STATES.includes(allMatches[i] as any)) {
        return allMatches[i];
      }
    }
  }
  
  return null;
}
