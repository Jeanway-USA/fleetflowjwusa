import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { UserCheck } from 'lucide-react';
import { toast } from 'sonner';

/** Roles that can be invited and onboarded. Owners are not listed: an owner sets themself up. */
export const ONBOARDING_ROLES = [
  { role: 'driver', label: 'Drivers', where: 'Driver profile, credentials and forms' },
  { role: 'dispatcher', label: 'Dispatchers', where: 'Staff onboarding: details, tax forms and your staff documents' },
  { role: 'safety', label: 'Safety managers', where: 'Staff onboarding' },
  { role: 'payroll_admin', label: 'Payroll admins', where: 'Staff onboarding' },
  { role: 'maintenance', label: 'Maintenance staff', where: 'Staff onboarding' },
] as const;

export type OnboardingRole = (typeof ONBOARDING_ROLES)[number]['role'];

const keyFor = (role: OnboardingRole) => `require_onboarding_${role}`;

/** Until someone changes it, every role is asked to onboard. */
export const ONBOARDING_PREF_DEFAULTS: Record<OnboardingRole, boolean> = {
  driver: true,
  dispatcher: true,
  safety: true,
  payroll_admin: true,
  maintenance: true,
};

export function useOnboardingDefaults() {
  const { orgId } = useAuth();
  return useQuery({
    queryKey: ['onboarding-defaults', orgId],
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<OnboardingRole, boolean>> => {
      const { data, error } = await supabase
        .from('company_settings')
        .select('setting_key, setting_value')
        .eq('org_id', orgId!)
        .in('setting_key', ONBOARDING_ROLES.map((r) => keyFor(r.role)));
      if (error) throw error;
      const stored = new Map(data.map((r) => [r.setting_key, r.setting_value]));
      const out = { ...ONBOARDING_PREF_DEFAULTS };
      for (const { role } of ONBOARDING_ROLES) {
        const v = stored.get(keyFor(role));
        if (v !== undefined) out[role] = v === 'true';
      }
      return out;
    },
  });
}

export function OnboardingPreferencesCard() {
  const { orgId } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useOnboardingDefaults();

  const values = useMemo(() => data ?? ONBOARDING_PREF_DEFAULTS, [data]);

  const mutation = useMutation({
    mutationFn: async ({ role, value }: { role: OnboardingRole; value: boolean }) => {
      if (!orgId) throw new Error('Missing organization');
      const { error } = await supabase
        .from('company_settings')
        .upsert(
          { org_id: orgId, setting_key: keyFor(role), setting_value: value ? 'true' : 'false' },
          { onConflict: 'org_id,setting_key' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-defaults', orgId] });
      toast.success('Saved');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update preference'),
  });

  const disabled = mutation.isPending || isLoading || !orgId;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="h-5 w-5 text-primary" />
          Who must onboard
        </CardTitle>
        <CardDescription>
          The starting choice when you invite someone in each role. You can change it for any single invitation, and a position can suggest its own.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border border-t border-border">
          {ONBOARDING_ROLES.map(({ role, label, where }) => (
            <li key={role} className="flex min-h-14 items-center justify-between gap-4 px-6 py-3">
              <div className="min-w-0">
                <Label htmlFor={`require-onboarding-${role}`} className="font-medium">{label}</Label>
                <p className="text-sm text-muted-foreground">{where}</p>
              </div>
              <Switch
                id={`require-onboarding-${role}`}
                checked={values[role]}
                disabled={disabled}
                onCheckedChange={(checked) => mutation.mutate({ role, value: checked })}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
