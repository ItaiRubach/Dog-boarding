// Kennel occupancy rules. A stay occupies its kennel from `start` until it
// actually departs (departedAt) or its planned `end`, whichever is earlier.
import { DAY } from './util.js';

export const effEnd = (s) => (s.departedAt && s.departedAt < s.end ? s.departedAt : s.end);
export const isActive = (s) => !s.cancelled;
const overlap = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;

/** Owner contact ids of all dogs in a stay. */
export function ownerSet(stay, dogsById) {
  const set = new Set();
  for (const id of stay.dogIds) {
    for (const c of dogsById[id]?.contacts || []) if (c.role === 'owner') set.add(c.contactId);
  }
  return set;
}

/** Two stays are one family when they share an owner. */
export function sameFamily(a, b, dogsById) {
  if (a.id === b.id) return true;
  const A = ownerSet(a, dogsById);
  if (!A.size) return false;
  for (const x of ownerSet(b, dogsById)) if (A.has(x)) return true;
  return false;
}

function maxConcurrent(stay, others) {
  const ev = [];
  for (const x of [{ s: stay.start, e: stay.end, n: stay.dogIds.length }, ...others.map((o) => ({ s: o.start, e: effEnd(o), n: o.dogIds.length }))]) {
    const s = Math.max(x.s, stay.start);
    const e = Math.min(x.e, stay.end);
    if (s < e) ev.push([s, x.n], [e, -x.n]);
  }
  // at the same instant, departures are counted before arrivals
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let c = 0;
  let m = 0;
  for (const [, n] of ev) {
    c += n;
    m = Math.max(m, c);
  }
  return m;
}

/**
 * Problems with saving `stay`. level: block (never), admin (PIN), confirm (one tap).
 * Issues already approved on the stay are filtered out, blocks never are.
 */
export function checkStay(stay, { stays, kennels, dogs, settings }) {
  const dogsById = Object.fromEntries(dogs.map((d) => [d.id, d]));
  const issues = [];
  const others = stays.filter((o) => isActive(o) && o.id !== stay.id);

  for (const o of others) {
    if (overlap(stay.start, stay.end, o.start, effEnd(o)) && o.dogIds.some((id) => stay.dogIds.includes(id))) {
      issues.push({ type: 'dog-double', level: 'block', other: o.id });
    }
  }

  const same = others.filter((o) => o.kennelId === stay.kennelId);
  const gap = (settings.cleaningGapMin || 0) * 60000;
  const stayAlone = stay.dogIds.some((id) => dogsById[id]?.aloneOnly);
  for (const o of same) {
    const oe = effEnd(o);
    if (overlap(stay.start, stay.end, o.start, oe)) {
      if (stayAlone || o.dogIds.some((id) => dogsById[id]?.aloneOnly)) {
        issues.push({ type: 'alone', level: 'admin', other: o.id });
      }
      if (!sameFamily(stay, o, dogsById)) {
        issues.push({ type: 'overlap', level: 'confirm', other: o.id, from: Math.max(stay.start, o.start), to: Math.min(stay.end, oe) });
      }
    } else if (gap > 0) {
      const before = stay.start - oe;
      const after = o.start - stay.end;
      if ((before >= 0 && before < gap) || (after >= 0 && after < gap)) {
        issues.push({ type: 'tight', level: 'confirm', other: o.id });
      }
    }
  }

  const cap = kennels.find((k) => k.id === stay.kennelId)?.capacity ?? 2;
  const max = maxConcurrent(stay, same);
  if (max > cap) issues.push({ type: 'capacity', level: 'admin', max, cap });

  const approved = new Set((stay.approvals || []).map((a) => a.key));
  return issues
    .map((i) => ({ ...i, key: i.type === 'capacity' ? `capacity:${i.max}` : `${i.type}:${i.other}` }))
    .filter((i) => i.level === 'block' || !approved.has(i.key));
}

/** Stays physically in a kennel at time t. */
export const presentAt = (kennelId, t, stays) =>
  stays.filter((s) => isActive(s) && s.kennelId === kennelId && s.start <= t && t < effEnd(s));

const RANK = { free: 0, partial: 1, full: 2 };

/**
 * Every kennel for a requested range: free (no issues), partial (needs a tap),
 * full (needs admin or impossible). Free kennels that are freed just before
 * the arrival and filled just after the departure come first, to keep gaps small.
 */
export function rankKennels(start, end, dogCount, ctx) {
  const dogIds = Array.from({ length: Math.max(1, dogCount) }, (_, i) => `__probe${i}`);
  return ctx.kennels
    .map((k) => {
      const issues = checkStay({ id: '__probe', kennelId: k.id, dogIds, start, end }, ctx);
      const status = issues.some((i) => i.level !== 'confirm') ? 'full' : issues.length ? 'partial' : 'free';
      const ks = ctx.stays.filter((s) => isActive(s) && s.kennelId === k.id);
      const prev = ks.map(effEnd).filter((e) => e <= start);
      const next = ks.map((s) => s.start).filter((s) => s >= end);
      const score = (prev.length ? start - Math.max(...prev) : 30 * DAY) + (next.length ? Math.min(...next) - end : 30 * DAY);
      return { kennel: k, status, issues, score };
    })
    .sort((a, b) => RANK[a.status] - RANK[b.status] || a.score - b.score);
}

/** When does a kennel that is empty at t next get a dog (ms) – or null. */
export function freeUntil(kennelId, t, stays) {
  const next = stays.filter((s) => isActive(s) && s.kennelId === kennelId && s.start > t).map((s) => s.start);
  return next.length ? Math.min(...next) : null;
}
