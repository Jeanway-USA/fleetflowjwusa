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
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(amount);
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
        <CardContent>
          {topDriver ? (
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14 border-2 border-primary/20">
                <AvatarImage src={topDriver.avatarUrl} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {topDriver.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-2">
                <h4 className="font-semibold">{topDriver.name}</h4>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>{formatCurrency(topDriver.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{formatNumber(topDriver.miles)} mi</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Package className="h-3 w-3" />
                    <span>{topDriver.loads} loads</span>
                  </div>
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
        <CardContent>
          {topTruck ? (
            <div className="flex items-start gap-4">
              <div className="h-14 w-14 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-7 w-7 text-primary" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">Unit #{topTruck.unitNumber}</h4>
                  <Badge
                    variant={topTruck.status === 'active' ? 'default' : 'secondary'}
                    className={topTruck.status === 'active' ? 'bg-green-500/10 text-green-500 border-green-500/20' : ''}
                  >
                    {topTruck.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>{formatCurrency(topTruck.revenue)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <MapPin className="h-3 w-3" />
                    <span>{formatNumber(topTruck.miles)} mi</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Package className="h-3 w-3" />
                    <span>{topTruck.loads} loads</span>
                  </div>
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
