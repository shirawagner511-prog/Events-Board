// Loads the visible date range and keeps it live: any change by anyone triggers a refetch.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import { loadRange } from './api';
import type { EventRow, TaskRow } from './types';

export function useBoard(from: string, to: string) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const channelId = useId();
  const range = useRef({ from, to });
  range.current = { from, to };

  const refresh = useCallback(async () => {
    const { from: f, to: t } = range.current;
    try {
      const r = await loadRange(f, t);
      if (range.current.from !== f || range.current.to !== t) return; // a newer range is loading
      setEvents(r.events);
      setTasks(r.tasks);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setLoading(true); refresh(); }, [from, to, refresh]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const soon = () => { clearTimeout(timer); timer = setTimeout(refresh, 250); };
    const channel = supabase
      .channel(`board-${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_tasks' }, soon)
      .subscribe();
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onFocus);
    return () => { clearTimeout(timer); supabase.removeChannel(channel); document.removeEventListener('visibilitychange', onFocus); };
  }, [refresh, channelId]);

  const tasksByEvent = useMemo(() => {
    const m = new Map<string, TaskRow[]>();
    for (const t of tasks) m.set(t.event_id, [...(m.get(t.event_id) ?? []), t]);
    return m;
  }, [tasks]);

  return { events, tasks, tasksByEvent, loading, error, refresh };
}
