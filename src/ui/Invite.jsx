import { Sheet } from './common.jsx';
import { byId, dogNames, stayPrimary } from '../model.js';
import { buildStayIcs, stayMessage, waLink, encodeInvite } from '../logic/messages.js';
import { total } from '../logic/pricing.js';

/** Link the client opens to add the stay to their own calendar. */
export function inviteLink(state, stay) {
  const inv = { i: stay.id, t: dogNames(state, stay.dogIds), s: stay.start, e: stay.end, r: state.settings.reminders, l: state.settings.homeAddress || undefined };
  return new URL('invite.html', location.href).href.split('#')[0] + '#' + encodeInvite(inv);
}

/** WhatsApp text with the calendar link; the .ics file stays as a fallback. */
export function InviteSheet({ state, stayId, onClose }) {
  const stay = byId(state.stays, stayId);
  if (!stay) return null;
  const contact = stayPrimary(state, stay);
  const names = dogNames(state, stay.dogIds);
  const link = inviteLink(state, stay);
  const text = stayMessage(state.settings.messageTemplate, {
    dogNames: names,
    ownerName: contact?.name || '',
    start: stay.start,
    end: stay.end,
    amount: total(stay.charges),
    link,
  });
  const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);

  const shareIcs = async () => {
    const ics = buildStayIcs({ id: stay.id, dogNames: names, start: stay.start, end: stay.end, location: state.settings.homeAddress, reminders: state.settings.reminders });
    const file = new File([ics], `${names}-פנסיון.ics`, { type: 'text/calendar' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${names} בפנסיון` });
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
      <h2>זימון ל{contact?.name || 'בעלים'}</h2>
      {!contact?.phone && <div class="issue block">אין טלפון לבעלים. הוסף טלפון בתיק הכלב.</div>}
      {local && <div class="issue">האפליקציה רצה כרגע מהמחשב בבית, אז הקישור בהודעה ייפתח רק ברשת הביתית. אחרי ההעלאה לאינטרנט הוא יעבוד אצל כל לקוח.</div>}
      <div class="field" style="white-space:pre-wrap;font-size:14px;word-break:break-all">{text}</div>
      <a class="btn" style="text-align:center;text-decoration:none" href={contact?.phone ? waLink(contact.phone, text) : undefined} target="_blank" rel="noopener">
        שלח בוואטסאפ
      </a>
      <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">
        הלקוח לוחץ על הקישור ומוסיף ליומן אירוע אחד מההגעה עד האיסוף, עם תזכורת {state.settings.reminders.join(' ו-')} ימים לפני.
      </div>
      <button class="btn ghost" type="button" onClick={shareIcs}>
        או שתף קובץ יומן במקום קישור
      </button>
      <button class="btn ghost" type="button" onClick={onClose}>
        סגור
      </button>
    </Sheet>
  );
}
