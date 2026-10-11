import { CATEGORY, isMyTask, taskState } from '../lib/board';
import type { EventRow, TaskRow } from '../lib/types';
import { StatusPill } from './EventSheet';
import { DeptBadge, Time, useApp } from './ui';

/** One event in the day / week lists: time, place, people, and each department's task at a glance. */
export function EventCard({ event: e, tasks, close, onOpen }: { event: EventRow; tasks: TaskRow[]; close?: boolean; onOpen: () => void }) {
  const { me } = useApp();
  const myOpen = tasks.filter(t => isMyTask(t, me) && ['new', 'updated'].includes(taskState(t, e)));
  return (
    <button onClick={onOpen}
      className={`block w-full rounded-2xl border bg-surface p-3 text-right shadow-sm transition active:scale-[.99] ${e.status === 'cancelled' ? 'opacity-55' : ''} ${e.tentative || e.status === 'pending' ? 'border-dashed border-muted/60' : 'border-line'}`}
      style={{ borderInlineStartWidth: 5, borderInlineStartColor: CATEGORY[e.category].color }}>
      <div className="flex items-start gap-3">
        <div className="w-14 shrink-0 text-center">
          <div className="text-lg font-extrabold leading-tight">{e.start_time ? <Time t={e.start_time} /> : '—'}</div>
          {e.prep_time && <div className="text-[11px] text-muted">יציאה <Time t={e.prep_time} /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`font-bold leading-tight ${e.status === 'cancelled' ? 'line-through' : ''}`}>{e.title}</span>
            <StatusPill e={e} />
            {myOpen.length > 0 && <span className="rounded-full bg-danger px-1.5 text-[11px] font-bold text-white">דורש אישור שלך</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
            {e.location && <span>📍 {e.location}</span>}
            {e.guests != null && <span>👥 {e.guests}</span>}
            {e.lead && <span>🚀 {e.lead}</span>}
          </div>
          {tasks.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tasks.map(t => {
                const s = taskState(t, e);
                return (
                  <span key={t.id} className="inline-flex items-center gap-0.5">
                    <DeptBadge id={t.department_id} small />
                    {e.status === 'published' && <span className="text-[11px]">{s === 'done' ? '✅' : s === 'seen' ? '👍' : s === 'updated' ? '🔄' : '⏳'}</span>}
                  </span>
                );
              })}
            </div>
          )}
          {close && <p className="mt-1 text-[12px] font-semibold text-warning">⏱️ צמוד לאירוע אחר באותו יום</p>}
        </div>
      </div>
    </button>
  );
}
