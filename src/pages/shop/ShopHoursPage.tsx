import { Fragment, useMemo, useState } from 'react';
import { addDays, format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle, ArchiveRestore, Check, ChevronDown, ChevronLeft, ChevronRight, Download, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShopNav } from '@/components/shop/ShopNav';
import { PageHeader } from '@/components/shared/PageHeader';
import { ShopEmpty, useNow } from '@/components/shop/shared';
import { useHoursData, useTimeReview } from '@/hooks/useShift';
import { hoursCsv, paidShiftMinutes, payWeekLabel, payWeekStart, summarizeWeek, toHours, type WeekHours } from '@/lib/shop/hours';
import { formatMinutes } from '@/lib/shop/board';

const hrs = (minutes: number) => toHours(minutes).toFixed(2);
const localInput = (iso: string) => format(new Date(iso), "yyyy-MM-dd'T'HH:mm");

interface EditTarget {
  kind: 'shift' | 'job_timer';
  id: string;
  who: string;
  startedAt: string;
  endedAt: string;
  mealMinutes: number | null;
}

/** Each mechanic's paid hours for a Monday to Sunday pay week: straight time, overtime, and where the hours went. */
export default function ShopHoursPage() {
  const now = useNow(60_000);
  const [weekStart, setWeekStart] = useState(() => payWeekStart(new Date()));
  const { data, isLoading } = useHoursData(weekStart);
  const { edit, review } = useTimeReview();
  const [open, setOpen] = useState<string | null>(null);
  const [target, setTarget] = useState<EditTarget | null>(null);
  const [started, setStarted] = useState('');
  const [ended, setEnded] = useState('');
  const [meal, setMeal] = useState('0');
  const [reason, setReason] = useState('');
  const [archiving, setArchiving] = useState<{ kind: 'shift' | 'job_timer'; id: string; who: string } | null>(null);
  const [archiveReason, setArchiveReason] = useState('');

  const live = useMemo(() => (data?.shifts ?? []).filter((s) => !s.archivedAt), [data]);
  const rows: WeekHours[] = useMemo(() => summarizeWeek(live, data?.timers ?? [], weekStart, now.getTime()), [live, data, weekStart, now]);
  const archived = useMemo(() => (data?.shifts ?? []).filter((s) => s.archivedAt), [data]);

  const totals = rows.reduce((a, r) => ({ reg: a.reg + r.regularMinutes, ot: a.ot + r.overtimeMinutes, all: a.all + r.totalMinutes, review: a.review + r.reviewCount }), { reg: 0, ot: 0, all: 0, review: 0 });

  const exportCsv = () => {
    const blob = new Blob([hoursCsv(rows, weekStart)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mechanic-hours-${format(weekStart, 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEdit = (t: EditTarget) => {
    setTarget(t);
    setStarted(localInput(t.startedAt));
    setEnded(localInput(t.endedAt));
    setMeal(String(t.mealMinutes ?? 0));
    setReason('');
  };

  const saveEdit = () => {
    if (!target) return;
    edit.mutate(
      { kind: target.kind, id: target.id, started: new Date(started).toISOString(), ended: new Date(ended).toISOString(), mealMinutes: target.kind === 'shift' ? Math.max(0, parseInt(meal, 10) || 0) : null, reason: reason.trim() },
      { onSuccess: () => { toast.success('Hours corrected. The old times are kept in the log.'); setTarget(null); }, onError: (e: any) => toast.error(e.message) },
    );
  };

  const jobName = (id: string) => data?.jobs.get(id) ?? 'A job';

  return (
    <div className="space-y-4">
      <PageHeader title="Mechanic hours" description="Pay comes from the shift clock. Overtime is hours over 40 in a Monday to Sunday week, paid at 1.5 times. Lunch is paid, so it is never taken out.">
          <Button variant="outline" size="icon" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="min-w-[210px] text-center text-sm font-semibold">{payWeekLabel(weekStart)}</div>
          <Button variant="outline" size="icon" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => setWeekStart(payWeekStart(new Date()))}>This week</Button>
          <Button variant="outline" className="gap-2" disabled={rows.length === 0} onClick={exportCsv}><Download className="h-4 w-4" />Export</Button>
        </PageHeader>
      <ShopNav />

      {isLoading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : data && !data.ready ? (
        <ShopEmpty title="The shift clock is not set up yet">Run the mechanic hours upgrade (docs/APPLY_MECHANIC.sql) and this report fills in.</ShopEmpty>
      ) : rows.length === 0 ? (
        <ShopEmpty title="No hours this week">When a mechanic clocks in, their time shows up here.</ShopEmpty>
      ) : (
        <>
          {totals.review > 0 && (
            <p className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {totals.review} {totals.review === 1 ? 'entry was' : 'entries were'} stopped automatically after running too long. Check them below: hourly pay will not be made until they are checked.
            </p>
          )}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mechanic</TableHead>
                  <TableHead className="text-right">Regular</TableHead>
                  <TableHead className="text-right">Overtime</TableHead>
                  <TableHead className="text-right">Total paid</TableHead>
                  <TableHead className="text-right">On jobs</TableHead>
                  <TableHead className="text-right">Not on a job</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const mine = live.filter((s) => s.userId === r.userId && paidShiftMinutes(s, weekStart, now.getTime()) > 0);
                  const theirTimers = (data?.timers ?? []).filter((t) => t.userId === r.userId);
                  const isOpen = open === r.userId;
                  return (
                    <Fragment key={r.userId}>
                      <TableRow className="cursor-pointer" onClick={() => setOpen(isOpen ? null : r.userId)}>
                        <TableCell className="font-medium">{r.userName ?? 'Unnamed'} {r.reviewCount > 0 && <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-300">{r.reviewCount} to check</Badge>}</TableCell>
                        <TableCell className="text-right tabular-nums">{hrs(r.regularMinutes)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.overtimeMinutes > 0 ? <span className="font-semibold text-amber-300">{hrs(r.overtimeMinutes)}</span> : '0.00'}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{hrs(r.totalMinutes)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{hrs(r.jobMinutes)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{hrs(r.unassignedMinutes)}</TableCell>
                        <TableCell className="w-8"><ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></TableCell>
                      </TableRow>
                      {isOpen && (
                        <TableRow>
                          <TableCell colSpan={7} className="bg-muted/30">
                            <div className="grid gap-6 py-2 lg:grid-cols-2">
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Shifts</p>
                                <ul className="space-y-2">
                                  {mine.map((s) => (
                                    <li key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                                      <span className="min-w-[150px]">
                                        {format(new Date(s.startedAt), 'EEE MMM d, h:mm a')} to {s.endedAt ? format(new Date(s.endedAt), 'h:mm a') : 'now'}
                                      </span>
                                      <span className="text-muted-foreground">{formatMinutes(paidShiftMinutes(s, weekStart, now.getTime()))} paid{s.mealMinutes > 0 ? ` · lunch ${s.mealMinutes}m (paid)` : ''}</span>
                                      {s.needsReview && <Badge variant="outline" className="border-amber-500/50 text-amber-300">{s.autoStopped ? 'Stopped automatically' : 'Check'}</Badge>}
                                      <span className="ml-auto flex gap-1">
                                        {s.needsReview && <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => review.mutate({ kind: 'shift', id: s.id, action: 'accept' }, { onSuccess: () => toast.success('Accepted as recorded'), onError: (e: any) => toast.error(e.message) })}><Check className="h-3.5 w-3.5" />Right as is</Button>}
                                        {s.endedAt && <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openEdit({ kind: 'shift', id: s.id, who: r.userName ?? 'Mechanic', startedAt: s.startedAt, endedAt: s.endedAt!, mealMinutes: s.mealMinutes })}><Pencil className="h-3.5 w-3.5" />Fix</Button>}
                                        {s.endedAt && <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" onClick={() => { setArchiving({ kind: 'shift', id: s.id, who: r.userName ?? 'Mechanic' }); setArchiveReason(''); }}><Trash2 className="h-3.5 w-3.5" />Archive</Button>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where the job hours went</p>
                                {r.byJob.length === 0 ? <p className="text-sm text-muted-foreground">No job timers this week.</p> : (
                                  <ul className="space-y-1 text-sm">
                                    {r.byJob.map((j) => <li key={j.workOrderId} className="flex justify-between gap-3"><span className="truncate">{jobName(j.workOrderId)}</span><span className="tabular-nums text-muted-foreground">{formatMinutes(j.minutes)}</span></li>)}
                                  </ul>
                                )}
                                {theirTimers.some((t) => t.needsReview) && (
                                  <div className="mt-3 space-y-2">
                                    {theirTimers.filter((t) => t.needsReview && t.endedAt).map((t) => (
                                      <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                                        <span>Job timer {format(new Date(t.startedAt), 'EEE h:mm a')} stopped automatically</span>
                                        <span className="ml-auto flex gap-1">
                                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => review.mutate({ kind: 'job_timer', id: t.id, action: 'accept' }, { onError: (e: any) => toast.error(e.message) })}><Check className="h-3.5 w-3.5" />Right as is</Button>
                                          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => openEdit({ kind: 'job_timer', id: t.id, who: r.userName ?? 'Mechanic', startedAt: t.startedAt, endedAt: t.endedAt!, mealMinutes: null })}><Pencil className="h-3.5 w-3.5" />Fix</Button>
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell>Everyone</TableCell>
                  <TableCell className="text-right tabular-nums">{hrs(totals.reg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{hrs(totals.ot)}</TableCell>
                  <TableCell className="text-right tabular-nums">{hrs(totals.all)}</TableCell>
                  <TableCell colSpan={3} />
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {archived.length > 0 && (
        <details className="rounded-lg border px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Archived entries ({archived.length})</summary>
          <ul className="mt-3 space-y-2">
            {archived.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <span>{s.userName ?? 'Mechanic'} · {format(new Date(s.startedAt), 'EEE MMM d, h:mm a')}</span>
                <Button size="sm" variant="outline" className="ml-auto h-8 gap-1" onClick={() => review.mutate({ kind: 'shift', id: s.id, action: 'restore', reason: 'Restored' }, { onSuccess: () => toast.success('Restored'), onError: (e: any) => toast.error(e.message) })}><ArchiveRestore className="h-3.5 w-3.5" />Restore</Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct {target?.kind === 'job_timer' ? 'a job timer' : 'a shift'} for {target?.who}</DialogTitle>
            <DialogDescription>The old times stay in the log with your reason. An entry cannot be longer than 24 hours.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Started</Label><Input type="datetime-local" value={started} onChange={(e) => setStarted(e.target.value)} /></div>
            <div><Label>Ended</Label><Input type="datetime-local" value={ended} onChange={(e) => setEnded(e.target.value)} /></div>
            {target?.kind === 'shift' && <div><Label>Lunch (minutes, paid)</Label><Input type="number" min={0} value={meal} onChange={(e) => setMeal(e.target.value)} /></div>}
          </div>
          <div><Label>Why is it being changed?</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Forgot to clock out, left at 5pm" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button disabled={reason.trim().length < 3 || !started || !ended || edit.isPending} onClick={saveEdit}>Save correction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive this shift for {archiving?.who}?</DialogTitle>
            <DialogDescription>It stops counting toward pay but is kept, and you can restore it.</DialogDescription>
          </DialogHeader>
          <div><Label>Why?</Label><Input value={archiveReason} onChange={(e) => setArchiveReason(e.target.value)} placeholder="Clocked in by mistake" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiving(null)}>Cancel</Button>
            <Button disabled={archiveReason.trim().length < 3 || review.isPending} onClick={() => archiving && review.mutate({ kind: archiving.kind, id: archiving.id, action: 'archive', reason: archiveReason.trim() }, { onSuccess: () => { toast.success('Archived'); setArchiving(null); }, onError: (e: any) => toast.error(e.message) })}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
