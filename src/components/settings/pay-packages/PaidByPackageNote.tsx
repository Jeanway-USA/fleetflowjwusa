import { todayLocal } from '@/lib/datetime';
import { Wallet } from 'lucide-react';
import { useDriverAssignments, usePayPackages } from '@/hooks/usePayPackages';
import { assignmentOn } from '@/lib/pay-packages/resolve';
import { formatDate } from '@/lib/formatters';

/**
 * Shown on a driver's Pay tab when a pay package decides their pay, so nobody mistakes the older pay type and
 * rate fields below for what is actually used at settlement time. Renders nothing for drivers without a package.
 */
export function PaidByPackageNote({ driverId }: { driverId: string | null | undefined }) {
  const { data: assignments = [] } = useDriverAssignments(driverId ?? null);
  const { data: packages = [] } = usePayPackages();
  const current = assignmentOn(assignments, todayLocal());
  if (!current) return null;
  const name = packages.find((p) => p.id === current.package_id)?.name ?? 'a pay package';

  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <p>
        <strong>Paid by the {name} pay package</strong> since {formatDate(current.effective_start)}. Settlements use the
        package, so the pay type and rate below are not used for this driver. Change the package from their profile.
      </p>
    </div>
  );
}
