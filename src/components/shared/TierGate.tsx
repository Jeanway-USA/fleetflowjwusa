import { useSubscriptionTier } from '@/hooks/useSubscriptionTier';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface TierGateProps {
  requiredFeature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function TierGate({ requiredFeature, children, fallback }: TierGateProps) {
  const { hasFeature, tier, loading } = useSubscriptionTier();
  const navigate = useNavigate();

  if (loading) return null;

  if (hasFeature(requiredFeature)) {
    return <>{children}</>;
  }

  if (fallback) return <>{fallback}</>;

  return (
    <div className="flex items-center justify-center min-h-[60vh] p-8">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle>Feature Not Available</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            This feature is not included in your <span className="font-medium capitalize">{tier.replace('_', ' ')}</span> plan.
            Upgrade to access it.
          </p>
          <Button onClick={() => navigate('/pricing')} className="gradient-gold text-primary-foreground">
            View Plans
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
