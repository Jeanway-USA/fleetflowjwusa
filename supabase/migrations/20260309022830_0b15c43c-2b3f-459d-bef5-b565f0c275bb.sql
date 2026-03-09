
ALTER TABLE public.load_status_logs DROP CONSTRAINT IF EXISTS load_status_logs_changed_by_fkey;
ALTER TABLE public.load_status_logs ADD CONSTRAINT load_status_logs_changed_by_fkey 
  FOREIGN KEY (changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.drivers DROP CONSTRAINT IF EXISTS drivers_user_id_fkey;
ALTER TABLE public.drivers ADD CONSTRAINT drivers_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE public.documents ADD CONSTRAINT documents_uploaded_by_fkey 
  FOREIGN KEY (uploaded_by) REFERENCES auth.users(id) ON DELETE SET NULL;
