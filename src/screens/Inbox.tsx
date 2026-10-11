import { useCallback, useEffect, useState } from 'react';
import { createFromRequest, dismissRequest, linkRequest, loadDirty, loadPending, loadRange, loadRequests, syncMondayNow } from '../lib/api';
import { dayTitle, hhmm, shortDate } from '../lib/dates';
import type { EventRow, MondayRequest } from '../lib/types';
import { Btn, Empty, Sheet } from '../components/ui';

/** Admin inbox: monday forms to link or turn into events, drafts to publish, linked forms that changed. */
export function Inbox({ onClose, onOpenEvent }: { onClose: () => void; onOpenEvent: (id: string) => void }) {
  const [requests, setRequests] = useState<MondayRequest[]>([]);
  const [drafts, setDrafts] = useState<EventRow[]>([]);
  const [dirty, setDirty] = useState<EventRow[]>([]);
  const [candidates, setCandidates] = useState<Map<string, EventRow[]>>(new Map());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, p, x] = await Promise.all([loadRequests(), loadPending(), loadDirty()]);
    setRequests(r); setDrafts(p); setDirty(x);
    // Same-day events each form could belong to.
    const map = new Map<string, EventRow[]>();
    for (const req of r) {
      const { events } = await loadRange(req.fields.event_date, req.fields.event_date);
      map.set(req.item_id, events.filter(e => !e.monday_item_id && e.status !== 'cancelled'));
    }
    setCandidates(map);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMsg(null);
    try { await fn(); await load(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  async function sync() {
    setBusy(true);
    const r = await syncMondayNow();
    setMsg('error' in r ? `הסנכרון נכשל: ${r.error}` : `סונכרן: ${r.added} חדשים, ${r.updated} עודכנו`);
    await load(); setBusy(false);
  }

  return (
    <Sheet full onClose={onClose} title="ממתינים לטיפול">
      <div className="space-y-6 p-4">
        <div className="flex items-center gap-2">
          <Btn kind="soft" disabled={busy} onClick={sync}>🔄 משיכה מ-monday עכשיו</Btn>
          {msg && <span className="text-sm text-muted">{msg}</span>}
        </div>

        <section>
          <h3 className="mb-2 font-bold">טפסי monday חדשים <span className="text-muted">({requests.length})</span></h3>
          {!requests.length && <p className="text-sm text-muted">אין טפסים חדשים</p>}
          <div className="space-y-3">
            {requests.map(r => {
              const f = r.fields;
              const cands = candidates.get(r.item_id) ?? [];
              const suggested = cands.find(c => c.id === r.suggested_event_id);
              return (
                <div key={r.item_id} className="rounded-2xl border border-line bg-surface p-3 shadow-sm">
                  <div className="font-bold">{f.title}</div>
                  <div className="text-sm text-muted">
                    {dayTitle(f.event_date)}{f.start_time && <> · <span className="ltr">{f.start_time}</span></>}
                    {f.guests != null && <> · {f.guests} איש</>}{f.location && <> · {f.location}</>}
                  </div>
                  <div className="text-sm text-muted">מזמין: {f.requester}</div>
                  {f.menu && <p className="mt-1 whitespace-pre-line rounded-lg bg-surface-2 p-2 text-sm">{f.menu}</p>}
                  {suggested && (
                    <div className="mt-2 rounded-xl bg-primary-soft/60 p-2 text-sm">
                      נראה שזה האירוע <b>{suggested.title}</b> ({hhmm(suggested.start_time) || 'ללא שעה'}) שכבר בלוח.
                      <Btn className="mr-2" disabled={busy} onClick={() => run(() => linkRequest(r.item_id, suggested.id))}>🔗 חיבור</Btn>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cands.filter(c => c.id !== suggested?.id).map(c => (
                      <Btn key={c.id} kind="ghost" disabled={busy} onClick={() => run(() => linkRequest(r.item_id, c.id))}>🔗 {c.title}</Btn>
                    ))}
                    <Btn kind="soft" disabled={busy} onClick={() => run(async () => onOpenEvent(await createFromRequest(r.item_id)))}>+ אירוע חדש מהטופס</Btn>
                    <Btn kind="ghost" disabled={busy} onClick={() => run(() => dismissRequest(r.item_id))}>התעלמות</Btn>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-bold">טיוטות שלא פורסמו <span className="text-muted">({drafts.length})</span></h3>
          {!drafts.length && <p className="text-sm text-muted">אין טיוטות</p>}
          <div className="space-y-2">
            {drafts.map(e => (
              <button key={e.id} onClick={() => onOpenEvent(e.id)} className="flex w-full items-center gap-3 rounded-xl border border-dashed border-line bg-surface p-3 text-right">
                <span className="text-sm font-bold text-muted">{shortDate(e.event_date)}</span>
                <span className="flex-1 font-semibold">{e.title}</span>
                <span className="text-xs text-primary">פתיחה ←</span>
              </button>
            ))}
          </div>
        </section>

        {dirty.length > 0 && (
          <section>
            <h3 className="mb-2 font-bold">טפסים שהשתנו אחרי החיבור</h3>
            <div className="space-y-2">
              {dirty.map(e => (
                <button key={e.id} onClick={() => onOpenEvent(e.id)} className="flex w-full items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft/40 p-3 text-right">
                  <span className="text-sm font-bold">{shortDate(e.event_date)}</span>
                  <span className="flex-1 font-semibold">{e.title}</span>
                  <span className="text-xs text-danger">לבדוק ולשמור</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {!requests.length && !drafts.length && !dirty.length && <Empty>הכל מטופל ✨</Empty>}
      </div>
    </Sheet>
  );
}
