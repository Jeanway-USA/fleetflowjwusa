export interface TourStep {
  id: string;
  targetSelector: string;
  title: string;
  description: string;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export interface TourDefinition {
  id: string;
  steps: TourStep[];
}

const dispatcherTour: TourDefinition = {
  id: 'dispatcher_v1',
  steps: [
    {
      id: 'sidebar',
      targetSelector: '[data-tour="sidebar-nav"]',
      title: 'Navigation',
      description: 'Use the sidebar to switch between dashboards, fleet management, loads, finance, and more.',
    },
    {
      id: 'active-loads',
      targetSelector: '[data-tour="active-loads"]',
      title: 'Active Loads Board',
      description: 'Track all your in-progress loads at a glance. Click any load for full details and status updates.',
    },
    {
      id: 'driver-status',
      targetSelector: '[data-tour="driver-status"]',
      title: 'Driver Status',
      description: 'See which drivers are available, en route, or off-duty. Assign loads directly from here.',
    },
    {
      id: 'fleet-map',
      targetSelector: '[data-tour="fleet-map"]',
      title: 'Fleet Map',
      description: 'Real-time map showing truck locations, active routes, and geofence alerts.',
    },
  ],
};

const bcoTour: TourDefinition = {
  id: 'bco_toolkit_v1',
  steps: [
    {
      id: 'dashboard-metrics',
      targetSelector: '[data-tour="revenue-kpi"]',
      title: 'Your Command Center',
      description: 'Get an instant read on your target Rate Per Mile (RPM), weekly revenue, and fleet health.',
    },
    {
      id: 'loads-dispatch',
      targetSelector: '[data-tour="nav-fleet-loads"]',
      title: 'Manage Your Freight',
      description: 'Track your active Landstar loads, monitor deadhead, and calculate expected revenue in real-time.',
    },
    {
      id: 'finance-statements',
      targetSelector: '[data-tour="nav-finance"]',
      title: 'Automated Accounting',
      description: 'Upload your weekly statements here. We will automatically parse your deductions, fuel costs, and settlements.',
    },
    {
      id: 'beta-feedback',
      targetSelector: '[data-tour="beta-feedback"]',
      title: 'Shape the Platform',
      description: 'Your input drives our updates. Click here anytime to report a bug or request a new feature for your operation.',
    },
  ],
};

const driverTour: TourDefinition = {
  id: 'driver_v1',
  steps: [
    {
      id: 'active-load',
      targetSelector: '[data-tour="active-load"]',
      title: 'Your Active Load',
      description: 'View your current assignment — pickup/delivery details, route info, and status controls.',
    },
    {
      id: 'dvir-buttons',
      targetSelector: '[data-tour="dvir-buttons"]',
      title: 'DVIR Inspections',
      description: 'Complete your pre-trip and post-trip inspections here. Stay compliant with one tap.',
    },
    {
      id: 'driver-pay',
      targetSelector: '[data-tour="driver-pay"]',
      title: 'Pay & Earnings',
      description: 'Track your weekly earnings, bonuses, and settlement details in real time.',
    },
  ],
};

// Map route prefixes to tour definitions
const TOUR_MAP: Record<string, TourDefinition> = {
  '/dispatcher-dashboard': dispatcherTour,
  '/executive-dashboard': executiveTour,
  '/driver-dashboard': driverTour,
};

export function getTourForRoute(pathname: string): TourDefinition | null {
  const segment = '/' + pathname.split('/')[1];
  return TOUR_MAP[segment] || null;
}
