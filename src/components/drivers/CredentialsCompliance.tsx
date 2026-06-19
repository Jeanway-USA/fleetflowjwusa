import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ShieldCheck } from 'lucide-react';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';

interface CredentialsComplianceProps {
  driver: {
    license_number?: string | null;
    license_expiry?: string | null;
    medical_card_expiry?: string | null;
    endorsements?: string[] | null;
    has_twic?: boolean | null;
    twic_expiry?: string | null;
    fast_card_passport_expiry?: string | null;
    dod_clearance_level?: string | null;
  };
  variant?: 'card' | 'section';
}

function parseDateSafe(date: string | null | undefined): Date | null {
  if (!date) return null;
  // Append T00:00:00 to prevent timezone shifting on YYYY-MM-DD
  const iso = date.length === 10 ? `${date}T00:00:00` : date;
  try {
    return parseISO(iso);
  } catch {
    return null;
  }
}

function ExpiryBadge({ date }: { date: string | null | undefined }) {
  const parsed = parseDateSafe(date);
  if (!parsed) return null;
  const days = differenceInCalendarDays(parsed, new Date());
  if (days < 0) return <StatusBadge status="expired" />;
  if (days <= 30) return <StatusBadge status="expiring_soon" />;
  return <StatusBadge status="valid" />;
}

function formatDate(date: string | null | undefined) {
  const parsed = parseDateSafe(date);
  return parsed ? format(parsed, 'MM/dd/yyyy') : '—';
}

function Row({
  label,
  value,
  expiry,
}: {
  label: string;
  value: React.ReactNode;
  expiry?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2 text-right">
        <span className="font-medium">{value}</span>
        {expiry !== undefined && <ExpiryBadge date={expiry} />}
      </div>
    </div>
  );
}

export function CredentialsCompliance({ driver, variant = 'card' }: CredentialsComplianceProps) {
  const endorsements = driver.endorsements ?? [];
  const hasTwic = !!driver.has_twic;

  const body = (
    <div className="space-y-3">
      <Row label="License Number" value={driver.license_number || '—'} />
      <Row label="License Expiry" value={formatDate(driver.license_expiry)} expiry={driver.license_expiry} />
      <Row
        label="DOT Medical Expiry"
        value={formatDate(driver.medical_card_expiry)}
        expiry={driver.medical_card_expiry}
      />

      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="text-muted-foreground pt-0.5">Endorsements</span>
        <div className="flex flex-wrap justify-end gap-1 max-w-[70%]">
          {endorsements.length === 0 ? (
            <span className="font-medium">None</span>
          ) : (
            endorsements.map((e) => (
              <Badge key={e} variant="secondary" className="text-xs">
                {e.split(' - ')[0]}
              </Badge>
            ))
          )}
        </div>
      </div>

      <Row label="TWIC Status" value={hasTwic ? 'Yes' : 'No'} />
      {hasTwic && (
        <Row
          label="TWIC Expiry"
          value={formatDate(driver.twic_expiry)}
          expiry={driver.twic_expiry}
        />
      )}
      <Row
        label="FAST Card / Passport Expiry"
        value={formatDate(driver.fast_card_passport_expiry)}
        expiry={driver.fast_card_passport_expiry}
      />
      <Row label="DoD Clearance" value={driver.dod_clearance_level || 'None'} />
    </div>
  );

  if (variant === 'section') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h4 className="font-medium text-sm">Credentials & Compliance</h4>
        </div>
        {body}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Credentials & Compliance
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
