// Maps an item of the "Playtika Event Form ISR" board to normalised request fields.
import { utcToLocal } from './time.ts';

export interface MondayColumn { id: string; text: string | null; value: string | null }
export interface MondayItem { id: string; name: string; column_values: MondayColumn[] }

export interface RequestFields {
  title: string;
  event_date: string;
  start_time: string | null;
  guests: number | null;
  location: string | null;
  menu: string | null;
  requester: string;
  notes: string | null;
}

export const COL = {
  title: 'short_text_mkmksatp',
  date: 'date_mkmkterr',
  guests: 'number_mkmk7xm5',
  location: 'short_text_mkmk49fb',
  custom: 'long_text_mkmkjbwg',
  note: 'short_text_mkmk9xtc',
};

// Menu item N dropdown ↔ quantity N.
export const MENU_PAIRS: [string, string][] = [
  ['dropdown_mkpb9879', 'numeric_mkpbz14v'], ['dropdown_mkpb3bpz', 'numeric_mkpbqqn5'],
  ['dropdown_mkpbw2jy', 'numeric_mkpbz28s'], ['dropdown_mkpbgpvh', 'numeric_mkpb7epc'],
  ['dropdown_mkpb4qyd', 'numeric_mkpbbxb4'], ['dropdown_mkpbd2nv', 'numeric_mkpbbjc4'],
  ['dropdown_mkpbm6xp', 'numeric_mkpbhsbe'], ['dropdown_mkpbhtpy', 'numeric_mkpb2z0'],
  ['dropdown_mkpb8nq7', 'numeric_mkpbnhh2'], ['dropdown_mkpbvpkb', 'numeric_mkpbrbxz'],
];

export const ALL_COLUMN_IDS = [...Object.values(COL), ...MENU_PAIRS.flat()];

const TEST_MARKERS = ['טסט', 'test', 'בדיקה', 'חחח', 'jsj', 'www', 'here'];

/** Returns null for test submissions and rows without a date. */
export function mapMondayItem(item: MondayItem): RequestFields | null {
  const col = new Map(item.column_values.map(c => [c.id, c]));
  const text = (id: string) => col.get(id)?.text?.trim() || null;

  const raw = col.get(COL.date)?.value;
  let date: string | null = null;
  let time: string | null = null;
  if (raw) {
    try {
      const v = JSON.parse(raw) as { date?: string; time?: string | null };
      if (v.date && v.time) ({ date, time } = utcToLocal(new Date(`${v.date}T${v.time}Z`))); // monday stores time in UTC
      else date = v.date ?? null;
    } catch { /* fall through */ }
  }
  if (!date) return null;

  const title = text(COL.title) ?? item.name;
  const location = text(COL.location);
  const guests = text(COL.guests) ? Number(text(COL.guests)) : null;
  const haystack = `${item.name} ${title} ${location ?? ''}`.toLowerCase();
  if (TEST_MARKERS.some(m => haystack.includes(m)) || (guests ?? 0) >= 500) return null;

  const menuLines: string[] = [];
  const custom = text(COL.custom);
  if (custom) menuLines.push(custom);
  for (const [dd, qty] of MENU_PAIRS) {
    const label = text(dd);
    if (!label) continue;
    const n = text(qty);
    menuLines.push(n ? `${label} ×${n}` : label);
  }

  return {
    title,
    event_date: date,
    start_time: time,
    guests: Number.isFinite(guests) ? guests : null,
    location,
    menu: menuLines.join('\n') || null,
    requester: item.name,
    notes: text(COL.note),
  };
}
