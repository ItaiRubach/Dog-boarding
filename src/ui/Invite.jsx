import { Sheet } from './common.jsx';
import { byId, dogNames, stayPrimary } from '../model.js';
import { buildStayIcs, stayMessage, waLink } from '../logic/messages.js';
import { total } from '../logic/pricing.js';

/** Two steps Yuval sends himself: the WhatsApp text, then the calendar file. */
export function InviteSheet({ state, stayId, onClose }) {
  const stay = byId(state.stays, stayId);
  if (!stay) return null;
  const contact = stayPrimary(state, stay);
  const names = dogNames(state, stay.dogIds);
  const text = stayMessage(state.settings.messageTemplate, {
    dogNames: names,
    ownerName: contact?.name || '',
    start: stay.start,
    end: stay.end,
    amount: total(stay.charges),
  });
  const ics = buildStayIcs({ id: stay.id, dogNames: names, start: stay.start, end: stay.end, location: state.settings.homeAddress, reminders: state.settings.reminders });

  const shareIcs = async () => {
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
      <div class="field" style="white-space:pre-wrap;font-size:14px">{text}</div>
      <a class="btn" style="text-align:center;text-decoration:none" href={contact?.phone ? waLink(contact.phone, text) : undefined} target="_blank" rel="noopener">
        1 · שלח הודעה בוואטסאפ
      </a>
      <button class="btn soft" type="button" onClick={shareIcs}>
        2 · שתף קובץ יומן (תזכורת {state.settings.reminders.join(' ו-')} ימים לפני)
      </button>
      <button class="btn ghost" type="button" onClick={onClose}>
        סגור
      </button>
    </Sheet>
  );
}
