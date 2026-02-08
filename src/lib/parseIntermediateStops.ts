/**
 * Parses intermediate stop data from a load's `notes` field.
 *
 * Expected format inside notes:
 * === INTERMEDIATE STOPS ===
 * Stop 2 (Drop): FacilityName, FacilityName, Street, City, ST ZIP - YYYY-MM-DD
 * Stop 3 (Pick): ...
 */

export interface IntermediateStop {
  stopNumber: number;
  stopType: string;
  facilityName: string;
  address: string;
  date: string | null;
}

export function parseIntermediateStops(notes: string | null): IntermediateStop[] {
  if (!notes) return [];

  // Only use the first section (before any "Updated from Rate Confirmation" duplicate)
  const mainContent = notes.split(/---\s*Updated from Rate Confirmation\s*---/i)[0] || '';

  const stopsMatch = mainContent.match(/===\s*INTERMEDIATE STOPS\s*===\n?([\s\S]*?)$/i);
  if (!stopsMatch) return [];

  const stopsBlock = stopsMatch[1].trim();
  const lines = stopsBlock.split('\n').filter(l => l.trim());

  const stops: IntermediateStop[] = [];

  for (const line of lines) {
    const match = line.match(/^Stop\s+(\d+)\s+\((\w+)\):\s*(.+)$/i);
    if (!match) continue;

    const stopNumber = parseInt(match[1], 10);
    const stopType = match[2];
    let rest = match[3].trim();

    // Extract trailing date (format: " - YYYY-MM-DD")
    let date: string | null = null;
    const dateMatch = rest.match(/\s+-\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (dateMatch) {
      date = dateMatch[1];
      rest = rest.slice(0, dateMatch.index).trim();
    }

    // Split by comma: [Name, Name(duplicate), Street, City, ST ZIP]
    const parts = rest.split(',').map(p => p.trim());

    let facilityName: string;
    let address: string;

    if (parts.length >= 3) {
      facilityName = parts[0];
      // The facility name is duplicated in the second segment; address starts at index 2
      address = parts.slice(2).join(', ');
    } else if (parts.length === 2) {
      facilityName = parts[0];
      address = parts[1];
    } else {
      facilityName = parts[0];
      address = parts[0];
    }

    stops.push({ stopNumber, stopType, facilityName, address, date });
  }

  return stops.sort((a, b) => a.stopNumber - b.stopNumber);
}
