import { fmtDateTime, fmtDayLong, fmtTime } from './util.js';

/** Israeli phone → digits for wa.me (05x… → 9725x…). */
export function waNumber(phone = '') {
  let d = phone.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '972' + d.slice(1);
  return d;
}

export const waLink = (phone, text = '') => `https://wa.me/${waNumber(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
export const telLink = (phone = '') => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const wazeLink = (address) => `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
export const mapsLink = (address) => `https://maps.google.com/?q=${encodeURIComponent(address)}`;

export function fillTemplate(template, vars) {
  return template.replace(/\{(.+?)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** The calendar link always goes in, even if Yuval's template has no {קישור}. */
const withLink = (template, text, link) => (link && !template.includes('{קישור}') ? `${text}\nלהוספה ליומן: ${link}` : text);

export function stayMessage(template, { dogNames, ownerName, start, end, amount, link }) {
  const text = fillTemplate(template, {
    כלב: dogNames,
    בעלים: ownerName,
    הגעה: fmtDateTime(start),
    איסוף: fmtDateTime(end),
    סכום: Math.round(amount).toLocaleString('he-IL'),
    קישור: link || '',
  });
  return withLink(template, text, link);
}

/** Lesson text: {כלב} {בעלים} {מתי} {כתובת} {סכום} {קישור}. */
export function lessonMessage(template, { dogNames, ownerName, start, end, address, amount, link }) {
  const text = fillTemplate(template, {
    כלב: dogNames,
    בעלים: ownerName,
    מתי: `${fmtDayLong(start)} ${fmtTime(start)}–${fmtTime(end)}`,
    כתובת: address || '',
    סכום: Math.round(amount).toLocaleString('he-IL'),
    קישור: link || '',
  });
  return withLink(template, text, link);
}

// ---- one calendar event, for a stay (k: 'stay') or a lesson (k: 'lesson') ----
export const eventTitle = ({ k, t }) => (k === 'lesson' ? `שיעור אילוף · ${t}` : `${t} בפנסיון`);
export const eventLabels = (k) => (k === 'lesson' ? ['התחלה', 'סיום'] : ['הגעה', 'איסוף']);

/** Reminder lead times are kept in minutes. */
export function leadText(min) {
  if (min % 1440 === 0) {
    const d = min / 1440;
    return d === 1 ? 'יום' : d === 2 ? 'יומיים' : d === 7 ? 'שבוע' : d === 14 ? 'שבועיים' : `${d} ימים`;
  }
  if (min % 60 === 0) return min === 60 ? 'שעה' : min === 120 ? 'שעתיים' : `${min / 60} שעות`;
  return `${min} דקות`;
}
export const daysToMinutes = (days = []) => days.map((d) => d * 1440);

// ---- invite link: the event travels inside the link (#…), no server needed ----
const b64url = (str) => btoa(String.fromCharCode(...new TextEncoder().encode(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

export const encodeInvite = (inv) => b64url(JSON.stringify(inv));

export function decodeInvite(hash) {
  try {
    const inv = JSON.parse(unb64url(hash.replace(/^#/, '')));
    return inv && inv.s && inv.e && inv.t ? inv : null;
  } catch {
    return null;
  }
}

/** Alarm minutes of an invite: lessons carry minutes (m), stays carry days (r). */
export const inviteAlarms = (inv) => inv.m || daysToMinutes(inv.r || []);

/** Google Calendar "add event" link (Google ignores reminders from links). */
export function googleCalLink({ k, t, s, e, l }) {
  const [a, b] = eventLabels(k);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: eventTitle({ k, t }), dates: `${utc(s)}/${utc(e)}`, details: `${a}: ${fmtDateTime(s)}\n${b}: ${fmtDateTime(e)}` });
  if (l) p.set('location', l);
  return `https://calendar.google.com/calendar/render?${p}`;
}

// ---- .ics ----
const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Fold lines at 74 octets as RFC 5545 asks (Hebrew is 2 bytes per letter). */
function fold(line) {
  const enc = new TextEncoder();
  let out = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 74) {
      out += '\r\n ';
      bytes = 1;
    }
    out += ch;
    bytes += b;
  }
  return out;
}

/**
 * One event from start to end, with the reminders set in settings
 * (alarms = minutes before the start). Same UID on resend, so the client's
 * calendar updates the event instead of duplicating it.
 */
export function buildEventIcs({ id, kind = 'stay', dogNames, start, end, location, alarms = [10080, 2880], now = Date.now() }) {
  const title = eventTitle({ k: kind, t: dogNames });
  const [a, b] = eventLabels(kind);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yuval-pension//he',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${id}@yuval-pension`,
    `DTSTAMP:${utc(now)}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(`${a}: ${fmtDateTime(start)}\n${b}: ${fmtDateTime(end)}`)}`,
  ];
  if (location) lines.push(`LOCATION:${esc(location)}`);
  for (const m of alarms) {
    const trigger = m % 1440 === 0 ? `-P${m / 1440}D` : `-PT${m}M`;
    lines.push('BEGIN:VALARM', `TRIGGER:${trigger}`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${title} בעוד ${leadText(m)}`)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Stays keep their reminders in days. */
export const buildStayIcs = ({ reminders = [7, 2], ...rest }) => buildEventIcs({ ...rest, kind: 'stay', alarms: daysToMinutes(reminders) });
