-- Create PM notifications table for maintenance alerts
CREATE TABLE public.pm_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,
  service_code TEXT,
  notification_type TEXT NOT NULL CHECK (notification_type IN ('overdue', 'due_soon', 'upcoming')),
  days_or_miles_remaining INTEGER,
  unit TEXT CHECK (unit IN ('miles', 'days')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  dismissed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pm_notifications ENABLE ROW LEVEL SECURITY;

-- Allow admin roles to view and manage PM notifications
CREATE POLICY "Admin users can view PM notifications"
  ON public.pm_notifications FOR SELECT
  USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Admin users can update PM notifications"
  ON public.pm_notifications FOR UPDATE
  USING (public.has_admin_access(auth.uid()));

CREATE POLICY "Admin users can delete PM notifications"
  ON public.pm_notifications FOR DELETE
  USING (public.has_admin_access(auth.uid()));

-- Service role can insert (for edge function)
CREATE POLICY "Service role can insert PM notifications"
  ON public.pm_notifications FOR INSERT
  WITH CHECK (true);

-- Create index for fast lookups
CREATE INDEX idx_pm_notifications_truck_id ON public.pm_notifications(truck_id);
CREATE INDEX idx_pm_notifications_type ON public.pm_notifications(notification_type);
CREATE INDEX idx_pm_notifications_created ON public.pm_notifications(created_at DESC);

-- Add trigger for updated_at
CREATE TRIGGER update_pm_notifications_updated_at
  BEFORE UPDATE ON public.pm_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for PM notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.pm_notifications;