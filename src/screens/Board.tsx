import { useEffect, useMemo, useState } from 'react';
import { ask } from '../components/Confirm';
import { EventSheet } from '../components/EventSheet';
import { PrintView } from '../components/PrintView';
import { DayView, Legend, MonthView, WeekView } from '../components/Views';
import { Sheet, useApp } from '../components/ui';
import { loadEvent, loadPending, loadRequests, signOut } from '../lib/api';
import { eventColor, isMine, isMyTask, lastChange, needsAttention, sortByTime } from '../lib/board';
import { MONTHS, addDays, addMonths, dayTitle, monthGrid, monthTitle, shortDate, startOfWeek, todayIso } from '../lib/dates';
import type { EventDraft, EventRow, TaskRow } from '../lib/types';
import { useBoard } from '../lib/useBoard';
import { EventEditor, draftFrom, emptyDraft } from './EventEditor';
import { Inbox } from './Inbox';
import { People } from './People';

type View = 'month' | 'week' | 'day';
/** 'all', 'mine', or a department id. */
type Scope = string;

const stored = (k: string, fallback: string): string => {
  try { return localStorage.getItem(k) || fallback; } catch { return fallback; }
};
const store = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function rangeFor(view: View, date: string): [string, string] {
  if (view === 'month') { const g = monthGrid(date); return [g[0][0], g[g.length - 1][6]]; }
  if (view === 'week') { const s = startOfWeek(date); return [s, addDays(s, 6)]; }
  return [date, date];
}

function Title({ view, date }: { view: View; date: string }) {
  const year = <span className="mr-2 align-middle text-[15px] font-semibold text-muted">{date.slice(0, 4)}</span>;
  if (view === 'month') return <>{MONTHS[+date.slice(5, 7) - 1]}{year}</>;
  if (view === 'day') return <>{dayTitle(date).replace('יום ', '')}{year}</>;
  const s = startOfWeek(date), e = addDays(s, 4);
  const sameMonth = s.slice(5, 7) === e.slice(5, 7);
  return <>
    <span className="ltr-nums">{+s.slice(8)}—{+e.slice(8)}</span>{' '}
    {sameMonth ? `ב${MONTHS[+s.slice(5, 7) - 1]}` : `${MONTHS[+s.slice(5, 7) - 1]}–${MONTHS[+e.slice(5, 7) - 1]}`}{year}
  </>;
}

const seg = (on: boolean) => `px-3 py-1.5 text-[14px] sm:px-4 sm:py-2 sm:text-[15px] font-semibold transition ${on ? 'bg-control text-control-ink' : 'bg-surface text-ink hover:bg-surface-2'}`;
const ctl = 'inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-3 text-[14px] font-semibold hover:bg-surface-2 sm:h-11 sm:px-3.5 sm:text-[15px]';

export function Board() {
  const { me, departments } = useApp();
  const today = todayIso();
  const [view, setView] = useState<View>(() => stored('view', 'week') as View);
  const [scope, setScope] = useState<Scope>(() => stored('scope', me.departments.length && !me.is_admin ? 'mine' : 'all'));
  const [date, setDate] = useState(today);
  const [open, setOpen] = useState<{ event: EventRow; tasks: TaskRow[] } | null>(null);
  const [editor, setEditor] = useState<{ draft: EventDraft; status?: EventRow['status'] } | null>(null);
  const [panel, setPanel] = useState<'inbox' | 'people' | 'changes' | null>(null);
  const [print, setPrint] = useState<{ title: string; events: EventRow[]; tasksByEvent: Map<string, TaskRow[]> } | null>(null);
  const [inboxCount, setInboxCount] = useState(0);
  const seenKey = `changes-seen-${me.id}`;
  const [seenAt, setSeenAt] = useState(() => {
    const v = stored(seenKey, '');
    if (!v) store(seenKey, new Date().toISOString());
    return v ? Date.parse(v) : Date.now();
  });

  useEffect(() => store('view', view), [view]);
  useEffect(() => store('scope', scope), [scope]);

  const [from, to] = rangeFor(view, date);
  const board = useBoard(from, to);
  const soon = useBoard(today, addDays(today, 1));

  const matches = (e: EventRow) => {
    const tasks = board.tasksByEvent.get(e.id) ?? [];
    if (scope === 'all') return true;
    if (scope === 'mine') return isMine(e, tasks, me);
    return tasks.some(t => t.department_id === scope);
  };
  const visible = useMemo(() => board.events.filter(e => (e.status !== 'pending' || me.is_admin) && matches(e)),
    [board.events, board.tasksByEvent, scope, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const changed = useMemo(() => new Set(board.events
    .filter(e => e.status !== 'pending' && lastChange(e, board.tasksByEvent.get(e.id) ?? []) > seenAt)
    .map(e => e.id)), [board.events, board.tasksByEvent, seenAt]);
  const changedList = board.events.filter(e => changed.has(e.id))
    .sort((a, b) => lastChange(b, board.tasksByEvent.get(b.id) ?? []) - lastChange(a, board.tasksByEvent.get(a.id) ?? []));
  const markAllSeen = () => { const now = new Date().toISOString(); store(seenKey, now); setSeenAt(Date.parse(now)); setPanel(null); };

  const myAttention = needsAttention(soon.events, soon.tasksByEvent, today, t => isMyTask(t, me));
  const teamAttention = me.is_admin ? needsAttention(soon.events, soon.tasksByEvent, today) : [];

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
  const openEvent = (e: EventRow) => setOpen({ event: e, tasks: board.tasksByEvent.get(e.id) ?? [] });
  const scopeName = scope === 'all' ? '' : scope === 'mine' ? ` · ${me.name}` : ` · ${departments.find(d => d.id === scope)?.name ?? ''}`;
  const printTitle = view === 'month' ? monthTitle(date) : view === 'day' ? dayTitle(date)
    : `שבוע ${shortDate(startOfWeek(date))}–${shortDate(addDays(startOfWeek(date), 6))}`;
  const nowLabel = view === 'month' ? 'החודש' : view === 'week' ? 'השבוע' : 'היום';
  const inCurrent = from <= today && today <= to;

  const chips: { id: Scope; label: string; color?: string }[] = [
    { id: 'all', label: 'הכל' },
    ...(me.departments.length ? [{ id: 'mine', label: 'שלי' }] : []),
    ...departments.filter(d => d.id !== 'site').map(d => ({ id: d.id, label: d.name, color: d.color })),
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-[1500px] flex-col">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-bg/95 px-4 pb-3 backdrop-blur sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 pt-3">
          <h1 className="font-display min-w-0 flex-1 text-[26px] leading-tight font-extrabold text-balance sm:text-[38px]"><Title view={view} date={date} /></h1>

          <div className="flex flex-wrap items-center gap-2">
            {me.is_admin && (
              <button onClick={() => setPanel('inbox')} className={`${ctl} relative`}>
                ממתינים
                {inboxCount > 0 && <span className="absolute -left-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-danger px-1 text-[12px] font-bold text-white">{inboxCount}</span>}
              </button>
            )}
            <button onClick={() => setPanel('changes')} className={`${ctl} relative`}>
              שינויים
              {changed.size > 0 && <span className="absolute -left-2 -top-2 grid h-6 min-w-6 place-items-center rounded-full bg-primary px-1 text-[12px] font-bold text-white">{changed.size}</span>}
            </button>
            <button aria-label="הקודם" onClick={() => step(-1)} className={`${ctl} w-10 px-0 text-lg sm:w-11`}>›</button>
            <button onClick={() => setDate(today)} disabled={inCurrent} className={`${ctl} disabled:opacity-50`}>{nowLabel}</button>
            <button aria-label="הבא" onClick={() => step(1)} className={`${ctl} w-10 px-0 text-lg sm:w-11`}>‹</button>
            <div className="flex overflow-hidden rounded-xl border border-line">
              {(['day', 'week', 'month'] as View[]).map(v => (
                <button key={v} onClick={() => setView(v)} className={seg(view === v)}>{{ day: 'יום', week: 'שבוע', month: 'חודש' }[v]}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-[14px] text-muted">אני מ:</span>
            {chips.map(c => (
              <button key={c.id} onClick={() => setScope(c.id)}
                className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-semibold ${scope === c.id ? 'border-control bg-control text-control-ink' : 'border-line bg-surface hover:bg-surface-2'}`}>
                {c.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />}
                {c.label}
              </button>
            ))}
          </div>
          <div className="max-md:hidden"><Legend /></div>
        </div>
      </header>

      {(myAttention.length > 0 || (me.is_admin && teamAttention.length > 0)) && (
        <div className="flex flex-col gap-2 px-4 pt-4 sm:px-6">
          {myAttention.length > 0 && (
            <button onClick={() => setOpen({ event: myAttention[0].event, tasks: soon.tasksByEvent.get(myAttention[0].event.id) ?? [] })}
              className="rounded-lg border-2 border-primary bg-primary-soft px-4 py-3 text-right">
              <div className="font-bold text-primary-dark">{myAttention.length === 1 ? 'משימה אחת מחכה לאישור שלך' : `${myAttention.length} משימות מחכות לאישור שלך`}</div>
              <div className="text-[14px]">{myAttention.slice(0, 3).map(a => `${a.event.event_date === today ? 'היום' : 'מחר'}: ${a.event.title}`).join(' · ')}</div>
            </button>
          )}
          {me.is_admin && teamAttention.length > 0 && (
            <div className="rounded-lg bg-warning-soft px-4 py-2.5 text-[14px] text-warning">
              <b>{teamAttention.length} משימות להיום/מחר עוד לא אושרו:</b> {[...new Set(teamAttention.map(a => a.event.title))].slice(0, 4).join(', ')}
            </div>
          )}
        </div>
      )}
      {board.error && <div className="mx-4 mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">שגיאה בטעינה: {board.error}</div>}

      <main className={`flex-1 pt-5 ${me.is_admin ? 'pb-28' : 'pb-10'}`}>
        {board.loading && !board.events.length ? <p className="py-10 text-center text-muted">טוען…</p>
          : view === 'month' ? <MonthView date={date} events={visible} tasksByEvent={board.tasksByEvent} changed={changed} onOpen={openEvent} onPickDay={d => { setDate(d); setView('day'); }} />
          : view === 'week' ? <WeekView date={date} events={visible} tasksByEvent={board.tasksByEvent} changed={changed} onOpen={openEvent} />
          : <DayView date={date} events={visible} tasksByEvent={board.tasksByEvent} changed={changed} onOpen={openEvent} />}
        {scope !== 'all' && !visible.length && !board.loading && (
          <p className="px-6 text-center text-sm text-muted">מסונן לפי "{chips.find(c => c.id === scope)?.label}". <button className="font-bold text-primary" onClick={() => setScope('all')}>להצגת הכל</button></p>
        )}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 px-4 text-[14px] text-muted">
          <button onClick={() => setPrint({ title: `${printTitle}${scopeName}`, events: visible, tasksByEvent: board.tasksByEvent })} className={ctl}>הדפסה / PDF</button>
          {me.is_admin && <button onClick={() => setPanel('people')} className={ctl}>אנשים והרשאות</button>}
          <button onClick={async () => { if (await ask('להתנתק מהמכשיר הזה?', { ok: 'התנתקות' })) signOut().then(() => location.reload()); }} className={ctl}>התנתקות</button>
          <span className="md:hidden"><Legend /></span>
        </div>
      </main>

      {me.is_admin && (
        <div className="pb-safe pointer-events-none fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-[1500px] justify-start px-5 pb-5">
          <button className="pointer-events-auto h-14 rounded-full bg-control px-7 text-[16px] font-bold text-control-ink shadow-xl hover:opacity-90"
            onClick={() => setEditor({ draft: emptyDraft(view === 'day' ? date : today < from || today > to ? from : today) })}>+ אירוע חדש</button>
        </div>
      )}

      {open && !editor && (
        <EventSheet event={open.event} tasks={open.tasks} onClose={() => setOpen(null)} onChanged={refreshAll}
          onPrint={() => setPrint({ title: open.event.title, events: [open.event], tasksByEvent: new Map([[open.event.id, open.tasks]]) })}
          onEdit={() => setEditor({ draft: draftFrom(open.event, open.tasks), status: open.event.status })}
          onDuplicate={() => setEditor({ draft: { ...draftFrom(open.event, open.tasks, true), title: `${open.event.title} (עותק)` } })} />
      )}
      {editor && (
        <EventEditor initial={editor.draft} status={editor.status} onClose={() => setEditor(null)}
          onSaved={id => { setEditor(null); refreshAll(); openById(id); }} />
      )}
      {panel === 'inbox' && <Inbox onClose={() => { setPanel(null); refreshAll(); }} onOpenEvent={id => { setPanel(null); openById(id); }} />}
      {panel === 'people' && <People onClose={() => setPanel(null)} />}
      {panel === 'changes' && (
        <Sheet onClose={() => setPanel(null)} title="שינויים מאז הביקור הקודם">
          <div className="flex flex-col gap-2 p-4">
            {!changedList.length && <p className="py-8 text-center text-muted">אין שינויים חדשים בתקופה המוצגת</p>}
            {changedList.sort(sortByTime).map(e => (
              <button key={e.id} onClick={() => { setPanel(null); openEvent(e); }}
                className="flex items-center gap-3 rounded-lg border border-line p-3 text-right hover:bg-surface-2"
                style={{ borderInlineEndWidth: 4, borderInlineEndColor: eventColor(e) }}>
                <span className="ltr-nums w-12 shrink-0 font-bold">{shortDate(e.event_date)}</span>
                <span className="min-w-0 flex-1 font-semibold">{e.title}{e.status === 'cancelled' && <span className="text-danger"> · בוטל</span>}</span>
                <span className="text-xs text-muted">עודכן {new Date(lastChange(e, board.tasksByEvent.get(e.id) ?? [])).toLocaleString('he-IL', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </button>
            ))}
            {changedList.length > 0 && <button onClick={markAllSeen} className="mt-2 h-11 rounded-xl bg-control font-bold text-control-ink">סימון הכל כנקרא</button>}
          </div>
        </Sheet>
      )}
      {print && <PrintView title={print.title} events={print.events} tasksByEvent={print.tasksByEvent} onClose={() => setPrint(null)} />}
    </div>
  );
}
