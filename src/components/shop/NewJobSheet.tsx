import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Search, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingButton } from '@/components/shared/LoadingButton';
import { supabase } from '@/integrations/supabase/client';
import { useShopActions, useShopCrew } from '@/hooks/useShop';
import { PRIORITY_LABEL, type Priority } from '@/lib/shop/board';
import { tasksForKinds, WORK_KINDS } from '@/lib/shop/templates';
import { cn } from '@/lib/utils';

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Start with this truck chosen. */
  truckId?: string | null;
  /** Start with this work chosen and its checklist filled in. */
  kind?: string | null;
  /** Start with this problem described, for example when turning a driver's report into a job. */
  description?: string;
  onCreated?: () => void;
}

/** Make a job in three taps: the truck, the work, and (if you want) who and how urgent. The checklist fills itself in. */
export function NewJobSheet({ open, onOpenChange, truckId, kind, description: startDescription, onCreated }: Props) {
  const actions = useShopActions();
  const { data: crew = [] } = useShopCrew();
  const [truck, setTruck] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [kinds, setKinds] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>('normal');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<string[]>([]);
  const [tasksEdited, setTasksEdited] = useState(false);
  const [assignee, setAssignee] = useState('__none__');
  const [due, setDue] = useState('');
  const [newTask, setNewTask] = useState('');

  const { data: trucks = [] } = useQuery({
    queryKey: ['shop', 'trucks-for-new-job'],
    enabled: open,
    queryFn: async () => {
      const [{ data: t }, { data: active }] = await Promise.all([
        supabase.from('trucks').select('id, unit_number, make, model, status').is('deleted_at', null).order('unit_number'),
        supabase.from('work_orders').select('truck_id').in('status', ['open', 'parts_ordered', 'in_progress']).is('deleted_at', null),
      ]);
      const busy = new Set((active ?? []).map((a) => a.truck_id));
      return (t ?? []).map((x) => ({ ...x, busy: busy.has(x.id) }));
    },
  });

  useEffect(() => {
    if (!open) return;
    setTruck(truckId ?? null);
    setKinds(kind ? [kind] : []);
    setPriority('normal');
    setDescription(startDescription ?? '');
    setTasks(kind ? tasksForKinds([kind]) : []);
    setTasksEdited(false);
    setAssignee('__none__');
    setDue('');
    setSearch('');
    setNewTask('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The checklist follows the chosen work until someone edits it by hand.
  useEffect(() => {
    if (!tasksEdited) setTasks(tasksForKinds(kinds));
  }, [kinds, tasksEdited]);

  const shown = useMemo(() => trucks.filter((t) => `${t.unit_number} ${t.make ?? ''} ${t.model ?? ''}`.toLowerCase().includes(search.toLowerCase())), [trucks, search]);
  const toggleKind = (k: string) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));

  const submit = async () => {
    if (!truck) return toast.error('Choose the truck.');
    if (kinds.length === 0 && !description.trim()) return toast.error('Choose the work, or describe the problem.');
    const person = crew.find((c) => c.id === assignee);
    try {
      await actions.createJob.mutateAsync({
        truckId: truck,
        serviceTypes: kinds.length > 0 ? kinds : ['repair'],
        description: description.trim(),
        priority,
        tasks: tasks.filter((t) => t.trim()),
        assignedTo: person?.id ?? null,
        assignedName: person?.name ?? null,
        estimatedCompletion: due || null,
      });
      toast.success('Job created.');
      onOpenChange(false);
      onCreated?.();
    } catch (e: any) {
      toast.error(e.message ?? 'Could not create the job');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !actions.createJob.isPending && onOpenChange(v)}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-5 py-4 pr-12 text-left">
          <SheetTitle className="font-condensed text-2xl">New job</SheetTitle>
          <SheetDescription>Pick the truck and the work. The checklist is filled in for you and you can change it.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">1. Which truck?</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by unit number" className="h-12 pl-9 sm:pl-9 text-base" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {shown.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTruck(t.id)}
                  className={cn('min-h-[64px] rounded-lg border p-3 text-left transition-colors', truck === t.id ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent')}
                >
                  <span className="block font-condensed text-xl font-bold leading-none">{t.unit_number}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[t.make, t.model].filter(Boolean).join(' ') || 'Truck'}</span>
                  {t.busy && <span className="mt-1 block text-xs font-medium text-orange-400">Already has an open job</span>}
                </button>
              ))}
              {shown.length === 0 && <p className="col-span-full text-sm text-muted-foreground">No trucks match.</p>}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">2. What work?</h3>
            <div className="flex flex-wrap gap-2">
              {WORK_KINDS.map((k) => (
                <button
                  key={k.key}
                  type="button"
                  onClick={() => toggleKind(k.key)}
                  className={cn('min-h-[44px] rounded-md border px-4 text-sm font-medium transition-colors', kinds.includes(k.key) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent')}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What is wrong, or anything the mechanic should know" className="text-base" />
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">3. How urgent?</h3>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn('min-h-[48px] rounded-lg border text-sm font-medium transition-colors', priority === p ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent')}
                >
                  {PRIORITY_LABEL[p]}
                </button>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold">Who is on it? <span className="font-normal text-muted-foreground">(optional)</span></h3>
              <Select value={assignee} onValueChange={setAssignee}>
                <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Anyone, first come first served</SelectItem>
                  {crew.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold">Needed by <span className="font-normal text-muted-foreground">(optional)</span></h3>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-12" />
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Checklist</h3>
            {tasks.length === 0 && <p className="text-xs text-muted-foreground">Pick the work above to fill this in, or add your own steps.</p>}
            <ul className="space-y-1.5">
              {tasks.map((t, i) => (
                <li key={`${i}-${t}`} className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <span className="flex-1">{t}</span>
                  <button type="button" aria-label="Remove step" className="rounded p-1 text-muted-foreground hover:bg-accent" onClick={() => { setTasksEdited(true); setTasks(tasks.filter((_, j) => j !== i)); }}>
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                setTasksEdited(true);
                setTasks([...tasks, newTask.trim()]);
                setNewTask('');
              }}
            >
              <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a step" className="h-11" />
              <Button type="submit" variant="outline" className="h-11"><Plus className="mr-1 h-4 w-4" />Add</Button>
            </form>
          </section>
        </div>

        <div className="flex gap-2 border-t bg-background px-5 py-4">
          <Button variant="outline" className="h-12 flex-1" onClick={() => onOpenChange(false)} disabled={actions.createJob.isPending}>Cancel</Button>
          <LoadingButton loading={actions.createJob.isPending} disabled={actions.createJob.isPending} onClick={submit} className="h-12 flex-[2] bg-primary text-primary-foreground hover:bg-primary/90">Create job</LoadingButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
