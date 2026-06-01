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
  id: 'driver_v2',
  steps: [
    {
      id: 'welcome',
      targetSelector: 'body',
      title: 'Welcome to FleetFlow!',
      description: "You're all set! This dashboard is your central hub for everything you need on the road. Let's take a quick tour of how to use it.",
    },
    {
      id: 'active-load',
      targetSelector: '#tour-active-load',
      title: 'Your Current Dispatch',
      description: 'Here is your active load. You can view pickup/delivery times, routing details, and update your status (like Arrived or Loaded) right from this card.',
    },
    {
      id: 'document-scan',
      targetSelector: '#tour-document-scan',
      title: 'Instant Document Upload',
      description: "No more waiting to turn in paperwork. Use this to instantly scan and upload BOLs, weight tickets, or lumper receipts using your phone's camera. Getting paperwork in faster means getting paid faster!",
    },
    {
      id: 'safety-bonus',
      targetSelector: '#tour-safety-bonus',
      title: 'Track Your Bonus',
      description: 'Drive safe, earn more. This widget tracks your safe miles in real-time for the current 4-week period. Watch your bonus grow as you complete loads without incidents.',
    },
    {
      id: 'pay-widget',
      targetSelector: '#tour-pay-widget',
      title: 'Your Earnings',
      description: 'Transparency is key. Track your current weekly settlements, year-to-date earnings, and view detailed pay stubs directly from this panel.',
    },
    {
      id: 'driver-requests',
      targetSelector: '#tour-driver-requests',
      title: 'Support & Requests',
      description: 'Need a cash advance, home time, or truck maintenance? Submit requests directly to dispatch from here. No need to wait on hold.',
    },
    {
      id: 'notifications',
      targetSelector: '#tour-notifications',
      title: 'Alerts & Messages',
      description: 'Important updates from dispatch, weather alerts, or routing changes will appear here. Keep an eye out for unread badges!',
    },
  ],
};


// Map route prefixes to tour definitions
const TOUR_MAP: Record<string, TourDefinition> = {
  '/dispatcher-dashboard': dispatcherTour,
  '/executive-dashboard': bcoTour,
  '/driver-dashboard': driverTour,
};

export function getTourForRoute(pathname: string): TourDefinition | null {
  const segment = '/' + pathname.split('/')[1];
  return TOUR_MAP[segment] || null;
}
