import { planInvites, type PlanInput } from './invites.ts';
import { baseEvent } from './ics.test.ts';
import type { TaskRow } from './types.ts';

const task = (id: string, dept: string, description: string): TaskRow => ({
  id, event_id: 'e1', department_id: dept, description, sort: 0, seen_at: null, seen_by: null,
  done_at: null, done_by: null, content_updated_at: '',
});
const person = (id: string, name: string, email: string | null) => ({ id, name, email, role_title: null, is_admin: false, active: true });

const base = (): PlanInput => ({
  event: baseEvent,
  tasks: [task('t1', 'kitchen', 'פיצה'), task('t2', 'mk', 'שתייה'), task('t3', 'cafe', 'ברמנים')],
  people: [person('sagi', 'שגיא', 'sagi@x'), person('liel', 'ליאל', 'liel@x'), person('anat', 'ענת', 'anat@x'), person('inbar', 'ענבר', null)],
  memberships: [
    { person_id: 'sagi', department_id: 'kitchen' }, { person_id: 'inbar', department_id: 'kitchen' },
    { person_id: 'liel', department_id: 'mk' }, { person_id: 'liel', department_id: 'cafe' },
  ],
  departments: [{ id: 'kitchen', name: 'מטבח', color: '', sort: 1 }, { id: 'mk', name: 'MK', color: '', sort: 2 }, { id: 'cafe', name: 'קפה', color: '', sort: 3 }],
  log: [],
  today: '2026-10-20',
  appUrl: 'https://app',
});

describe('planInvites', () => {
  it('invites each person once with all their departments\' tasks; skips people without tasks or email', async () => {
    const a = await planInvites(base());
    expect(a.map(x => x.kind === 'request' && x.email)).toEqual(['sagi@x', 'liel@x']);
    const liel = a[1];
    expect(liel.kind === 'request' && liel.content.description).toContain('המשימה שלך (MK, קפה)');
  });

  it('does not resend when nothing changed, and bumps sequence when it did', async () => {
    const first = await planInvites(base());
    const log = first.map(x => x.kind === 'request'
      ? { person_id: x.person.id, email: x.email, sequence: x.sequence, fingerprint: x.fingerprint, state: 'sent' as const } : null!);
    expect(await planInvites({ ...base(), log })).toEqual([]);
    const moved = await planInvites({ ...base(), log, event: { ...baseEvent, start_time: '14:00:00' } });
    expect(moved.map(x => x.kind === 'request' && x.sequence)).toEqual([1, 1]);
  });

  it('cancels for people who lost their task, and for everyone when cancelled', async () => {
    const log = [{ person_id: 'anat', email: 'anat@x', sequence: 0, fingerprint: 'x', state: 'sent' as const }];
    const a = await planInvites({ ...base(), log });
    expect(a.filter(x => x.kind === 'cancel').map(x => x.email)).toEqual(['anat@x']);
    const c = await planInvites({ ...base(), log, event: { ...baseEvent, status: 'cancelled' } });
    expect(c.map(x => x.kind)).toEqual(['cancel']);
  });

  it('sends nothing for drafts or past events', async () => {
    expect(await planInvites({ ...base(), event: { ...baseEvent, status: 'pending' } })).toEqual([]);
    expect(await planInvites({ ...base(), today: '2026-10-26' })).toEqual([]);
  });
});
