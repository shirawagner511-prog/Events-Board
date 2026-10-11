import { useState } from 'react';
import { deleteDraft, setStatus, syncInvites } from '../lib/api';
import { CATEGORY } from '../lib/board';
import { invitesNote } from '../lib/toast';
import { dayTitle, relativeDay, todayIso } from '../lib/dates';
import type { EventRow, TaskRow as Task } from '../lib/types';
import { TaskRow } from './TaskRow';
import { Btn, Sheet, Time, useApp } from './ui';

function Fact({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="flex gap-3 py-1.5">
      <span className="w-6 text-center text-lg" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{label}</div>
        <div className="whitespace-pre-line text-[15px] leading-snug">{children}</div>
      </div>
    </div>
  );
}

export function StatusPill({ e }: { e: EventRow }) {
  if (e.status === 'cancelled') return <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">בוטל</span>;
  if (e.status === 'pending') return <span className="rounded-full bg-warning-soft px-2 py-0.5 text-xs font-bold text-warning">טיוטה - לא פורסם</span>;
  if (e.tentative) return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-bold text-muted">לא סגור</span>;
  return null;
}

export function EventSheet({ event: e, tasks, onClose, onEdit, onDuplicate, onChanged }: {
  event: EventRow; tasks: Task[]; onClose: () => void; onEdit: () => void; onDuplicate: () => void; onChanged: () => void;
}) {
  const { me } = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rel = relativeDay(e.event_date, todayIso());
  const mine = tasks.filter(t => me.departments.includes(t.department_id));
  const others = tasks.filter(t => !me.departments.includes(t.department_id));

  async function changeStatus(s: EventRow['status']) {
    if (s === 'cancelled' && !confirm('לבטל את האירוע? כל מי שקיבל זימון יקבל ביטול.')) return;
    setBusy(true); setNote(null);
    try {
      await setStatus(e.id, s);
      const r = await syncInvites(e.id);
      setNote(invitesNote(r));
      onChanged();
    } catch (err) { setNote((err as Error).message); } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('למחוק את הטיוטה?')) return;
    await deleteDraft(e.id); onChanged(); onClose();
  }

  return (
    <Sheet onClose={onClose} title={
      <span className="flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CATEGORY[e.category].color }} />
        <span className={`truncate ${e.status === 'cancelled' ? 'line-through' : ''}`}>{e.title}</span>
      </span>
    }>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {rel && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white">{rel}</span>}
          <span className="font-semibold">{dayTitle(e.event_date)}</span>
          <StatusPill e={e} />
          {e.monday_dirty && me.is_admin && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-xs font-bold text-danger">הטופס ב-monday השתנה</span>}
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[['יציאה / היערכות', e.prep_time], ['התחלה', e.start_time], ['סיום', e.end_time]].map(([l, t]) => (
            <div key={l} className="rounded-xl bg-surface-2 py-2">
              <div className="text-[11px] text-muted">{l}</div>
              <div className="text-lg font-bold">{t ? <Time t={t} /> : '—'}</div>
            </div>
          ))}
        </div>

        <div className="divide-y divide-line rounded-xl border border-line px-3">
          <Fact icon="📍" label="מקום">{e.location}</Fact>
          <Fact icon="👥" label="כמות אנשים">{e.guests}</Fact>
          <Fact icon="🍽️" label="תפריט">{e.menu}</Fact>
          <Fact icon="🚀" label="מוציא">{e.lead}</Fact>
          <Fact icon="📦" label="מקפל">{e.teardown}</Fact>
          <Fact icon="🚚" label="ספקי חוץ">{e.suppliers}</Fact>
          <Fact icon="⚠️" label="הערות מיוחדות">{e.notes}</Fact>
          <Fact icon="🙋" label="מזמין">{e.requester}</Fact>
        </div>

        {mine.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-bold text-primary">המשימות שלי</h3>
            <div className="space-y-2">{mine.map(t => <TaskRow key={t.id} task={t} event={e} onChanged={onChanged} />)}</div>
          </section>
        )}
        {others.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-bold text-muted">{mine.length ? 'שאר המחלקות' : 'משימות לפי מחלקה'}</h3>
            <div className="space-y-2">{others.map(t => <TaskRow key={t.id} task={t} event={e} onChanged={onChanged} />)}</div>
          </section>
        )}

        {note && <p className="rounded-xl bg-surface-2 p-3 text-sm">{note}</p>}

        {me.is_admin && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            <Btn onClick={onEdit}>✏️ עריכה</Btn>
            {e.status === 'pending' && <Btn kind="success" disabled={busy} onClick={() => changeStatus('published')}>📣 פרסום לכולם</Btn>}
            {e.status === 'published' && <Btn kind="danger" disabled={busy} onClick={() => changeStatus('cancelled')}>ביטול אירוע</Btn>}
            {e.status === 'cancelled' && <Btn kind="soft" disabled={busy} onClick={() => changeStatus('published')}>החזרת האירוע</Btn>}
            <Btn kind="ghost" onClick={onDuplicate}>⧉ שכפול</Btn>
            {e.status === 'pending' && <Btn kind="ghost" onClick={remove}>מחיקת טיוטה</Btn>}
          </div>
        )}
        <p className="text-center text-[11px] text-muted">עודכן לאחרונה {new Date(e.content_updated_at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>
    </Sheet>
  );
}
