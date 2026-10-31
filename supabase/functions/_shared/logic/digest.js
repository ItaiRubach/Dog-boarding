// What each push notification says, and when it is due.
// Runs on the server (UTC), so every time is read in Israel time explicitly.
import { effStart, effEnd, isActive } from './occupancy.js';
import { balance, isPaid } from './pricing.js';
import { leadText } from './messages.js';

export const TZ = 'Asia/Jerusalem';
const HOUR = 3600000;
const pad = (n) => String(n).padStart(2, '0');
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Israel-time calendar parts of an instant. */
export function ilParts(ms) {
  const o = {};
  for (const p of fmt.formatToParts(ms)) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour, min: +o.minute };
}

export const ilTime = (ms) => {
  const p = ilParts(ms);
  return `${pad(p.h)}:${pad(p.min)}`;
};
export const ilDateKey = (ms) => {
  const p = ilParts(ms);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
};

/** The instant of HH:MM on the Israel calendar day that contains ms. */
export function ilAt(ms, hhmm) {
  const p = ilParts(ms);
  const [h, mi] = hhmm.split(':').map(Number);
  let t = Date.UTC(p.y, p.m - 1, p.d, h, mi);
  // shift by Israel's offset at that moment (2 or 3 hours), twice to settle around DST changes
  for (let i = 0; i < 2; i++) {
    const q = ilParts(t);
    t -= Date.UTC(q.y, q.m - 1, q.d, q.h, q.min) - Date.UTC(p.y, p.m - 1, p.d, h, mi);
  }
  return t;
}

export const ilDayStart = (ms) => ilAt(ms, '00:00');
const nextDay = (dayStart) => ilDayStart(dayStart + 26 * HOUR);

const dogName = (data, id) => data.dogs?.find((d) => d.id === id)?.name || '?';
const names = (data, ids) => ids.map((id) => dogName(data, id)).join(' ו');
const flagged = (data, ids) => ids.some((id) => data.dogs?.find((d) => d.id === id)?.flag);
const kennelName = (data, id) => data.kennels?.find((k) => k.id === id)?.name || '';
const money = (n) => '₪' + Math.round(n).toLocaleString('he-IL');

function dayItems(data, from, to) {
  const stays = (data.stays || []).filter(isActive);
  return {
    stays,
    ins: stays.filter((s) => s.start >= from && s.start < to).sort((a, b) => a.start - b.start),
    outs: stays.filter((s) => s.end >= from && s.end < to).sort((a, b) => a.end - b.end),
    lessons: (data.trainings || []).filter((t) => t.start >= from && t.start < to).sort((a, b) => a.start - b.start),
  };
}

/** Morning: what happens today. */
export function morningDigest(data, now) {
  const day = ilDayStart(now);
  const { stays, ins, outs, lessons } = dayItems(data, day, nextDay(day));
  const here = stays.filter((s) => effStart(s) <= now && now < effEnd(s)).reduce((n, s) => n + s.dogIds.length, 0);
  const lines = [];
  if (ins.length) lines.push('נכנסים: ' + ins.map((s) => `${names(data, s.dogIds)}${flagged(data, s.dogIds) ? ' ⚠' : ''} ${ilTime(s.start)}`).join(', '));
  if (outs.length) lines.push('יוצאים: ' + outs.map((s) => `${names(data, s.dogIds)} ${ilTime(s.end)}${isPaid(s) ? '' : ` (לגבות ${money(balance(s))})`}`).join(', '));
  if (lessons.length) lines.push('אילוף: ' + lessons.map((t) => `${dogName(data, t.dogId)} ${ilTime(t.start)}`).join(', '));
  if (!lines.length) lines.push('אין תנועות היום');
  lines.push(`${here} כלבים בפנסיון`);
  return { title: 'בוקר טוב · היום בפנסיון', body: lines.join('\n') };
}

/** Evening: what is still open today, and tomorrow. */
export function eveningDigest(data, now) {
  const day = ilDayStart(now);
  const tomorrow = nextDay(day);
  const today = dayItems(data, day, tomorrow);
  const next = dayItems(data, tomorrow, nextDay(tomorrow));
  const lines = [];
  const notArrived = today.ins.filter((s) => !s.arrivedAt && s.start <= now);
  const notLeft = today.outs.filter((s) => !s.departedAt && s.end <= now);
  const toCollect = today.outs.filter((s) => !isPaid(s));
  if (notArrived.length) lines.push('לא סומן שהגיע: ' + notArrived.map((s) => names(data, s.dogIds)).join(', '));
  if (notLeft.length) lines.push('לא סומן שיצא: ' + notLeft.map((s) => names(data, s.dogIds)).join(', '));
  if (toCollect.length) lines.push('לגבות: ' + toCollect.map((s) => `${names(data, s.dogIds)} ${money(balance(s))}`).join(', '));
  if (!lines.length) lines.push('היום נסגר בלי פריטים פתוחים');
  const parts = [];
  if (next.ins.length) parts.push(`נכנסים ${next.ins.map((s) => `${names(data, s.dogIds)} ${ilTime(s.start)}`).join(', ')}`);
  if (next.outs.length) parts.push(`יוצאים ${next.outs.map((s) => `${names(data, s.dogIds)} ${ilTime(s.end)}`).join(', ')}`);
  if (next.lessons.length) parts.push(`אילוף ${next.lessons.map((t) => `${dogName(data, t.dogId)} ${ilTime(t.start)}`).join(', ')}`);
  lines.push('מחר: ' + (parts.length ? parts.join(' · ') : 'אין תנועות'));
  return { title: 'סיכום היום · ומחר', body: lines.join('\n') };
}

export const DEFAULT_NOTIFY = { morningOn: true, morningTime: '07:30', eveningOn: true, eveningTime: '20:00', lessonOn: true, lessonMin: 60, moveOn: true, moveMin: 60 };

/**
 * Everything that should go out in the window (from, to]. Each item has a
 * stable key, so the server sends it once even if windows overlap.
 */
export function dueNotifications(data, from, to) {
  const n = { ...DEFAULT_NOTIFY, ...(data.settings?.notify || {}) };
  const out = [];
  const inWin = (t) => t > from && t <= to;
  for (const [on, time, kind, build] of [[n.morningOn, n.morningTime, 'morning', morningDigest], [n.eveningOn, n.eveningTime, 'evening', eveningDigest]]) {
    if (!on) continue;
    const at = ilAt(to, time);
    if (inWin(at)) out.push({ key: `${kind}:${ilDateKey(at)}`, ...build(data, at) });
  }
  if (n.lessonOn) {
    for (const t of data.trainings || []) {
      if (!inWin(t.start - n.lessonMin * 60000)) continue;
      out.push({ key: `lesson:${t.id}:${t.start}`, title: `בעוד ${leadText(n.lessonMin)}: אילוף`, body: [dogName(data, t.dogId), ilTime(t.start), t.address].filter(Boolean).join(' · ') });
    }
  }
  if (n.moveOn) {
    for (const s of (data.stays || []).filter(isActive)) {
      if (!s.arrivedAt && inWin(s.start - n.moveMin * 60000)) {
        out.push({ key: `in:${s.id}:${s.start}`, title: `בעוד ${leadText(n.moveMin)}: ${names(data, s.dogIds)} מגיע`, body: [kennelName(data, s.kennelId), ilTime(s.start), flagged(data, s.dogIds) ? '⚠ כלב שצריך לשים לב אליו' : ''].filter(Boolean).join(' · ') });
      }
      if (!s.departedAt && inWin(s.end - n.moveMin * 60000)) {
        out.push({ key: `out:${s.id}:${s.end}`, title: `בעוד ${leadText(n.moveMin)}: ${names(data, s.dogIds)} יוצא`, body: [kennelName(data, s.kennelId), ilTime(s.end), isPaid(s) ? 'שולם' : `לגבות ${money(balance(s))}`].join(' · ') });
      }
    }
  }
  return out;
}
