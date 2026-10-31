import { useEffect, useState } from 'preact/hooks';
import { Top, Field, useUI } from './common.jsx';
import { update } from '../store.js';
import { useSync } from '../sync.js';
import { DEFAULT_NOTIFY } from '../logic/digest.js';
import { leadText } from '../logic/messages.js';
import { pushSupported, isInstalled, isIOS, currentSubscription, enablePush, disablePush, sendTest } from '../push.js';

const LEADS = [30, 60, 120, 180];

export function Notify({ state }) {
  const ui = useUI();
  const sync = useSync();
  const n = { ...DEFAULT_NOTIFY, ...(state.settings.notify || {}) };
  const set = (patch) => update((s) => { s.settings.notify = { ...n, ...patch }; });
  const [on, setOn] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const connected = !!(sync.session && sync.pensionId);

  useEffect(() => {
    currentSubscription().then((s) => setOn(!!s)).catch(() => setOn(false));
  }, []);

  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  let device;
  if (!pushSupported()) device = <div class="issue">הדפדפן הזה לא תומך בהתראות. באייפון: iOS 16.4 ומעלה, ולפתוח את האפליקציה מהאייקון במסך הבית.</div>;
  else if (isIOS() && !isInstalled()) device = <div class="issue">באייפון התראות עובדות רק כשפותחים את האפליקציה מהאייקון במסך הבית: ב-Safari ← שיתוף ← ״הוסף למסך הבית״, ואז לפתוח משם.</div>;
  else if (!connected) device = (
    <>
      <div class="issue">ההתראות נשלחות מהענן, לכן צריך קודם להתחבר.</div>
      <button class="btn" type="button" onClick={() => ui.go('account')}>לענן וסנכרון</button>
    </>
  );
  else if (on === null) device = <div class="empty">בודק…</div>;
  else device = (
    <>
      <div class="check">
        <span>התראות בטלפון הזה<br /><small style="color:var(--mute)">{on ? 'פעילות' : 'כבויות'}</small></span>
        <button class={'btn small' + (on ? ' ghost' : '')} type="button" disabled={busy} onClick={() => run(async () => {
          if (on) { await disablePush(); setOn(false); }
          else { const r = await enablePush(); setOn(r === 'on'); if (r === 'denied') setMsg('ההתראות נחסמו. אפשר להפעיל אותן בהגדרות של האייפון ← התראות ← פנסיון.'); }
        })}>{on ? 'כבה' : 'הפעל'}</button>
      </div>
      {on && <button class="btn soft" type="button" disabled={busy} onClick={() => run(async () => { const r = await sendTest(); setMsg(r?.sent ? 'נשלחה התראת בדיקה. היא אמורה להגיע תוך כמה שניות.' : 'לא נמצא טלפון רשום. כבה והפעל שוב.'); })}>שלח התראת בדיקה</button>}
    </>
  );

  const toggle = (key, label, sub) => (
    <label class="check"><span>{label}{sub && <><br /><small style="color:var(--mute)">{sub}</small></>}</span><input type="checkbox" checked={n[key]} onChange={(e) => set({ [key]: e.currentTarget.checked })} /></label>
  );
  const leads = (key) => (
    <div class="chips">
      {LEADS.map((m) => <button type="button" class="chip" key={m} aria-pressed={String(n[key] === m)} onClick={() => set({ [key]: m })}>{leadText(m)} לפני</button>)}
    </div>
  );

  return (
    <>
      <Top title="התראות" back />
      <main class="main">
        <div class="sec">הטלפון הזה</div>
        {device}
        {msg && <div class="issue">{msg}</div>}

        <div class="sec" style="margin-top:10px">מה לשלוח · משותף לכל הטלפונים של הפנסיון</div>
        {toggle('morningOn', 'סיכום בוקר', 'מי נכנס ויוצא היום, אילוף, ממי לגבות, כלבים שצריך לשים לב אליהם')}
        {n.morningOn && <Field label="שעה"><input id="n-mt" type="time" value={n.morningTime} onChange={(e) => e.currentTarget.value && set({ morningTime: e.currentTarget.value })} /></Field>}
        {toggle('eveningOn', 'סיכום ערב', 'מה נשאר פתוח היום, ומה מחר')}
        {n.eveningOn && <Field label="שעה"><input id="n-et" type="time" value={n.eveningTime} onChange={(e) => e.currentTarget.value && set({ eveningTime: e.currentTarget.value })} /></Field>}
        {toggle('lessonOn', 'לפני שיעור אילוף', 'עם הכתובת')}
        {n.lessonOn && leads('lessonMin')}
        {toggle('moveOn', 'לפני כניסה או יציאה של כלב', 'עם התא וכמה לגבות')}
        {n.moveOn && leads('moveMin')}
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">השרת בודק כל 5 דקות, אז התראה יכולה להגיע עד 5 דקות אחרי השעה שנקבעה.</div>
      </main>
    </>
  );
}
