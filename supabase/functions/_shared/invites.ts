// Decides, per person, whether an event needs a new/updated invite, a cancellation, or nothing.
import { buildInviteContent, fingerprint, type InviteContent } from './ics.ts';
import type { Department, EventRow, Person, TaskRow } from './types.ts';

export interface InviteLogRow { person_id: string; email: string; sequence: number; fingerprint: string | null; state: 'sent' | 'cancelled' }

export type InviteAction =
  | { kind: 'request'; person: Person; email: string; sequence: number; content: InviteContent; fingerprint: string }
  | { kind: 'cancel'; personId: string; name: string; email: string; sequence: number; content: InviteContent };

export interface PlanInput {
  event: EventRow;
  tasks: TaskRow[];
  people: Person[];
  memberships: { person_id: string; department_id: string }[];
  departments: Department[];
  log: InviteLogRow[];
  today: string;   // YYYY-MM-DD, Israel
  appUrl: string;
}

export async function planInvites(i: PlanInput): Promise<InviteAction[]> {
  const { event: e } = i;
  // Past events (forms often arrive after the fact) never generate mail.
  if (e.event_date < i.today) return [];

  const live = e.status === 'published';
  const deptName = new Map(i.departments.map(d => [d.id, d.name]));
  const actions: InviteAction[] = [];
  const wanted = new Set<string>();

  if (live) {
    for (const p of i.people) {
      if (!p.active || !p.email) continue;
      const myDepts = new Set(i.memberships.filter(m => m.person_id === p.id).map(m => m.department_id));
      const myTasks = i.tasks.filter(t => myDepts.has(t.department_id));
      if (!myTasks.length) continue;
      wanted.add(p.id);
      const names = [...new Set(myTasks.map(t => deptName.get(t.department_id) ?? t.department_id))];
      const content = buildInviteContent(e, myTasks, names, i.appUrl);
      const fp = await fingerprint(content);
      const prev = i.log.find(l => l.person_id === p.id);
      if (prev && prev.state === 'sent' && prev.fingerprint === fp && prev.email === p.email) continue;
      actions.push({ kind: 'request', person: p, email: p.email, sequence: prev ? prev.sequence + 1 : 0, content, fingerprint: fp });
    }
  }

  for (const prev of i.log) {
    if (prev.state !== 'sent' || wanted.has(prev.person_id)) continue;
    const name = i.people.find(p => p.id === prev.person_id)?.name ?? '';
    actions.push({
      kind: 'cancel', personId: prev.person_id, name, email: prev.email, sequence: prev.sequence + 1,
      content: buildInviteContent(e, [], [], i.appUrl),
    });
  }
  return actions;
}
