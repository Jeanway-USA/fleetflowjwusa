-- Shop floor: everything a mechanic needs to work a job and everything the shop board needs to show it.
--
-- ADDITIVE ONLY. Existing work orders, their statuses, costs and history are untouched. This adds:
--   * a few optional columns on work_orders (who is on it, priority, when it started, bay, why it is blocked)
--   * work_order_tasks          a checklist for each job
--   * work_order_parts          parts used on a job (stock is taken off atomically, and put back if a line is voided)
--   * work_order_time_entries   labor time, one running timer per mechanic
--   * work_order_events         notes, photos and status changes: the job's activity feed
--   * parts_inventory.unit_cost so parts used can be costed
--
-- Nothing here can be deleted by the app (no DELETE privilege): parts lines are voided, tasks are ticked or
-- hidden, time entries are stopped. Who can do what: owners and the maintenance role work jobs; dispatcher and
-- safety can read.

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS assigned_to    uuid,
  ADD COLUMN IF NOT EXISTS assigned_name  text,
  ADD COLUMN IF NOT EXISTS priority       text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS started_at     timestamptz,
  ADD COLUMN IF NOT EXISTS bay            text,
  ADD COLUMN IF NOT EXISTS blocked_reason text;

DO $$ BEGIN
  ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_priority_check CHECK (priority IN ('low', 'normal', 'high', 'critical'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.parts_inventory ADD COLUMN IF NOT EXISTS unit_cost numeric;

CREATE TABLE IF NOT EXISTS public.work_order_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  work_order_id  uuid NOT NULL REFERENCES public.work_orders (id) ON DELETE RESTRICT,
  label          text NOT NULL,
  is_done        boolean NOT NULL DEFAULT false,
  done_at        timestamptz,
  done_by_name   text,
  hidden_at      timestamptz,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_tasks_wo_idx ON public.work_order_tasks (work_order_id, sort_order);

CREATE TABLE IF NOT EXISTS public.work_order_parts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  work_order_id  uuid NOT NULL REFERENCES public.work_orders (id) ON DELETE RESTRICT,
  part_id        uuid,
  part_name      text NOT NULL,
  part_number    text,
  quantity       numeric NOT NULL CHECK (quantity > 0),
  unit_cost      numeric NOT NULL DEFAULT 0,
  logged_by      uuid,
  logged_by_name text,
  logged_at      timestamptz NOT NULL DEFAULT now(),
  voided_at      timestamptz,
  voided_by      uuid
);
CREATE INDEX IF NOT EXISTS work_order_parts_wo_idx ON public.work_order_parts (work_order_id);

CREATE TABLE IF NOT EXISTS public.work_order_time_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  work_order_id  uuid NOT NULL REFERENCES public.work_orders (id) ON DELETE RESTRICT,
  user_id        uuid NOT NULL,
  user_name      text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  ended_at       timestamptz,
  note           text
);
CREATE INDEX IF NOT EXISTS work_order_time_wo_idx ON public.work_order_time_entries (work_order_id);
-- One running timer per person.
CREATE UNIQUE INDEX IF NOT EXISTS work_order_time_one_running_idx ON public.work_order_time_entries (user_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.work_order_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL,
  work_order_id  uuid NOT NULL REFERENCES public.work_orders (id) ON DELETE RESTRICT,
  kind           text NOT NULL CHECK (kind IN ('note', 'photo', 'status', 'assign', 'blocked', 'part', 'task', 'timer')),
  body           text,
  photo_path     text,
  user_id        uuid,
  user_name      text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_order_events_wo_idx ON public.work_order_events (work_order_id, created_at DESC);

-- Who may work a job: owners and the maintenance role. Who may look: also dispatcher and safety.
CREATE OR REPLACE FUNCTION public.can_work_shop(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND (public.is_owner(_uid) OR public.has_role(_uid, 'maintenance'::app_role));
$$;

CREATE OR REPLACE FUNCTION public.can_view_shop(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT _uid IS NOT NULL AND (public.can_work_shop(_uid) OR public.has_role(_uid, 'dispatcher'::app_role) OR public.has_role(_uid, 'safety'::app_role));
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['work_order_tasks', 'work_order_parts', 'work_order_time_entries', 'work_order_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_select" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_select" ON public.%1$I FOR SELECT TO authenticated USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_view_shop(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_insert" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_insert" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_work_shop(auth.uid()))', t);
    EXECUTE format('DROP POLICY IF EXISTS "%1$s_update" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "%1$s_update" ON public.%1$I FOR UPDATE TO authenticated USING (org_id = public.get_user_org_id(auth.uid()) AND public.can_work_shop(auth.uid())) WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.can_work_shop(auth.uid()))', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Take a part off the shelf for a job. Refuses if there is not enough, and does it in one step so two mechanics
-- cannot take the same last part.
CREATE OR REPLACE FUNCTION public.shop_log_part(_work_order_id uuid, _part_id uuid, _quantity numeric, _user_name text DEFAULT NULL)
RETURNS public.work_order_parts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _part public.parts_inventory%ROWTYPE;
  _row public.work_order_parts;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can log parts'; END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN RAISE EXCEPTION 'Enter how many were used'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.work_orders WHERE id = _work_order_id AND org_id = _org) THEN RAISE EXCEPTION 'Job not found'; END IF;

  SELECT * INTO _part FROM public.parts_inventory WHERE id = _part_id AND org_id = _org AND deleted_at IS NULL FOR UPDATE;
  IF _part.id IS NULL THEN RAISE EXCEPTION 'Part not found'; END IF;
  IF _part.quantity_on_hand < _quantity THEN
    RAISE EXCEPTION 'Only % % of % in stock', _part.quantity_on_hand, COALESCE(_part.unit, ''), _part.part_name;
  END IF;

  UPDATE public.parts_inventory SET quantity_on_hand = quantity_on_hand - _quantity WHERE id = _part.id;
  INSERT INTO public.work_order_parts (org_id, work_order_id, part_id, part_name, part_number, quantity, unit_cost, logged_by, logged_by_name)
  VALUES (_org, _work_order_id, _part.id, _part.part_name, _part.part_number, _quantity, COALESCE(_part.unit_cost, 0), auth.uid(), _user_name)
  RETURNING * INTO _row;
  INSERT INTO public.work_order_events (org_id, work_order_id, kind, body, user_id, user_name)
  VALUES (_org, _work_order_id, 'part', 'Used ' || _quantity || ' x ' || _part.part_name, auth.uid(), _user_name);
  RETURN _row;
END;
$$;

-- Undo a parts line: the stock goes back and the line stays on record, marked voided.
CREATE OR REPLACE FUNCTION public.shop_void_part(_id uuid, _user_name text DEFAULT NULL)
RETURNS public.work_order_parts
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _row public.work_order_parts;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can change parts'; END IF;
  SELECT * INTO _row FROM public.work_order_parts WHERE id = _id AND org_id = _org FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Parts line not found'; END IF;
  IF _row.voided_at IS NOT NULL THEN RETURN _row; END IF;
  IF _row.part_id IS NOT NULL THEN
    UPDATE public.parts_inventory SET quantity_on_hand = quantity_on_hand + _row.quantity WHERE id = _row.part_id AND org_id = _org;
  END IF;
  UPDATE public.work_order_parts SET voided_at = now(), voided_by = auth.uid() WHERE id = _id RETURNING * INTO _row;
  INSERT INTO public.work_order_events (org_id, work_order_id, kind, body, user_id, user_name)
  VALUES (_org, _row.work_order_id, 'part', 'Put back ' || _row.quantity || ' x ' || _row.part_name, auth.uid(), _user_name);
  RETURN _row;
END;
$$;

-- Start the clock on a job. A mechanic has one timer at a time: starting a new one stops the last. Starting work
-- on a job nobody has started also marks it in progress.
CREATE OR REPLACE FUNCTION public.shop_start_timer(_work_order_id uuid, _user_name text DEFAULT NULL)
RETURNS public.work_order_time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _org uuid := public.get_user_org_id(auth.uid());
  _row public.work_order_time_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can track time'; END IF;
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

CREATE OR REPLACE FUNCTION public.shop_stop_timer(_user_name text DEFAULT NULL)
RETURNS public.work_order_time_entries
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _row public.work_order_time_entries;
BEGIN
  IF NOT public.can_work_shop(auth.uid()) THEN RAISE EXCEPTION 'Only the shop can track time'; END IF;
  UPDATE public.work_order_time_entries SET ended_at = now() WHERE user_id = auth.uid() AND ended_at IS NULL RETURNING * INTO _row;
  IF _row.id IS NOT NULL THEN
    INSERT INTO public.work_order_events (org_id, work_order_id, kind, body, user_id, user_name)
    VALUES (_row.org_id, _row.work_order_id, 'timer', 'Paused work', auth.uid(), _user_name);
  END IF;
  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_work_shop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_shop(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_log_part(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_void_part(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_start_timer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_stop_timer(text) TO authenticated;