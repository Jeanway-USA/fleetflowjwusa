-- Create notifications table for driver alerts
CREATE TABLE public.driver_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  notification_type TEXT NOT NULL DEFAULT 'load_assigned',
  related_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_notifications ENABLE ROW LEVEL SECURITY;

-- Drivers can view their own notifications
CREATE POLICY "Drivers can view their own notifications"
  ON public.driver_notifications
  FOR SELECT
  USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Drivers can update (mark as read) their own notifications
CREATE POLICY "Drivers can update their own notifications"
  ON public.driver_notifications
  FOR UPDATE
  USING (driver_id = get_driver_id_for_user(auth.uid()));

-- Admin roles can view all notifications
CREATE POLICY "Admin roles can view all notifications"
  ON public.driver_notifications
  FOR SELECT
  USING (has_admin_access(auth.uid()));

-- System can insert notifications (via trigger)
CREATE POLICY "System can insert notifications"
  ON public.driver_notifications
  FOR INSERT
  WITH CHECK (true);

-- Owner/dispatcher can manage notifications
CREATE POLICY "Owner dispatcher can manage notifications"
  ON public.driver_notifications
  FOR ALL
  USING (is_owner(auth.uid()) OR has_role(auth.uid(), 'dispatcher'::app_role));

-- Create index for faster queries
CREATE INDEX idx_driver_notifications_driver_id ON public.driver_notifications(driver_id);
CREATE INDEX idx_driver_notifications_is_read ON public.driver_notifications(driver_id, is_read);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_notifications;

-- Create function to notify driver when load is assigned
CREATE OR REPLACE FUNCTION public.notify_driver_on_load_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  load_origin TEXT;
  load_destination TEXT;
BEGIN
  -- Only trigger when driver_id is set and status is pending or assigned
  IF NEW.driver_id IS NOT NULL AND 
     (NEW.status = 'pending' OR NEW.status = 'assigned') AND
     (OLD IS NULL OR OLD.driver_id IS DISTINCT FROM NEW.driver_id) THEN
    
    load_origin := COALESCE(split_part(NEW.origin, ',', 1), NEW.origin);
    load_destination := COALESCE(split_part(NEW.destination, ',', 1), NEW.destination);
    
    INSERT INTO public.driver_notifications (
      driver_id,
      title,
      message,
      notification_type,
      related_id
    ) VALUES (
      NEW.driver_id,
      'New Load Assigned',
      'You have a new load: ' || load_origin || ' → ' || load_destination,
      'load_assigned',
      NEW.id
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on fleet_loads
CREATE TRIGGER trigger_notify_driver_on_load_assignment
  AFTER INSERT OR UPDATE ON public.fleet_loads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_driver_on_load_assignment();