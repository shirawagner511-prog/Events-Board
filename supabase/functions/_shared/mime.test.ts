import { buildInviteMime } from './mime.ts';

it('builds multipart/alternative with a calendar part carrying the method', () => {
  const mime = buildInviteMime({
    from: { name: 'לוח אירועים', email: 'events@x.com' }, to: { name: 'שגיא', email: 'sagi@x.com' },
    subject: 'אירוע: האפי אוור', text: 'שלום', ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', method: 'REQUEST',
  });
  expect(mime).toMatch(/^From: =\?UTF-8\?B\?.+\?= <events@x\.com>\r\n/);
  expect(mime).toContain('Content-Type: multipart/alternative;');
  expect(mime).toContain('Content-Type: text/calendar; charset=UTF-8; method=REQUEST');
  const icsPart = mime.split('method=REQUEST\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0];
  expect(Buffer.from(icsPart.replace(/\r\n/g, ''), 'base64').toString()).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n');
});
