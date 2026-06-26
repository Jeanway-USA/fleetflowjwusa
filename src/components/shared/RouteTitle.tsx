import { useLocation, useMatch } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const BRAND = 'FleetFlow TMS';

const ROUTE_TITLES: Record<string, string> = {
  '/': BRAND,
  '/executive-dashboard': 'Executive Dashboard',
  '/dispatcher-dashboard': 'Dispatcher Dashboard',
  '/driver-dashboard': 'Driver Dashboard',
  '/driver/loads': 'My Loads',
  '/driver/onboarding': 'Driver Onboarding',
  '/driver-performance': 'Driver Performance',
  '/driver-settings': 'Driver Settings',
  '/driver-stats': 'Driver Stats',
  '/trucks': 'Trucks',
  '/trailers': 'Trailers',
  '/drivers': 'Drivers',
  '/fleet-loads': 'Fleet Loads',
  '/agency-loads': 'Agency Loads',
  '/finance': 'Finance',
  '/ledger': 'Ledger',
  '/insights': 'Company Insights',
  '/ifta': 'IFTA',
  '/crm': 'CRM',
  '/resources': 'Resources',
  '/maintenance': 'Maintenance',
  '/maintenance-home': 'Maintenance',
  '/documents': 'Documents',
  '/safety': 'Safety',
  '/incidents': 'Incidents',
  '/settings': 'Settings',
  '/admin/document-templates': 'Document Templates',
  '/super-admin': 'Super Admin',
  '/pending-access': 'Pending Access',
  '/onboarding': 'Onboarding',
  '/account-deactivated': 'Account Deactivated',
  '/checkout-success': 'Checkout Complete',
};

export function RouteTitle() {
  const { pathname } = useLocation();
  const driverViewMatch = useMatch('/driver-view/:driverId');
  const settlementPrintMatch = useMatch('/settlements/:id/print');

  // Skip routes that own their own <Helmet> to avoid a flash of the wrong title.
  // (Helmet dedupes, but explicit skip keeps the static index.html title for first paint.)
  const SELF_TITLED = new Set([
    '/auth',
    '/reset-password',
    '/auth/accept-invite',
    '/landing',
    '/pricing',
    '/track',
    '/about',
    '/contact',
    '/privacy',
    '/terms',
  ]);
  if (SELF_TITLED.has(pathname)) return null;

  let label = ROUTE_TITLES[pathname];
  if (!label && driverViewMatch) label = 'Driver View';
  if (!label && settlementPrintMatch) label = 'Settlement';

  const title = label ? `${label} — ${BRAND}` : `${BRAND} — Fleet Management for Owner-Operators`;

  return (
    <Helmet>
      <title>{title}</title>
    </Helmet>
  );
}
