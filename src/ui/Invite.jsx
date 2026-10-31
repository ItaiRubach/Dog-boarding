import { Sheet } from './common.jsx';
import { byId, dogNames, stayPrimary, primaryContact } from '../model.js';
import { buildEventIcs, stayMessage, lessonMessage, waLink, encodeInvite, daysToMinutes, leadText } from '../logic/messages.js';
import { total } from '../logic/pricing.js';
import { lessonAddress } from './Training.jsx';

/** Everything an invite needs, for a stay or a lesson. */
export function inviteData(state, { kind, id }) {
  const set = state.settings;
  if (kind === 'lesson') {
    const tr = byId(state.trainings, id);
    if (!tr) return null;
    const dog = byId(state.dogs, tr.dogId);
    const address = lessonAddress(state, tr);
    const inv = { k: 'lesson', i: tr.id, t: dog?.name || '', s: tr.start, e: tr.end, m: set.lessonReminders, l: address || undefined };
    const link = inviteUrl(inv);
    const contact = primaryContact(state, dog);
    const text = lessonMessage(set.lessonTemplate, { dogNames: inv.t, ownerName: contact?.name || '', start: tr.start, end: tr.end, address, amount: total(tr.charges), link });
    return { inv, link, contact, text, alarms: set.lessonReminders };
  }
  const stay = byId(state.stays, id);
  if (!stay) return null;
  const inv = { k: 'stay', i: stay.id, t: dogNames(state, stay.dogIds), s: stay.start, e: stay.end, r: set.reminders, l: set.homeAddress || undefined };
  const link = inviteUrl(inv);
  const contact = stayPrimary(state, stay);
  const text = stayMessage(set.messageTemplate, { dogNames: inv.t, ownerName: contact?.name || '', start: stay.start, end: stay.end, amount: total(stay.charges), link });
  return { inv, link, contact, text, alarms: daysToMinutes(set.reminders) };
}

const inviteUrl = (inv) => new URL('invite.html', location.href).href.split('#')[0] + '#' + encodeInvite(inv);

/** WhatsApp to the client + the same event into Yuval's own calendar. */
export function InviteSheet({ state, target, onClose }) {
  const data = inviteData(state, target);
  if (!data) return null;
  const { inv, link, contact, text, alarms } = data;
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);

  const shareIcs = async () => {
    const ics = buildEventIcs({ id: inv.i, kind: inv.k, dogNames: inv.t, start: inv.s, end: inv.e, location: inv.l, alarms });
    const file = new File([ics], `${inv.t}.ics`, { type: 'text/calendar' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: inv.t });
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <Sheet onClose={onClose} label="שליחת זימון">
      <h2>{inv.k === 'lesson' ? 'זימון לשיעור' : 'זימון לפנסיון'} · {contact?.name || inv.t}</h2>
      {!contact?.phone && <div class="issue block">אין טלפון לבעלים. הוסף טלפון בתיק הכלב.</div>}
      {local && <div class="issue">האפליקציה רצה כרגע מהמחשב בבית, אז הקישור ייפתח רק ברשת הביתית. אחרי ההעלאה לאינטרנט הוא יעבוד בכל מקום.</div>}
      <div class="field" style="white-space:pre-wrap;font-size:14px">{text.replace(link, '🔗 קישור ליומן')}</div>
      <a class="btn" style="text-align:center;text-decoration:none" href={contact?.phone ? waLink(contact.phone, text) : undefined} target="_blank" rel="noopener">
        שלח ללקוח בוואטסאפ
      </a>
      <a class="btn soft" style="text-align:center;text-decoration:none" href={link} target="_blank" rel="noopener">
        הוסף ליומן שלי
      </a>
      <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">
        אירוע אחד מ{inv.k === 'lesson' ? 'ההתחלה עד הסיום' : 'ההגעה עד האיסוף'}{alarms.length ? `, עם תזכורת ${alarms.map(leadText).join(' ו')} לפני` : ', בלי תזכורת'}. משנים בהגדרות.
      </div>
      <button class="btn ghost" type="button" onClick={shareIcs}>
        או שתף קובץ יומן
      </button>
      <button class="btn ghost" type="button" onClick={onClose}>
        סגור
      </button>
    </Sheet>
  );
}
