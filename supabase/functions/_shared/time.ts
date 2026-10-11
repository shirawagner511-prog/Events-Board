// Wall-clock times are entered in Israel time; invites and monday use UTC.
export const TZ = 'Asia/Jerusalem';

function offsetMinutes(utc: Date, timeZone = TZ): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(utc).map(p => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utc.getTime()) / 60000);
}

/** "2026-10-18" + "13:00" in Israel → the matching UTC instant. */
export function localToUtc(date: string, time: string, timeZone = TZ): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let t = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  t = guess - offsetMinutes(new Date(t), timeZone) * 60000; // second pass settles DST edges
  return new Date(t);
}

/** A UTC instant → { date: "YYYY-MM-DD", time: "HH:MM" } in Israel. */
export function utcToLocal(utc: Date, timeZone = TZ): { date: string; time: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).formatToParts(utc).map(x => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Today's date in Israel as YYYY-MM-DD. */
export function todayLocal(now = new Date()): string {
  return utcToLocal(now).date;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60000);
}
