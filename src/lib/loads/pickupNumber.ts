/**
 * The pickup number a driver gives at the guard shack. On a Landstar BCO Load Detail it is usually a Customer Reference
 * Number listed under "References" near the top. When that is missing it is the Notes line of the first (pickup) stop.
 */

export interface PickupNumberSource {
  /** What the document reader found directly. */
  pickup_number?: string | null;
  /** The "Customer Reference Number" values under References, in the order shown. */
  customer_references?: Array<string | null> | null;
  /** The Notes (and References) text of stop 1, the pickup. */
  pickup_stop_notes?: string | null;
  /** The load's notes, as a last place to look. */
  notes?: string | null;
}

/** A reference code has letters and digits (or just digits), 4 to 30 characters, and at least one digit. */
export function looksLikeReference(value: string): boolean {
  const v = value.trim();
  return /^[A-Za-z0-9][A-Za-z0-9-]{3,29}$/.test(v) && /\d/.test(v);
}

const clean = (v: string | null | undefined) => (v ?? '').trim().replace(/^[#:\s]+|[\s.,;]+$/g, '');

/** Every token in a piece of text that looks like a reference code. */
function codesIn(text: string | null | undefined): string[] {
  return (text ?? '').split(/[\s,;:|/()]+/).map(clean).filter((t) => t && looksLikeReference(t));
}

/**
 * Finds the pickup number, or null when there is none to find.
 *  1. The number the reader found.
 *  2. A Customer Reference Number under References. When there are several, the one that also appears in the pickup stop's
 *     notes wins, otherwise the first.
 *  3. A code in the pickup stop's notes.
 *  4. A code written after a label like "Pickup #" or "PU number" in the load notes.
 */
export function findPickupNumber(src: PickupNumberSource): string | null {
  const direct = clean(src.pickup_number);
  if (direct && looksLikeReference(direct)) return direct;

  const refs = (src.customer_references ?? []).map(clean).filter((r) => r && looksLikeReference(r));
  const stopCodes = codesIn(src.pickup_stop_notes);
  if (refs.length > 0) return refs.find((r) => stopCodes.some((c) => c.toLowerCase() === r.toLowerCase())) ?? refs[0];

  if (stopCodes.length > 0) return stopCodes[0];

  const labelled = /\b(?:pick-?up|pu)\s*(?:number|no\.?|#)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,29})/i.exec(src.notes ?? '');
  if (labelled && looksLikeReference(labelled[1])) return labelled[1];
  return null;
}
