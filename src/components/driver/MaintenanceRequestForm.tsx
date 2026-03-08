import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Send } from 'lucide-react';

interface MaintenanceRequestFormProps {
  driverId: string;
  truckId: string;
  onComplete: () => void;
}

const ISSUE_TYPES = [
  { value: 'tire', label: 'Tire Issue' },
  { value: 'brake', label: 'Brake Problem' },
  { value: 'engine', label: 'Engine Issue' },
  { value: 'electrical', label: 'Electrical Problem' },
  { value: 'lights', label: 'Lights Not Working' },
  { value: 'trailer', label: 'Trailer Issue' },
  { value: 'other', label: 'Other' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low - Can wait for scheduled maintenance' },
  { value: 'medium', label: 'Medium - Should be addressed soon' },
  { value: 'high', label: 'High - Needs attention quickly' },
  { value: 'critical', label: 'Critical - Safety concern, needs immediate attention' },
] as const;

const maintenanceRequestSchema = z.object({
  issueType: z.string().min(1, 'Please select an issue type'),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  description: z
    .string()
    .trim()
    .min(10, 'Description must be at least 10 characters')
    .max(1000, 'Description must be less than 1000 characters'),
});

type MaintenanceRequestValues = z.infer<typeof maintenanceRequestSchema>;

export function MaintenanceRequestForm({ driverId, truckId, onComplete }: MaintenanceRequestFormProps) {
  const queryClient = useQueryClient();

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<MaintenanceRequestValues>({
    resolver: zodResolver(maintenanceRequestSchema),
    defaultValues: {
      issueType: '',
      priority: 'medium',
      description: '',
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (data: MaintenanceRequestValues) => {
      const { error } = await supabase.from('maintenance_requests').insert({
        driver_id: driverId,
        truck_id: truckId,
        issue_type: data.issueType,
        priority: data.priority,
        description: data.description,
        status: 'submitted',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['driver-maintenance-requests'] });
      toast.success('Maintenance request submitted successfully');
      onComplete();
    },
    onError: (error: any) => {
      toast.error('Failed to submit request: ' + error.message);
    },
  });

  const onSubmit = (data: MaintenanceRequestValues) => {
    submitMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Issue Type */}
      <div className="space-y-2">
        <Label>Issue Type *</Label>
        <Controller
          name="issueType"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select issue type" />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.issueType && (
          <p className="text-sm text-destructive">{errors.issueType.message}</p>
        )}
      </div>

      {/* Priority */}
      <div className="space-y-2">
        <Label>Priority</Label>
        <Controller
          name="priority"
          control={control}
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.priority && (
          <p className="text-sm text-destructive">{errors.priority.message}</p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label htmlFor="description">Description *</Label>
        <Textarea
          id="description"
          placeholder="Describe the issue in detail. Include location, symptoms, when it started..."
          rows={4}
          {...register('description')}
        />
        {errors.description && (
          <p className="text-sm text-destructive">{errors.description.message}</p>
        )}
      </div>

      {/* Submit Button */}
      <Button
        type="submit"
        className="w-full"
        disabled={submitMutation.isPending}
      >
        {submitMutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <Send className="h-4 w-4 mr-2" />
            Submit Request
          </>
        )}
      </Button>
    </form>
  );
}
