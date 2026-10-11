import { useCallback, useEffect, useState } from 'react';
import { loadAdminPeople, personalLink, resetLink, savePerson, setActive } from '../lib/api';
import type { AdminPerson } from '../lib/types';
import { Btn, DeptBadge, Sheet, useApp } from '../components/ui';

const input = 'w-full rounded-xl border border-line bg-surface px-3 py-2 text-[15px] outline-none focus:border-primary';
type Form = { id?: string; name: string; role_title: string; email: string; is_admin: boolean; departments: string[] };

export function People({ onClose }: { onClose: () => void }) {
  const { departments, me } = useApp();
  const [people, setPeople] = useState<AdminPerson[]>([]);
  const [edit, setEdit] = useState<Form | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const load = useCallback(async () => setPeople(await loadAdminPeople()), []);
  useEffect(() => { load(); }, [load]);

  async function copy(token: string, name: string) {
    const link = personalLink(token);
    try { await navigator.clipboard.writeText(link); setMsg(`הקישור של ${name} הועתק - שלחי לו/לה בוואטסאפ`); }
    catch { prompt('העתיקי את הקישור:', link); }
  }
  function share(token: string, name: string) {
    const text = `היי ${name}, זה הקישור האישי שלך ללוח האירועים. פתח/י אותו פעם אחת בטלפון והוסיפ/י למסך הבית: ${personalLink(token)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  }
  async function save() {
    if (!edit?.name.trim()) return;
    try { await savePerson({ ...edit }); setEdit(null); await load(); } catch (e) { setMsg((e as Error).message); }
  }

  return (
    <Sheet full onClose={onClose} title="אנשים והרשאות">
      <div className="space-y-3 p-4">
        <p className="text-sm text-muted">כל אחד נכנס עם קישור אישי. המחלקות קובעות מה יופיע לו תחת "שלי" ולאילו זימונים ב-Outlook הוא יקבל.</p>
        {msg && <p className="rounded-xl bg-success-soft p-2 text-sm text-success">{msg}</p>}
        {people.map(p => (
          <div key={p.id} className={`rounded-2xl border border-line bg-surface p-3 ${p.active ? '' : 'opacity-50'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{p.name} {p.is_admin && <span className="text-xs text-primary">· מנהל/ת לוח</span>}</div>
                <div className="text-sm text-muted">{p.role_title}{p.email && <> · <span className="ltr">{p.email}</span></>}</div>
                <div className="mt-1 flex flex-wrap gap-1">{p.departments.map(d => <DeptBadge key={d} id={d} small />)}</div>
                {!p.email && <div className="mt-1 text-xs text-warning">אין מייל - לא יקבל זימונים ל-Outlook</div>}
                <div className="mt-1 text-xs text-muted">{p.devices ? `מחובר ב-${p.devices} מכשירים` : 'עוד לא נכנס'}</div>
              </div>
              <button className="text-sm text-primary" onClick={() => setEdit({ id: p.id, name: p.name, role_title: p.role_title ?? '', email: p.email ?? '', is_admin: p.is_admin, departments: p.departments })}>עריכה</button>
            </div>
            {p.active && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn kind="soft" onClick={() => share(p.link_token, p.name)}>שליחה בוואטסאפ</Btn>
                <Btn kind="ghost" onClick={() => copy(p.link_token, p.name)}>העתקת קישור</Btn>
                <Btn kind="ghost" onClick={async () => { if (confirm(`לנתק את ${p.name} מכל המכשירים וליצור קישור חדש?`)) { await resetLink(p.id); await load(); } }}>קישור חדש</Btn>
                {p.id !== me.id && <Btn kind="ghost" onClick={async () => { await setActive(p.id, false); await load(); }}>השבתה</Btn>}
              </div>
            )}
            {!p.active && <Btn kind="ghost" className="mt-2" onClick={async () => { await setActive(p.id, true); await load(); }}>הפעלה מחדש</Btn>}
          </div>
        ))}
        <Btn onClick={() => setEdit({ name: '', role_title: '', email: '', is_admin: false, departments: [] })}>+ הוספת איש צוות</Btn>
      </div>

      {edit && (
        <Sheet onClose={() => setEdit(null)} title={edit.id ? `עריכה: ${edit.name}` : 'איש צוות חדש'}>
          <div className="space-y-3 p-4">
            <input className={input} placeholder="שם" value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} />
            <input className={input} placeholder="תפקיד" value={edit.role_title} onChange={e => setEdit({ ...edit, role_title: e.target.value })} />
            <input className={input} dir="ltr" type="email" placeholder="name@company.com" value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} />
            <div>
              <div className="mb-1 text-xs font-semibold text-muted">מחלקות (אפשר כמה)</div>
              <div className="flex flex-wrap gap-2">
                {departments.map(d => {
                  const on = edit.departments.includes(d.id);
                  return (
                    <button key={d.id} type="button" onClick={() => setEdit({ ...edit, departments: on ? edit.departments.filter(x => x !== d.id) : [...edit.departments, d.id] })}
                      className="rounded-full border-2 px-3 py-1 text-sm font-semibold" style={{ borderColor: d.color, background: on ? d.color : undefined, color: on ? '#fff' : d.color }}>
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={edit.is_admin} onChange={e => setEdit({ ...edit, is_admin: e.target.checked })} />יכול/ה לערוך את הלוח</label>
            <Btn className="w-full" onClick={save}>שמירה</Btn>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
