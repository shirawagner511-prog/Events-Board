// A multipart/alternative message with a text/calendar part: the shape Outlook renders
// as a meeting invite (accept/decline bar, lands in the calendar, updates in place).

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};
const wrap76 = (s: string) => s.replace(/.{1,76}/g, m => m + '\r\n').trimEnd();
const encodeWord = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const addr = (name: string, email: string) => (name ? `${encodeWord(name)} <${email}>` : email);

export interface InviteMail {
  from: { name: string; email: string };
  to: { name: string; email: string };
  subject: string;
  text: string;
  ics: string;
  method: 'REQUEST' | 'CANCEL';
  messageId?: string;
  date?: Date;
}

export function buildInviteMime(m: InviteMail): string {
  const boundary = `=_eb_${crypto.randomUUID()}`;
  return [
    `From: ${addr(m.from.name, m.from.email)}`,
    `To: ${addr(m.to.name, m.to.email)}`,
    `Subject: ${encodeWord(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString()}`,
    `Message-ID: <${m.messageId ?? crypto.randomUUID()}@events-board>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(m.text)),
    `--${boundary}`,
    `Content-Type: text/calendar; charset=UTF-8; method=${m.method}`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64(m.ics)),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

export { b64 as base64Utf8 };
