import { useEffect, useRef, useState } from 'react';
import { deleteFile, listFiles, parseMessage, saveEvent, setStatus, syncInvites, uploadFile } from '../lib/api';
import { fileKind, fileSize } from '../components/Files';
import { CATEGORY } from '../lib/board';
import { invitesNote, toast } from '../lib/toast';
import { hhmm, todayIso } from '../lib/dates';
import type { EventDraft, EventFile, EventRow, TaskRow } from '../lib/types';
import { MAX_FILE_MB } from '../lib/types';
import { Btn, Sheet, useApp } from '../components/ui';

export function emptyDraft(date = todayIso()): EventDraft {
  return {
    title: '', event_date: date, start_time: '', end_time: '', prep_time: '', location: '', guests: '', menu: '',
    requester: '', lead: '', teardown: '', suppliers: '', paid_staff: '', notes: '', category: 'events', tentative: false, tasks: [],
  };
}

export function draftFrom(e: EventRow, tasks: TaskRow[], copy = false): EventDraft {
  const s = (v: string | number | null) => (v === null ? '' : String(v));
  return {
    id: copy ? undefined : e.id,
    title: e.title, event_date: e.event_date, start_time: hhmm(e.start_time), end_time: hhmm(e.end_time),
    prep_time: hhmm(e.prep_time), location: s(e.location), guests: s(e.guests), menu: s(e.menu),
    requester: s(e.requester), lead: s(e.lead), teardown: s(e.teardown), suppliers: s(e.suppliers), paid_staff: s(e.paid_staff), notes: s(e.notes),
    category: e.category, tentative: e.tentative,
    tasks: tasks.map(t => ({ id: copy ? undefined : t.id, department_id: t.department_id, description: t.description })),
  };
}

const input = 'w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20';

function F({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`block ${wide ? 'col-span-2' : ''}`}><span className="mb-1 block text-xs font-semibold text-muted">{label}</span>{children}</label>;
}

export function EventEditor({ initial, status, onClose, onSaved }: {
  initial: EventDraft; status?: EventRow['status']; onClose: () => void; onSaved: (id: string) => void;
}) {
  const { departments } = useApp();
  const [d, setD] = useState<EventDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [paste, setPaste] = useState<string | null>(initial.id ? null : '');
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [files, setFiles] = useState<EventFile[]>([]);
  const [removed, setRemoved] = useState<EventFile[]>([]);
  const [added, setAdded] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initial.id) listFiles(initial.id).then(setFiles).catch(() => {}); }, [initial.id]);
  const set = <K extends keyof EventDraft>(k: K) => (v: EventDraft[K]) => setD(x => ({ ...x, [k]: v }));
  const text = (k: keyof EventDraft) => ({ value: d[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(k)(e.target.value as never) });

  async function fromMessage() {
    if (!paste?.trim()) return;
    setBusy(true); setErr(null);
    try {
      const r = await parseMessage(paste);
      const { uncertain: u, ...fields } = r;
      setD(x => ({ ...x, ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length))) }));
      setUncertain(u ?? []);
      setPaste(null);
    } catch (e) { setErr(`לא הצלחתי לקרוא את ההודעה: ${(e as Error).message}`); } finally { setBusy(false); }
  }

  async function save(publish: boolean) {
    if (!d.title.trim() || !d.event_date) { setErr('חסר שם אירוע או תאריך'); return; }
    setBusy(true); setErr(null);
    try {
      const id = await saveEvent(d);
      for (const f of removed) await deleteFile(f);
      for (const f of added) await uploadFile(id, f);
      if (publish && status !== 'published') await setStatus(id, 'published');
      if (publish || status === 'published') {
        const note = invitesNote(await syncInvites(id));
        if (note) toast(note);
      }
      onSaved(id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  const tasks = d.tasks;
  const setTask = (i: number, patch: Partial<EventDraft['tasks'][number]>) => set('tasks')(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const live = status === 'published';

  return (
    <Sheet full onClose={onClose} title={d.id ? 'עריכת אירוע' : 'אירוע חדש'}>
      <div className="space-y-5 p-4 pb-28">
        {paste !== null && (
          <div className="rounded-2xl border border-primary/30 bg-primary-soft/50 p-3">
            <p className="mb-2 text-sm font-semibold">הדביקי הודעה מוואטסאפ או מייל ואמלא את הפרטים</p>
            <textarea className={`${input} min-h-28`} placeholder="לדוגמה: היי יהלי, ביום שלישי ב-16:00 הרמת כוסית לצוות R&D, 60 איש, מרפסת קומה 5…" value={paste} onChange={e => setPaste(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <Btn disabled={busy || !paste.trim()} onClick={fromMessage}>{busy ? 'קורא…' : 'מילוי אוטומטי'}</Btn>
              <Btn kind="ghost" onClick={() => setPaste(null)}>אמלא ידנית</Btn>
            </div>
          </div>
        )}
        {uncertain.length > 0 && (
          <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning">כדאי לבדוק: {uncertain.join(' · ')}</div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <F label="שם האירוע *" wide><input className={input} {...text('title')} /></F>
          <F label="תאריך *"><input type="date" className={input} {...text('event_date')} /></F>
          <F label="כמות אנשים"><input inputMode="numeric" className={input} {...text('guests')} /></F>
          <F label="שעת יציאה / היערכות"><input type="time" className={input} {...text('prep_time')} /></F>
          <F label="שעת התחלה"><input type="time" className={input} {...text('start_time')} /></F>
          <F label="שעת סיום"><input type="time" className={input} {...text('end_time')} /></F>
          <F label="מקום"><input className={input} {...text('location')} /></F>
          <F label="מוציא"><input className={input} {...text('lead')} /></F>
          <F label="מקפל"><input className={input} {...text('teardown')} /></F>
          <F label="תפריט" wide><textarea rows={4} className={input} {...text('menu')} /></F>
          <F label="ספקי חוץ"><input className={input} {...text('suppliers')} /></F>
          <F label="מזמין"><input className={input} {...text('requester')} /></F>
          <F label="הערות מיוחדות" wide><textarea rows={2} className={input} {...text('notes')} /></F>
        </div>

        <div className="rounded-xl border border-line p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input id="paid-staff-toggle" type="checkbox" className="h-4 w-4 accent-primary" checked={+d.paid_staff > 0}
              onChange={e => set('paid_staff')(e.target.checked ? '1' : '')} />
            לקחתי עובד תפעול בתשלום
          </label>
          {+d.paid_staff > 0 && (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm text-muted">כמה עובדים?</span>
              <div className="flex items-center rounded-xl border border-line">
                <button type="button" aria-label="פחות" className="h-10 w-10 text-lg" onClick={() => set('paid_staff')(String(Math.max(1, +d.paid_staff - 1)))}>−</button>
                <input id="paid-staff-count" inputMode="numeric" className="w-12 bg-transparent text-center text-lg font-bold outline-none" value={d.paid_staff}
                  onChange={e => set('paid_staff')(e.target.value.replace(/\D/g, ''))} />
                <button type="button" aria-label="יותר" className="h-10 w-10 text-lg" onClick={() => set('paid_staff')(String(+d.paid_staff + 1))}>+</button>
              </div>
            </div>
          )}
        </div>

        <div>
          <span className="mb-1 block text-xs font-semibold text-muted">סוג (צבע בלוח)</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).map(c => (
              <button key={c} type="button" onClick={() => set('category')(c)}
                className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${d.category === c ? 'text-white' : 'bg-surface'}`}
                style={{ borderColor: CATEGORY[c].color, background: d.category === c ? CATEGORY[c].color : undefined, color: d.category === c ? undefined : CATEGORY[c].color }}>
                {CATEGORY[c].label.replace('אירועים - ', '')}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.tentative} onChange={e => set('tentative')(e.target.checked)} className="h-4 w-4 accent-primary" />
            אירוע לא סגור (עדיין בבירור)
          </label>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold">משימות לפי מחלקה</h3>
          <div className="space-y-2">
            {tasks.map((t, i) => {
              const dep = departments.find(x => x.id === t.department_id);
              return (
                <div key={i} className="rounded-xl border border-line p-2" style={{ borderInlineStartWidth: 4, borderInlineStartColor: dep?.color }}>
                  <div className="mb-1 flex items-center gap-2">
                    <select className="rounded-lg border border-line bg-surface px-2 py-1 text-sm font-semibold" value={t.department_id} onChange={e => setTask(i, { department_id: e.target.value })}>
                      {departments.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <button type="button" className="mr-auto text-sm text-danger" onClick={() => set('tasks')(tasks.filter((_, j) => j !== i))}>הסרה</button>
                  </div>
                  <textarea rows={2} className={input} placeholder="מה צריך לעשות?" value={t.description} onChange={e => setTask(i, { description: e.target.value })} />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {departments.map(x => (
              <button key={x.id} type="button" onClick={() => set('tasks')([...tasks, { department_id: x.id, description: '' }])}
                className="rounded-full border border-dashed px-3 py-1 text-sm font-semibold" style={{ borderColor: x.color, color: x.color }}>
                + {x.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-2 text-sm font-bold">קבצים מצורפים</h3>
          <div className="flex flex-col gap-2">
            {files.filter(f => !removed.some(r => r.id === f.id)).map(f => (
              <div key={f.id} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2">
                <span className="grid h-8 w-10 shrink-0 place-items-center rounded-md bg-primary-soft text-[10px] font-extrabold text-primary-dark">{fileKind(f.name)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
                <span className="text-xs text-muted">{fileSize(f.size)}</span>
                <button type="button" className="text-sm text-danger" onClick={() => setRemoved(r => [...r, f])}>הסרה</button>
              </div>
            ))}
            {added.map((f, i) => (
              <div key={`new-${i}`} className="flex items-center gap-3 rounded-xl border border-dashed border-primary/50 bg-primary-soft/30 px-3 py-2">
                <span className="grid h-8 w-10 shrink-0 place-items-center rounded-md bg-primary-soft text-[10px] font-extrabold text-primary-dark">{fileKind(f.name)}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
                <span className="text-xs text-muted">{fileSize(f.size)} · יעלה בשמירה</span>
                <button type="button" className="text-sm text-danger" onClick={() => setAdded(a => a.filter((_, j) => j !== i))}>הסרה</button>
              </div>
            ))}
          </div>
          <input ref={fileInput} id="event-files-input" type="file" multiple className="hidden"
            onChange={e => {
              const picked = Array.from(e.target.files ?? []);
              const big = picked.filter(f => f.size > MAX_FILE_MB * 1024 * 1024);
              if (big.length) setErr(`קבצים מעל ${MAX_FILE_MB}MB לא יצורפו: ${big.map(f => f.name).join(', ')}`);
              setAdded(a => [...a, ...picked.filter(f => f.size <= MAX_FILE_MB * 1024 * 1024)]);
              e.target.value = '';
            }} />
          <button type="button" onClick={() => fileInput.current?.click()}
            className="mt-2 w-full rounded-xl border-2 border-dashed border-line py-3 text-sm font-semibold text-muted hover:border-primary hover:text-primary">
            + צירוף קובץ מהמחשב (תפריט, הצעת מחיר, תמונה…)
          </button>
        </div>

        {err && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{err}</p>}
      </div>

      <div className="pb-safe sticky bottom-0 flex gap-2 border-t border-line bg-surface p-3">
        {live
          ? <Btn className="flex-1" disabled={busy} onClick={() => save(false)}>שמירה ועדכון כולם</Btn>
          : <>
              <Btn kind="success" className="flex-1" disabled={busy} onClick={() => save(true)}>שמירה ופרסום</Btn>
              <Btn kind="ghost" disabled={busy} onClick={() => save(false)}>שמירה כטיוטה</Btn>
            </>}
      </div>
    </Sheet>
  );
}
