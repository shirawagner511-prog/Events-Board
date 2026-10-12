import { DEMO_VERSION } from './seed';

describe('demo data upgrade', () => {
  beforeEach(() => { localStorage.clear(); vi.resetModules(); });

  it('keeps events entered under an older demo version', async () => {
    const old = { version: 1, currentPersonId: 'yahli', people: [{ id: 'yahli', name: 'יהלי', role_title: null, email: null, is_admin: true, active: true, link_token: 't' }],
      memberships: [{ person_id: 'yahli', department_id: 'events' }], departments: [],
      events: [{ id: 'mine', status: 'published', title: 'אירוע שהוספתי', event_date: '2026-10-12', category: 'events', tentative: false, content_updated_at: '2026-10-12T08:00:00Z' }],
      tasks: [], requests: [], inviteLog: [], mondayPool: 0 };
    localStorage.setItem('events-board-demo', JSON.stringify(old));
    const api = await import('./api');
    const { events } = await api.loadRange('2026-10-12', '2026-10-12');
    expect(events.map(e => e.title)).toEqual(['אירוע שהוספתי']);
    expect(events[0].paid_staff).toBeNull();
    expect(JSON.parse(localStorage.getItem('events-board-demo')!).version).toBe(DEMO_VERSION);
  });
});
