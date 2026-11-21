import { useSubscriptionTier } from '@/hooks/useSubscriptionTier';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lock } from 'lucide-react';

interface TierGateProps {
  requiredFeature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function TierGate({ requiredFeature, children, fallback }: TierGateProps) {
  const { hasFeature, loading } = useSubscriptionTier();

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
          <CardTitle>Not available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            This area isn't available for your account. Ask the owner if you need access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
