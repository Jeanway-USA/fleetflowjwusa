import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { MapPin, Navigation, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

// Update interval in milliseconds (10 minutes)
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

interface LocationSharingProps {
  driverId: string;
  truckId?: string | null;
  loadId?: string | null;
}

export function LocationSharing({ driverId, truckId, loadId }: LocationSharingProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nextUpdateIn, setNextUpdateIn] = useState<number | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // Get current location status from database
  const { data: locationData, isLoading: isLoadingLocation } = useQuery({
    queryKey: ['driver-location', driverId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('*')
        .eq('driver_id', driverId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Mutation to update location
  const updateLocation = useMutation({
    mutationFn: async (position: GeolocationPosition) => {
      const locationPayload = {
        driver_id: driverId,
        truck_id: truckId || null,
        load_id: loadId || null,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        accuracy: position.coords.accuracy,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('driver_locations')
        .upsert(locationPayload, { onConflict: 'driver_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      lastUpdateTimeRef.current = Date.now();
      queryClient.invalidateQueries({ queryKey: ['driver-location', driverId] });
    },
    onError: (error) => {
      console.error('Failed to update location:', error);
      setError('Failed to update location');
    },
  });

  // Mutation to delete location (stop sharing)
  const deleteLocation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('driver_locations')
        .delete()
        .eq('driver_id', driverId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-location', driverId] });
      toast.success('Location sharing stopped');
    },
  });

  // Handle position updates with throttling (10 min interval)
  const handlePositionUpdate = useCallback((position: GeolocationPosition) => {
    setCurrentPosition(position);
    setError(null);
    
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;
    
    // Send update if it's the first update or 10 minutes have passed
    if (lastUpdateTimeRef.current === 0 || timeSinceLastUpdate >= UPDATE_INTERVAL_MS) {
      updateLocation.mutate(position);
    }
  }, [updateLocation]);

  // Handle position errors
  const handlePositionError = useCallback((error: GeolocationPositionError) => {
    console.error('Geolocation error:', error);
    let errorMessage = 'Unable to get location';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        errorMessage = 'Location permission denied. Please enable location access in your browser settings.';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage = 'Location information is unavailable.';
        break;
      case error.TIMEOUT:
        errorMessage = 'Location request timed out.';
        break;
    }
    setError(errorMessage);
    setIsSharing(false);
    toast.error(errorMessage);
  }, []);

  // Start sharing location
  const startSharing = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      toast.error('Geolocation is not supported by your browser');
      return;
    }

    const id = navigator.geolocation.watchPosition(
      handlePositionUpdate,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    setWatchId(id);
    setIsSharing(true);
    setError(null);
    toast.success('Location sharing started');
  }, [handlePositionUpdate, handlePositionError]);

  // Stop sharing location
  const stopSharing = useCallback(() => {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      setWatchId(null);
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setIsSharing(false);
    setCurrentPosition(null);
    setNextUpdateIn(null);
    lastUpdateTimeRef.current = 0;
    deleteLocation.mutate();
  }, [watchId, deleteLocation]);

  // Toggle sharing
  const handleToggle = (checked: boolean) => {
    if (checked) {
      startSharing();
    } else {
      stopSharing();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [watchId]);

  // Update countdown timer
  useEffect(() => {
    if (isSharing && lastUpdateTimeRef.current > 0) {
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - lastUpdateTimeRef.current;
        const remaining = Math.max(0, UPDATE_INTERVAL_MS - elapsed);
        setNextUpdateIn(Math.ceil(remaining / 1000));
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
      };
    }
  }, [isSharing, locationData]);

  // Check if we had a previous session
  useEffect(() => {
    if (locationData && !isSharing) {
      // Location exists in DB, check if we should resume sharing
      const lastUpdate = new Date(locationData.updated_at);
      const now = new Date();
      const minutesSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60);
      
      // If last update was within 5 minutes, offer to resume
      if (minutesSinceUpdate < 5) {
        // Auto-resume could be added here if desired
      }
    }
  }, [locationData, isSharing]);

  const formatCoords = (lat: number, lng: number) => {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  };

  const formatSpeed = (speed: number | null) => {
    if (!speed) return 'Stationary';
    const mph = speed * 2.237; // Convert m/s to mph
    return `${mph.toFixed(0)} mph`;
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Navigation className="h-4 w-4 text-primary" />
              GPS Location
            </CardTitle>
            <CardDescription className="text-xs">
              Share your location with dispatch
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Switch
              id="location-sharing"
              checked={isSharing}
              onCheckedChange={handleToggle}
              disabled={updateLocation.isPending}
            />
            <Label htmlFor="location-sharing" className="sr-only">
              Share location
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error ? (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        ) : isSharing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
                <span className="relative flex h-2 w-2 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                </span>
                Live
              </Badge>
              {updateLocation.isPending && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </div>
            {currentPosition && (
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  <span>
                    {formatCoords(currentPosition.coords.latitude, currentPosition.coords.longitude)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Speed: {formatSpeed(currentPosition.coords.speed)}</span>
                  <span>
                    Accuracy: ±{currentPosition.coords.accuracy?.toFixed(0) || '?'}m
                  </span>
                </div>
                {nextUpdateIn !== null && nextUpdateIn > 0 && (
                  <div className="text-muted-foreground/70">
                    Next update in {Math.floor(nextUpdateIn / 60)}:{String(nextUpdateIn % 60).padStart(2, '0')}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : locationData ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            <span>
              Last shared {new Date(locationData.updated_at).toLocaleTimeString()}
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Enable to share your live location with dispatchers
          </p>
        )}
      </CardContent>
    </Card>
  );
}
