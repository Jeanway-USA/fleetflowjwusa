// Wear-part lifespan profiles keyed by truck make/model
// Used for predictive component health calculations

export interface WearPartProfile {
  part_name: string;
  lifespan_miles: number;
  warning_threshold_pct: number; // Below this % → urgent
}

export interface TruckMaintenanceProfile {
  make: string;
  model: string; // "all" = applies to any model of that make
  parts: WearPartProfile[];
}

export const TRUCK_MAINTENANCE_PROFILES: TruckMaintenanceProfile[] = [
  {
    make: 'freightliner',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 300000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 250000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 400000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 350000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 200000, warning_threshold_pct: 20 },
    ],
  },
  {
    make: 'kenworth',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 280000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 275000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 420000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 360000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 210000, warning_threshold_pct: 20 },
    ],
  },
  {
    make: 'peterbilt',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 280000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 275000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 420000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 360000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 210000, warning_threshold_pct: 20 },
    ],
  },
  {
    make: 'volvo',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 320000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 260000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 380000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 340000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 220000, warning_threshold_pct: 20 },
    ],
  },
  {
    make: 'mack',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 310000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 260000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 380000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 340000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 220000, warning_threshold_pct: 20 },
    ],
  },
  {
    make: 'international',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 260000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 230000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 350000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 300000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 180000, warning_threshold_pct: 20 },
    ],
  },
  {
    make: 'western star',
    model: 'all',
    parts: [
      { part_name: 'Brake Pads', lifespan_miles: 290000, warning_threshold_pct: 20 },
      { part_name: 'DPF System', lifespan_miles: 250000, warning_threshold_pct: 20 },
      { part_name: 'Turbocharger', lifespan_miles: 400000, warning_threshold_pct: 20 },
      { part_name: 'Clutch', lifespan_miles: 350000, warning_threshold_pct: 20 },
      { part_name: 'Alternator', lifespan_miles: 200000, warning_threshold_pct: 20 },
    ],
  },
];

// Default profile for unknown makes
const DEFAULT_PROFILE: WearPartProfile[] = [
  { part_name: 'Brake Pads', lifespan_miles: 250000, warning_threshold_pct: 20 },
  { part_name: 'DPF System', lifespan_miles: 200000, warning_threshold_pct: 20 },
  { part_name: 'Turbocharger', lifespan_miles: 350000, warning_threshold_pct: 20 },
  { part_name: 'Clutch', lifespan_miles: 300000, warning_threshold_pct: 20 },
  { part_name: 'Alternator', lifespan_miles: 175000, warning_threshold_pct: 20 },
];

export function getWearPartsForTruck(make?: string | null, model?: string | null): WearPartProfile[] {
  if (!make) return DEFAULT_PROFILE;
  const normalized = make.trim().toLowerCase();
  
  // Try model-specific match first
  if (model) {
    const modelMatch = TRUCK_MAINTENANCE_PROFILES.find(
      p => p.make === normalized && p.model.toLowerCase() === model.trim().toLowerCase()
    );
    if (modelMatch) return modelMatch.parts;
  }
  
  // Fall back to make-level "all" match
  const makeMatch = TRUCK_MAINTENANCE_PROFILES.find(
    p => p.make === normalized && p.model === 'all'
  );
  return makeMatch?.parts || DEFAULT_PROFILE;
}

export interface WearPartHealth {
  part_name: string;
  lifespan_miles: number;
  miles_used: number;
  health_pct: number; // 0–100
  is_urgent: boolean;
}

export function calculateWearPartHealth(
  make: string | null | undefined,
  model: string | null | undefined,
  currentOdometer: number,
  purchaseMileage: number
): WearPartHealth[] {
  const parts = getWearPartsForTruck(make, model);
  const milesDriven = Math.max(0, currentOdometer - purchaseMileage);
  
  return parts.map(part => {
    const healthPct = Math.max(0, Math.min(100, ((part.lifespan_miles - milesDriven) / part.lifespan_miles) * 100));
    return {
      part_name: part.part_name,
      lifespan_miles: part.lifespan_miles,
      miles_used: milesDriven,
      health_pct: parseFloat(healthPct.toFixed(1)),
      is_urgent: healthPct < part.warning_threshold_pct,
    };
  });
}
