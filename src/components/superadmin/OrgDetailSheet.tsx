import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Building2, Calendar, Users, Palette, CheckCircle, XCircle, Truck, FileText, Banknote, Receipt } from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  solo_bco: 'Solo BCO',
  fleet_owner: 'Fleet Owner',
  agency: 'Agency',
  all_in_one: 'All-in-One',
  open_beta: 'Open Beta',
};

interface OrgDetailSheetProps {
  org: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrgDetailSheet({ org, open, onOpenChange }: OrgDetailSheetProps) {
  const queryClient = useQueryClient();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [selectedTmsMode, setSelectedTmsMode] = useState<string | null>(null);

  const updateOrg = useMutation({
    mutationFn: async ({ newTier, newIsActive, newTrialEndsAt, newTmsMode }: { newTier?: string; newIsActive?: boolean; newTrialEndsAt?: string; newTmsMode?: string }) => {
      const { error } = await supabase.rpc('super_admin_update_org' as any, {
        target_org_id: org.id,
        new_subscription_tier: newTier ?? null,
        new_is_active: newIsActive ?? null,
        new_trial_ends_at: newTrialEndsAt ?? null,
        new_tms_mode: newTmsMode ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-dashboard'] });
      toast.success('Organization updated');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update'),
  });

  if (!org) return null;

  const trialEnd = org.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const isTrialExpired = trialEnd ? trialEnd < new Date() : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden">
        <SheetHeader className="shrink-0 mx-0 mt-0 px-6 pt-6 pb-4 pr-12 border-b static">
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {org.name}
          </SheetTitle>
          <SheetDescription>Organization details & management</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={org.is_active ? 'default' : 'destructive'} className="gap-1">
              {org.is_active ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {org.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          {/* Tier */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Subscription Tier</span>
            <Badge variant="secondary">{TIER_LABELS[org.subscription_tier] || org.subscription_tier}</Badge>
          </div>

          {/* Users */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Users</span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Users className="h-3.5 w-3.5" />
              {org.user_count}
            </span>
          </div>

          {/* Created */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Created</span>
            <span className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-3.5 w-3.5" />
              {format(new Date(org.created_at), 'MMM d, yyyy')}
            </span>
          </div>

          {/* Plan Access */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Plan Access</span>
            {org.is_complimentary ? (
              <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                {org.complimentary_ends_at
                  ? `Complimentary (until ${format(new Date(org.complimentary_ends_at), 'MMM d, yyyy')})`
                  : 'Complimentary (Permanent)'}
              </Badge>
            ) : (
              <Badge variant="secondary">Standard</Badge>
            )}
          </div>

          {/* Trial */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Trial Ends</span>
            <span className={`text-sm ${isTrialExpired ? 'text-destructive' : ''}`}>
              {trialEnd ? format(trialEnd, 'MMM d, yyyy') : '—'}
              {isTrialExpired && ' (expired)'}
            </span>
          </div>

          {/* Branding */}
          {org.primary_color && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Brand Color</span>
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 rounded-full border" style={{ backgroundColor: `hsl(${org.primary_color})` }} />
                <span className="text-xs font-mono text-muted-foreground">{org.primary_color}</span>
              </div>
            </div>
          )}

          <Separator />

          {/* Business Configuration */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Business Configuration
            </h3>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">TMS Mode</span>
              <Badge variant={org.tms_mode === 'independent' ? 'default' : 'secondary'}>
                {org.tms_mode === 'independent' ? 'Independent O/O' : 'Landstar BCO'}
              </Badge>
            </div>
            {org.dot_number && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">DOT Number</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{org.dot_number}</code>
              </div>
            )}
            {org.mc_number && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">MC Number</span>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{org.mc_number}</code>
              </div>
           )}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Factoring Provider</span>
              {org.factoring_enabled ? (
                <Badge variant="default" className="gap-1">
                  <Banknote className="h-3 w-3" />
                  {org.factoring_provider_name || 'Enabled (no name)'}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">Not configured</span>
              )}
            </div>
          </div>

          <Separator />

          {/* Change TMS Mode */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Change TMS Mode</label>
            <div className="flex gap-2">
              <Select value={selectedTmsMode || org.tms_mode || 'landstar'} onValueChange={setSelectedTmsMode}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="landstar">Landstar BCO</SelectItem>
                  <SelectItem value="independent">Independent O/O</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selectedTmsMode || selectedTmsMode === (org.tms_mode || 'landstar') || updateOrg.isPending}
                onClick={() => {
                  if (selectedTmsMode) updateOrg.mutate({ newTmsMode: selectedTmsMode });
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <Separator />

          {/* Change Tier */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Change Tier</label>
            <div className="flex gap-2">
              <Select value={selectedTier || org.subscription_tier} onValueChange={setSelectedTier}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TIER_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={!selectedTier || selectedTier === org.subscription_tier || updateOrg.isPending}
                onClick={() => {
                  if (selectedTier) updateOrg.mutate({ newTier: selectedTier });
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <Separator />

          {/* Deactivate / Reactivate */}
          <Button
            variant={org.is_active ? 'destructive' : 'default'}
            className="w-full"
            disabled={updateOrg.isPending}
            onClick={() => updateOrg.mutate({ newIsActive: !org.is_active })}
          >
            {org.is_active ? 'Deactivate Organization' : 'Reactivate Organization'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
