// The page a client opens from the WhatsApp link. Everything it shows comes
// from the link itself (#…), so nothing about the client is stored online.
import { decodeInvite, buildStayIcs, googleCalLink } from './logic/messages.js';
import { fmtDayLong, fmtTime } from './logic/util.js';

const inv = decodeInvite(location.hash);
const $ = (id) => document.getElementById(id);

if (!inv) {
  $('title').textContent = 'הקישור לא תקין';
  $('body').hidden = true;
} else {
  $('title').textContent = `${inv.t} בפנסיון`;
  $('arrive').textContent = `${fmtDayLong(inv.s)} · ${fmtTime(inv.s)}`;
  $('pickup').textContent = `${fmtDayLong(inv.e)} · ${fmtTime(inv.e)}`;
  const r = inv.r || [];
  $('remind').textContent = r.length ? `היומן יזכיר ${r.map((d) => (d === 1 ? 'יום' : d === 2 ? 'יומיים' : d === 7 ? 'שבוע' : d === 14 ? 'שבועיים' : `${d} ימים`)).join(' ו')} לפני.` : '';
  if (inv.l) $('loc').textContent = inv.l;
  else $('locrow').hidden = true;

  const ics = buildStayIcs({ id: inv.i || String(inv.s), dogNames: inv.t, start: inv.s, end: inv.e, location: inv.l, reminders: r });
  // iPhone opens a calendar file from a data: link straight into "Add to Calendar"
  $('apple').href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  $('google').href = googleCalLink(inv);
}
