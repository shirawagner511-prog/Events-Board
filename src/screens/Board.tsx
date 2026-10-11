import { useEffect, useMemo, useState } from 'react';
import { loadEvent, loadPending, loadRequests, signOut } from '../lib/api';
import { isMine, isMyTask, needsAttention } from '../lib/board';
import { addDays, addMonths, dayTitle, monthGrid, monthTitle, shortDate, startOfWeek, todayIso } from '../lib/dates';
import type { EventDraft, EventRow, TaskRow } from '../lib/types';
import { useBoard } from '../lib/useBoard';
import { EventSheet } from '../components/EventSheet';
import { DayView, MonthView, WeekView } from '../components/Views';
import { Btn, useApp } from '../components/ui';
import { EventEditor, draftFrom, emptyDraft } from './EventEditor';
import { Inbox } from './Inbox';
import { People } from './People';

type View = 'month' | 'week' | 'day';
type Scope = 'mine' | 'all';

const stored = <T extends string>(k: string, fallback: T): T => {
  try { return (localStorage.getItem(k) as T) || fallback; } catch { return fallback; }
};
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function rangeFor(view: View, date: string): [string, string] {
  if (view === 'month') { const g = monthGrid(date); return [g[0][0], g[g.length - 1][6]]; }
  if (view === 'week') { const s = startOfWeek(date); return [s, addDays(s, 6)]; }
  return [date, date];
}

export function Board() {
  const { me } = useApp();
  const today = todayIso();
  const [view, setView] = useState<View>(() => stored('view', 'week'));
  const [scope, setScope] = useState<Scope>(() => stored('scope', me.departments.length && !me.is_admin ? 'mine' : 'all'));
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<{ event: EventRow; tasks: TaskRow[] } | null>(null);
  const [editor, setEditor] = useState<{ draft: EventDraft; status?: EventRow['status'] } | null>(null);
  const [panel, setPanel] = useState<'inbox' | 'people' | null>(null);
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => store('view', view), [view]);
  useEffect(() => store('scope', scope), [scope]);

  const [from, to] = rangeFor(view, date);
  const board = useBoard(from, to);
  const soon = useBoard(today, addDays(today, 1));

  const visible = useMemo(() => board.events.filter(e =>
    (e.status !== 'pending' || me.is_admin) && (scope === 'all' || isMine(e, board.tasksByEvent.get(e.id) ?? [], me))),
  [board.events, board.tasksByEvent, scope, me]);

  const myAttention = needsAttention(soon.events, soon.tasksByEvent, today, t => isMyTask(t, me));
  const teamAttention = me.is_admin ? needsAttention(soon.events, soon.tasksByEvent, today) : [];

  // Keep an open event in sync with live updates.
  useEffect(() => {
    if (!open) return;
    const e = board.events.find(x => x.id === open.event.id) ?? soon.events.find(x => x.id === open.event.id);
    if (e) setOpen({ event: e, tasks: (board.tasksByEvent.get(e.id) ?? soon.tasksByEvent.get(e.id)) ?? [] });
  }, [board.events, board.tasksByEvent, soon.events]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!me.is_admin) return;
    Promise.all([loadRequests(), loadPending()]).then(([r, p]) => setInboxCount(r.length + p.length)).catch(() => {});
  }, [me.is_admin, board.events]);

  async function openById(id: string) {
    const r = await loadEvent(id);
    if (r.event) { setOpen({ event: r.event, tasks: r.tasks }); setDate(r.event.event_date); }
  }
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('event');
    if (id) { openById(id); history.replaceState(null, '', location.pathname); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => { board.refresh(); soon.refresh(); };
  const step = (n: number) => setDate(d => (view === 'month' ? addMonths(d, n) : addDays(d, view === 'week' ? 7 * n : n)));
  const title = view === 'month' ? monthTitle(date) : view === 'week' ? `שבוע ${shortDate(startOfWeek(date))}–${shortDate(addDays(startOfWeek(date), 6))}` : dayTitle(date);

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 pt-2">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">שלום {me.name} 👋</div>
            <h1 className="truncate text-lg font-extrabold">לוח אירועים</h1>
          </div>
          {me.is_admin && (
            <>
              <button onClick={() => setPanel('inbox')} className="relative rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold">
                📥 ממתינים
                {inboxCount > 0 && <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] text-white">{inboxCount}</span>}
              </button>
              <button onClick={() => setPanel('people')} aria-label="אנשים" className="rounded-xl bg-surface-2 px-3 py-2 text-sm">👥</button>
            </>
          )}
          <button onClick={() => { if (confirm('להתנתק מהמכשיר הזה?')) signOut().then(() => location.reload()); }} aria-label="התנתקות" title="התנתקות" className="rounded-xl px-2 py-2 text-sm text-muted">🚪</button>
        </div>

        <div className="flex items-center gap-2 px-3 py-2">
          <div className="flex rounded-xl bg-surface-2 p-0.5 text-sm font-semibold">
            {(['mine', 'all'] as Scope[]).map(s => (
              <button key={s} onClick={() => setScope(s)} className={`rounded-lg px-3 py-1.5 ${scope === s ? 'bg-surface shadow-sm text-primary' : 'text-muted'}`}>{s === 'mine' ? 'שלי' : 'הכל'}</button>
            ))}
          </div>
          <div className="mr-auto flex rounded-xl bg-surface-2 p-0.5 text-sm font-semibold">
            {(['day', 'week', 'month'] as View[]).map(v => (
              <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1.5 ${view === v ? 'bg-surface shadow-sm text-primary' : 'text-muted'}`}>{{ day: 'יום', week: 'שבוע', month: 'חודש' }[v]}</button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 px-2 pb-2">
          <button aria-label="הקודם" onClick={() => step(-1)} className="grid h-9 w-9 place-items-center rounded-full text-xl hover:bg-surface-2">›</button>
          <div className="flex-1 text-center font-bold">{title}</div>
          {date !== today && <button onClick={() => setDate(today)} className="rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">היום</button>}
          <button aria-label="הבא" onClick={() => step(1)} className="grid h-9 w-9 place-items-center rounded-full text-xl hover:bg-surface-2">‹</button>
        </div>
      </header>

      {myAttention.length > 0 && (
        <button onClick={() => setOpen({ event: myAttention[0].event, tasks: soon.tasksByEvent.get(myAttention[0].event.id) ?? [] })}
          className="mx-3 mt-3 rounded-2xl bg-danger px-4 py-3 text-right text-white shadow-sm">
          <div className="font-bold">🔔 {myAttention.length === 1 ? 'משימה אחת מחכה לאישור שלך' : `${myAttention.length} משימות מחכות לאישור שלך`}</div>
          <div className="text-sm opacity-90">{myAttention.slice(0, 3).map(a => `${a.event.event_date === today ? 'היום' : 'מחר'}: ${a.event.title}`).join(' · ')}</div>
        </button>
      )}
      {me.is_admin && teamAttention.length > 0 && (
        <div className="mx-3 mt-3 rounded-2xl bg-warning-soft px-4 py-2 text-sm text-warning">
          ⏳ {teamAttention.length} משימות להיום/מחר עוד לא אושרו: {[...new Set(teamAttention.map(a => a.event.title))].slice(0, 3).join(', ')}
        </div>
      )}
      {board.error && <div className="mx-3 mt-3 rounded-xl bg-danger-soft p-3 text-sm text-danger">שגיאה בטעינה: {board.error}</div>}

      <main className={`flex-1 pt-3 ${me.is_admin ? 'pb-24' : 'pb-6'}`}>
        {board.loading && !board.events.length ? <p className="py-10 text-center text-muted">טוען…</p>
          : view === 'month' ? <MonthView date={date} events={visible} tasksByEvent={board.tasksByEvent} onOpen={e => setOpen({ event: e, tasks: board.tasksByEvent.get(e.id) ?? [] })} onPickDay={d => { setDate(d); setView('day'); }} />
          : view === 'week' ? <WeekView date={date} events={visible} tasksByEvent={board.tasksByEvent} onOpen={e => setOpen({ event: e, tasks: board.tasksByEvent.get(e.id) ?? [] })} />
          : <DayView date={date} events={visible} tasksByEvent={board.tasksByEvent} onOpen={e => setOpen({ event: e, tasks: board.tasksByEvent.get(e.id) ?? [] })} />}
        {scope === 'mine' && !visible.length && !board.loading && (
          <p className="px-6 text-center text-sm text-muted">מציג רק אירועים שקשורים אליך. <button className="font-bold text-primary" onClick={() => setScope('all')}>להצגת הכל</button></p>
        )}
      </main>

      {me.is_admin && (
        <div className="pb-safe pointer-events-none sticky bottom-0 flex justify-start px-4">
          <Btn className="pointer-events-auto h-14 rounded-full px-6 text-base shadow-lg" onClick={() => setEditor({ draft: emptyDraft(view === 'day' ? date : today < from || today > to ? from : today) })}>+ אירוע חדש</Btn>
        </div>
      )}

      {open && !editor && (
        <EventSheet event={open.event} tasks={open.tasks} onClose={() => setOpen(null)} onChanged={refreshAll}
          onEdit={() => setEditor({ draft: draftFrom(open.event, open.tasks), status: open.event.status })}
          onDuplicate={() => setEditor({ draft: { ...draftFrom(open.event, open.tasks, true), title: `${open.event.title} (עותק)` } })} />
      )}
      {editor && (
        <EventEditor initial={editor.draft} status={editor.status} onClose={() => setEditor(null)}
          onSaved={id => { setEditor(null); refreshAll(); openById(id); }} />
      )}
      {panel === 'inbox' && <Inbox onClose={() => { setPanel(null); refreshAll(); }} onOpenEvent={id => { setPanel(null); openById(id); }} />}
      {panel === 'people' && <People onClose={() => setPanel(null)} />}
    </div>
  );
}
