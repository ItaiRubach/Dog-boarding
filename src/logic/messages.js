import { fmtDateTime } from './util.js';

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

export function stayMessage(template, { dogNames, ownerName, start, end, amount }) {
  return fillTemplate(template, {
    כלב: dogNames,
    בעלים: ownerName,
    הגעה: fmtDateTime(start),
    איסוף: fmtDateTime(end),
    סכום: Math.round(amount).toLocaleString('he-IL'),
  });
}

// ---- .ics with two reminders ----
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

function vevent({ uid, title, at, location, description, reminders, stamp }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utc(stamp)}`,
    `DTSTART:${utc(at)}`,
    `DTEND:${utc(at + 30 * 60000)}`,
    `SUMMARY:${esc(title)}`,
  ];
  if (location) lines.push(`LOCATION:${esc(location)}`);
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  for (const d of reminders) {
    lines.push('BEGIN:VALARM', `TRIGGER:-P${d}D`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

/** Arrival + pickup events. Same UID on resend, so the client's calendar updates instead of duplicating. */
export function buildStayIcs({ id, dogNames, start, end, location, reminders = [7, 2], now = Date.now() }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//yuval-pension//he',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...vevent({ uid: `${id}-in@yuval-pension`, title: `${dogNames} בפנסיון – הגעה`, at: start, location, reminders, stamp: now }),
    ...vevent({ uid: `${id}-out@yuval-pension`, title: `${dogNames} בפנסיון – איסוף`, at: end, location, reminders, stamp: now }),
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
