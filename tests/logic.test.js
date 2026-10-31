import { describe, it, expect } from 'vitest';
import { checkStay, rankKennels, presentAt } from '../src/logic/occupancy.js';
import { stayUnits, autoCharges, isPaid, balance } from '../src/logic/pricing.js';
import { waNumber, buildStayIcs } from '../src/logic/messages.js';
import { defaultSettings } from '../src/model.js';

const at = (d, hh, mm = 0) => new Date(2026, 10, d, hh, mm).getTime(); // Nov 2026
const kennels = [1, 2, 3].map((n) => ({ id: 'k' + n, name: 'תא ' + n, capacity: 2 }));
const dog = (id, owner, extra = {}) => ({ id, name: id, contacts: [{ contactId: owner, role: 'owner' }], ...extra });
const stay = (id, kennelId, dogIds, start, end, extra = {}) => ({ id, kennelId, dogIds, start, end, ...extra });
const ctx = (stays, dogs, settings = defaultSettings()) => ({ stays, kennels, dogs, settings });

describe('checkStay', () => {
  const dogs = [dog('nela', 'c1'), dog('mika', 'c2'), dog('buddy', 'c3'), dog('choco', 'c3'), dog('tofi', 'c4', { aloneOnly: true })];

  it('clean turnover in the same day is fine', () => {
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(3, 10));
    const s2 = stay('b', 'k1', ['mika'], at(3, 16), at(5, 18));
    expect(checkStay(s2, ctx([s1], dogs))).toEqual([]);
  });

  it('overlapping hours of two families need confirmation, with the overlap window', () => {
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(3, 14));
    const s2 = stay('b', 'k1', ['mika'], at(3, 12), at(5, 18));
    const issues = checkStay(s2, ctx([s1], dogs));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ type: 'overlap', level: 'confirm', from: at(3, 12), to: at(3, 14) });
  });

  it('two dogs of one family share a kennel without warnings', () => {
    expect(checkStay(stay('a', 'k1', ['buddy', 'choco'], at(1, 8), at(4, 8)), ctx([], dogs))).toEqual([]);
  });

  it('a third dog needs admin', () => {
    const s1 = stay('a', 'k1', ['buddy', 'choco'], at(1, 8), at(4, 8));
    const issues = checkStay(stay('b', 'k1', ['nela'], at(2, 8), at(3, 8)), ctx([s1], dogs));
    expect(issues.map((i) => i.type).sort()).toEqual(['capacity', 'overlap']);
    expect(issues.find((i) => i.type === 'capacity').level).toBe('admin');
  });

  it('an early actual departure frees the kennel', () => {
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(3, 14), { departedAt: at(3, 9) });
    expect(checkStay(stay('b', 'k1', ['mika'], at(3, 12), at(5, 18)), ctx([s1], dogs))).toEqual([]);
  });

  it('alone-only dog needs admin', () => {
    const s1 = stay('a', 'k1', ['tofi'], at(1, 8), at(5, 8));
    const types = checkStay(stay('b', 'k1', ['nela'], at(2, 8), at(3, 8)), ctx([s1], dogs)).map((i) => i.type);
    expect(types).toContain('alone');
  });

  it('same dog twice is blocked, even in another kennel', () => {
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(5, 8));
    const issues = checkStay(stay('b', 'k2', ['nela'], at(2, 8), at(3, 8)), ctx([s1], dogs));
    expect(issues[0]).toMatchObject({ type: 'dog-double', level: 'block' });
  });

  it('cleaning gap warns on tight turnover', () => {
    const settings = { ...defaultSettings(), cleaningGapMin: 30 };
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(3, 12));
    const issues = checkStay(stay('b', 'k1', ['mika'], at(3, 12, 15), at(5, 8)), ctx([s1], dogs, settings));
    expect(issues.map((i) => i.type)).toEqual(['tight']);
  });

  it('approved issues are not asked again', () => {
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(3, 14));
    const s2 = stay('b', 'k1', ['mika'], at(3, 12), at(5, 18), { approvals: [{ key: 'overlap:a' }] });
    expect(checkStay(s2, ctx([s1], dogs))).toEqual([]);
  });

  it('a dog that arrived early is already in the kennel; a late dog keeps it reserved', () => {
    const early = stay('a', 'k1', ['nela'], at(3, 12), at(5, 8), { arrivedAt: at(3, 9) });
    expect(presentAt('k1', at(3, 10), [early])).toHaveLength(1);
    const issues = checkStay(stay('b', 'k1', ['mika'], at(1, 8), at(3, 11)), ctx([early], dogs));
    expect(issues.map((i) => i.type)).toEqual(['overlap']);
    const late = stay('c', 'k1', ['nela'], at(3, 12), at(5, 8));
    expect(presentAt('k1', at(3, 13), [late])).toHaveLength(1);
  });

  it('cancelled stays do not count', () => {
    const s1 = stay('a', 'k1', ['nela'], at(1, 8), at(5, 8), { cancelled: true });
    expect(checkStay(stay('b', 'k1', ['mika'], at(2, 8), at(3, 8)), ctx([s1], dogs))).toEqual([]);
    expect(presentAt('k1', at(2, 8), [s1])).toEqual([]);
  });
});

describe('rankKennels', () => {
  it('free first, and the kennel freed just before arrival wins', () => {
    const dogs = [dog('nela', 'c1'), dog('mika', 'c2')];
    const stays = [
      stay('a', 'k1', ['nela'], at(1, 8), at(3, 10)), // k1 frees at 3rd 10:00
      stay('b', 'k2', ['mika'], at(1, 8), at(6, 8)), // k2 busy
    ];
    const r = rankKennels(at(3, 16), at(5, 8), 1, ctx(stays, dogs));
    expect(r.map((x) => [x.kennel.id, x.status])).toEqual([['k1', 'free'], ['k3', 'free'], ['k2', 'partial']]);
  });
});

describe('pricing', () => {
  const pricing = { method: 'nights', lateHour: 14, lateFraction: 0.5 };
  it('three methods on Sunday 08:00 → Tuesday 18:00', () => {
    expect(stayUnits(at(1, 8), at(3, 18), pricing)).toBe(2);
    expect(stayUnits(at(1, 8), at(3, 18), { ...pricing, method: 'days' })).toBe(3);
    expect(stayUnits(at(1, 8), at(3, 18), { ...pricing, method: 'nightsLate' })).toBe(2.5);
    expect(stayUnits(at(1, 8), at(3, 10), { ...pricing, method: 'nightsLate' })).toBe(2);
  });

  it('auto charges: nights + second dog, day without lodging', () => {
    const s = defaultSettings();
    const two = autoCharges(at(1, 8), at(3, 18), 2, s);
    expect(two.map((c) => [c.label, c.qty, c.unitPrice])).toEqual([['לינה ללילה', 2, 130], ['כלב שני מאותו בית · ללילה', 2, 90]]);
    const day = autoCharges(at(1, 8), at(1, 18), 1, s);
    expect(day.map((c) => c.label)).toEqual(['יום בלי לינה']);
  });

  it('red until everything is paid', () => {
    const x = { charges: [{ qty: 2, unitPrice: 130 }], payments: [{ amount: 200 }] };
    expect(balance(x)).toBe(60);
    expect(isPaid(x)).toBe(false);
    x.payments.push({ amount: 60 });
    expect(isPaid(x)).toBe(true);
  });
});

describe('messages', () => {
  it('Israeli numbers for WhatsApp', () => {
    expect(waNumber('054-123 4567')).toBe('972541234567');
    expect(waNumber('+972 54 1234567')).toBe('972541234567');
  });

  it('ics is one event from arrival to pickup with the reminders from settings', () => {
    const ics = buildStayIcs({ id: 's1', dogNames: 'טופי', start: at(1, 8), end: at(3, 18), reminders: [10, 3, 1], now: at(1, 0) });
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain(`DTSTART:${new Date(at(1, 8)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    expect(ics).toContain(`DTEND:${new Date(at(3, 18)).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    expect(ics.match(/TRIGGER:-P\d+D/g)).toEqual(['TRIGGER:-P10D', 'TRIGGER:-P3D', 'TRIGGER:-P1D']);
    expect(ics).toContain('UID:s1@yuval-pension');
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
