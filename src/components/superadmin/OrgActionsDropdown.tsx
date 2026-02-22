import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MoreHorizontal, Eye, CalendarIcon, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrgActionsDropdownProps {
  org: any;
}

export function OrgActionsDropdown({ org }: OrgActionsDropdownProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialDate, setTrialDate] = useState<Date | undefined>(
    org.trial_ends_at ? new Date(org.trial_ends_at) : undefined
  );
  const [trialActive, setTrialActive] = useState(!!org.trial_ends_at);

  const updateTrial = useMutation({
    mutationFn: async () => {
      const newTrialEndsAt = trialActive ? (trialDate?.toISOString() ?? null) : null;
      const { error } = await supabase.rpc('super_admin_update_org' as any, {
        target_org_id: org.id,
        new_trial_ends_at: newTrialEndsAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-dashboard'] });
      toast.success('Trial status updated');
      setTrialOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update trial'),
  });

  const resetPassword = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('super_admin_get_owner_email' as any, {
        target_org_id: org.id,
      });
      if (error) throw error;
      if (!data) throw new Error('No owner email found for this org');
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(data as string);
      if (resetError) throw resetError;
      return data;
    },
  });

  const handleSimulate = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem('simulatedOrgId', org.id);
    localStorage.setItem('simulatedOrgName', org.name);
    localStorage.setItem('simulatedOrgTier', org.subscription_tier);
    window.dispatchEvent(new Event('simulatedOrgChanged'));
    navigate('/executive-dashboard');
  };

  const handlePasswordReset = () => {
    toast.promise(resetPassword.mutateAsync(), {
      loading: 'Sending password reset…',
      success: (email) => `Reset email sent to ${email}`,
      error: (err) => err.message || 'Failed to send reset',
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={handleSimulate}>
            <Eye className="h-4 w-4 mr-2" /> Simulate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTrialOpen(true)}>
            <CalendarIcon className="h-4 w-4 mr-2" /> Manage Trial
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handlePasswordReset}>
            <KeyRound className="h-4 w-4 mr-2" /> Force Password Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={trialOpen} onOpenChange={setTrialOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Manage Trial — {org.name}</DialogTitle>
            <DialogDescription>Toggle trial status and set end date.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Trial Active</span>
              <Switch checked={trialActive} onCheckedChange={setTrialActive} />
            </div>
            {trialActive && (
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Trial End Date</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !trialDate && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {trialDate ? format(trialDate, 'PPP') : 'Pick a date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={trialDate}
                      onSelect={setTrialDate}
                      initialFocus
                      className={cn('p-3 pointer-events-auto')}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <Button className="w-full" disabled={updateTrial.isPending} onClick={() => updateTrial.mutate()}>
              {updateTrial.isPending ? 'Saving…' : 'Save Trial Settings'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
