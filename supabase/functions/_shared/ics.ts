// RFC 5545 calendar invites (METHOD:REQUEST / CANCEL) that Outlook shows as meetings.
import { addMinutes, localToUtc } from './time.ts';
import type { EventRow, TaskRow } from './types.ts';

export interface InviteContent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
}

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** When the person needs to be there: prep/departure time if set, else start; ends at end time or start+2h. */
export function inviteWindow(e: Pick<EventRow, 'event_date' | 'start_time' | 'end_time' | 'prep_time'>) {
  const startAt = hhmm(e.prep_time) ?? hhmm(e.start_time) ?? '08:00';
  const start = localToUtc(e.event_date, startAt);
  const eventStart = localToUtc(e.event_date, hhmm(e.start_time) ?? startAt);
  let end = e.end_time ? localToUtc(e.event_date, hhmm(e.end_time)!) : addMinutes(eventStart, 120);
  if (end <= start) end = addMinutes(start, 60);
  return { start, end };
}

export function buildInviteContent(e: EventRow, myTasks: Pick<TaskRow, 'description'>[], deptNames: string[], appUrl: string): InviteContent {
  const { start, end } = inviteWindow(e);
  const lines: string[] = [];
  if (myTasks.length) {
    lines.push(`המשימה שלך (${deptNames.join(', ')}):`);
    for (const t of myTasks) lines.push(`• ${t.description || 'ללא פירוט'}`);
    lines.push('');
  }
  const add = (label: string, v: string | number | null | undefined) => { if (v !== null && v !== undefined && v !== '') lines.push(`${label}: ${v}`); };
  add('שעת התחלה', hhmm(e.start_time));
  add('יציאה / היערכות', hhmm(e.prep_time));
  add('מקום', e.location);
  add('כמות אנשים', e.guests);
  add('מוציא', e.lead);
  add('מקפל', e.teardown);
  add('ספקי חוץ', e.suppliers);
  if (e.menu) lines.push('', 'תפריט:', e.menu);
  if (e.notes) lines.push('', 'הערות:', e.notes);
  lines.push('', `לפרטים ואישור: ${appUrl}/?event=${e.id}`);
  return {
    uid: `${e.id}@events-board`,
    summary: `${e.tentative ? '(לא סגור) ' : ''}${e.title}`,
    location: e.location ?? '',
    description: lines.join('\n'),
    start,
    end,
  };
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Folds a content line at 75 octets without splitting a UTF-8 character. */
export function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (curBytes + b > limit) { out.push(cur); cur = ''; curBytes = 0; }
    cur += ch; curBytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export interface IcsOptions {
  method: 'REQUEST' | 'CANCEL';
  sequence: number;
  organizer: { name: string; email: string };
  attendee: { name: string; email: string };
  now?: Date;
  reminderMinutes?: number;
}

export function buildIcs(c: InviteContent, o: IcsOptions): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//Events Board//HE',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${o.method}`,
    'BEGIN:VEVENT',
    `UID:${c.uid}`,
    `SEQUENCE:${o.sequence}`,
    `DTSTAMP:${stamp(o.now ?? new Date())}`,
    `DTSTART:${stamp(c.start)}`,
    `DTEND:${stamp(c.end)}`,
    `SUMMARY:${esc(c.summary)}`,
    `LOCATION:${esc(c.location)}`,
    `DESCRIPTION:${esc(c.description)}`,
    `ORGANIZER;CN=${esc(o.organizer.name)}:mailto:${o.organizer.email}`,
    `ATTENDEE;CN=${esc(o.attendee.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${o.attendee.email}`,
    `STATUS:${o.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
  ];
  if (o.method === 'REQUEST') {
    lines.push('BEGIN:VALARM', `TRIGGER:-PT${o.reminderMinutes ?? 30}M`, 'ACTION:DISPLAY', 'DESCRIPTION:תזכורת', 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Stable hash of what the attendee sees, so unchanged events are not re-sent. */
export async function fingerprint(c: InviteContent): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify([c.summary, c.location, c.description, c.start.toISOString(), c.end.toISOString()]));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}
