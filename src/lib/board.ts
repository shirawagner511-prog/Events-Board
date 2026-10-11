// Pure view logic over the loaded board: what is mine, what needs attention, what overlaps.
import type { EventRow, Me, TaskRow } from './types';
import { addDays, hhmm } from './dates';

export type TaskState = 'new' | 'updated' | 'seen' | 'done';

/** "updated" = the event or the task text changed after the department last confirmed it. */
export function taskState(t: TaskRow, e: Pick<EventRow, 'content_updated_at'>): TaskState {
  if (t.done_at) return 'done';
  if (!t.seen_at) return 'new';
  const changed = Math.max(Date.parse(e.content_updated_at), Date.parse(t.content_updated_at));
  return changed > Date.parse(t.seen_at) ? 'updated' : 'seen';
}

export const isMyTask = (t: TaskRow, me: Me) => me.departments.includes(t.department_id);

export function isMine(e: EventRow, tasks: TaskRow[], me: Me): boolean {
  if (tasks.some(t => isMyTask(t, me))) return true;
  const n = me.name.trim();
  return !!n && [e.lead, e.teardown].some(v => v?.includes(n));
}

export interface Attention { event: EventRow; task: TaskRow; state: TaskState }

/** Tasks for today/tomorrow (published events) that their department has not confirmed. */
export function needsAttention(events: EventRow[], tasksByEvent: Map<string, TaskRow[]>, today: string, filter?: (t: TaskRow) => boolean): Attention[] {
  const horizon = addDays(today, 1);
  const out: Attention[] = [];
  for (const e of events) {
    if (e.status !== 'published' || e.event_date < today || e.event_date > horizon) continue;
    for (const t of tasksByEvent.get(e.id) ?? []) {
      if (filter && !filter(t)) continue;
      const s = taskState(t, e);
      if (s === 'new' || s === 'updated') out.push({ event: e, task: t, state: s });
    }
  }
  return out.sort((a, b) => (a.event.event_date + hhmm(a.event.start_time)).localeCompare(b.event.event_date + hhmm(b.event.start_time)));
}

const minutes = (t: string | null) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : null);

/** Ids of same-day events whose busy windows (prep → end, or start+2h) overlap or sit within 30 minutes. */
export function closeEvents(dayEvents: EventRow[]): Set<string> {
  const spans = dayEvents
    .filter(e => e.status !== 'cancelled')
    .map(e => {
      const s = minutes(e.prep_time) ?? minutes(e.start_time);
      if (s === null) return null;
      const end = minutes(e.end_time) ?? (minutes(e.start_time) ?? s) + 120;
      return { id: e.id, s, end };
    })
    .filter((x): x is { id: string; s: number; end: number } => !!x)
    .sort((a, b) => a.s - b.s);
  const hit = new Set<string>();
  for (let i = 0; i < spans.length; i++)
    for (let j = i + 1; j < spans.length && spans[j].s < spans[i].end + 30; j++) {
      hit.add(spans[i].id); hit.add(spans[j].id);
    }
  return hit;
}

export function sortByTime(a: EventRow, b: EventRow): number {
  return (a.event_date + (hhmm(a.start_time) || '99')).localeCompare(b.event_date + (hhmm(b.start_time) || '99'));
}

export const CATEGORY: Record<EventRow['category'], { label: string; color: string }> = {
  events:  { label: 'אירועים - יהלי', color: '#8b5cf6' },
  kitchen: { label: 'אירועים - מטבח', color: '#ef4444' },
  welfare: { label: 'אירועים - רווחה', color: '#10b981' },
  cafe:    { label: 'אירועים - קפה',  color: '#f59e0b' },
};
