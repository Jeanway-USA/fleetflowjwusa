-- Fix the INSERT policy to be more restrictive (only service role can insert via edge function)
DROP POLICY IF EXISTS "Service role can insert PM notifications" ON public.pm_notifications;

-- No INSERT policy needed for regular users - edge function uses service role which bypasses RLS