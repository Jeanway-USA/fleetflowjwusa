import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Calendar, CheckCircle2, AlertTriangle, ArrowUpRight, Gift, Settings, Loader2 } from 'lucide-react';
import { format, differenceInDays, isPast } from 'date-fns';
import { toast } from 'sonner';
import type { SubscriptionTier } from '@/contexts/AuthContext';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  open_beta: 'Open Beta',
  solo_bco: 'Solo BCO',
  fleet_owner: 'Fleet Owner',
  agency: 'Agency',
  all_in_one: 'All-in-One',
};

const TIER_DESCRIPTIONS: Record<SubscriptionTier, string> = {
  open_beta: 'Full platform access during the open beta period.',
  solo_bco: 'Essential tools for independent owner-operators.',
  fleet_owner: 'Full fleet management with dispatch, payroll, and analytics.',
  agency: 'Agency load management and commission tracking.',
  all_in_one: 'Complete access to every feature in the platform.',
};

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Active', variant: 'default' },
  trialing: { label: 'Trial', variant: 'secondary' },
  past_due: { label: 'Past Due', variant: 'destructive' },
  canceled: { label: 'Canceled', variant: 'destructive' },
  incomplete: { label: 'Incomplete', variant: 'outline' },
  incomplete_expired: { label: 'Expired', variant: 'destructive' },
  unpaid: { label: 'Unpaid', variant: 'destructive' },
};

export function BillingTab() {
  const { orgId, subscriptionTier } = useAuth();
  const navigate = useNavigate();
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const { data: org } = useQuery({
    queryKey: ['org-billing', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organizations')
        .select('name, subscription_tier, trial_ends_at, is_active, created_at, is_complimentary, complimentary_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, subscription_period_end')
        .eq('id', orgId)
        .single();
      if (error) throw error;
      return data as unknown as {
        name: string;
        subscription_tier: string;
        trial_ends_at: string | null;
        is_active: boolean;
        created_at: string;
        is_complimentary: boolean | null;
        complimentary_ends_at: string | null;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        subscription_status: string | null;
        subscription_period_end: string | null;
      };
    },
    enabled: !!orgId,
  });

  const isComplimentary = !!org?.is_complimentary;
  const compEndsAt = org?.complimentary_ends_at ? new Date(org.complimentary_ends_at) : null;
  const isPermanentComp = isComplimentary && !compEndsAt;

  const trialEndsAt = org?.trial_ends_at ? new Date(org.trial_ends_at) : null;
  const trialExpired = trialEndsAt ? isPast(trialEndsAt) : false;
  const daysRemaining = trialEndsAt ? Math.max(0, differenceInDays(trialEndsAt, new Date())) : 0;

  const subscriptionStatus = org?.subscription_status || 'trialing';
  const subscriptionPeriodEnd = org?.subscription_period_end ? new Date(org.subscription_period_end) : null;
  const hasStripeSubscription = !!org?.stripe_subscription_id;
  const hasStripeCustomer = !!org?.stripe_customer_id;

  const statusBadge = STATUS_BADGES[subscriptionStatus] || STATUS_BADGES.trialing;

  const handleManageBilling = async () => {
    if (!hasStripeCustomer) {
      toast.error('No billing account found. Please subscribe first.');
      return;
    }

    setPortalLoading(true);
    try {
      const response = await supabase.functions.invoke('create-portal-session');

      if (response.error) {
        throw new Error(response.error.message || 'Failed to open billing portal');
      }

      const { url } = response.data;
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No portal URL returned');
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    try {
      // Navigate to pricing page where they can select a new tier
      navigate('/pricing');
    } finally {
      setCheckoutLoading(false);
    }
  };

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
            <Badge variant={statusBadge.variant} className="shrink-0">
              {statusBadge.label}
            </Badge>
          </div>

          {/* Subscription Period End */}
          {hasStripeSubscription && subscriptionPeriodEnd && subscriptionStatus === 'active' && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Next billing date</p>
                <p className="text-sm text-muted-foreground">
                  {format(subscriptionPeriodEnd, 'MMMM d, yyyy')}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {!isPermanentComp && (
              <Button
                variant="outline"
                onClick={handleUpgrade}
                className="gap-2"
                disabled={checkoutLoading}
              >
                {checkoutLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                {hasStripeSubscription ? 'Change Plan' : 'Subscribe Now'}
              </Button>
            )}

            {hasStripeCustomer && (
              <Button
                variant="outline"
                onClick={handleManageBilling}
                className="gap-2"
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Settings className="h-4 w-4" />
                )}
                Manage Billing
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Complimentary / Trial Status */}
      <Card className="card-elevated">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {isComplimentary ? (
              <><Gift className="h-5 w-5 text-primary" /> Complimentary Plan</>
            ) : (
              <><Calendar className="h-5 w-5 text-primary" /> Trial Status</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isComplimentary ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="font-medium">Complimentary Access</p>
                <p className="text-sm text-muted-foreground">
                  {isPermanentComp
                    ? 'You have permanent free access to this plan.'
                    : `Free access until ${format(compEndsAt!, 'MMM d, yyyy')}`}
                </p>
              </div>
            </div>
          ) : hasStripeSubscription && subscriptionStatus === 'trialing' ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="font-medium">Trial Active</p>
                <p className="text-sm text-muted-foreground">
                  {subscriptionPeriodEnd
                    ? `${Math.max(0, differenceInDays(subscriptionPeriodEnd, new Date()))} days remaining · Trial ends ${format(subscriptionPeriodEnd, 'MMM d, yyyy')}`
                    : 'Your trial is active. Add payment details to continue after trial.'}
                </p>
              </div>
            </div>
          ) : hasStripeSubscription && subscriptionStatus === 'active' ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
              <div>
                <p className="font-medium">Active Subscription</p>
                <p className="text-sm text-muted-foreground">
                  Your subscription is active and will renew automatically.
                </p>
              </div>
            </div>
          ) : trialEndsAt ? (
            <div className="flex items-center gap-3">
              {trialExpired ? (
                <>
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                  <div>
                    <p className="font-medium text-destructive">Trial Expired</p>
                    <p className="text-sm text-muted-foreground">
                      Your trial ended on {format(trialEndsAt, 'MMM d, yyyy')}. Subscribe to continue using all features.
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
              <dt className="text-sm text-muted-foreground">Billing Status</dt>
              <dd className="text-sm font-medium capitalize">{subscriptionStatus.replace('_', ' ')}</dd>
            </div>
            {hasStripeSubscription && (
              <div className="flex justify-between">
                <dt className="text-sm text-muted-foreground">Subscription ID</dt>
                <dd className="text-sm font-mono text-muted-foreground">
                  {org?.stripe_subscription_id?.slice(0, 20)}...
                </dd>
              </div>
            )}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
