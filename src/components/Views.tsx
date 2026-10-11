import { CATEGORY, closeEvents, sortByTime } from '../lib/board';
import { WEEKDAYS, addDays, dayTitle, hhmm, monthGrid, relativeDay, startOfWeek, todayIso, weekday } from '../lib/dates';
import type { EventRow, TaskRow } from '../lib/types';
import { EventCard } from './EventCard';
import { Empty } from './ui';

interface ViewProps {
  date: string;
  events: EventRow[];
  tasksByEvent: Map<string, TaskRow[]>;
  onOpen: (e: EventRow) => void;
}

const byDay = (events: EventRow[]) => {
  const m = new Map<string, EventRow[]>();
  for (const e of [...events].sort(sortByTime)) m.set(e.event_date, [...(m.get(e.event_date) ?? []), e]);
  return m;
};

export function MonthView({ date, events, onOpen, onPickDay }: ViewProps & { onPickDay: (d: string) => void }) {
  const today = todayIso();
  const days = byDay(events);
  const month = date.slice(0, 7);
  // The site works Sunday–Thursday: show Friday/Saturday only when something is on.
  const grid = monthGrid(date);
  const weekend = grid.flat().some(d => weekday(d) >= 5 && days.get(d)?.length);
  const cols = weekend ? 7 : 5;
  const cells = grid.flatMap(w => w.slice(0, cols));
  return (
    <div className="px-2 pb-4">
      <div className={`grid text-center text-xs font-bold text-muted ${cols === 7 ? 'grid-cols-7' : 'grid-cols-5'}`}>
        {WEEKDAYS.slice(0, cols).map(w => <div key={w} className="py-1.5">{w}</div>)}
      </div>
      <div className={`grid gap-1 ${cols === 7 ? 'grid-cols-7' : 'grid-cols-5'}`}>
        {cells.map(d => {
          const list = days.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          const isWeekend = weekday(d) >= 5;
          return (
            <div key={d} onClick={() => onPickDay(d)}
              className={`flex min-h-24 cursor-pointer flex-col rounded-lg border p-1 sm:min-h-28 ${out ? 'border-transparent bg-transparent opacity-40' : isWeekend ? 'border-line bg-surface-2/60' : 'border-line bg-surface'} ${d === today ? 'ring-2 ring-primary' : ''}`}>
              <div className={`mb-0.5 text-xs font-bold ${d === today ? 'text-primary' : 'text-muted'}`}>{+d.slice(8)}</div>
              <div className="flex flex-col gap-0.5">
                {list.slice(0, 3).map(e => (
                  <button key={e.id} onClick={ev => { ev.stopPropagation(); onOpen(e); }}
                    className={`line-clamp-2 rounded px-1 py-0.5 text-right text-[10.5px] font-semibold leading-tight break-words text-white sm:text-xs ${e.status === 'cancelled' ? 'line-through opacity-50' : ''} ${e.tentative || e.status === 'pending' ? 'opacity-70 outline-1 outline-dashed outline-white' : ''}`}
                    style={{ background: CATEGORY[e.category].color }} title={e.title}>
                    {e.start_time && <span className="ltr ml-0.5 opacity-90">{hhmm(e.start_time)}</span>} {e.title}
                  </button>
                ))}
                {list.length > 3 && <span className="text-[10.5px] font-bold text-primary">+{list.length - 3} נוספים</span>}
              </div>
            </div>
          );
        })}
      </div>
      <Legend />
    </div>
  );
}

export function Legend() {
  return (
    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted">
      {Object.values(CATEGORY).map(c => (
        <span key={c.label} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} />{c.label}</span>
      ))}
      <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-muted" />לא סגור / טיוטה</span>
    </div>
  );
}

function DayBlock({ day, events, tasksByEvent, onOpen, showEmpty }: { day: string; showEmpty?: boolean } & Omit<ViewProps, 'date'>) {
  const today = todayIso();
  const rel = relativeDay(day, today);
  const close = closeEvents(events);
  if (!events.length && !showEmpty) return null;
  return (
    <section className="mb-4">
      <h2 className={`sticky top-0 z-10 -mx-3 mb-2 bg-bg/95 px-3 py-1.5 text-sm font-bold backdrop-blur ${day === today ? 'text-primary' : ''}`}>
        {rel && <span className="ml-1.5 rounded-full bg-primary px-2 py-0.5 text-xs text-white">{rel}</span>}
        {dayTitle(day)}
        <span className="mr-2 text-xs font-normal text-muted">{events.length ? `${events.length} אירועים` : ''}</span>
      </h2>
      {events.length
        ? <div className="space-y-2">{events.map(e => <EventCard key={e.id} event={e} tasks={tasksByEvent.get(e.id) ?? []} close={close.has(e.id)} onOpen={() => onOpen(e)} />)}</div>
        : <p className="py-4 text-center text-sm text-muted">אין אירועים</p>}
    </section>
  );
}

export function WeekView({ date, events, tasksByEvent, onOpen }: ViewProps) {
  const start = startOfWeek(date);
  const days = byDay(events);
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  if (!week.some(d => days.get(d)?.length)) return <Empty>אין אירועים השבוע 🎉</Empty>;
  return <div className="px-3 pb-6">{week.map(d => <DayBlock key={d} day={d} events={days.get(d) ?? []} tasksByEvent={tasksByEvent} onOpen={onOpen} />)}</div>;
}

export function DayView({ date, events, tasksByEvent, onOpen }: ViewProps) {
  const list = events.filter(e => e.event_date === date).sort(sortByTime);
  return <div className="px-3 pb-6"><DayBlock day={date} events={list} tasksByEvent={tasksByEvent} onOpen={onOpen} showEmpty /></div>;
}
