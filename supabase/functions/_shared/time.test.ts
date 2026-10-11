import { localToUtc, utcToLocal } from './time.ts';

describe('time', () => {
  it('converts Israel summer and winter time to UTC', () => {
    expect(localToUtc('2026-07-01', '13:00').toISOString()).toBe('2026-07-01T10:00:00.000Z'); // IDT +3
    expect(localToUtc('2026-12-01', '13:00').toISOString()).toBe('2026-12-01T11:00:00.000Z'); // IST +2
  });
  it('round-trips', () => {
    expect(utcToLocal(new Date('2026-10-18T07:30:00Z'))).toEqual({ date: '2026-10-18', time: '10:30' });
    expect(utcToLocal(new Date('2026-10-18T22:30:00Z'))).toEqual({ date: '2026-10-19', time: '01:30' });
  });
});
