import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { 
  CalendarIcon, 
  ClipboardCheck, 
  AlertTriangle, 
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  FileSignature,
  User,
  Truck,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface InspectionHistoryProps {
  truckId?: string;
  showAllTrucks?: boolean;
}

export function InspectionHistory({ truckId, showAllTrucks = true }: InspectionHistoryProps) {
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 7),
    to: new Date(),
  });
  const [selectedInspection, setSelectedInspection] = useState<any>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [inspectionToDelete, setInspectionToDelete] = useState<any>(null);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // First delete related photos
      await supabase.from('inspection_photos').delete().eq('inspection_id', id);
      // Then delete the inspection
      const { error } = await supabase.from('driver_inspections').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-inspections-history'] });
      queryClient.invalidateQueries({ queryKey: ['driver_inspections'] });
      toast.success('Inspection deleted');
      setDeleteDialogOpen(false);
      setInspectionToDelete(null);
    },
    onError: (error: any) => toast.error(error.message),
  });

  const handleDeleteClick = (e: React.MouseEvent, inspection: any) => {
    e.stopPropagation();
    e.preventDefault();
    setInspectionToDelete(inspection);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (inspectionToDelete) {
      deleteMutation.mutate(inspectionToDelete.id);
    }
  };

  const { data: inspections = [], isLoading } = useQuery({
    queryKey: ['all-inspections-history', dateRange.from, dateRange.to, truckId],
    queryFn: async () => {
      let query = (supabase.from('driver_inspections' as any) as any)
        .select('*, trucks(*), drivers(*)')
        .gte('inspection_date', startOfDay(dateRange.from).toISOString())
        .lte('inspection_date', endOfDay(dateRange.to).toISOString())
        .order('inspection_date', { ascending: false });

      if (truckId) {
        query = query.eq('truck_id', truckId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch photos for selected inspection
  const { data: inspectionPhotos = [] } = useQuery({
    queryKey: ['inspection-photos', selectedInspection?.id],
    queryFn: async () => {
      const { data, error } = await (supabase.from('inspection_photos' as any) as any)
        .select('*')
        .eq('inspection_id', selectedInspection?.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedInspection?.id,
  });

  const goBack = () => {
    setDateRange(prev => ({
      from: subDays(prev.from, 7),
      to: subDays(prev.to, 7),
    }));
  };

  const goForward = () => {
    const today = new Date();
    const newTo = subDays(dateRange.to, -7);
    const clampedTo = newTo > today ? today : newTo;
    setDateRange(prev => ({
      from: subDays(prev.from, -7),
      to: clampedTo,
    }));
  };

  const canGoForward = endOfDay(dateRange.to) < endOfDay(new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5" />
            Inspection History
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={goBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 pointer-events-auto" align="end">
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ from: range.from, to: range.to });
                    } else if (range?.from) {
                      setDateRange({ from: range.from, to: range.from });
                    }
                  }}
                  disabled={(date) => date > new Date()}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={goForward}
              disabled={!canGoForward}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : inspections.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No inspections in this date range</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {inspections.map((inspection: any) => (
                <Dialog key={inspection.id}>
                  <DialogTrigger asChild>
                    <button
                      className="w-full text-left p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedInspection(inspection)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={inspection.inspection_type === 'pre_trip' ? 'default' : 'secondary'}>
                              {inspection.inspection_type === 'pre_trip' ? 'Pre-Trip' : 'Post-Trip'}
                            </Badge>
                            {inspection.defects_found ? (
                              <Badge variant="destructive" className="gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Defects
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1 text-success border-success">
                                <CheckCircle className="h-3 w-3" />
                                Clear
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(inspection.inspection_date), 'EEEE, MMM d, yyyy • h:mm a')}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {inspection.trucks && (
                              <span className="flex items-center gap-1">
                                <Truck className="h-3 w-3" />
                                {inspection.trucks.unit_number}
                              </span>
                            )}
                            {inspection.drivers && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {inspection.drivers.first_name} {inspection.drivers.last_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {inspection.signature_url && (
                            <FileSignature className="h-4 w-4 text-muted-foreground" />
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDeleteClick(e, inspection)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Inspection Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      {/* Basic Info */}
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Type:</span>
                          <p className="font-medium capitalize">
                            {inspection.inspection_type?.replace('_', '-')}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Date:</span>
                          <p className="font-medium">
                            {format(new Date(inspection.inspection_date), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Time:</span>
                          <p className="font-medium">
                            {format(new Date(inspection.inspection_date), 'h:mm a')}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Odometer:</span>
                          <p className="font-medium">
                            {inspection.odometer_reading?.toLocaleString() || 'N/A'} mi
                          </p>
                        </div>
                        {inspection.trucks && (
                          <div>
                            <span className="text-muted-foreground">Truck:</span>
                            <p className="font-medium">{inspection.trucks.unit_number}</p>
                          </div>
                        )}
                        {inspection.drivers && (
                          <div>
                            <span className="text-muted-foreground">Driver:</span>
                            <p className="font-medium">
                              {inspection.drivers.first_name} {inspection.drivers.last_name}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Status */}
                      <div className="flex items-center gap-2">
                        {inspection.defects_found ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Defects Found
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-success border-success">
                            <CheckCircle className="h-3 w-3" />
                            No Defects
                          </Badge>
                        )}
                        <Badge variant="outline">
                          {inspection.status}
                        </Badge>
                      </div>

                      {/* Defect Notes */}
                      {inspection.defect_notes && (
                        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                          <h4 className="text-sm font-medium text-destructive mb-1">Defect Notes</h4>
                          <p className="text-sm">{inspection.defect_notes}</p>
                        </div>
                      )}

                      {/* Photos */}
                      {inspectionPhotos.length > 0 && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                            <ImageIcon className="h-4 w-4" />
                            Defect Photos ({inspectionPhotos.length})
                          </h4>
                          <div className="grid grid-cols-3 gap-2">
                            {inspectionPhotos.map((photo: any) => (
                              <a
                                key={photo.id}
                                href={photo.photo_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="aspect-square rounded-lg overflow-hidden border hover:opacity-80 transition-opacity"
                              >
                                <img
                                  src={photo.photo_url}
                                  alt="Defect photo"
                                  className="w-full h-full object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Signature */}
                      {inspection.signature_url && (
                        <div>
                          <h4 className="text-sm font-medium mb-2 flex items-center gap-1">
                            <FileSignature className="h-4 w-4" />
                            Driver Signature
                          </h4>
                          <div className="border rounded-lg p-2 bg-white">
                            <img
                              src={inspection.signature_url}
                              alt="Driver signature"
                              className="max-h-24 mx-auto"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Inspection</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this {inspectionToDelete?.inspection_type?.replace('_', '-')} inspection from{' '}
            {inspectionToDelete && format(new Date(inspectionToDelete.inspection_date), 'MMM d, yyyy')}? 
            This will also delete any associated photos and cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
