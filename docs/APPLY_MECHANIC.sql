-- Mechanic upgrade, part 1 of 2: the maintenance role on positions.
-- Let a position carry the maintenance role, and give the built-in Mechanic position that role.
-- Additive: only widens the allowed values and fills the Mechanic position where no role was chosen.

DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.positions'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%default_role%'
  LOOP
    EXECUTE format('ALTER TABLE public.positions DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.positions
  ADD CONSTRAINT positions_default_role_check
  CHECK (default_role IS NULL OR default_role IN ('owner', 'payroll_admin', 'dispatcher', 'safety', 'driver', 'maintenance'));

UPDATE public.positions
SET default_role = 'maintenance'
WHERE key = 'mechanic' AND is_builtin AND default_role IS NULL;


-- Mechanic upgrade, part 2 of 2: the shift clock, safeguards, and hourly pay.
-- Mechanic hours: the shift clock, safeguards on every clock, audited edits, and the hourly pay methods.
-- Additive and safe to run twice. Pay is counted from the SHIFT clock (every hour at work); job timers only show
-- where those hours went. Nothing here deletes data: entries are archived, never removed.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. The hourly pay methods (straight time to 40 hours a week, then 1.5 times).
-- ---------------------------------------------------------------------------------------------------------------
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.pay_package_components'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%calculation_method%'
  LOOP
    EXECUTE format('ALTER TABLE public.pay_package_components DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.pay_package_components
  ADD CONSTRAINT pay_package_components_calculation_method_check
  CHECK (calculation_method IN ('flat_weekly', 'flat_daily', 'per_mile', 'percentage_of_net_revenue',
                                'percentage_of_gross', 'fixed_amount', 'formula', 'per_hour', 'overtime_hour'));

-- ---------------------------------------------------------------------------------------------------------------
-- 2. The shift clock. One open shift per person. People change it only through the functions below, so nobody
--    can quietly edit their own hours; the owner can correct an entry, with a reason that is kept.
-- ---------------------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shift_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL,
  user_id          uuid NOT NULL,
  user_name        text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  meal_started_at  timestamptz,
  meal_minutes     integer NOT NULL DEFAULT 0 CHECK (meal_minutes >= 0),
  auto_stopped     boolean NOT NULL DEFAULT false,
  needs_review     boolean NOT NULL DEFAULT false,
  archived_at      timestamptz,
  archived_by      uuid,
  archive_reason   text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shift_entries_user_idx ON public.shift_entries (user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS shift_entries_org_idx ON public.shift_entries (org_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS shift_entries_one_open_idx ON public.shift_entries (user_id) WHERE ended_at IS NULL AND archived_at IS NULL;

ALTER TABLE public.shift_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shift_entries_select" ON public.shift_entries;
CREATE POLICY "shift_entries_select" ON public.shift_entries FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND (user_id = auth.uid() OR public.is_owner(auth.uid())));
GRANT SELECT ON public.shift_entries TO authenticated;
GRANT ALL ON public.shift_entries TO service_role;

-- Job timers get the same safeguard columns.
ALTER TABLE public.work_order_time_entries
  ADD COLUMN IF NOT EXISTS auto_stopped   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at    timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by    uuid,
  ADD COLUMN IF NOT EXISTS archive_reason text;

-- Every correction to a clock entry is written here, with who and why.
CREATE TABLE IF NOT EXISTS public.time_edit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('shift', 'job_timer')),
  entry_id    uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('edit', 'archive', 'restore', 'auto_stop')),
  reason      text,
  old_started timestamptz,
  old_ended   timestamptz,
  new_started timestamptz,
  new_ended   timestamptz,
  edited_by   uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS time_edit_log_entry_idx ON public.time_edit_log (entry_id, created_at DESC);
ALTER TABLE public.time_edit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_edit_log_select" ON public.time_edit_log;
CREATE POLICY "time_edit_log_select" ON public.time_edit_log FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()) AND public.is_owner(auth.uid()));
GRANT SELECT ON public.time_edit_log TO authenticated;
GRANT ALL ON public.time_edit_log TO service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Safeguard: a clock left running is stopped at 12 hours and flagged for review. (The screen warns at 10.)
--    The stop time is start + 12 hours, not "now", so a forgotten clock never pays hours nobody worked.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shop_close_stale_clocks()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _n integer := 0;
  _r record;
BEGIN
  IF _org IS NULL THEN RETURN 0; END IF;
  FOR _r IN
    SELECT id, started_at, meal_started_at FROM public.shift_entries
     WHERE org_id = _org AND ended_at IS NULL AND archived_at IS NULL AND started_at < now() - interval '12 hours' FOR UPDATE
  LOOP
    UPDATE public.shift_entries
       SET ended_at = _r.started_at + interval '12 hours',
           meal_minutes = meal_minutes + CASE WHEN _r.meal_started_at IS NULL THEN 0
                                              ELSE GREATEST(0, LEAST(720, round(extract(epoch FROM (_r.started_at + interval '12 hours' - _r.meal_started_at)) / 60)::int)) END,
           meal_started_at = NULL, auto_stopped = true, needs_review = true
     WHERE id = _r.id;
    INSERT INTO public.time_edit_log (org_id, kind, entry_id, action, reason, old_started, old_ended, new_started, new_ended)
    VALUES (_org, 'shift', _r.id, 'auto_stop', 'Left running more than 12 hours', _r.started_at, NULL, _r.started_at, _r.started_at + interval '12 hours');
    _n := _n + 1;
  END LOOP;
  FOR _r IN
    SELECT id, started_at FROM public.work_order_time_entries
     WHERE org_id = _org AND ended_at IS NULL AND archived_at IS NULL AND started_at < now() - interval '12 hours' FOR UPDATE
  LOOP
    UPDATE public.work_order_time_entries SET ended_at = _r.started_at + interval '12 hours', auto_stopped = true, needs_review = true WHERE id = _r.id;
    INSERT INTO public.time_edit_log (org_id, kind, entry_id, action, reason, old_started, old_ended, new_started, new_ended)
    VALUES (_org, 'job_timer', _r.id, 'auto_stop', 'Left running more than 12 hours', _r.started_at, NULL, _r.started_at, _r.started_at + interval '12 hours');
    _n := _n + 1;
  END LOOP;
  RETURN _n;
END;
$$;

-- The job timer: same as before, plus it first stops any clock left running too long.
CREATE OR REPLACE FUNCTION public.shop_start_timer(_work_order_id uuid, _user_name text DEFAULT NULL)
RETURNS public.work_order_time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _row public.work_order_time_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can track time'; END IF;
  PERFORM public.shop_close_stale_clocks();
  IF NOT EXISTS (SELECT 1 FROM public.work_orders WHERE id = _work_order_id AND org_id = _org AND status <> 'completed') THEN
    RAISE EXCEPTION 'Job not found or already finished';
  END IF;
  UPDATE public.work_order_time_entries SET ended_at = now() WHERE user_id = auth.uid() AND ended_at IS NULL;
  INSERT INTO public.work_order_time_entries (org_id, work_order_id, user_id, user_name)
  VALUES (_org, _work_order_id, auth.uid(), _user_name) RETURNING * INTO _row;
  UPDATE public.work_orders
     SET started_at = COALESCE(started_at, now()),
         status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END,
         blocked_reason = NULL
   WHERE id = _work_order_id;
  INSERT INTO public.work_order_events (org_id, work_order_id, kind, body, user_id, user_name)
  VALUES (_org, _work_order_id, 'timer', 'Started work', auth.uid(), _user_name);
  RETURN _row;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Clock in, meal break, clock out.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shift_clock_in(_user_name text DEFAULT NULL)
RETURNS public.shift_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _row public.shift_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can clock in'; END IF;
  PERFORM public.shop_close_stale_clocks();
  SELECT * INTO _row FROM public.shift_entries WHERE user_id = auth.uid() AND ended_at IS NULL AND archived_at IS NULL;
  IF _row.id IS NOT NULL THEN RETURN _row; END IF;
  INSERT INTO public.shift_entries (org_id, user_id, user_name) VALUES (_org, auth.uid(), _user_name) RETURNING * INTO _row;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_meal_start()
RETURNS public.shift_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.shift_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can clock in'; END IF;
  SELECT * INTO _row FROM public.shift_entries WHERE user_id = auth.uid() AND ended_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Clock in first'; END IF;
  IF _row.meal_started_at IS NOT NULL THEN RETURN _row; END IF;
  -- Nobody works a job on a meal break.
  UPDATE public.work_order_time_entries SET ended_at = now() WHERE user_id = auth.uid() AND ended_at IS NULL;
  UPDATE public.shift_entries SET meal_started_at = now() WHERE id = _row.id RETURNING * INTO _row;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_meal_end()
RETURNS public.shift_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.shift_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can clock in'; END IF;
  SELECT * INTO _row FROM public.shift_entries WHERE user_id = auth.uid() AND ended_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'You are not clocked in'; END IF;
  IF _row.meal_started_at IS NULL THEN RETURN _row; END IF;
  UPDATE public.shift_entries
     SET meal_minutes = meal_minutes + GREATEST(0, round(extract(epoch FROM (now() - meal_started_at)) / 60)::int), meal_started_at = NULL
   WHERE id = _row.id RETURNING * INTO _row;
  RETURN _row;
END;
$$;

CREATE OR REPLACE FUNCTION public.shift_clock_out()
RETURNS public.shift_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.shift_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can clock in'; END IF;
  SELECT * INTO _row FROM public.shift_entries WHERE user_id = auth.uid() AND ended_at IS NULL AND archived_at IS NULL FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'You are not clocked in'; END IF;
  UPDATE public.work_order_time_entries SET ended_at = now() WHERE user_id = auth.uid() AND ended_at IS NULL;
  UPDATE public.shift_entries
     SET ended_at = now(),
         meal_minutes = meal_minutes + CASE WHEN meal_started_at IS NULL THEN 0 ELSE GREATEST(0, round(extract(epoch FROM (now() - meal_started_at)) / 60)::int) END,
         meal_started_at = NULL
   WHERE id = _row.id RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 5. Owner corrections. A reason is required and kept; the old times are logged; entries are archived, not removed.
-- ---------------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shop_edit_time(_kind text, _id uuid, _started timestamptz, _ended timestamptz, _meal_minutes integer, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _old_s timestamptz; _old_e timestamptz;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Only the owner can correct hours'; END IF;
  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN RAISE EXCEPTION 'Say why the time is being changed'; END IF;
  IF _ended IS NULL OR _started IS NULL OR _ended <= _started THEN RAISE EXCEPTION 'The end must be after the start'; END IF;
  IF _ended - _started > interval '24 hours' THEN RAISE EXCEPTION 'An entry cannot be longer than 24 hours'; END IF;
  IF _ended > now() + interval '5 minutes' THEN RAISE EXCEPTION 'The end cannot be in the future'; END IF;
  IF _kind = 'shift' THEN
    SELECT started_at, ended_at INTO _old_s, _old_e FROM public.shift_entries WHERE id = _id AND org_id = _org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
    UPDATE public.shift_entries
       SET started_at = _started, ended_at = _ended, meal_started_at = NULL,
           meal_minutes = GREATEST(0, COALESCE(_meal_minutes, meal_minutes)), needs_review = false
     WHERE id = _id;
  ELSIF _kind = 'job_timer' THEN
    SELECT started_at, ended_at INTO _old_s, _old_e FROM public.work_order_time_entries WHERE id = _id AND org_id = _org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
    UPDATE public.work_order_time_entries SET started_at = _started, ended_at = _ended, needs_review = false WHERE id = _id;
  ELSE
    RAISE EXCEPTION 'Unknown kind of entry';
  END IF;
  INSERT INTO public.time_edit_log (org_id, kind, entry_id, action, reason, old_started, old_ended, new_started, new_ended, edited_by)
  VALUES (_org, _kind, _id, 'edit', btrim(_reason), _old_s, _old_e, _started, _ended, auth.uid());
END;
$$;

-- Accept an entry as it is (an auto-stopped clock that was right), or archive / restore one.
CREATE OR REPLACE FUNCTION public.shop_review_time(_kind text, _id uuid, _action text, _reason text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _s timestamptz; _e timestamptz;
BEGIN
  IF NOT public.is_owner(auth.uid()) THEN RAISE EXCEPTION 'Only the owner can review hours'; END IF;
  IF _action NOT IN ('accept', 'archive', 'restore') THEN RAISE EXCEPTION 'Unknown action'; END IF;
  IF _action <> 'accept' AND (_reason IS NULL OR length(btrim(_reason)) < 3) THEN RAISE EXCEPTION 'Say why'; END IF;
  IF _kind = 'shift' THEN
    SELECT started_at, ended_at INTO _s, _e FROM public.shift_entries WHERE id = _id AND org_id = _org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF _action = 'accept' THEN UPDATE public.shift_entries SET needs_review = false WHERE id = _id;
    ELSIF _action = 'archive' THEN UPDATE public.shift_entries SET archived_at = now(), archived_by = auth.uid(), archive_reason = btrim(_reason), needs_review = false WHERE id = _id;
    ELSE UPDATE public.shift_entries SET archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = _id; END IF;
  ELSIF _kind = 'job_timer' THEN
    SELECT started_at, ended_at INTO _s, _e FROM public.work_order_time_entries WHERE id = _id AND org_id = _org FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF _action = 'accept' THEN UPDATE public.work_order_time_entries SET needs_review = false WHERE id = _id;
    ELSIF _action = 'archive' THEN UPDATE public.work_order_time_entries SET archived_at = now(), archived_by = auth.uid(), archive_reason = btrim(_reason), needs_review = false WHERE id = _id;
    ELSE UPDATE public.work_order_time_entries SET archived_at = NULL, archived_by = NULL, archive_reason = NULL WHERE id = _id; END IF;
  ELSE
    RAISE EXCEPTION 'Unknown kind of entry';
  END IF;
  INSERT INTO public.time_edit_log (org_id, kind, entry_id, action, reason, old_started, old_ended, new_started, new_ended, edited_by)
  VALUES (_org, _kind, _id, CASE _action WHEN 'accept' THEN 'edit' ELSE _action END, COALESCE(NULLIF(btrim(_reason), ''), 'Checked and accepted as recorded'), _s, _e, _s, _e, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.shop_close_stale_clocks() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_start_timer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_clock_in(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_meal_start() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_meal_end() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shift_clock_out() TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_edit_time(text, uuid, timestamptz, timestamptz, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_review_time(text, uuid, text, text) TO authenticated;
