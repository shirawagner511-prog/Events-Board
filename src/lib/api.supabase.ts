// Every call the app makes to Supabase.
import { supabase } from './supabase';
import type { AdminPerson, Department, EventDraft, EventRow, Me, MondayRequest, Person, TaskRow } from './types';

function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data;
}

// ------------------------------------------------------------ session

/** Signs this device in (anonymously, once) and binds it to the person behind the link. */
export async function joinWithToken(token: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) check(await supabase.auth.signInAnonymously());
  check(await supabase.rpc('claim_link', { p_token: token }));
}

export async function loadMe(): Promise<Me | null> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  return check(await supabase.rpc('me')) as Me | null;
}

export async function signOut(): Promise<void> {
  await supabase.rpc('sign_out_device');
  await supabase.auth.signOut();
}

// ------------------------------------------------------------ board

export async function loadReference(): Promise<{ departments: Department[]; people: Person[] }> {
  const [d, p] = await Promise.all([
    supabase.from('departments').select('*').order('sort'),
    supabase.from('people').select('id, name, role_title, email, is_admin, active').order('name'),
  ]);
  return { departments: check(d) ?? [], people: check(p) ?? [] };
}

export async function loadRange(from: string, to: string): Promise<{ events: EventRow[]; tasks: TaskRow[] }> {
  const events = check(await supabase.from('events').select('*').gte('event_date', from).lte('event_date', to)) as EventRow[];
  const ids = events.map(e => e.id);
  const tasks = ids.length
    ? (check(await supabase.from('event_tasks').select('*').in('event_id', ids).order('sort')) as TaskRow[])
    : [];
  return { events, tasks };
}

export async function loadEvent(id: string): Promise<{ event: EventRow | null; tasks: TaskRow[] }> {
  const e = check(await supabase.from('events').select('*').eq('id', id).maybeSingle()) as EventRow | null;
  const t = e ? (check(await supabase.from('event_tasks').select('*').eq('event_id', id).order('sort')) as TaskRow[]) : [];
  return { event: e, tasks: t };
}

export async function markTask(taskId: string, action: 'seen' | 'done' | 'undo'): Promise<void> {
  check(await supabase.rpc('mark_task', { p_task: taskId, p_action: action }));
}

// ------------------------------------------------------------ admin: events

export async function saveEvent(d: EventDraft): Promise<string> {
  const { tasks, ...event } = d;
  return check(await supabase.rpc('save_event', { p_event: event, p_tasks: tasks.filter(t => t.department_id) })) as string;
}

export async function setStatus(id: string, status: EventRow['status']): Promise<void> {
  check(await supabase.rpc('set_event_status', { p_event: id, p_status: status }));
}

export async function deleteDraft(id: string): Promise<void> {
  check(await supabase.rpc('delete_event', { p_event: id }));
}

/** Brings everyone's Outlook calendar in line with the event. Never throws: mail is best-effort. */
export async function syncInvites(eventId: string): Promise<{ sent: number; failed: unknown[]; recipients?: string[] } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('send-invites', { body: { event_id: eventId } });
  return error ? { error: error.message } : data;
}

export async function loadPending(): Promise<EventRow[]> {
  return check(await supabase.from('events').select('*').eq('status', 'pending').order('event_date')) as EventRow[];
}

export async function loadDirty(): Promise<EventRow[]> {
  return check(await supabase.from('events').select('*').eq('monday_dirty', true).neq('status', 'cancelled').order('event_date')) as EventRow[];
}

export async function parseMessage(text: string): Promise<Partial<EventDraft> & { uncertain?: string[] }> {
  const { data, error } = await supabase.functions.invoke('parse-message', { body: { text } });
  if (error) throw new Error(error.message);
  const d = data.draft;
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    title: s(d.title), event_date: s(d.event_date), start_time: s(d.start_time), end_time: s(d.end_time),
    prep_time: s(d.prep_time), location: s(d.location), guests: s(d.guests), menu: s(d.menu),
    requester: s(d.requester), lead: s(d.lead), teardown: s(d.teardown), suppliers: s(d.suppliers), paid_staff: s(d.paid_staff),
    notes: s(d.notes), tasks: d.tasks ?? [], uncertain: d.uncertain ?? [],
  };
}

// ------------------------------------------------------------ admin: monday

export async function loadRequests(): Promise<MondayRequest[]> {
  return check(await supabase.from('monday_requests').select('*').eq('status', 'new').order('received_at', { ascending: false })) as MondayRequest[];
}

export async function linkRequest(item: string, eventId: string) {
  check(await supabase.rpc('admin_link_request', { p_item: item, p_event: eventId }));
}
export async function createFromRequest(item: string): Promise<string> {
  return check(await supabase.rpc('admin_create_from_request', { p_item: item })) as string;
}
export async function dismissRequest(item: string) {
  check(await supabase.rpc('admin_dismiss_request', { p_item: item }));
}
export async function syncMondayNow(): Promise<{ added: number; updated: number } | { error: string }> {
  const { data, error } = await supabase.functions.invoke('sync-monday', { body: {} });
  return error ? { error: error.message } : data;
}

// ------------------------------------------------------------ admin: people

export async function loadAdminPeople(): Promise<AdminPerson[]> {
  return check(await supabase.rpc('admin_people')) as AdminPerson[];
}
export async function savePerson(p: { id?: string; name: string; role_title: string; email: string; is_admin: boolean; departments: string[] }) {
  return check(await supabase.rpc('admin_save_person', {
    p_id: p.id ?? null, p_name: p.name, p_role_title: p.role_title, p_email: p.email,
    p_is_admin: p.is_admin, p_departments: p.departments,
  })) as string;
}
export async function resetLink(id: string) { return check(await supabase.rpc('admin_reset_link', { p_person: id })) as string; }
export async function setActive(id: string, active: boolean) { check(await supabase.rpc('admin_set_active', { p_person: id, p_active: active })); }

export const personalLink = (token: string) => `${location.origin}/?join=${token}`;

// ------------------------------------------------------------ live updates

/** Calls onChange whenever anyone changes an event or a task. Returns an unsubscribe function. */
export function subscribe(onChange: () => void): () => void {
  const channel = supabase
    .channel(`board-${crypto.randomUUID()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'event_tasks' }, onChange)
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
