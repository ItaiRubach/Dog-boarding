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

/** The calendar link always goes in, even if Yuval's template has no {קישור}. */
export function stayMessage(template, { dogNames, ownerName, start, end, amount, link }) {
  const text = fillTemplate(template, {
    כלב: dogNames,
    בעלים: ownerName,
    הגעה: fmtDateTime(start),
    איסוף: fmtDateTime(end),
    סכום: Math.round(amount).toLocaleString('he-IL'),
    קישור: link || '',
  });
  return link && !template.includes('{קישור}') ? `${text}\nלהוספה ליומן: ${link}` : text;
}

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

/** Google Calendar "add event" link (Google ignores reminders from links). */
export function googleCalLink({ t, s, e, l }) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: `${t} בפנסיון`, dates: `${utc(s)}/${utc(e)}`, details: `הגעה: ${fmtDateTime(s)}\nאיסוף: ${fmtDateTime(e)}` });
  if (l) p.set('location', l);
  return `https://calendar.google.com/calendar/render?${p}`;
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

/**
 * One event from arrival to pickup, with the reminders set in settings
 * (days before the arrival). Same UID on resend, so the client's calendar
 * updates the event instead of duplicating it.
 */
export function buildStayIcs({ id, dogNames, start, end, location, reminders = [7, 2], now = Date.now() }) {
  const title = `${dogNames} בפנסיון`;
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
    `DESCRIPTION:${esc(`הגעה: ${fmtDateTime(start)}\nאיסוף: ${fmtDateTime(end)}`)}`,
  ];
  if (location) lines.push(`LOCATION:${esc(location)}`);
  for (const d of reminders) {
    lines.push('BEGIN:VALARM', `TRIGGER:-P${d}D`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${title} בעוד ${d === 1 ? 'יום' : d === 2 ? 'יומיים' : `${d} ימים`}`)}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
