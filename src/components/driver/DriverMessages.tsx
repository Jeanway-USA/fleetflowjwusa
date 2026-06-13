import { useEffect, useMemo, useRef, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Send, Loader2, ArrowLeft } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { safeChannel } from '@/lib/safe-channel';

interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

interface ProfileLite {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface Thread {
  counterpartId: string;
  name: string;
  lastMessage: Message;
  unread: number;
}

function counterpartName(p?: ProfileLite | null): string {
  if (!p) return 'Dispatch';
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
  return full || p.email || 'Dispatch';
}

export function DriverMessages() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const me = user?.id ?? null;

  const [open, setOpen] = useState(false);
  const [activeCounterpart, setActiveCounterpart] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // ---------- Unread badge count ----------
  const unreadQueryKey = useMemo(() => ['driver-msgs-unread', me], [me]);
  const { data: unreadCount = 0 } = useQuery({
    queryKey: unreadQueryKey,
    enabled: !!me,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!me) return 0;
      const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', me)
        .eq('is_read', false);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ---------- Threads list ----------
  const threadsKey = useMemo(() => ['driver-msgs-threads', me], [me]);
  const { data: threads = [], isLoading: threadsLoading } = useQuery({
    queryKey: threadsKey,
    enabled: open && !!me,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Thread[]> => {
      if (!me) return [];
      const { data: msgs, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (msgs ?? []) as Message[];

      const byCounterpart = new Map<string, { last: Message; unread: number }>();
      for (const m of rows) {
        const cp = m.sender_id === me ? m.receiver_id : m.sender_id;
        const entry = byCounterpart.get(cp);
        if (!entry) {
          byCounterpart.set(cp, {
            last: m,
            unread: m.receiver_id === me && !m.is_read ? 1 : 0,
          });
        } else if (m.receiver_id === me && !m.is_read) {
          entry.unread += 1;
        }
      }

      const counterpartIds = Array.from(byCounterpart.keys());
      let profiles: ProfileLite[] = [];
      if (counterpartIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('user_id, first_name, last_name, email')
          .in('user_id', counterpartIds);
        profiles = (profs ?? []) as ProfileLite[];
      }
      const profMap = new Map(profiles.map((p) => [p.user_id, p]));

      return counterpartIds
        .map((cp) => {
          const entry = byCounterpart.get(cp)!;
          return {
            counterpartId: cp,
            name: counterpartName(profMap.get(cp)),
            lastMessage: entry.last,
            unread: entry.unread,
          };
        })
        .sort((a, b) => b.lastMessage.created_at.localeCompare(a.lastMessage.created_at));
    },
  });

  // ---------- Active thread messages ----------
  const threadKey = useMemo(
    () => ['driver-msgs-thread', me, activeCounterpart],
    [me, activeCounterpart],
  );
  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: threadKey,
    enabled: open && !!me && !!activeCounterpart,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Message[]> => {
      if (!me || !activeCounterpart) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .or(
          `and(sender_id.eq.${me},receiver_id.eq.${activeCounterpart}),and(sender_id.eq.${activeCounterpart},receiver_id.eq.${me})`,
        )
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  const activeThread = threads.find((t) => t.counterpartId === activeCounterpart);

  // Auto-scroll
  useEffect(() => {
    if (!open || !activeCounterpart) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, activeCounterpart]);

  // Mark active thread incoming messages as read
  useEffect(() => {
    if (!open || !me || !activeCounterpart) return;
    const unread = messages.filter(
      (m) => m.receiver_id === me && m.sender_id === activeCounterpart && !m.is_read,
    );
    if (unread.length === 0) return;
    supabase
      .from('messages')
      .update({ is_read: true })
      .in(
        'id',
        unread.map((m) => m.id),
      )
      .then(({ error }) => {
        if (error) {
          console.error('Failed to mark messages read', error);
          return;
        }
        queryClient.invalidateQueries({ queryKey: unreadQueryKey });
        queryClient.invalidateQueries({ queryKey: threadsKey });
      });
  }, [messages, open, me, activeCounterpart, queryClient, unreadQueryKey, threadsKey]);

  // ---------- Realtime ----------
  useEffect(() => {
    if (!me) return;
    return safeChannel(`driver-msgs-${me}`, (ch) =>
      ch.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `receiver_id=eq.${me}`,
        },
        (payload) => {
          const m = payload.new as Message;
          queryClient.invalidateQueries({ queryKey: unreadQueryKey });
          queryClient.invalidateQueries({ queryKey: threadsKey });
          if (open && activeCounterpart && m.sender_id === activeCounterpart) {
            queryClient.setQueryData<Message[]>(threadKey, (prev = []) =>
              prev.some((x) => x.id === m.id) ? prev : [...prev, m],
            );
          }
        },
      ),
    );
  }, [me, open, activeCounterpart, queryClient, unreadQueryKey, threadsKey, threadKey]);

  // ---------- Send ----------
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!me || !activeCounterpart) throw new Error('Pick a conversation first');
      const { data, error } = await supabase
        .from('messages')
        .insert({ sender_id: me, receiver_id: activeCounterpart, content } as any)
        .select('id, sender_id, receiver_id, content, is_read, created_at')
        .single();
      if (error) throw error;
      return data as Message;
    },
    onSuccess: (m) => {
      queryClient.setQueryData<Message[]>(threadKey, (prev = []) =>
        prev.some((x) => x.id === m.id) ? prev : [...prev, m],
      );
      queryClient.invalidateQueries({ queryKey: threadsKey });
      setDraft('');
    },
    onError: (err: any) => toast.error(err?.message || 'Failed to send message'),
  });

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 relative"
        onClick={() => setOpen(true)}
        aria-label="Messages"
      >
        <MessageSquare className="h-4 w-4" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[10px] leading-none rounded-full flex items-center justify-center"
          >
            {badgeLabel}
          </Badge>
        )}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setActiveCounterpart(null);
        }}
      >
        <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0 overflow-hidden">
          <SheetHeader className="px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              {activeCounterpart && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 -ml-2"
                  onClick={() => setActiveCounterpart(null)}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div className="min-w-0">
                <SheetTitle className="text-base leading-tight truncate">
                  {activeThread ? activeThread.name : 'Messages'}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {activeCounterpart ? 'Dispatch' : 'Your conversations'}
                </p>
              </div>
            </div>
          </SheetHeader>

          {/* List vs Thread */}
          {!activeCounterpart ? (
            <div className="flex-1 overflow-y-auto">
              {threadsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : threads.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-12 px-6">
                  No messages yet. Dispatch will reach out here.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {threads.map((t) => (
                    <li key={t.counterpartId}>
                      <button
                        type="button"
                        onClick={() => setActiveCounterpart(t.counterpartId)}
                        className="w-full text-left px-5 py-3 hover:bg-muted/60 transition flex items-start gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-sm truncate">{t.name}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {formatDistanceToNow(new Date(t.lastMessage.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {t.lastMessage.sender_id === me ? 'You: ' : ''}
                            {t.lastMessage.content}
                          </p>
                        </div>
                        {t.unread > 0 && (
                          <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px]">
                            {t.unread}
                          </Badge>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {messagesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-12">
                    No messages yet.
                  </div>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === me;
                    return (
                      <div key={m.id} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                        <div
                          className={cn(
                            'max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap break-words',
                            mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
                          )}
                        >
                          {m.content}
                        </div>
                        <span className="text-[10px] text-muted-foreground mt-1 px-1">
                          {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="border-t border-border p-3 bg-background">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message…"
                    disabled={sendMutation.isPending}
                    rows={1}
                    className="min-h-[44px] max-h-32 resize-none pl-4 sm:pl-3"
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-11 w-11 shrink-0"
                    onClick={handleSend}
                    disabled={!draft.trim() || sendMutation.isPending}
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
