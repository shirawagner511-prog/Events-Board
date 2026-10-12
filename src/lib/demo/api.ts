// Demo backend: the same calls as api.supabase.ts, served from browser storage.
// Rules mirror the SQL in supabase/migrations so the demo behaves like the real thing.
import { planInvites } from '../../../supabase/functions/_shared/invites';
import { addDays, startOfWeek, todayIso } from '../dates';
import type { AdminPerson, Department, EventDraft, EventFile, EventRow, Me, MondayRequest, Person, TaskRow } from '../types';
import { DEMO_VERSION, mondayPool, seed, type DemoDb } from './seed';

const KEY = 'events-board-demo';
let memory: DemoDb | null = null;
const listeners = new Set<() => void>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(KEY) : null;
channel?.addEventListener('message', () => { memory = null; listeners.forEach(f => f()); });

function db(): DemoDb {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as DemoDb) : null;
    memory = !parsed ? seed() : parsed.version === DEMO_VERSION ? parsed : upgrade(parsed);
  } catch {
    memory = seed();
  }
  return memory;
}

/**
 * Brings data saved by an older demo build up to date without losing what the person entered:
 * new fields get defaults, departments take their current names and colours.
 */
function upgrade(old: Partial<DemoDb>): DemoDb {
  const fresh = seed();
  if (!Array.isArray(old.events) || !Array.isArray(old.people)) return fresh;
  const upgraded: DemoDb = {
    ...fresh,
    ...old,
    version: DEMO_VERSION,
    departments: fresh.departments,
    events: old.events.map(e => ({ ...e, paid_staff: e.paid_staff ?? null })),
    tasks: old.tasks ?? [],
    files: old.files ?? [],
    requests: old.requests ?? [],
    inviteLog: old.inviteLog ?? [],
    memberships: old.memberships ?? fresh.memberships,
    mondayPool: old.mondayPool ?? 0,
  } as DemoDb;
  try { localStorage.setItem(KEY, JSON.stringify(upgraded)); } catch { /* keep in memory */ }
  return upgraded;
}

function commit() {
  try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* storage blocked: keep in memory */ }
  channel?.postMessage('changed');
  listeners.forEach(f => f());
}

const pause = () => new Promise(r => setTimeout(r, 120));
const nowIso = () => new Date().toISOString();
const canUuid = typeof (globalThis.crypto as Crypto | undefined)?.randomUUID === 'function' && globalThis.isSecureContext !== false;
const id = () => (canUuid ? crypto.randomUUID() : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const me = () => db().people.find(p => p.id === db().currentPersonId && p.active);
const isAdmin = () => !!me()?.is_admin;
function requireAdmin() { if (!isAdmin()) throw new Error('admin only'); }
const deptsOf = (pid: string) => db().memberships.filter(m => m.person_id === pid).map(m => m.department_id).sort();
const visible = (e: EventRow) => e.status !== 'pending' || isAdmin();

// ------------------------------------------------------------ demo controls

export function demoPeople() { return db().people.filter(p => p.active).map(p => ({ id: p.id, name: p.name, role_title: p.role_title })); }
export function demoCurrent() { return db().currentPersonId; }
export function demoSwitch(personId: string) { db().currentPersonId = personId; commit(); }
export function demoReset() { memory = seed(); commit(); }

// ------------------------------------------------------------ session

export async function joinWithToken(token: string): Promise<void> {
  const p = db().people.find(x => x.link_token === token && x.active);
  if (!p) throw new Error('invalid link');
  demoSwitch(p.id);
}

export async function loadMe(): Promise<Me | null> {
  const p = me();
  return p ? { id: p.id, name: p.name, role_title: p.role_title, is_admin: p.is_admin, departments: deptsOf(p.id) } : null;
}

export async function signOut(): Promise<void> { demoSwitch('yahli'); }

// ------------------------------------------------------------ board

export async function loadReference(): Promise<{ departments: Department[]; people: Person[] }> {
  return clone({ departments: db().departments, people: db().people.map(({ link_token: _t, ...p }) => p) });
}

export async function loadRange(from: string, to: string): Promise<{ events: EventRow[]; tasks: TaskRow[] }> {
  await pause();
  const events = db().events.filter(e => e.event_date >= from && e.event_date <= to && visible(e));
  const ids = new Set(events.map(e => e.id));
  return clone({ events, tasks: db().tasks.filter(t => ids.has(t.event_id)).sort((a, b) => a.sort - b.sort) });
}

export async function loadEvent(eventId: string): Promise<{ event: EventRow | null; tasks: TaskRow[] }> {
  const e = db().events.find(x => x.id === eventId && visible(x)) ?? null;
  return clone({ event: e, tasks: e ? db().tasks.filter(t => t.event_id === e.id).sort((a, b) => a.sort - b.sort) : [] });
}

export async function markTask(taskId: string, action: 'seen' | 'done' | 'undo'): Promise<void> {
  const p = me(); const t = db().tasks.find(x => x.id === taskId);
  if (!p || !t) throw new Error('task not found');
  if (!p.is_admin && !deptsOf(p.id).includes(t.department_id)) throw new Error('not your department');
  const now = nowIso();
  if (action === 'seen') Object.assign(t, { seen_at: now, seen_by: p.id });
  if (action === 'done') Object.assign(t, { done_at: now, done_by: p.id, seen_at: t.seen_at ?? now, seen_by: t.seen_by ?? p.id });
  if (action === 'undo') Object.assign(t, { done_at: null, done_by: null });
  commit();
}

// ------------------------------------------------------------ admin: events

const CONTENT: (keyof EventRow)[] = ['title', 'event_date', 'start_time', 'end_time', 'prep_time', 'location', 'guests', 'menu', 'lead', 'teardown', 'suppliers', 'paid_staff', 'notes', 'status', 'tentative'];

function touch(e: EventRow, patch: Partial<EventRow>) {
  const changed = CONTENT.some(k => k in patch && patch[k] !== e[k]);
  Object.assign(e, patch, { updated_at: nowIso() });
  if (changed) e.content_updated_at = nowIso();
}

export async function saveEvent(d: EventDraft): Promise<string> {
  requireAdmin(); await pause();
  const nil = (v: string) => (v.trim() === '' ? null : v.trim());
  let e = d.id ? db().events.find(x => x.id === d.id) : undefined;
  if (!e) {
    e = {
      id: id(), status: 'pending', tentative: false, category: 'events', title: d.title, event_date: d.event_date,
      start_time: null, end_time: null, prep_time: null, location: null, guests: null, menu: null, requester: null, lead: null,
      teardown: null, suppliers: null, paid_staff: null, notes: null, source: 'manual', monday_item_id: null, monday_dirty: false,
      content_updated_at: nowIso(), published_at: null, updated_at: nowIso(),
    };
    db().events.push(e);
  }
  touch(e, {
    title: d.title, event_date: d.event_date, start_time: nil(d.start_time), end_time: nil(d.end_time), prep_time: nil(d.prep_time),
    location: nil(d.location), guests: nil(d.guests) === null ? null : Number(d.guests), menu: nil(d.menu), requester: nil(d.requester),
    lead: nil(d.lead), teardown: nil(d.teardown), suppliers: nil(d.suppliers), paid_staff: +d.paid_staff > 0 ? +d.paid_staff : null, notes: nil(d.notes), category: d.category,
    tentative: d.tentative, monday_dirty: false,
  });
  const keep = new Set<string>();
  d.tasks.filter(t => t.department_id).forEach((t, i) => {
    const existing = t.id ? db().tasks.find(x => x.id === t.id && x.event_id === e!.id) : undefined;
    if (existing) {
      if (existing.description !== t.description || existing.department_id !== t.department_id) existing.content_updated_at = nowIso();
      Object.assign(existing, { department_id: t.department_id, description: t.description, sort: i + 1 });
      keep.add(existing.id);
    } else {
      const nt: TaskRow = { id: id(), event_id: e!.id, department_id: t.department_id, description: t.description, sort: i + 1, seen_at: null, seen_by: null, done_at: null, done_by: null, content_updated_at: nowIso() };
      db().tasks.push(nt); keep.add(nt.id);
    }
  });
  memory!.tasks = db().tasks.filter(t => t.event_id !== e!.id || keep.has(t.id));
  commit();
  return e.id;
}

export async function setStatus(eventId: string, status: EventRow['status']): Promise<void> {
  requireAdmin();
  const e = db().events.find(x => x.id === eventId); if (!e) throw new Error('event not found');
  touch(e, { status, published_at: status === 'published' ? e.published_at ?? nowIso() : e.published_at });
  commit();
}

export async function deleteDraft(eventId: string): Promise<void> {
  requireAdmin();
  const e = db().events.find(x => x.id === eventId);
  if (e?.status !== 'pending') throw new Error('only pending events can be deleted; cancel published ones');
  memory!.files = db().files.filter(f => f.event_id !== eventId);
  memory!.events = db().events.filter(x => x.id !== eventId);
  memory!.tasks = db().tasks.filter(t => t.event_id !== eventId);
  commit();
}

/** Runs the real invite planner and records what would have been mailed. */
export async function syncInvites(eventId: string): Promise<{ sent: number; failed: unknown[]; recipients?: string[] }> {
  const e = db().events.find(x => x.id === eventId); if (!e) return { sent: 0, failed: [] };
  const actions = await planInvites({
    event: e, tasks: db().tasks.filter(t => t.event_id === eventId), people: db().people, memberships: db().memberships,
    departments: db().departments, log: db().inviteLog.filter(l => l.event_id === eventId), today: todayIso(), appUrl: location.origin,
  });
  for (const a of actions) {
    const personId = a.kind === 'request' ? a.person.id : a.personId;
    memory!.inviteLog = db().inviteLog.filter(l => !(l.event_id === eventId && l.person_id === personId));
    db().inviteLog.push({ event_id: eventId, person_id: personId, email: a.email, sequence: a.sequence, fingerprint: a.kind === 'request' ? a.fingerprint : null, state: a.kind === 'request' ? 'sent' : 'cancelled' });
  }
  commit();
  return { sent: actions.length, failed: [], recipients: actions.map(a => `${a.kind === 'request' ? a.person.name : a.name}${a.kind === 'cancel' ? ' (ביטול)' : a.sequence > 0 ? ' (עדכון)' : ''}`) };
}

export async function loadPending(): Promise<EventRow[]> {
  return clone(isAdmin() ? db().events.filter(e => e.status === 'pending').sort((a, b) => a.event_date.localeCompare(b.event_date)) : []);
}
export async function loadDirty(): Promise<EventRow[]> {
  return clone(isAdmin() ? db().events.filter(e => e.monday_dirty && e.status !== 'cancelled') : []);
}

/** Demo stand-in for the Claude parser: picks out date, time, head count and obvious tasks. */
export async function parseMessage(text: string): Promise<Partial<EventDraft> & { uncertain?: string[] }> {
  await new Promise(r => setTimeout(r, 600));
  const today = todayIso();
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  let date = '';
  if (/מחרתיים/.test(text)) date = addDays(today, 2);
  else if (/מחר/.test(text)) date = addDays(today, 1);
  else if (/היום/.test(text)) date = today;
  const dm = text.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (dm) date = `${today.slice(0, 4)}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
  const wd = days.findIndex(d => new RegExp(`(ביום|יום)\\s+${d}`).test(text));
  if (!date && wd >= 0) { let d = addDays(startOfWeek(today), wd); if (d <= today) d = addDays(d, 7); date = d; }
  const times = [...text.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)].map(m => `${m[1].padStart(2, '0')}:${m[2]}`);
  const paid = text.match(/(\d+)\s*(?:עובדי|עובד)\s*(?:תפעול\s*)?בתשלום/)?.[1] ?? (/בתשלום/.test(text) ? '1' : '');
  const guests = text.match(/(\d+)\s*(איש|אנשים|משתתפים|אורחים|עובדים)/)?.[1] ?? '';
  const place = text.match(/(?:ב|מיקום:?\s*)(מועדון|מרפסת[^,.\n]*|חדר[^,.\n]*|קומה[^,.\n]*|רחבת[^,.\n]*)/)?.[1]?.trim() ?? '';
  const tasks: EventDraft['tasks'] = [];
  if (/שתי|מקרר|ציוד|קיפול|לקפל|פריסה/.test(text)) tasks.push({ department_id: 'mk', description: 'שתייה / ציוד / פריסה וקיפול' });
  if (/אוכל|תפריט|מגש|פלט|כריכ|סנדוויץ/.test(text)) tasks.push({ department_id: 'kitchen', description: 'הכנת האוכל לפי התפריט' });
  if (/מאפ|ברמן|מלצר|צוות לאירוע|עובדים לאירוע/.test(text)) tasks.push({ department_id: 'cafe', description: 'מאפים / אנשי צוות לאירוע' });
  const firstLine = text.trim().split('\n')[0].replace(/^(היי|הי|שלום)[^,]*,\s*/, '')
    .split(/\s(?:מחרתיים|מחר|היום|ביום|ב-?\d|\d{1,2}[:./]|\d+\s*איש)/)[0].replace(/[,.]\s*$/, '');
  return {
    title: firstLine.slice(0, 50), event_date: date, start_time: times[0] ?? '', end_time: times[1] ?? '', guests, location: place, paid_staff: paid, tasks,
    uncertain: ['במצב דמו הפענוח בסיסי (תאריך, שעה, כמות, מקום). בגרסה האמיתית Claude קורא את כל ההודעה וממלא גם תפריט, מוציא ומשימות מדויקות'],
  };
}

// ------------------------------------------------------------ admin: monday

function suggest(f: DemoDb['requests'][number]['fields']): string | null {
  const same = db().events.filter(e => e.event_date === f.event_date && !e.monday_item_id && e.status !== 'cancelled');
  const mins = (t: string | null) => (t ? +t.slice(0, 2) * 60 + +t.slice(3, 5) : 720);
  same.sort((a, b) => Math.abs(mins(a.start_time) - mins(f.start_time)) - Math.abs(mins(b.start_time) - mins(f.start_time)));
  return same[0]?.id ?? null;
}

export async function loadRequests(): Promise<MondayRequest[]> {
  if (!isAdmin()) return [];
  return clone(db().requests.filter(r => r.status === 'new').map(r => ({ ...r, suggested_event_id: suggest(r.fields) }))) as MondayRequest[];
}

export async function linkRequest(item: string, eventId: string): Promise<void> {
  requireAdmin();
  const r = db().requests.find(x => x.item_id === item); const e = db().events.find(x => x.id === eventId);
  if (!r || !e) throw new Error('not found');
  const f = r.fields as MondayRequest['fields'];
  Object.assign(e, {
    monday_item_id: item, start_time: e.start_time ?? f.start_time, location: e.location ?? f.location, guests: e.guests ?? f.guests,
    menu: e.menu ?? f.menu, requester: e.requester ?? f.requester, notes: e.notes ?? f.notes, source: 'monday', monday_dirty: false,
  });
  Object.assign(r, { status: 'linked', event_id: eventId });
  commit();
}

export async function createFromRequest(item: string): Promise<string> {
  requireAdmin();
  const r = db().requests.find(x => x.item_id === item); if (!r) throw new Error('not found');
  const f = r.fields as MondayRequest['fields'];
  const eid = id();
  db().events.push({
    id: eid, status: 'pending', tentative: false, category: 'events', title: f.title, event_date: f.event_date, start_time: f.start_time,
    end_time: null, prep_time: null, location: f.location, guests: f.guests, menu: f.menu, requester: f.requester, lead: null, teardown: null,
    suppliers: null, paid_staff: null, notes: f.notes, source: 'monday', monday_item_id: item, monday_dirty: false, content_updated_at: nowIso(),
    published_at: null, updated_at: nowIso(),
  });
  Object.assign(r, { status: 'linked', event_id: eid });
  commit();
  return eid;
}

export async function dismissRequest(item: string): Promise<void> {
  requireAdmin();
  const r = db().requests.find(x => x.item_id === item); if (r) r.status = 'dismissed';
  commit();
}

export async function syncMondayNow(): Promise<{ added: number; updated: number }> {
  await new Promise(r => setTimeout(r, 500));
  const next = mondayPool()[db().mondayPool];
  if (!next) return { added: 0, updated: 0 };
  db().mondayPool++;
  db().requests.push({ ...next, status: 'new', event_id: null, suggested_event_id: null, received_at: nowIso() });
  commit();
  return { added: 1, updated: 0 };
}

// ------------------------------------------------------------ admin: people

export async function loadAdminPeople(): Promise<AdminPerson[]> {
  requireAdmin();
  return clone(db().people.map(p => ({ ...p, departments: deptsOf(p.id), devices: p.id === db().currentPersonId ? 1 : 0 })).sort((a, b) => a.name.localeCompare(b.name, 'he')));
}

export async function savePerson(p: { id?: string; name: string; role_title: string; email: string; is_admin: boolean; departments: string[] }): Promise<string> {
  requireAdmin();
  if (p.id === db().currentPersonId && !p.is_admin) throw new Error('cannot remove your own admin rights');
  let row = p.id ? db().people.find(x => x.id === p.id) : undefined;
  if (!row) { row = { id: id(), name: p.name, role_title: null, email: null, is_admin: false, active: true, link_token: id() }; db().people.push(row); }
  Object.assign(row, { name: p.name, role_title: p.role_title || null, email: p.email || null, is_admin: p.is_admin });
  memory!.memberships = [...db().memberships.filter(m => m.person_id !== row!.id), ...p.departments.map(d => ({ person_id: row!.id, department_id: d }))];
  commit();
  return row.id;
}

export async function resetLink(personId: string): Promise<string> {
  requireAdmin();
  const p = db().people.find(x => x.id === personId)!; p.link_token = id(); commit(); return p.link_token;
}

export async function setActive(personId: string, active: boolean): Promise<void> {
  requireAdmin();
  if (personId === db().currentPersonId) throw new Error('cannot deactivate yourself');
  db().people.find(x => x.id === personId)!.active = active; commit();
}

export const personalLink = (token: string) => `${location.origin}/?join=${token}`;

// ------------------------------------------------------------ live updates

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

// ------------------------------------------------------------ attached files (demo: kept in this browser)

const FILES_KEY = `${KEY}-files`;
const DEMO_MAX_MB = 2;
const blobs = new Map<string, string>(); // path -> data URL, when storage is full or blocked

function readBlobs(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(FILES_KEY) ?? '{}'); } catch { return {}; }
}

export async function listFiles(eventId: string): Promise<EventFile[]> {
  const e = db().events.find(x => x.id === eventId);
  return e && visible(e) ? clone(db().files.filter(f => f.event_id === eventId)) : [];
}

export async function uploadFile(eventId: string, file: File): Promise<void> {
  requireAdmin();
  if (file.size > DEMO_MAX_MB * 1024 * 1024) throw new Error(`בדמו אפשר לצרף קבצים עד ${DEMO_MAX_MB}MB ("${file.name}" גדול יותר)`);
  const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
  const path = `${eventId}/${id()}`;
  const all = readBlobs(); all[path] = dataUrl;
  try { localStorage.setItem(FILES_KEY, JSON.stringify(all)); } catch { blobs.set(path, dataUrl); }
  db().files.push({ id: id(), event_id: eventId, name: file.name, path, size: file.size, mime: file.type || null, created_at: nowIso() });
  commit();
}

export async function deleteFile(f: EventFile): Promise<void> {
  requireAdmin();
  memory!.files = db().files.filter(x => x.id !== f.id);
  const all = readBlobs(); delete all[f.path];
  try { localStorage.setItem(FILES_KEY, JSON.stringify(all)); } catch { /* ignore */ }
  blobs.delete(f.path);
  commit();
}

export async function fileUrl(f: EventFile): Promise<string> {
  const dataUrl = blobs.get(f.path) ?? readBlobs()[f.path];
  if (!dataUrl) throw new Error('הקובץ לא נמצא בדפדפן הזה');
  const blob = await (await fetch(dataUrl)).blob();
  return URL.createObjectURL(blob);
}
