import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY, sortByTime } from '../lib/board';
import { dayTitle, hhmm, shortDate } from '../lib/dates';
import type { EventRow, TaskRow } from '../lib/types';
import { DEMO } from '../lib/api';
import { useApp } from './ui';

/**
 * A paper-first layout of the selected events: A4 landscape, black on white, one table per day,
 * every detail spelled out and a tick box per task. Shown as a preview; the browser prints it
 * or saves it as PDF.
 */
export function PrintView({ title, subtitle, events, tasksByEvent, onClose }: {
  title: string; subtitle?: string; events: EventRow[]; tasksByEvent: Map<string, TaskRow[]>; onClose: () => void;
}) {
  const { dept } = useApp();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = events.filter(e => e.status === 'published').sort(sortByTime);
  const days = [...new Set(list.map(e => e.event_date))];
  const printedAt = new Date().toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' });

  return createPortal(
    <div className="print-overlay fixed inset-0 z-50 overflow-y-auto bg-surface-2" dir="rtl" lang="he">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-line bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold">תצוגת הדפסה</div>
          <div className="text-xs text-muted">{DEMO ? 'בדמו הדפדפן חוסם הדפסה. באפליקציה עצמה הכפתור פותח הדפסה או שמירה כ-PDF.' : 'בחלון ההדפסה בחרו מדפסת, או "שמירה כ-PDF".'}</div>
        </div>
        <button onClick={() => window.print()} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-white">הדפסה / שמירה כ-PDF</button>
        <button onClick={onClose} className="min-h-10 rounded-xl border border-line px-4 text-sm font-semibold">סגירה</button>
      </div>

      <div className="print-paper mx-auto my-6 w-[min(100%-2rem,297mm)] bg-white p-[12mm] text-[#111] shadow-lg">
        <header className="mb-4 flex items-end justify-between border-b-2 border-[#111] pb-2">
          <div>
            <h1 className="text-[20pt] font-extrabold leading-tight">לוח אירועים · {title}</h1>
            {subtitle && <div className="text-[10pt]">{subtitle}</div>}
          </div>
          <div className="text-left text-[9pt] text-[#444]">הודפס {printedAt}<br />{list.length} אירועים</div>
        </header>

        {!list.length && <p className="py-10 text-center text-[12pt]">אין אירועים מפורסמים בטווח הזה.</p>}

        {days.map(day => (
          <section key={day} className="print-day mb-5">
            <h2 className="mb-1.5 bg-[#111] px-2 py-1 text-[12pt] font-bold text-white print-keep-color">{dayTitle(day)} · {shortDate(day)}</h2>
            <table className="print-table w-full border-collapse text-[9.5pt] leading-snug">
              <thead>
                <tr className="text-right">
                  <th className="w-[13%]">שעות</th>
                  <th className="w-[22%]">אירוע</th>
                  <th className="w-[22%]">תפריט</th>
                  <th className="w-[15%]">צוות</th>
                  <th>משימות לפי מחלקה</th>
                </tr>
              </thead>
              <tbody>
                {list.filter(e => e.event_date === day).map(e => {
                  const tasks = tasksByEvent.get(e.id) ?? [];
                  return (
                    <tr key={e.id} className="print-row align-top">
                      <td>
                        {e.prep_time && <div>יציאה <b className="ltr">{hhmm(e.prep_time)}</b></div>}
                        <div>התחלה <b className="ltr text-[11pt]">{hhmm(e.start_time) || '—'}</b></div>
                        {e.end_time && <div>סיום <b className="ltr">{hhmm(e.end_time)}</b></div>}
                      </td>
                      <td>
                        <div className="text-[10.5pt] font-bold">{e.title}</div>
                        <div className="text-[8.5pt]">{CATEGORY[e.category].label}{e.tentative && <b> · לא סגור</b>}</div>
                        {e.location && <div><b>מקום:</b> {e.location}</div>}
                        {e.guests != null && <div><b>כמות:</b> {e.guests} איש</div>}
                        {e.requester && <div><b>מזמין:</b> {e.requester}</div>}
                        {e.notes && <div className="mt-1 border border-[#111] px-1"><b>הערות:</b> {e.notes}</div>}
                      </td>
                      <td className="whitespace-pre-line">{e.menu || '—'}</td>
                      <td>
                        {e.lead && <div><b>מוציא:</b> {e.lead}</div>}
                        {e.teardown && <div><b>מקפל:</b> {e.teardown}</div>}
                        {e.paid_staff ? <div><b>בתשלום:</b> {e.paid_staff} עובדי תפעול</div> : null}
                        {e.suppliers && <div><b>ספקי חוץ:</b> {e.suppliers}</div>}
                      </td>
                      <td>
                        {tasks.length ? tasks.map(t => (
                          <div key={t.id} className="mb-0.5 flex gap-1.5">
                            <span className="mt-[2px] inline-block h-[3mm] w-[3mm] shrink-0 border border-[#111]" aria-hidden />
                            <span><b>{dept(t.department_id)?.name ?? t.department_id}:</b> {t.description || '—'}</span>
                          </div>
                        )) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  );
}
