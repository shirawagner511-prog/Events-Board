import { closeEvents, isMine, needsAttention, taskState } from './board';
import { monthGrid, relativeDay, startOfWeek } from './dates';
import type { EventRow, Me, TaskRow } from './types';

const ev = (p: Partial<EventRow>): EventRow => ({
  id: 'e', status: 'published', tentative: false, category: 'events', title: 't', event_date: '2026-10-12',
  start_time: null, end_time: null, prep_time: null, location: null, guests: null, menu: null, requester: null,
  lead: null, teardown: null, suppliers: null, paid_staff: null, notes: null, source: 'manual', monday_item_id: null, monday_dirty: false,
  content_updated_at: '2026-10-10T10:00:00Z', published_at: null, updated_at: '', ...p,
});
const task = (p: Partial<TaskRow>): TaskRow => ({
  id: 't', event_id: 'e', department_id: 'mk', description: '', sort: 0, seen_at: null, seen_by: null,
  done_at: null, done_by: null, content_updated_at: '2026-10-10T10:00:00Z', ...p,
});
const liel: Me = { id: 'p', name: 'ליאל', role_title: null, is_admin: false, departments: ['mk'] };

describe('taskState', () => {
  it('moves new → seen → updated (after an edit) → done', () => {
    expect(taskState(task({}), ev({}))).toBe('new');
    const seen = task({ seen_at: '2026-10-11T00:00:00Z' });
    expect(taskState(seen, ev({}))).toBe('seen');
    expect(taskState(seen, ev({ content_updated_at: '2026-10-11T08:00:00Z' }))).toBe('updated');
    expect(taskState(task({ ...seen, content_updated_at: '2026-10-11T08:00:00Z' }), ev({}))).toBe('updated');
    expect(taskState(task({ done_at: '2026-10-11T00:00:00Z' }), ev({}))).toBe('done');
  });
});

describe('isMine', () => {
  it('matches by department task or by name in lead/teardown', () => {
    expect(isMine(ev({}), [task({})], liel)).toBe(true);
    expect(isMine(ev({}), [task({ department_id: 'cafe' })], liel)).toBe(false);
    expect(isMine(ev({ teardown: 'ליאל + 1' }), [], liel)).toBe(true);
  });
});

describe('needsAttention', () => {
  it('lists unconfirmed tasks of published events today and tomorrow only', () => {
    const events = [
      ev({ id: 'a', event_date: '2026-10-11' }), ev({ id: 'b', event_date: '2026-10-12' }),
      ev({ id: 'c', event_date: '2026-10-13' }), ev({ id: 'd', event_date: '2026-10-12', status: 'pending' }),
    ];
    const tasks = new Map(events.map(e => [e.id, [task({ event_id: e.id })]]));
    expect(needsAttention(events, tasks, '2026-10-11').map(a => a.event.id)).toEqual(['a', 'b']);
  });
});

describe('closeEvents', () => {
  it('flags overlapping or back-to-back events', () => {
    const r = closeEvents([
      ev({ id: 'a', start_time: '12:30:00' }),                      // busy 12:30–14:30
      ev({ id: 'b', start_time: '14:00:00', prep_time: '13:30:00' }),
      ev({ id: 'c', start_time: '18:00:00' }),
    ]);
    expect([...r].sort()).toEqual(['a', 'b']);
  });
});

describe('dates', () => {
  it('builds Sunday-first month grids', () => {
    const g = monthGrid('2026-10-15');
    expect(g[0][0]).toBe('2026-09-27');
    expect(g[0][4]).toBe('2026-10-01');
    expect(g.at(-1)!.at(-1)).toBe('2026-10-31');
  });
  it('labels nearby days', () => {
    expect(startOfWeek('2026-10-14')).toBe('2026-10-11');
    expect(relativeDay('2026-10-12', '2026-10-11')).toBe('מחר');
  });
});
