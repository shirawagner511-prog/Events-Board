// Calendar arithmetic on plain YYYY-MM-DD strings (no time zones involved).
export const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const WEEKDAYS_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parse = (s: string) => new Date(`${s}T00:00:00Z`);

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

export function addMonths(s: string, n: number): string {
  const d = parse(s);
  return iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)));
}

export const weekday = (s: string) => parse(s).getUTCDay();
export const startOfWeek = (s: string) => addDays(s, -weekday(s));          // Sunday
export const startOfMonth = (s: string) => s.slice(0, 8) + '01';

/** Six-or-fewer Sunday-first weeks covering the month of `s`. */
export function monthGrid(s: string): string[][] {
  const first = startOfMonth(s);
  const month = first.slice(0, 7);
  let day = startOfWeek(first);
  const weeks: string[][] = [];
  do {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
    day = addDays(day, 7);
  } while (day.slice(0, 7) === month);
  return weeks;
}

export const monthTitle = (s: string) => `${MONTHS[parse(s).getUTCMonth()]} ${parse(s).getUTCFullYear()}`;
export const dayTitle = (s: string) => `יום ${WEEKDAYS_LONG[weekday(s)]}, ${+s.slice(8)} ב${MONTHS[+s.slice(5, 7) - 1]}`;
export const shortDate = (s: string) => `${+s.slice(8)}.${+s.slice(5, 7)}`;
export const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '');

export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

export function relativeDay(s: string, today: string): string | null {
  if (s === today) return 'היום';
  if (s === addDays(today, 1)) return 'מחר';
  if (s === addDays(today, -1)) return 'אתמול';
  return null;
}
