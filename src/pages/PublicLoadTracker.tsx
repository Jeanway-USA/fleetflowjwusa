import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, MapPin, Truck, CheckCircle, Package, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LoadRouteMap } from '@/components/driver/LoadRouteMap';
import { format, parseISO } from 'date-fns';

interface TrackingData {
  origin: string;
  origin_full: string;
  destination: string;
  destination_full: string;
  status: string;
  pickup_date: string | null;
  delivery_date: string | null;
  booked_miles: number | null;
  load_number: string | null;
  org: {
    name: string;
    logo_url: string | null;
    primary_color: string | null;
  } | null;
  location: {
    latitude: number;
    longitude: number;
    updated_at: string;
  } | null;
}

const STEPS = [
  { key: 'dispatched', label: 'Dispatched', icon: Package },
  { key: 'in_transit', label: 'In Transit', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle },
];

function getStepIndex(status: string): number {
  if (['delivered'].includes(status)) return 2;
  if (['in_transit', 'loading'].includes(status)) return 1;
  return 0; // pending, assigned
}

export default function PublicLoadTracker() {
  const [searchParams] = useSearchParams();
  const trackingId = searchParams.get('tracking_id');
  const [data, setData] = useState<TrackingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!trackingId) {
      setError('No tracking ID provided');
      setLoading(false);
      return;
    }

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/public-load-tracker?tracking_id=${trackingId}`;

    fetch(url, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        setData(json);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [trackingId]);

  // Apply brand color via inline style
  const brandStyle = data?.org?.primary_color
    ? ({ '--primary': data.org.primary_color } as React.CSSProperties)
    : {};

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center px-4">
        <Package className="h-16 w-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold mb-2">Tracking Not Found</h1>
        <p className="text-muted-foreground">
          {error || 'This tracking link is invalid or has expired.'}
        </p>
      </div>
    );
  }

  const currentStep = getStepIndex(data.status);

  return (
    <div className="min-h-screen bg-background" style={brandStyle}>
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Org Header */}
        <div className="text-center space-y-2">
          {data.org?.logo_url ? (
            <img
              src={data.org.logo_url}
              alt={data.org.name || 'Company'}
              className="h-12 mx-auto object-contain"
            />
          ) : (
            <h2 className="text-lg font-semibold text-muted-foreground">
              {data.org?.name || 'Shipment Tracking'}
            </h2>
          )}
          {data.load_number && (
            <p className="text-sm text-muted-foreground font-mono">
              Load #{data.load_number}
            </p>
          )}
        </div>

        {/* Progress Bar */}
        <Card>
          <CardContent className="py-6 px-4">
            <div className="flex items-center justify-between relative">
              {/* Connecting line */}
              <div className="absolute top-5 left-[10%] right-[10%] h-0.5 bg-muted" />
              <div
                className="absolute top-5 left-[10%] h-0.5 bg-primary transition-all duration-500"
                style={{ width: `${currentStep * 40}%` }}
              />

              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isActive = idx <= currentStep;
                const isCurrent = idx === currentStep;
                return (
                  <div key={step.key} className="relative z-10 flex flex-col items-center gap-1.5 flex-1">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground'
                      } ${isCurrent ? 'ring-4 ring-primary/20' : ''}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={`text-xs font-medium ${
                        isActive ? 'text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Route Info */}
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <div className="w-0.5 h-8 bg-muted" />
                <div className="w-3 h-3 rounded-full bg-destructive" />
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Origin</p>
                  <p className="font-medium">{data.origin}</p>
                  {data.pickup_date && (
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(data.pickup_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Destination</p>
                  <p className="font-medium">{data.destination}</p>
                  {data.delivery_date && (
                    <p className="text-xs text-muted-foreground">
                      {format(parseISO(data.delivery_date), 'MMM d, yyyy')}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {data.booked_miles && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2 border-t">
                <MapPin className="h-4 w-4" />
                <span>{data.booked_miles.toLocaleString()} miles</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Map */}
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg">
            <LoadRouteMap origin={data.origin_full} destination={data.destination_full} />
          </CardContent>
        </Card>

        {/* Live location timestamp */}
        {data.location && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              Location updated {format(parseISO(data.location.updated_at), 'MMM d, h:mm a')}
            </span>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pt-4">
          Powered by FleetFlow TMS
        </p>
      </div>
    </div>
  );
}
