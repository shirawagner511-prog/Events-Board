import { eventColor, eventTint, isMyTask, taskState } from '../lib/board';
import { hhmm } from '../lib/dates';
import type { EventRow, TaskRow } from '../lib/types';
import { useApp } from './ui';

/** One event on the board, in the style of the weekly paper board: tinted card, side stripe, tasks as ★ lines. */
export function EventCard({ event: e, tasks, close, changed, onOpen }: {
  event: EventRow; tasks: TaskRow[]; close?: boolean; changed?: boolean; onOpen: () => void;
}) {
  const { me, dept } = useApp();
  const color = eventColor(e);
  const myOpen = tasks.some(t => isMyTask(t, me) && ['new', 'updated'].includes(taskState(t, e)));
  const meta = [
    e.start_time && `התחלה: ${hhmm(e.start_time)}`,
    e.prep_time && `יציאה: ${hhmm(e.prep_time)}`,
    e.location,
  ].filter(Boolean) as string[];
  const menu = (e.menu ?? '').split('\n').filter(Boolean);

  return (
    <button onClick={onOpen}
      className={`block w-full rounded-lg p-3.5 text-right transition hover:brightness-[.98] focus-visible:outline-2 focus-visible:outline-primary active:scale-[.995] ${e.status === 'cancelled' ? 'opacity-50' : ''} ${myOpen ? 'ring-2 ring-primary' : ''}`}
      style={{ background: eventTint(e), borderInlineEnd: `5px solid ${color}` }}>
      {(e.tentative || e.status !== 'published' || changed || myOpen) && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {e.status === 'pending' && <Badge cls="bg-warning text-white">טיוטה</Badge>}
          {e.status === 'cancelled' && <Badge cls="bg-danger text-white">בוטל</Badge>}
          {e.tentative && e.status !== 'cancelled' && <Badge cls="bg-[#6b7080] text-white">לא סגור</Badge>}
          {changed && <Badge cls="bg-primary text-white">עודכן</Badge>}
          {myOpen && <Badge cls="border border-primary text-primary">מחכה לאישור שלך</Badge>}
        </div>
      )}
      <div className={`font-display text-[17px] font-bold leading-snug text-balance ${e.status === 'cancelled' ? 'line-through' : ''}`}>{e.title}</div>
      {meta.length > 0 && <div className="mt-0.5 text-[13.5px] text-muted"><span className="ltr-nums">{meta.join(' | ')}</span></div>}
      {menu.length > 0 && (
        <div className="mt-1.5 text-[14px] leading-relaxed">
          {menu.slice(0, 3).map((m, i) => <div key={i}>{m}</div>)}
          {menu.length > 3 && <div className="text-muted">ועוד {menu.length - 3}…</div>}
        </div>
      )}
      {(e.lead || e.guests != null || e.paid_staff) && (
        <div className="mt-1.5 text-[13.5px]">
          {e.guests != null && <div>{e.guests} איש</div>}
          {e.lead && <div>מוציא: {e.lead}</div>}
          {!!e.paid_staff && <div className="font-semibold">עובדי תפעול בתשלום: {e.paid_staff}</div>}
        </div>
      )}
      {tasks.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[14px] leading-snug">
          {tasks.map(t => {
            const d = dept(t.department_id);
            const s = taskState(t, e);
            return (
              <li key={t.id} className="flex gap-1.5">
                <span aria-hidden style={{ color: d?.color }}>★</span>
                <span className="min-w-0">
                  <b>{d?.name ?? t.department_id}:</b> {t.description}
                  {e.status === 'published' && (s === 'done' ? <span className="text-success"> · בוצע</span> : s === 'seen' ? <span className="text-muted"> · אושר</span> : null)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {close && <p className="mt-2 text-[12.5px] font-bold" style={{ color }}>צמוד לאירוע אחר באותו יום</p>}
    </button>
  );
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11.5px] font-bold leading-none ${cls}`}>{children}</span>;
}
