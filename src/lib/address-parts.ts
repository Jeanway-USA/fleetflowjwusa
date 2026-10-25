/**
 * Splits a written address into pieces a geocoder can use, for the United States and Canada.
 *
 *   "Set Epes Yard, 4455 Lansing Dr, Winston Salem, NC 27105-2924"
 *     -> { street: '4455 Lansing Dr', city: 'Winston Salem', state: 'NC', postal: '27105', country: 'us' }
 *   "Refrigerative Supply, 5543 72nd Ave SE #14, Calgary, AB T2C 3C4"
 *     -> { street: '5543 72nd Ave SE #14', city: 'Calgary', state: 'AB', postal: 'T2C 3C4', country: 'ca' }
 *
 * Canada used to be unknown here: an Alberta postal code was not read, so the address could not be parsed and the
 * lookup was limited to the US, which matched a similarly named place in the wrong country.
 *
 * The supabase/functions/geocode-address function has its own copy of this logic (functions cannot import from
 * src). Keep the two in step.
 */

export const CA_PROVINCES = new Set(['AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT']);

const ZIP = String.raw`\d{5}(?:-\d{4})?`;
const CA_POSTAL = String.raw`[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d`;
const POSTAL = `(?:${ZIP}|${CA_POSTAL})`;
const STATE_ONLY = new RegExp(`^([A-Za-z]{2})(?:\\s+(${POSTAL}))?$`);
const CITY_STATE = new RegExp(`^(.+?)\\s+([A-Za-z]{2})(?:\\s+(${POSTAL}))?$`);

export type Country = 'us' | 'ca';

export interface AddressParts {
  street?: string;
  city?: string;
  state?: string;
  postal?: string;
  country?: Country;
}

function tidyPostal(raw: string | undefined, country: Country): string | undefined {
  if (!raw) return undefined;
  if (country === 'ca') {
    const compact = raw.replace(/[\s-]/g, '').toUpperCase();
    return `${compact.slice(0, 3)} ${compact.slice(3)}`;
  }
  return raw.slice(0, 5);
}

export function parseAddressParts(address: string): AddressParts {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  let state: string | undefined;
  let rawPostal: string | undefined;
  let stateIdx = -1;

  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(STATE_ONLY);
    if (m) {
      state = m[1].toUpperCase();
      rawPostal = m[2];
      stateIdx = i;
      break;
    }
    const m2 = parts[i].match(CITY_STATE);
    if (m2) {
      state = m2[2].toUpperCase();
      rawPostal = m2[3];
      stateIdx = i;
      break;
    }
  }

  if (stateIdx === -1 || !state) return {};

  const country: Country = CA_PROVINCES.has(state) ? 'ca' : 'us';
  const city = stateIdx > 0 ? parts[stateIdx - 1] : undefined;

  // The street is the part before the city that starts with a house number.
  let street: string | undefined;
  for (let i = stateIdx - 2; i >= 0; i--) {
    if (/^\d/.test(parts[i])) {
      street = parts[i];
      break;
    }
  }
  // No numbered street: use the segment right before the city.
  if (!street && stateIdx - 2 >= 0) street = parts[stateIdx - 2];

  return { street, city, state, postal: tidyPostal(rawPostal, country), country };
}

/** "City, ST" (or "City, AB") for a centroid lookup, or null if the address has no readable state or province. */
export function cityAndState(address: string): { city: string; state: string; country: Country } | null {
  const { city, state, country } = parseAddressParts(address);
  if (!city || !state || !country) return null;
  return { city, state, country };
}

// Rough outlines of each country. Only used to catch a lookup that landed in the wrong country entirely, such as a
// Calgary address matched to a town named Robinson in Texas. They are deliberately generous at the borders.
const BOUNDS: Record<Country, Array<{ minLat: number; maxLat: number; minLng: number; maxLng: number }>> = {
  ca: [{ minLat: 41.6, maxLat: 83.2, minLng: -141.1, maxLng: -52.5 }],
  us: [
    { minLat: 24.3, maxLat: 49.6, minLng: -125.1, maxLng: -66.8 }, // lower 48
    { minLat: 51.0, maxLat: 71.6, minLng: -180.0, maxLng: -129.0 }, // Alaska
    { minLat: 18.8, maxLat: 22.4, minLng: -160.6, maxLng: -154.6 }, // Hawaii
  ],
};

/** True when a point is plausibly inside the country its address says it is in. */
export function plausibleForCountry(point: { lat: number; lng: number }, country: Country | undefined): boolean {
  if (!country) return true;
  return BOUNDS[country].some((b) => point.lat >= b.minLat && point.lat <= b.maxLat && point.lng >= b.minLng && point.lng <= b.maxLng);
}
