import { Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/** Shown until the shop database update is applied: the board works, but checklists, parts-to-job and the clock need it. */
export function UpgradeNotice() {
  const { isOwner } = useAuth();
  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3.5 text-sm">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        <p className="font-medium">The shop upgrade is not switched on yet</p>
        <p className="mt-0.5 text-muted-foreground">
          Jobs show up here already. Checklists, logging parts to a job, the time clock, photos and who is on what need one database update.
          {isOwner ? ' Send docs/APPLY_SHOP_FLOOR.sql through Lovable like the earlier updates.' : ' Ask the owner to switch it on.'}
        </p>
      </div>
    </div>
  );
}
