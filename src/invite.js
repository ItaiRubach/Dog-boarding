// The page a client (or Yuval) opens from the invite link. Everything it shows
// comes from the link itself (#…), so nothing about the client is stored online.
import { decodeInvite, buildEventIcs, googleCalLink, eventTitle, eventLabels, inviteAlarms, leadText } from './logic/messages.js';
import { fmtDayLong, fmtTime } from './logic/util.js';

const inv = decodeInvite(location.hash);
const $ = (id) => document.getElementById(id);

if (!inv) {
  $('title').textContent = 'הקישור לא תקין';
  $('body').hidden = true;
} else {
  const [a, b] = eventLabels(inv.k);
  const alarms = inviteAlarms(inv);
  document.title = eventTitle(inv);
  $('title').textContent = eventTitle(inv);
  $('l-start').textContent = a;
  $('l-end').textContent = b;
  $('arrive').textContent = `${fmtDayLong(inv.s)} · ${fmtTime(inv.s)}`;
  $('pickup').textContent = `${fmtDayLong(inv.e)} · ${fmtTime(inv.e)}`;
  $('remind').textContent = alarms.length ? `היומן יזכיר ${alarms.map(leadText).join(' ו')} לפני.` : '';
  if (inv.l) $('loc').textContent = inv.l;
  else $('locrow').hidden = true;

  const ics = buildEventIcs({ id: inv.i || String(inv.s), kind: inv.k, dogNames: inv.t, start: inv.s, end: inv.e, location: inv.l, alarms });
  // iPhone opens a calendar file from a data: link straight into "Add to Calendar"
  $('apple').href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  $('google').href = googleCalLink(inv);
}
