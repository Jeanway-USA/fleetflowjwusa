import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';

export const ONBOARDING_PREF_KEYS = {
  driver: 'require_onboarding_driver',
  dispatcher: 'require_onboarding_dispatcher',
} as const;

export const ONBOARDING_PREF_DEFAULTS = {
  driver: true,
  dispatcher: false,
};

export function useOnboardingDefaults() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['onboarding-defaults', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('setting_key, setting_value')
        .eq('org_id', orgId!)
        .in('setting_key', [ONBOARDING_PREF_KEYS.driver, ONBOARDING_PREF_KEYS.dispatcher]);
      if (error) throw error;
      const map = new Map(data.map(r => [r.setting_key, r.setting_value]));
      return {
        driver: map.has(ONBOARDING_PREF_KEYS.driver)
          ? map.get(ONBOARDING_PREF_KEYS.driver) === 'true'
          : ONBOARDING_PREF_DEFAULTS.driver,
        dispatcher: map.has(ONBOARDING_PREF_KEYS.dispatcher)
          ? map.get(ONBOARDING_PREF_KEYS.dispatcher) === 'true'
          : ONBOARDING_PREF_DEFAULTS.dispatcher,
      };
    },
  });
}

export function OnboardingPreferencesCard() {
  const { orgId, isDemoMode } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useOnboardingDefaults();

  const values = useMemo(() => data ?? ONBOARDING_PREF_DEFAULTS, [data]);

  const mutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: boolean }) => {
      if (!orgId) throw new Error('Missing organization');
      const { error } = await supabase
        .from('company_settings')
        .upsert(
          { org_id: orgId, setting_key: key, setting_value: value ? 'true' : 'false' },
          { onConflict: 'org_id,setting_key' }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-defaults', orgId] });
      toast.success('Preference updated');
    },
    onError: (err: any) => toast.error(err.message || 'Failed to update preference'),
  });

  const disabled = isDemoMode || mutation.isPending || isLoading || !orgId;

  return (
    <Card className="card-elevated">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          Global Invite Preferences
        </CardTitle>
        <CardDescription>
          Set default onboarding requirements for new invitations. These defaults pre-fill the Invite User
          modal based on the role being invited and can be overridden per invite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="require-onboarding-driver" className="font-medium">
              Require onboarding for new Drivers by default
            </Label>
            <p className="text-sm text-muted-foreground">
              New driver invites will be marked as requiring onboarding before activation.
            </p>
          </div>
          <Switch
            id="require-onboarding-driver"
            checked={values.driver}
            disabled={disabled}
            onCheckedChange={(checked) =>
              mutation.mutate({ key: ONBOARDING_PREF_KEYS.driver, value: checked })
            }
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-1">
            <Label htmlFor="require-onboarding-dispatcher" className="font-medium">
              Require onboarding for new Dispatchers by default
            </Label>
            <p className="text-sm text-muted-foreground">
              New dispatcher invites will be marked as requiring onboarding before activation.
            </p>
          </div>
          <Switch
            id="require-onboarding-dispatcher"
            checked={values.dispatcher}
            disabled={disabled}
            onCheckedChange={(checked) =>
              mutation.mutate({ key: ONBOARDING_PREF_KEYS.dispatcher, value: checked })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
