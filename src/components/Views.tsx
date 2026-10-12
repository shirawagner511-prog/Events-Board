import { CATEGORY, TENTATIVE, closeEvents, eventColor, sortByTime } from '../lib/board';
import { WEEKDAYS, WEEKDAYS_LONG, addDays, hhmm, monthGrid, relativeDay, startOfWeek, todayIso, weekday } from '../lib/dates';
import type { EventRow, TaskRow } from '../lib/types';
import { EventCard } from './EventCard';

interface ViewProps {
  date: string;
  events: EventRow[];
  tasksByEvent: Map<string, TaskRow[]>;
  changed: Set<string>;
  onOpen: (e: EventRow) => void;
}

const byDay = (events: EventRow[]) => {
  const m = new Map<string, EventRow[]>();
  for (const e of [...events].sort(sortByTime)) m.set(e.event_date, [...(m.get(e.event_date) ?? []), e]);
  return m;
};

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
      {[...Object.values(CATEGORY), TENTATIVE].map(c => (
        <span key={c.label} className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[3px] border-2" style={{ borderColor: c.color, background: `color-mix(in oklab, ${c.color} 15%, var(--color-surface))` }} />
          {c.label}
        </span>
      ))}
    </div>
  );
}

/** Column / section heading: big day number, weekday, count. */
function DayHead({ day, count }: { day: string; count: number }) {
  const today = todayIso();
  const rel = relativeDay(day, today);
  const isToday = day === today;
  return (
    <div className="flex items-baseline gap-2 pb-3">
      <span className={`font-display text-[40px] leading-none font-extrabold ${isToday ? 'text-primary' : ''}`}>{+day.slice(8)}</span>
      <span className={`text-[17px] font-bold ${isToday ? 'text-primary' : ''}`}>{WEEKDAYS_LONG[weekday(day)]}{rel && rel !== 'אתמול' && <span> · {rel}</span>}</span>
      <span className="mr-auto text-[13px] text-muted">{count ? `${count} אירועים` : 'אין אירועים'}</span>
    </div>
  );
}

function DayColumn({ events, tasksByEvent, changed, onOpen }: { events: EventRow[] } & Omit<ViewProps, 'date' | 'events'>) {
  const close = closeEvents(events);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {events.map(e => <EventCard key={e.id} event={e} tasks={tasksByEvent.get(e.id) ?? []} close={close.has(e.id)} changed={changed.has(e.id)} onOpen={() => onOpen(e)} />)}
    </div>
  );
}

/** Desktop: day columns side by side. Phone: the same days stacked. */
export function WeekView({ date, events, tasksByEvent, changed, onOpen }: ViewProps) {
  const start = startOfWeek(date);
  const days = byDay(events);
  const all = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const shown = all.filter((d, i) => i < 5 || days.get(d)?.length);   // Fri/Sat only when something is on
  return (
    <div>
      <div className={`grid grid-cols-1 gap-6 lg:gap-0 ${shown.length === 7 ? 'lg:grid-cols-7' : shown.length === 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-5'}`}>
        {shown.map(d => {
          const list = days.get(d) ?? [];
          return (
            <section key={d} className={`min-w-0 px-4 lg:border-l lg:border-line lg:px-3 lg:last:border-l-0 ${!list.length ? 'max-lg:hidden' : ''}`}>
              <DayHead day={d} count={list.length} />
              <DayColumn events={list} tasksByEvent={tasksByEvent} changed={changed} onOpen={onOpen} />
            </section>
          );
        })}
      </div>
      {!shown.some(d => days.get(d)?.length) && <p className="py-16 text-center text-muted">אין אירועים השבוע</p>}
    </div>
  );
}

export function DayView({ date, events, tasksByEvent, changed, onOpen }: ViewProps) {
  const list = events.filter(e => e.event_date === date).sort(sortByTime);
  return (
    <section className="mx-auto max-w-2xl px-4">
      <DayHead day={date} count={list.length} />
      {list.length ? <DayColumn events={list} tasksByEvent={tasksByEvent} changed={changed} onOpen={onOpen} />
        : <p className="py-12 text-center text-muted">אין אירועים ביום הזה</p>}
    </section>
  );
}

export function MonthView({ date, events, onOpen, onPickDay }: ViewProps & { onPickDay: (d: string) => void }) {
  const today = todayIso();
  const days = byDay(events);
  const month = date.slice(0, 7);
  const grid = monthGrid(date);
  const weekend = grid.flat().some(d => weekday(d) >= 5 && days.get(d)?.length);
  const cols = weekend ? 7 : 5;
  const cells = grid.flatMap(w => w.slice(0, cols));
  const colCls = cols === 7 ? 'grid-cols-7' : 'grid-cols-5';
  return (
    <div className="px-2 sm:px-4">
      <div className={`grid ${colCls} text-center text-[13px] font-bold text-muted`}>
        {WEEKDAYS_LONG.slice(0, cols).map((w, i) => <div key={w} className="py-2"><span className="sm:hidden">{WEEKDAYS[i]}</span><span className="max-sm:hidden">{w}</span></div>)}
      </div>
      <div className={`grid ${colCls} gap-px overflow-hidden rounded-lg border border-line bg-line`}>
        {cells.map(d => {
          const list = days.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          return (
            <div key={d} onClick={() => onPickDay(d)}
              className={`flex min-h-24 cursor-pointer flex-col gap-1 p-1 sm:min-h-32 sm:p-1.5 ${out ? 'bg-surface-2/70' : 'bg-surface'}`}>
              <div className={`font-display text-[15px] font-extrabold sm:text-[18px] ${d === today ? 'text-primary' : out ? 'text-muted/60' : ''}`}>{+d.slice(8)}</div>
              {list.slice(0, 4).map(e => (
                <button key={e.id} onClick={ev => { ev.stopPropagation(); onOpen(e); }}
                  className={`line-clamp-2 rounded-[4px] px-1 py-0.5 text-right text-[10.5px] font-semibold leading-tight break-words sm:text-[12.5px] ${e.status === 'cancelled' ? 'line-through opacity-50' : ''}`}
                  style={{ background: `color-mix(in oklab, ${eventColor(e)} 15%, var(--color-surface))`, borderInlineEnd: `3px solid ${eventColor(e)}` }} title={e.title}>
                  {e.start_time && <span className="ltr-nums text-muted">{hhmm(e.start_time)} </span>}{e.title}
                </button>
              ))}
              {list.length > 4 && <span className="text-[11px] font-bold text-primary">+{list.length - 4} נוספים</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
