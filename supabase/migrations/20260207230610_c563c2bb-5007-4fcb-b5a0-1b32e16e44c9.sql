-- Add start_date and end_date columns to driver_requests
ALTER TABLE public.driver_requests
ADD COLUMN start_date date NULL,
ADD COLUMN end_date date NULL;

-- Add DELETE policy for driver_notifications so drivers can clear them
CREATE POLICY "Drivers can delete their own notifications"
ON public.driver_notifications
FOR DELETE
USING (driver_id = get_driver_id_for_user(auth.uid()));