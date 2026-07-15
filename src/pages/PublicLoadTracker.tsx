import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Package, Truck } from "lucide-react";
import { format, parseISO } from "date-fns";

type Stop = {
  stop_number: number;
  stop_type: string | null;
  facility_name: string | null;
  location: string | null;
  scheduled_date: string | null;
  status: string | null;
  completed_at: string | null;
};

type PublicLoad = {
  tracking_id: string;
  landstar_load_id: string | null;
  status: string | null;
  origin: string | null;
  destination: string | null;
  pickup_date: string | null;
  pickup_time: string | null;
  pickup_end_time?: string | null;
  pickup_time_type: string | null;
  delivery_date: string | null;
  delivery_time: string | null;
  delivery_end_time?: string | null;
  delivery_time_type: string | null;
  pickup_at: string | null;
  delivery_at: string | null;
  current_route_updated_at: string | null;
  stops: Stop[];
};

const formatDate = (d: string | null) => {
  if (!d) return "—";
  try {
    const iso = d.length === 10 ? `${d}T00:00:00` : d;
    return format(parseISO(iso), "MMM d, yyyy");
  } catch {
    return d;
  }
};

const statusVariant = (status: string | null) => {
  const s = (status || "").toLowerCase();
  if (s.includes("deliver")) return "default" as const;
  if (s.includes("transit") || s.includes("progress")) return "secondary" as const;
  if (s.includes("cancel")) return "destructive" as const;
  return "outline" as const;
};

export default function PublicLoadTracker() {
  const [params] = useSearchParams();
  const trackingId = params.get("tracking_id");

  useEffect(() => {
    // Noindex the public tracker
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    const prevTitle = document.title;
    document.title = "Load Tracking";
    return () => {
      document.head.removeChild(meta);
      document.title = prevTitle;
    };
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-load-tracking", trackingId],
    queryFn: async (): Promise<PublicLoad | null> => {
      if (!trackingId) return null;
      const { data, error } = await supabase.rpc(
        "get_public_load_by_tracking" as any,
        { _tracking_id: trackingId } as any
      );
      if (error) throw error;
      return (data as PublicLoad | null) ?? null;
    },
    enabled: !!trackingId,
    staleTime: 30_000,
  });

  if (!trackingId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Missing tracking ID</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            This tracking link is invalid. Please check the URL and try again.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Load not found</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground">
            We couldn't find a shipment for this tracking link. It may have expired or been removed.
          </CardContent>
        </Card>
      </div>
    );
  }

  const stops = Array.isArray(data.stops) ? data.stops : [];

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold">Shipment Tracking</h1>
          <p className="text-sm text-muted-foreground">
            Load {data.landstar_load_id ? `#${data.landstar_load_id}` : ""}
          </p>
        </header>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" /> Status
            </CardTitle>
            <Badge variant={statusVariant(data.status)}>
              {data.status || "Unknown"}
            </Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Origin
              </div>
              <div className="font-medium">{data.origin || "—"}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Pickup: {formatDate(data.pickup_date)}
                {data.pickup_time ? ` · ${data.pickup_time_type === 'window' && data.pickup_end_time ? `${data.pickup_time} - ${data.pickup_end_time}` : data.pickup_time}` : ""}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Destination
              </div>
              <div className="font-medium">{data.destination || "—"}</div>
              <div className="text-sm text-muted-foreground mt-1">
                Delivery: {formatDate(data.delivery_date)}
                {data.delivery_time ? ` · ${data.delivery_time}` : ""}
              </div>
            </div>
          </CardContent>
        </Card>

        {stops.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> Stops
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {stops.map((s) => (
                  <li key={s.stop_number} className="border-l-2 border-muted pl-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">
                        Stop {s.stop_number}
                        {s.stop_type ? ` · ${s.stop_type}` : ""}
                      </div>
                      {s.status && (
                        <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {s.facility_name || s.location || "—"}
                    </div>
                    {s.scheduled_date && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Scheduled: {formatDate(s.scheduled_date)}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        )}

        {data.current_route_updated_at && (
          <p className="text-xs text-muted-foreground text-center">
            Last updated {format(parseISO(data.current_route_updated_at), "MMM d, yyyy p")}
          </p>
        )}
      </div>
    </div>
  );
}
