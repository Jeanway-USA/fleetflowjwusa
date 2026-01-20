import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Trophy, Truck, MapPin, Package, DollarSign } from 'lucide-react';

interface TopDriver {
  id: string;
  name: string;
  avatarUrl?: string;
  revenue: number;
  miles: number;
  loads: number;
}

interface TopTruck {
  id: string;
  unitNumber: string;
  revenue: number;
  miles: number;
  loads: number;
  status: string;
}

interface TopPerformerCardsProps {
  topDriver: TopDriver | undefined;
  topTruck: TopTruck | undefined;
  isLoading: boolean;
}

function formatCurrency(amount: number) {
  if (amount >= 10000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatMiles(num: number) {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}

function formatNumber(num: number) {
  return new Intl.NumberFormat('en-US').format(Math.round(num));
}

export function TopPerformerCards({ topDriver, topTruck, isLoading }: TopPerformerCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Top Driver Card */}
      <Card className="border-border hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              Top Driver
            </CardTitle>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              #1
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {topDriver ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12 border-2 border-primary/20">
                  <AvatarImage src={topDriver.avatarUrl} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {topDriver.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </AvatarFallback>
                </Avatar>
                <h4 className="font-semibold text-lg">{topDriver.name}</h4>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                  <DollarSign className="h-4 w-4 text-primary mb-1" />
                  <span className="text-sm font-medium">{formatCurrency(topDriver.revenue)}</span>
                  <span className="text-xs text-muted-foreground">Revenue</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                  <MapPin className="h-4 w-4 text-primary mb-1" />
                  <span className="text-sm font-medium">{formatMiles(topDriver.miles)}</span>
                  <span className="text-xs text-muted-foreground">Miles</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                  <Package className="h-4 w-4 text-primary mb-1" />
                  <span className="text-sm font-medium">{topDriver.loads}</span>
                  <span className="text-xs text-muted-foreground">Loads</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No driver data available</p>
          )}
        </CardContent>
      </Card>

      {/* Top Truck Card */}
      <Card className="border-border hover:border-primary/30 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Top Truck
            </CardTitle>
            <Badge variant="secondary" className="bg-primary/10 text-primary">
              #1
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {topTruck ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-lg">Unit #{topTruck.unitNumber}</h4>
                  <Badge
                    variant={topTruck.status === 'active' ? 'default' : 'secondary'}
                    className={topTruck.status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}
                  >
                    {topTruck.status}
                  </Badge>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                  <DollarSign className="h-4 w-4 text-primary mb-1" />
                  <span className="text-sm font-medium">{formatCurrency(topTruck.revenue)}</span>
                  <span className="text-xs text-muted-foreground">Revenue</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                  <MapPin className="h-4 w-4 text-primary mb-1" />
                  <span className="text-sm font-medium">{formatMiles(topTruck.miles)}</span>
                  <span className="text-xs text-muted-foreground">Miles</span>
                </div>
                <div className="flex flex-col items-center p-2 rounded-lg bg-muted/50">
                  <Package className="h-4 w-4 text-primary mb-1" />
                  <span className="text-sm font-medium">{topTruck.loads}</span>
                  <span className="text-xs text-muted-foreground">Loads</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No truck data available</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
