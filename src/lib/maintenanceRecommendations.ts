export interface RecommendationPreset {
  id: string;
  title: string;
  category: 'tire' | 'shop' | 'mobile' | 'tow' | 'hold' | 'clear' | 'other';
  template: string;
}

export const RECOMMENDATION_PRESETS: RecommendationPreset[] = [
  {
    id: 'roadside_tire',
    title: 'Roadside Tire Repair',
    category: 'tire',
    template:
      'Call dispatch-approved roadside tire service. Stay with the truck and share live location.',
  },
  {
    id: 'ta_petro',
    title: 'Nearest TA / Petro Truck Service',
    category: 'shop',
    template:
      'Route to the nearest TA / Petro shop and check in at the service desk. Reference the work order on arrival.',
  },
  {
    id: 'loves',
    title: "Love's Truck Care",
    category: 'shop',
    template: "Stop at the nearest Love's Truck Care for diagnosis. Ask for the truck service bay.",
  },
  {
    id: 'pilot',
    title: 'Pilot Flying J Service',
    category: 'shop',
    template: 'Head to the nearest Pilot Flying J truck service bay for an inspection.',
  },
  {
    id: 'mobile_mech',
    title: 'Mobile Diesel Mechanic',
    category: 'mobile',
    template:
      'A mobile mechanic has been requested. Hold position in a safe spot and share live location until they arrive.',
  },
  {
    id: 'tow',
    title: 'Tow to Nearest Shop',
    category: 'tow',
    template: 'Do not drive the truck. Tow has been dispatched — stay with the unit until it arrives.',
  },
  {
    id: 'park_safe',
    title: 'Park Safely & Wait',
    category: 'hold',
    template:
      'Park in a safe location, set out triangles, and await further instructions. Do not continue until cleared.',
  },
  {
    id: 'continue',
    title: 'Safe to Continue',
    category: 'clear',
    template:
      'Issue is non-critical. Continue carefully to the planned stop and monitor for changes.',
  },
];
