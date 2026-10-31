import { createContext } from 'preact';
import { useContext, useState } from 'preact/hooks';
import { fmtDateTime, fmtTime } from '../logic/util.js';
import { dogNames, kennelName, byId } from '../model.js';

export const UI = createContext(null);
export const useUI = () => useContext(UI);

export function Logo({ class: cls = 'logo' }) {
  return (
    <svg class={cls} viewBox="0 0 120 120" aria-hidden="true">
      <rect width="120" height="120" rx="27" fill="#e9a93b" />
      <circle cx="60" cy="60" r="36" fill="none" stroke="#2f6b4f" stroke-width="7" />
      <g fill="#2f6b4f" transform="translate(44 44) scale(.32)">
        <ellipse cx="50" cy="66" rx="22" ry="18" />
        <ellipse cx="24" cy="40" rx="9" ry="11" transform="rotate(-18 24 40)" />
        <ellipse cx="41" cy="26" rx="9" ry="12" />
        <ellipse cx="59" cy="26" rx="9" ry="12" />
        <ellipse cx="76" cy="40" rx="9" ry="11" transform="rotate(18 76 40)" />
      </g>
      <rect x="57" y="18" width="6" height="12" rx="3" fill="#2f6b4f" />
    </svg>
  );
}

export function Top({ title, sub, back, right, logo }) {
  const ui = useUI();
  return (
    <header class="top">
      {back && (
        <button class="textbtn" type="button" onClick={() => (typeof back === 'function' ? back() : ui.back())}>
          <span dir="ltr">›</span> {typeof back === 'string' ? back : 'חזרה'}
        </button>
      )}
      {logo && <Logo />}
      <div class="titles">
        <h1 style={back ? 'font-size:19px' : ''}>{title}</h1>
        {sub && <div class="sub">{sub}</div>}
      </div>
      {right}
    </header>
  );
}

export function Sheet({ onClose, children, label }) {
  return (
    <>
      <div class="scrim" onClick={onClose} />
      <div class="sheet" role="dialog" aria-label={label}>
        <div class="grab" />
        {children}
      </div>
    </>
  );
}

export function Seg({ value, onChange, options }) {
  return (
    <div class="seg">
      {options.map(([v, label]) => (
        <button type="button" key={v} aria-pressed={String(value === v)} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label class="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function issueText(issue, state) {
  const other = issue.other ? byId(state.stays, issue.other) : null;
  const who = other ? `${dogNames(state, other.dogIds)} (${kennelName(state, other.kennelId)})` : '';
  switch (issue.type) {
    case 'dog-double':
      return `הכלב כבר רשום בשהייה אחרת באותן שעות: ${who}. אי אפשר לשמור.`;
    case 'overlap':
      return `חפיפה עם ${who} בין ${fmtTime(issue.from)} ל-${fmtTime(issue.to)} (${fmtDateTime(issue.from).split(' ')[0]}). שני כלבים ממשפחות שונות בתא.`;
    case 'tight':
      return `החלפה צמודה מול ${who}. אין מספיק זמן לניקוי.`;
    case 'alone':
      return `כלב שמסומן ״רק לבד בתא״ יהיה עם ${who}.`;
    case 'capacity':
      return `${issue.max} כלבים בתא שמוגדר ל-${issue.cap}.`;
    default:
      return issue.type;
  }
}

/** Shows what blocks saving. Confirm = one tap, admin = PIN. */
export function IssuesSheet({ issues, state, onApprove, onCancel }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const blocked = issues.some((i) => i.level === 'block');
  const needsAdmin = issues.some((i) => i.level === 'admin');
  const approve = () => {
    if (needsAdmin && pin !== state.settings.adminPin) {
      setErr('קוד מנהל שגוי');
      return;
    }
    onApprove(issues.map((i) => ({ key: i.key, at: Date.now(), by: needsAdmin ? 'admin' : 'confirm' })));
  };
  return (
    <Sheet onClose={onCancel} label="אישור לפני שמירה">
      <h2>{blocked ? 'אי אפשר לשמור' : needsAdmin ? 'צריך אישור מנהל' : 'לאשר?'}</h2>
      {issues.map((i) => (
        <div class={'issue ' + i.level} key={i.key}>
          {issueText(i, state)}
        </div>
      ))}
      {!blocked && needsAdmin && (
        <Field label="קוד מנהל">
          <input id="admin-pin" type="password" inputMode="numeric" autocomplete="off" value={pin} onInput={(e) => { setPin(e.currentTarget.value); setErr(''); }} />
        </Field>
      )}
      {err && <div class="issue block">{err}</div>}
      <div class="btnrow">
        {!blocked && (
          <button class={'btn ' + (needsAdmin ? 'warn' : '')} type="button" onClick={approve}>
            {needsAdmin ? 'אשר כמנהל ושמור' : 'אשר ושמור'}
          </button>
        )}
        <button class="btn ghost" type="button" onClick={onCancel}>
          {blocked ? 'הבנתי' : 'חזרה לעריכה'}
        </button>
      </div>
    </Sheet>
  );
}
