import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { AuditFilters as AuditFiltersT } from '@/hooks/useAuditLogs';

interface Props {
  value: AuditFiltersT;
  onChange: (next: AuditFiltersT) => void;
}

const ROLES = ['owner', 'payroll_admin', 'dispatcher', 'safety', 'maintenance', 'driver'];
const ACTIONS = ['INSERT', 'UPDATE', 'DELETE'];
const RESOURCES = ['fleet_loads', 'driver_settlements', 'settlements', 'drivers', 'trucks', 'trailers'];

export function AuditFilters({ value, onChange }: Props) {
  const update = (patch: Partial<AuditFiltersT>) => onChange({ ...value, ...patch });
  const clear = () => onChange({});
  const hasAny = !!(value.userRole || value.actionType || value.resourceType || value.resourceId || value.from || value.to);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end">
      <div className="space-y-1.5">
        <Label className="text-xs">Role</Label>
        <Select value={value.userRole ?? 'all'} onValueChange={(v) => update({ userRole: v === 'all' ? undefined : v })}>
          <SelectTrigger><SelectValue placeholder="Any role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any role</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Action</Label>
        <Select value={value.actionType ?? 'all'} onValueChange={(v) => update({ actionType: v === 'all' ? undefined : v })}>
          <SelectTrigger><SelectValue placeholder="Any action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any action</SelectItem>
            {ACTIONS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Resource</Label>
        <Select value={value.resourceType ?? 'all'} onValueChange={(v) => update({ resourceType: v === 'all' ? undefined : v })}>
          <SelectTrigger><SelectValue placeholder="Any resource" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any resource</SelectItem>
            {RESOURCES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Record ID</Label>
        <Input
          placeholder="UUID fragment…"
          value={value.resourceId ?? ''}
          onChange={(e) => update({ resourceId: e.target.value || undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">From</Label>
        <Input
          type="datetime-local"
          value={value.from ? value.from.slice(0, 16) : ''}
          onChange={(e) => update({ from: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">To</Label>
        <div className="flex gap-2">
          <Input
            type="datetime-local"
            value={value.to ? value.to.slice(0, 16) : ''}
            onChange={(e) => update({ to: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
          />
          {hasAny && (
            <Button variant="outline" size="icon" onClick={clear} title="Clear filters">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
