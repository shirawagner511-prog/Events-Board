import { buildIcs, buildInviteContent, fold, inviteWindow } from './ics.ts';
import type { EventRow } from './types.ts';

export const baseEvent: EventRow = {
  id: 'e1', status: 'published', tentative: false, category: 'events', title: 'האפי אוור בחירות',
  event_date: '2026-10-25', start_time: '13:00:00', end_time: null, prep_time: '11:30:00',
  location: 'רחבת הקפה', guests: 200, menu: 'פיצה טאבון\nקרפים', requester: 'HR', lead: 'יהלי',
  teardown: 'ליאל', suppliers: null, paid_staff: 2, notes: 'ברמן מגיע 11:00', source: 'manual', monday_item_id: null,
  monday_dirty: false, content_updated_at: '', published_at: '', updated_at: '',
};

describe('inviteWindow', () => {
  it('starts at prep time and ends 2h after the event start', () => {
    const { start, end } = inviteWindow(baseEvent);
    expect(start.toISOString()).toBe('2026-10-25T09:30:00.000Z'); // 11:30 IST (+2 after DST ends 25.10)
    expect(end.toISOString()).toBe('2026-10-25T13:00:00.000Z');
  });
  it('falls back to start time, then 08:00', () => {
    expect(inviteWindow({ ...baseEvent, prep_time: null }).start.toISOString()).toBe('2026-10-25T11:00:00.000Z');
    expect(inviteWindow({ ...baseEvent, prep_time: null, start_time: null }).start.toISOString()).toBe('2026-10-25T06:00:00.000Z');
  });
});

describe('buildIcs', () => {
  const content = buildInviteContent(baseEvent, [{ description: 'דוכן פיצה' }], ['מטבח'], 'https://app');
  const ics = buildIcs(content, {
    method: 'REQUEST', sequence: 2, organizer: { name: 'לוח אירועים', email: 'events@x.com' },
    attendee: { name: 'שגיא', email: 'sagi@x.com' }, now: new Date('2026-10-20T00:00:00Z'),
  });
  const unfolded = ics.replace(/\r\n /g, '');
  it('is a REQUEST with stable uid, sequence and reminder', () => {
    expect(unfolded).toContain('METHOD:REQUEST');
    expect(unfolded).toContain('UID:e1@events-board');
    expect(unfolded).toContain('SEQUENCE:2');
    expect(unfolded).toContain('DTSTART:20261025T093000Z');
    expect(unfolded).toContain('TRIGGER:-PT30M');
    expect(unfolded).toContain('mailto:sagi@x.com');
  });
  it('puts the person\'s task first and escapes text', () => {
    expect(unfolded).toContain('DESCRIPTION:המשימה שלך (מטבח):\\n• דוכן פיצה');
    expect(unfolded).toContain('תפריט:\\nפיצה טאבון\\nקרפים');
  });
  it('uses CRLF and folds every line to 75 octets', () => {
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it('cancel has no alarm', () => {
    const c = buildIcs(content, { method: 'CANCEL', sequence: 3, organizer: { name: 'a', email: 'a@x' }, attendee: { name: 'b', email: 'b@x' } });
    expect(c).toContain('STATUS:CANCELLED');
    expect(c).not.toContain('VALARM');
  });
});

describe('fold', () => {
  it('never splits a multibyte character', () => {
    const folded = fold('DESCRIPTION:' + 'שלום'.repeat(40));
    expect(folded.replace(/\r\n /g, '')).toBe('DESCRIPTION:' + 'שלום'.repeat(40));
  });
});
