import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { Fragment } from 'react';

const LABELS: Record<string, string> = {
  'executive-dashboard': 'Executive',
  'dispatcher-dashboard': 'Dispatch',
  'driver-dashboard': 'Driver',
  'fleet-loads': 'Fleet Loads',
  'agency-loads': 'Agency Loads',
  loads: 'Loads',
  trucks: 'Trucks',
  trailers: 'Trailers',
  drivers: 'Drivers',
  finance: 'Finance',
  ledger: 'Ledger',
  insights: 'Insights',
  ifta: 'IFTA',
  crm: 'CRM',
  maintenance: 'Maintenance',
  'maintenance-home': 'Maintenance',
  documents: 'Documents',
  safety: 'Safety',
  incidents: 'Incidents',
  settings: 'Settings',
  performance: 'Performance',
  stats: 'Stats',
  onboarding: 'Onboarding',
  admin: 'Admin',
  'super-admin': 'Super Admin',
  driver: 'Driver',
};

const titleCase = (s: string) =>
  LABELS[s] ??
  s
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const HIDE_ON = new Set(['/', '/auth', '/landing', '/pricing', '/contact', '/about']);

export function Breadcrumbs() {
  const { pathname } = useLocation();
  if (HIDE_ON.has(pathname)) return null;

  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3"
    >
      <Link to="/" className="hover:text-foreground transition-colors flex items-center">
        <Home className="h-3.5 w-3.5" />
      </Link>
      {parts.map((part, i) => {
        const href = '/' + parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        return (
          <Fragment key={href}>
            <ChevronRight className="h-3 w-3 shrink-0" />
            {isLast ? (
              <span className="text-foreground font-medium truncate max-w-[200px]">
                {titleCase(part)}
              </span>
            ) : (
              <Link
                to={href}
                className="hover:text-foreground transition-colors truncate max-w-[160px]"
              >
                {titleCase(part)}
              </Link>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
