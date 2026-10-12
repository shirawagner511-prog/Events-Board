// Sample data for demo mode, taken from the October 2026 board and placed around the current week.
import { addDays, startOfWeek, todayIso } from '../dates';
import type { Department, EventRow, TaskRow } from '../types';

export interface DemoPerson {
  id: string; name: string; role_title: string | null; email: string | null; is_admin: boolean; active: boolean; link_token: string;
}
export interface DemoRequest {
  item_id: string; fields: Record<string, unknown> & { title: string; event_date: string; start_time: string | null };
  status: 'new' | 'linked' | 'dismissed'; event_id: string | null; suggested_event_id: string | null; received_at: string;
}
export interface DemoDb {
  version: number;
  currentPersonId: string;
  departments: Department[];
  people: DemoPerson[];
  memberships: { person_id: string; department_id: string }[];
  events: EventRow[];
  tasks: TaskRow[];
  requests: DemoRequest[];
  files: import('../types').EventFile[];
  inviteLog: { event_id: string; person_id: string; email: string; sequence: number; fingerprint: string | null; state: 'sent' | 'cancelled' }[];
  mondayPool: number;
}

export const DEMO_VERSION = 4;

export function seed(): DemoDb {
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 2 * 86400000).toISOString();
  const W = startOfWeek(todayIso());
  const day = (n: number) => addDays(W, n);

  const departments: Department[] = [
    { id: 'events', name: 'אירועים', color: '#dc3b3b', sort: 1 },
    { id: 'kitchen', name: 'מטבח', color: '#1f9d55', sort: 2 },
    { id: 'mk', name: 'MK', color: '#d9921a', sort: 3 },
    { id: 'cafe', name: 'קפה', color: '#2f6fdb', sort: 4 },
    { id: 'ops', name: 'שירה', color: '#0e9aa7', sort: 5 },
    { id: 'site', name: 'ניהול אתר', color: '#64748b', sort: 6 },
  ];
  const P = (id: string, name: string, role_title: string, depts: string[], is_admin = false) =>
    ({ person: { id, name, role_title, email: `${id}@example.com`, is_admin, active: true, link_token: `demo-${id}` }, depts });
  const team = [
    P('yahli', 'יהלי', 'מנהלת אירועים', ['events'], true),
    P('shira', 'שירה', 'מנהלת אופרציה', ['ops'], true),
    P('sagi', 'שגיא', 'שף', ['kitchen']),
    P('inbar', 'ענבר', 'סו שף', ['kitchen']),
    P('liel', 'ליאל', 'מנהל מטבחונים', ['mk']),
    P('liran', 'לירן', 'מנהל קפה ובר בריאות', ['cafe']),
    P('anat', 'ענת', 'מנהלת אתר ולקוח', ['site']),
  ];

  let n = 0;
  const events: EventRow[] = [];
  const E = (d: string, title: string, o: Partial<EventRow> = {}) => {
    const e: EventRow = {
      id: `ev${++n}`, status: 'published', tentative: false, category: 'events', title, event_date: d,
      start_time: null, end_time: null, prep_time: null, location: null, guests: null, menu: null, requester: null,
      lead: null, teardown: null, suppliers: null, paid_staff: null, notes: null, source: 'manual', monday_item_id: null, monday_dirty: false,
      content_updated_at: earlier, published_at: earlier, updated_at: earlier, ...o,
    };
    events.push(e);
    return e.id;
  };
  let tn = 0;
  const tasks: TaskRow[] = [];
  const T = (event_id: string, department_id: string, description: string, o: Partial<TaskRow> = {}) =>
    tasks.push({ id: `tk${++tn}`, event_id, department_id, description, sort: tn, seen_at: null, seen_by: null, done_at: null, done_by: null, content_updated_at: earlier, ...o });
  const seen = (by: string) => ({ seen_at: now, seen_by: by });

  // Last week
  const wsop = E(day(-3), 'כיבוד בוקר - WSOP', { start_time: '10:00', prep_time: '09:30', location: 'החושלים 8 קומה 4 צפון', menu: '20 חצאי סנדוויצים\n1 מגש מאפים מתוקים\n1 מגש מאפים מלוחים\n1 מגש עוגיות' });
  T(wsop, 'kitchen', 'הכנת הסנדוויצים והמגשים', { ...seen('sagi'), done_at: now, done_by: 'sagi' });
  const shawarma = E(day(-4), 'שווארמה צארום', { start_time: '12:30', location: 'מועדון', category: 'kitchen' });
  T(shawarma, 'ops', 'סטנד ביי לעזרה עקב אירועים צמודים', { ...seen('shira'), done_at: now, done_by: 'shira' });

  // This week
  const burger = E(day(0), 'אירוע מילואימניקים - המבורגר', { start_time: '18:45', prep_time: '17:45', location: 'מועדון', guests: 90, menu: 'המבורגר בורגר סטיישן', category: 'welfare', lead: 'שגיא' });
  T(burger, 'mk', 'לשים לב למלא מקררים במועדון', seen('liel'));
  T(burger, 'kitchen', 'בורגר סטיישן - הכנה ותפעול', seen('sagi'));
  const crepe = E(day(1), 'מתכון עם זיכרון - עמדת קרפ', { start_time: '08:30', location: 'ארוחות בוקר - קפה', category: 'kitchen' });
  T(crepe, 'kitchen', 'לתפעל עמדת קרפים');
  T(crepe, 'cafe', 'עזרה בהקמה וקיפול עמדות', seen('liran'));
  T(crepe, 'ops', 'לוודא שהתשתיות מוכנות לאירוע', { ...seen('shira'), done_at: now, done_by: 'shira' });
  const hh = E(day(1), 'האפי אוור / הרמת כוסית - מעיין עסיס', { start_time: '11:30', location: 'מרפסת רכש', menu: 'מאפים סניורה\nעמדת ורמוט שפרייץ', lead: 'יהלי +1', teardown: 'יהלי +1', requester: 'מעיין עסיס' });
  T(hh, 'mk', 'עזרה בהקמת עמדה ובפינוי אירוע ביחד עם יהלי');
  T(hh, 'cafe', 'עובד שיעזור לפרוס אירוע', seen('liran'));
  T(hh, 'kitchen', 'הכנת תפריט וארגון אוכל בסקן בוקס');
  const health = E(day(1), 'אירוע בריאות - טל דהן', { start_time: '14:00', prep_time: '13:00', location: 'חושלים 4 קומה 5 מטבח', menu: 'פריסת חטיפי בריאות ומיצי בריאות מהקונדיטוריה', category: 'cafe' });
  T(health, 'ops', 'עזרה בהקמה אירוע');
  T(health, 'cafe', 'חטיפים ומיצים מהקונדיטוריה');
  const welfare = E(day(1), 'כיבוד רווחה', { start_time: '16:00', prep_time: '15:20', location: 'חדר אופסייט', menu: '1 פלטת פירות\n1 עוגיות\n1 מאפים מתוקים\n1 מאפים מלוחים', category: 'welfare', content_updated_at: now });
  T(welfare, 'mk', 'קיפול בוקר אחרי', { seen_at: earlier, seen_by: 'liel' });
  T(welfare, 'kitchen', 'שימו לב לפלטת פירות');
  E(day(2), 'אירוע רפידוס אודיה', { start_time: '13:00', guests: 40, tentative: true, notes: 'עוד לא סגור מול הלקוח' });
  const dolly = E(day(3), 'אירוע דולי בייקרי - נשנושים בריאים', { start_time: '10:00', location: 'מועדון', category: 'cafe', menu: 'שתייה ואוכל מהמטבח המרכזי' });
  T(dolly, 'mk', 'למלא שתייה במועדון');
  T(dolly, 'ops', 'לתגבר את שירה בארוחת בוקר במידת הצורך');
  const italian = E(day(3), 'אירוע מילואמניקים איטלקי - רווחה', { start_time: '16:00', prep_time: '15:30', location: 'מועדון', guests: 120, menu: 'אוכל - מטבח שגב, תפריט אצל שגיא', lead: 'יהלי, שירה, ענבר', paid_staff: 1, category: 'welfare' });
  T(italian, 'mk', 'למלא שתייה במועדון');
  T(italian, 'kitchen', 'תפריט בנוי לאירוע');
  T(italian, 'ops', 'הוצאת אירוע ביחד עם יהלי');
  const morning = E(day(4), 'אירוע כיבוד בוקר', { location: 'חדר אופסייט', menu: 'פלטת ירקות + 2 מטבלים\nפלטת פירות' });
  T(morning, 'mk', 'נעמה - להוציא פלטות וקיפול');
  const salad = E(day(4), 'אירוע - בר סלטים', { start_time: '13:00', location: 'חושלים 4 קומה 5 מטבח', menu: 'בר סלט - תפריט מול שגיא + הזמנה מקומפנייא', lead: 'יהלי', suppliers: 'קומפנייא' });
  T(salad, 'kitchen', 'עזרה מטבח להוציא את האירוע');
  const poker = E(day(4), 'פוקר', { start_time: '15:30', prep_time: '14:30', location: 'חדר ישיבות קומה 5 צפון', menu: 'פיצוחים ובירות' });
  T(poker, 'mk', 'צריכים מכם בירות וקיפול במידת הצורך יום אחרי');

  // Next week
  const okt = E(day(7), '"אוקטובר פסט" הילה', { start_time: '13:00', menu: 'נקניקיות מביירס מרקט', lead: 'יהלי + שירה', suppliers: 'ביירס מרקט' });
  T(okt, 'mk', 'עזרה בפינוי');
  T(okt, 'cafe', 'להביא עמדה');
  const offsite = E(day(7), 'אופסייט ליאור קינן', { start_time: '13:30', prep_time: '13:00', location: 'חדר אופסייט', menu: '1 פלטת פירות קטנה אך מכובדת - הנהלה' });
  T(offsite, 'mk', 'נעמה מוציאה ומקפלת');
  const women = E(day(10), 'אירוע נשים רווחה', { start_time: '17:00', prep_time: '15:30', location: 'מועדון', menu: 'שולחן מאפים סניורה\nאוכל ממטבח שגב - תפריט מפורט אצל שגיא\nשתייה: יין לבן', lead: 'יהלי +1', category: 'welfare' });
  T(women, 'mk', 'לשים לב לשתייה במועדון ופינויים יום אחרי במידת הצורך');
  T(women, 'ops', 'הוצאת אירוע ביחד עם יהלי');
  T(women, 'kitchen', 'ארגון האוכל בסקן בוקס');
  const hhElections = E(day(14), 'HAPPY HOUR בחירות', { start_time: '13:00', prep_time: '11:00', location: 'רחבת הקפה ובחוץ', menu: 'פנים: דוכן יין/בירה, דוכן בורקס\nבחוץ: דוכן פיצה טאבון, דוכן קרפים', lead: 'יהלי, שירה (ראנרים)', paid_staff: 2 });
  T(hhElections, 'cafe', '3 ברמנים לצורך האירוע, 2 בתשלום - הקמה, תפעול ופינוי');
  T(hhElections, 'kitchen', 'תפעול דוכן פיצה (שגיא + ליאל)');
  T(hhElections, 'mk', 'עזרה בהקמה - ליאל באירוע, עזרה בפינוי');
  T(hhElections, 'ops', 'עזרה בהקמה, תפעול ופינוי');

  // A draft Yahli has not published yet
  E(day(9), 'ארוחת צהריים לצוות מכירות', { status: 'pending', published_at: null, guests: 25, notes: 'סוכם בוואטסאפ, מחכה לטופס' });

  return {
    version: DEMO_VERSION,
    currentPersonId: 'yahli',
    departments,
    people: team.map(t => t.person),
    memberships: team.flatMap(t => t.depts.map(d => ({ person_id: t.person.id, department_id: d }))),
    events,
    tasks,
    requests: [{
      item_id: 'mon-1', status: 'new', event_id: null, suggested_event_id: okt, received_at: now,
      fields: { title: 'Oktoberfest - Hila', event_date: day(7), start_time: '13:00', guests: 80, location: 'Club', menu: 'Sausages ×80', requester: 'הילה כהן', notes: null },
    }],
    files: [],
    inviteLog: [],
    mondayPool: 0,
  };
}

/** Forms that "arrive" each time the demo's monday sync button is pressed. */
export function mondayPool(): Omit<DemoRequest, 'status' | 'event_id' | 'suggested_event_id' | 'received_at'>[] {
  const W = startOfWeek(todayIso());
  return [
    { item_id: 'mon-2', fields: { title: 'Sales team lunch', event_date: addDays(W, 9), start_time: '12:30', guests: 25, location: 'חדר אופסייט', menu: 'Sandwich platter ×3\nFruit platter ×1', requester: 'דנה לוי', notes: 'אחד צמחוני' } },
    { item_id: 'mon-3', fields: { title: 'Welcome breakfast - new employees', event_date: addDays(W, 8), start_time: '09:00', guests: 15, location: 'מרפסת קומה 4', menu: 'Pastries ×2', requester: 'HR', notes: null } },
  ];
}
