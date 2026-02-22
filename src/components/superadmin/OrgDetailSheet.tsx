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
import { Building2, Calendar, Users, Palette, CheckCircle, XCircle } from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  solo_bco: 'Solo BCO',
  fleet_owner: 'Fleet Owner',
  agency: 'Agency',
  all_in_one: 'All-in-One',
};

interface OrgDetailSheetProps {
  org: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrgDetailSheet({ org, open, onOpenChange }: OrgDetailSheetProps) {
  const queryClient = useQueryClient();
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const updateOrg = useMutation({
    mutationFn: async ({ newTier, newIsActive }: { newTier?: string; newIsActive?: boolean }) => {
      const { error } = await supabase.rpc('super_admin_update_org' as any, {
        target_org_id: org.id,
        new_tier: newTier ?? null,
        new_is_active: newIsActive ?? null,
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
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {org.name}
          </SheetTitle>
          <SheetDescription>Organization details & management</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
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
