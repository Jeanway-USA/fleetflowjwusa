import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, CheckCircle2, AlertTriangle, ArrowUpRight } from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import type { SubscriptionTier } from '@/contexts/AuthContext';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  solo_bco: 'Solo BCO',
  fleet_owner: 'Fleet Owner',
  agency: 'Agency',
  all_in_one: 'All-in-One',
};

const TIER_DESCRIPTIONS: Record<SubscriptionTier, string> = {
  solo_bco: 'Essential tools for independent owner-operators.',
  fleet_owner: 'Full fleet management with dispatch, payroll, and analytics.',
  agency: 'Agency load management and commission tracking.',
  all_in_one: 'Complete access to every feature in the platform.',
};

export function BillingTab() {
  const { orgId, subscriptionTier } = useAuth();
  const navigate = useNavigate();

  const { data: org } = useQuery({
    queryKey: ['org-billing', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('name, subscription_tier, trial_ends_at, is_active, created_at')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const trialEndsAt = org?.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const trialExpired = trialEndsAt ? isPast(trialEndsAt) : false;
  const daysRemaining = trialEndsAt ? Math.max(0, differenceInDays(trialEndsAt, new Date())) : 0;

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Current Plan
          </CardTitle>
          <CardDescription>Your subscription details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-2xl font-bold">{TIER_LABELS[subscriptionTier]}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {TIER_DESCRIPTIONS[subscriptionTier]}
              </p>
            </div>
            <Badge variant={org?.is_active ? 'default' : 'destructive'} className="shrink-0">
              {org?.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>

          <Button
            variant="outline"
            onClick={() => navigate('/pricing')}
            className="gap-2"
          >
            <ArrowUpRight className="h-4 w-4" />
            View Plans & Upgrade
          </Button>
        </CardContent>
      </Card>

      {/* Trial Status */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Trial Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {trialEndsAt ? (
            <div className="flex items-center gap-3">
              {trialExpired ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="font-medium text-destructive">Trial Expired</p>
                    <p className="text-sm text-muted-foreground">
                      Your trial ended on {format(trialEndsAt, 'MMM d, yyyy')}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  <div>
                    <p className="font-medium">Trial Active</p>
                    <p className="text-sm text-muted-foreground">
                      {daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining · Ends{' '}
                      {format(trialEndsAt, 'MMM d, yyyy')}
                    </p>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No trial information available.</p>
          )}
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Account Created</dt>
              <dd className="text-sm font-medium">
                {org?.created_at ? format(new Date(org.created_at), 'MMM d, yyyy') : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Subscription Tier</dt>
              <dd className="text-sm font-medium">{TIER_LABELS[subscriptionTier]}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-muted-foreground">Status</dt>
              <dd className="text-sm font-medium">{org?.is_active ? 'Active' : 'Inactive'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
