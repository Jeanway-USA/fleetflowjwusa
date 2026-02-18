import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth, type SubscriptionTier } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sparkles, ArrowRight, X } from 'lucide-react';

const TIERS: { label: string; value: SubscriptionTier }[] = [
  { label: 'Solo BCO', value: 'solo_bco' },
  { label: 'Fleet Owner', value: 'fleet_owner' },
  { label: 'Agency', value: 'agency' },
];

export function DemoControls() {
  const { isDemoMode, orgId, subscriptionTier, refreshOrgData, signOut } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (!isDemoMode) return null;

  const handleTierSwitch = async (tier: SubscriptionTier) => {
    if (tier === subscriptionTier || !orgId) return;
    setSwitching(true);
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ subscription_tier: tier })
        .eq('id', orgId);
      if (error) throw error;
      await refreshOrgData();
      toast.success(`Switched to ${TIERS.find(t => t.value === tier)?.label} view`);
    } catch {
      toast.error('Failed to switch tier');
    } finally {
      setSwitching(false);
    }
  };

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
      >
        <Sparkles className="h-5 w-5" />
      </button>
    );
  }

  return (
    <Card className="fixed bottom-6 right-6 z-50 w-72 shadow-xl border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            Demo Controls
          </h4>
          <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5">
          {TIERS.map(t => (
            <Button
              key={t.value}
              size="sm"
              variant={subscriptionTier === t.value ? 'default' : 'outline'}
              className="flex-1 text-xs h-8"
              disabled={switching}
              onClick={() => handleTierSwitch(t.value)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="pt-1 border-t border-border space-y-2">
          <p className="text-xs text-muted-foreground text-center">Like what you see?</p>
          <Button
            size="sm"
            className="w-full gradient-gold text-primary-foreground text-xs h-8"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Start Your Beta Account
            <ArrowRight className="h-3.5 w-3.5 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
