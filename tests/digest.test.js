import { describe, it, expect } from 'vitest';
import { ilAt, ilTime, ilDayStart, morningDigest, eveningDigest, dueNotifications } from '../src/logic/digest.js';

// Israel time, independent of the machine's time zone
const IL = (date, time) => ilAt(Date.parse(date + 'T12:00:00Z'), time);

const data = () => ({
  kennels: [{ id: 'k1', name: 'תא 1' }, { id: 'k3', name: 'תא 3' }],
  dogs: [
    { id: 'nela', name: 'נלה' },
    { id: 'mika', name: 'מיקה' },
    { id: 'tofi', name: 'טופי', flag: 'נוהם ליד הקערה' },
    { id: 'ginger', name: 'ג׳ינג׳ר' },
  ],
  stays: [
    { id: 's1', kennelId: 'k3', dogIds: ['nela'], start: IL('2026-11-08', '12:00'), end: IL('2026-11-10', '14:00'), charges: [{ qty: 2, unitPrice: 130 }], payments: [] },
    { id: 's2', kennelId: 'k3', dogIds: ['mika'], start: IL('2026-11-10', '12:00'), end: IL('2026-11-12', '18:00'), charges: [{ qty: 2, unitPrice: 130 }], payments: [{ amount: 260 }] },
    { id: 's3', kennelId: 'k1', dogIds: ['tofi'], start: IL('2026-11-10', '18:00'), end: IL('2026-11-11', '08:00'), charges: [], payments: [] },
  ],
  trainings: [{ id: 't1', dogId: 'ginger', start: IL('2026-11-10', '16:00'), end: IL('2026-11-10', '17:00'), address: 'הגפן 3' }],
  settings: {},
});

describe('Israel time on a UTC server', () => {
  it('winter and summer offsets', () => {
    expect(new Date(IL('2026-11-10', '07:30')).toISOString()).toBe('2026-11-10T05:30:00.000Z');
    expect(new Date(IL('2026-07-10', '07:30')).toISOString()).toBe('2026-07-10T04:30:00.000Z');
    expect(ilTime(Date.parse('2026-11-10T05:30:00Z'))).toBe('07:30');
    expect(new Date(ilDayStart(Date.parse('2026-11-10T23:30:00Z'))).toISOString()).toBe('2026-11-10T22:00:00.000Z');
  });
});

describe('digests', () => {
  it('morning lists arrivals (with ⚠), departures with money to collect, lessons and dog count', () => {
    const { title, body } = morningDigest(data(), IL('2026-11-10', '07:30'));
    expect(title).toBe('בוקר טוב · היום בפנסיון');
    expect(body).toBe('נכנסים: מיקה 12:00, טופי ⚠ 18:00\nיוצאים: נלה 14:00 (לגבות ₪260)\nאילוף: ג׳ינג׳ר 16:00\n1 כלבים בפנסיון');
  });

  it('evening lists what is still open today and what comes tomorrow', () => {
    const { body } = eveningDigest(data(), IL('2026-11-10', '20:00'));
    expect(body).toBe('לא סומן שהגיע: מיקה, טופי\nלא סומן שיצא: נלה\nלגבות: נלה ₪260\nמחר: יוצאים טופי 08:00');
  });
});

describe('what is due in a 5-minute window', () => {
  it('morning summary once, at the set time', () => {
    const due = dueNotifications(data(), IL('2026-11-10', '07:26'), IL('2026-11-10', '07:31'));
    expect(due.map((d) => d.key)).toEqual(['morning:2026-11-10']);
    expect(dueNotifications(data(), IL('2026-11-10', '07:31'), IL('2026-11-10', '07:36'))).toEqual([]);
  });

  it('reminders an hour before a lesson, an arrival and a departure', () => {
    const d = data();
    expect(dueNotifications(d, IL('2026-11-10', '14:56'), IL('2026-11-10', '15:01')).map((x) => [x.key, x.title, x.body])).toEqual([
      ['lesson:t1:' + IL('2026-11-10', '16:00'), 'בעוד שעה: אילוף', 'ג׳ינג׳ר · 16:00 · הגפן 3'],
    ]);
    expect(dueNotifications(d, IL('2026-11-10', '10:56'), IL('2026-11-10', '11:01')).map((x) => x.title)).toEqual(['בעוד שעה: מיקה מגיע']);
    expect(dueNotifications(d, IL('2026-11-10', '12:56'), IL('2026-11-10', '13:01')).map((x) => x.body)).toEqual(['תא 3 · 14:00 · לגבות ₪260']);
  });

  it('settings: times, lead times and switching things off', () => {
    const d = data();
    d.settings.notify = { morningTime: '06:00', lessonMin: 180, moveOn: false, eveningOn: false };
    expect(dueNotifications(d, IL('2026-11-10', '05:56'), IL('2026-11-10', '06:01')).map((x) => x.key)).toEqual(['morning:2026-11-10']);
    expect(dueNotifications(d, IL('2026-11-10', '12:56'), IL('2026-11-10', '13:01')).map((x) => x.title)).toEqual(['בעוד 3 שעות: אילוף']);
    expect(dueNotifications(d, IL('2026-11-10', '10:56'), IL('2026-11-10', '11:01'))).toEqual([]);
  });

  it('no arrival reminder once the dog already came early', () => {
    const d = data();
    d.stays[1].arrivedAt = IL('2026-11-10', '09:00');
    expect(dueNotifications(d, IL('2026-11-10', '10:56'), IL('2026-11-10', '11:01'))).toEqual([]);
  });
});
