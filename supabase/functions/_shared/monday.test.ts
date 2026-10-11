import { mapMondayItem, COL, MENU_PAIRS, type MondayItem } from './monday.ts';

const item = (cols: Record<string, { text?: string; value?: unknown }>, name = 'הילה כהן'): MondayItem => ({
  id: '1', name,
  column_values: Object.entries(cols).map(([id, c]) => ({ id, text: c.text ?? null, value: c.value === undefined ? null : JSON.stringify(c.value) })),
});

describe('mapMondayItem', () => {
  it('maps fields and converts the UTC time to Israel time', () => {
    const f = mapMondayItem(item({
      [COL.title]: { text: 'Oktoberfest' },
      [COL.date]: { text: '2026-10-18 13:00', value: { date: '2026-10-18', time: '10:00:00' } },
      [COL.guests]: { text: '80' },
      [COL.location]: { text: 'Club' },
      [COL.custom]: { text: 'נקניקיות' },
      [MENU_PAIRS[0][0]]: { text: 'Fruit platter' }, [MENU_PAIRS[0][1]]: { text: '2' },
      [COL.note]: { text: 'ללא גלוטן' },
    }));
    expect(f).toEqual({
      title: 'Oktoberfest', event_date: '2026-10-18', start_time: '13:00', guests: 80, location: 'Club',
      menu: 'נקניקיות\nFruit platter ×2', requester: 'הילה כהן', notes: 'ללא גלוטן',
    });
  });
  it('drops test rows and rows without a date', () => {
    expect(mapMondayItem(item({ [COL.date]: { value: { date: '2026-10-18' } } }, 'test'))).toBeNull();
    expect(mapMondayItem(item({ [COL.title]: { text: 'x' } }))).toBeNull();
  });
  it('keeps a date without a time', () => {
    expect(mapMondayItem(item({ [COL.date]: { value: { date: '2026-10-18' } } }))?.start_time).toBeNull();
  });
});
