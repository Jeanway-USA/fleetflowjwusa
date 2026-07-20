import { useOpenMeteoForecast, type DailyForecast } from '@/hooks/useOpenMeteoForecast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudFog,
  CloudLightning,
  CloudDrizzle,
  Wind,
  Droplets,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Coords {
  lat: number;
  lng: number;
}

interface WeatherForecastPanelProps {
  loadLabel: string;
  origin: string;
  destination: string;
  pickupCoords: Coords | null;
  destCoords: Coords | null;
  truckCoords: Coords | null;
  onClose: () => void;
}

function iconForCode(code: number) {
  if (code === 0) return Sun;
  if ([1, 2, 3].includes(code)) return Cloud;
  if ([45, 48].includes(code)) return CloudFog;
  if ([51, 53, 55, 56, 57].includes(code)) return CloudDrizzle;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return CloudRain;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return CloudSnow;
  if ([95, 96, 99].includes(code)) return CloudLightning;
  return Cloud;
}

function labelForCode(code: number) {
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 80, 81, 82].includes(code)) return 'Rain';
  if ([66, 67].includes(code)) return 'Freezing rain';
  if ([71, 73, 75, 85, 86].includes(code)) return 'Snow';
  if (code === 77) return 'Snow grains';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return '—';
}

function ForecastList({ coords }: { coords: Coords | null }) {
  const { data, isLoading, isError } = useOpenMeteoForecast(coords);

  if (!coords) {
    return (
      <p className="text-xs text-muted-foreground py-6 text-center">
        Location not yet available.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    );
  }
  if (isError || !data) {
    return (
      <p className="text-xs text-destructive py-6 text-center">
        Forecast temporarily unavailable.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((d: DailyForecast) => {
        const Icon = iconForCode(d.weatherCode);
        const dayLabel = new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        return (
          <div
            key={d.date}
            className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon className="h-6 w-6 text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{dayLabel}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {labelForCode(d.weatherCode)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                <Droplets className="h-3 w-3" />
                <span>{Math.round(d.precipProb)}%</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <Wind className="h-3 w-3" />
                <span>{Math.round(d.windMph)}</span>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold leading-tight">
                  {Math.round(d.tempMaxF)}°
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {Math.round(d.tempMinF)}°
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function WeatherForecastPanel({
  loadLabel,
  origin,
  destination,
  pickupCoords,
  destCoords,
  truckCoords,
  onClose,
}: WeatherForecastPanelProps) {
  return (
    <Card className="card-elevated h-full flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">7-Day Forecast</CardTitle>
            <p className="text-xs text-muted-foreground truncate">Load {loadLabel}</p>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto pt-0">
        <Tabs defaultValue="truck" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="pickup" className="text-xs">Pickup</TabsTrigger>
            <TabsTrigger value="truck" className="text-xs">Truck</TabsTrigger>
            <TabsTrigger value="dest" className="text-xs">Delivery</TabsTrigger>
          </TabsList>
          <TabsContent value="pickup" className="mt-3">
            <p className="text-xs text-muted-foreground mb-2 truncate">{origin}</p>
            <ForecastList coords={pickupCoords} />
          </TabsContent>
          <TabsContent value="truck" className="mt-3">
            <p className="text-xs text-muted-foreground mb-2">Current truck location</p>
            <ForecastList coords={truckCoords} />
          </TabsContent>
          <TabsContent value="dest" className="mt-3">
            <p className="text-xs text-muted-foreground mb-2 truncate">{destination}</p>
            <ForecastList coords={destCoords} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
