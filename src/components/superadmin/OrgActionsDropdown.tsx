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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MoreHorizontal, Eye, CalendarIcon, KeyRound, Gift } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface OrgActionsDropdownProps {
  org: any;
}

export function OrgActionsDropdown({ org }: OrgActionsDropdownProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [planOpen, setPlanOpen] = useState(false);
  
  // Trial state
  const [trialDate, setTrialDate] = useState<Date | undefined>(
    org.trial_ends_at ? new Date(org.trial_ends_at) : undefined
  );
  const [trialActive, setTrialActive] = useState(!!org.trial_ends_at);

  // Complimentary state
  const [compActive, setCompActive] = useState(!!org.is_complimentary);
  const [compDuration, setCompDuration] = useState<'permanent' | 'until_date'>(
    org.is_complimentary && org.complimentary_ends_at ? 'until_date' : 'permanent'
  );
  const [compDate, setCompDate] = useState<Date | undefined>(
    org.complimentary_ends_at ? new Date(org.complimentary_ends_at) : undefined
  );

  const updatePlan = useMutation({
    mutationFn: async () => {
      const newTrialEndsAt = trialActive ? (trialDate?.toISOString() ?? null) : null;
      const newIsComplimentary = compActive;
      const newCompEndsAt = compActive && compDuration === 'until_date' ? (compDate?.toISOString() ?? null) : null;

      const { error } = await supabase.rpc('super_admin_update_org' as any, {
        target_org_id: org.id,
        new_trial_ends_at: newTrialEndsAt,
        new_is_complimentary: newIsComplimentary,
        new_complimentary_ends_at: newCompEndsAt,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['super-admin-dashboard'] });
      toast.success('Plan access updated');
      setPlanOpen(false);
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update plan access'),
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
            <Eye className="h-4 w-4 mr-2" /> Impersonate Org
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPlanOpen(true)}>
            <Gift className="h-4 w-4 mr-2" /> Manage Plan Access
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handlePasswordReset}>
            <KeyRound className="h-4 w-4 mr-2" /> Force Password Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Manage Plan Access — {org.name}</DialogTitle>
            <DialogDescription>Grant complimentary access or manage trial status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Complimentary Access */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Complimentary Access</span>
                <Switch checked={compActive} onCheckedChange={setCompActive} />
              </div>
              {compActive && (
                <div className="space-y-3 pl-1">
                  <RadioGroup value={compDuration} onValueChange={(v) => setCompDuration(v as any)}>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="permanent" id="comp-perm" />
                      <Label htmlFor="comp-perm" className="text-sm">Permanent</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="until_date" id="comp-date" />
                      <Label htmlFor="comp-date" className="text-sm">Until specific date</Label>
                    </div>
                  </RadioGroup>
                  {compDuration === 'until_date' && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !compDate && 'text-muted-foreground')}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {compDate ? format(compDate, 'PPP') : 'Pick a date'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={compDate}
                          onSelect={setCompDate}
                          initialFocus
                          className={cn('p-3 pointer-events-auto')}
                        />
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Trial Controls */}
            <div className="space-y-3">
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
            </div>

            <Button className="w-full" disabled={updatePlan.isPending} onClick={() => updatePlan.mutate()}>
              {updatePlan.isPending ? 'Saving…' : 'Save Plan Settings'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
