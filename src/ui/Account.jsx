import { useState } from 'preact/hooks';
import { Top, Field, Seg, useUI } from './common.jsx';
import { useSync, signIn, signUp, resetPassword, createFromPhone, joinWithCode, signOut, syncLabel, pushNow } from '../sync.js';
import { waLink } from '../logic/messages.js';

const errText = (e) => {
  const m = String(e?.message || e);
  if (/Invalid login/i.test(m)) return 'מייל או סיסמה לא נכונים';
  if (/Email not confirmed/i.test(m)) return 'צריך קודם לאשר את המייל: לחץ על הקישור במייל שקיבלת';
  if (/already registered/i.test(m)) return 'המייל הזה כבר רשום. בחר ״כניסה״';
  if (/at least 6/i.test(m)) return 'סיסמה של 6 תווים לפחות';
  if (/wrong code/i.test(m)) return 'הקוד לא נכון';
  if (/fetch|network/i.test(m)) return 'אין חיבור לאינטרנט';
  return m;
};

export function Account({ state }) {
  const ui = useUI();
  const s = useSync();
  const [mode, setMode] = useState('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('הפנסיון של יובל');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    setMsg('');
    try {
      await fn();
    } catch (e) {
      setMsg(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!s.enabled) {
    return (<><Top title="ענן וסנכרון" back /><main class="main"><div class="empty">החיבור לענן עוד לא הוגדר בגרסה הזאת.</div></main></>);
  }

  return (
    <>
      <Top title="ענן וסנכרון" back sub={syncLabel(s)} />
      <main class="main">
        {!s.session && (
          <>
            <div class="issue">אחרי כניסה הנתונים נשמרים גם בענן: גיבוי אוטומטי, ואפשר לראות אותו פנסיון בכמה טלפונים.</div>
            <Seg value={mode} onChange={(v) => { setMode(v); setMsg(''); }} options={[['in', 'כניסה'], ['up', 'משתמש חדש']]} />
            <Field label="מייל"><input id="ac-email" type="email" autocomplete="email" inputMode="email" value={email} onInput={(e) => setEmail(e.currentTarget.value)} /></Field>
            <Field label={mode === 'up' ? 'בחר סיסמה (6 תווים לפחות)' : 'סיסמה'}><input id="ac-pw" type="password" autocomplete={mode === 'up' ? 'new-password' : 'current-password'} value={pw} onInput={(e) => setPw(e.currentTarget.value)} /></Field>
            {mode === 'in' ? (
              <>
                <button class="btn" type="button" disabled={busy || !email || !pw} onClick={() => run(() => signIn(email, pw))}>{busy ? 'נכנס…' : 'כניסה'}</button>
                <button class="textbtn" type="button" disabled={!email} onClick={() => run(async () => { await resetPassword(email); setMsg('נשלח מייל לאיפוס סיסמה'); })}>שכחתי סיסמה</button>
              </>
            ) : (
              <button class="btn" type="button" disabled={busy || !email || pw.length < 6} onClick={() => run(async () => {
                const r = await signUp(email, pw);
                if (r?.session) setMsg('נרשמת ונכנסת.');
                else { setMsg('נשלח אליך מייל אישור. לחץ על הקישור שבו, ואז חזור לכאן ובחר ״כניסה״.'); setMode('in'); }
              })}>{busy ? 'רושם…' : 'הרשמה'}</button>
            )}
          </>
        )}

        {s.session && s.status === 'nopension' && (
          <>
            <div class="list"><div class="row static"><span class="grow">מחובר<small>{s.email}</small></span></div></div>
            <div class="sec">יובל · פעם ראשונה</div>
            <Field label="שם הפנסיון"><input id="ac-name" value={name} onInput={(e) => setName(e.currentTarget.value)} /></Field>
            <button class="btn" type="button" disabled={busy} onClick={() => run(() => createFromPhone(name))}>
              העלה את הנתונים שבטלפון לענן ({state.dogs.length} כלבים · {state.stays.length} שהיות)
            </button>
            <div class="sec">מכשיר נוסף · הצטרפות לפנסיון קיים</div>
            <Field label="קוד הצטרפות (מהטלפון של יובל)"><input id="ac-code" autocapitalize="characters" value={code} onInput={(e) => setCode(e.currentTarget.value)} /></Field>
            <button class="btn soft" type="button" disabled={busy || code.trim().length < 6} onClick={() => run(() => joinWithCode(code))}>הצטרף · הנתונים בטלפון הזה יוחלפו בנתוני הפנסיון</button>
            <button class="textbtn" type="button" onClick={() => run(signOut)}>התנתק</button>
          </>
        )}

        {s.session && s.pensionId && (
          <>
            <div class="list">
              <div class="row static"><span class="grow">{s.name}<small>{s.email}</small></span><span class={'pill ' + (s.status === 'synced' ? 'g' : s.status === 'offline' || s.status === 'conflict' ? 'w' : '')}>{syncLabel(s)}</span></div>
            </div>
            {s.status === 'conflict' && <div class="issue">בזמן שעבדת, הפנסיון עודכן בטלפון אחר. מוצגת הגרסה העדכנית, והשינוי האחרון שלך לא נשמר. אם חסר משהו, צריך להזין אותו שוב.</div>}
            {s.status === 'offline' && <button class="btn soft" type="button" onClick={() => pushNow()}>נסה לשמור עכשיו</button>}
            <div class="sec">הוספת טלפון נוסף לאותו פנסיון</div>
            <div class="card" style="padding:14px;text-align:center;display:grid;gap:6px">
              <div style="color:var(--mute);font-size:13px">קוד הצטרפות</div>
              <div style="font-size:30px;font-weight:800;letter-spacing:.15em;direction:ltr" class="num">{s.joinCode}</div>
              <div style="color:var(--mute);font-size:13px">בטלפון השני: להיכנס עם משתמש משלו ← ״הצטרפות לפנסיון קיים״ ← הקוד הזה</div>
            </div>
            <a class="btn ghost" style="text-align:center;text-decoration:none" href={waLink('', `קוד הצטרפות לפנסיון: ${s.joinCode}\n${location.href.split('#')[0]}`)} target="_blank" rel="noopener">שלח את הקוד בוואטסאפ</a>
            {confirmOut ? (
              <div class="btnrow">
                <button class="btn red" type="button" onClick={() => run(signOut)}>כן, התנתק</button>
                <button class="btn ghost" type="button" onClick={() => setConfirmOut(false)}>לא</button>
              </div>
            ) : (
              <button class="btn red" type="button" onClick={() => setConfirmOut(true)}>התנתק מהענן</button>
            )}
            <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">אחרי התנתקות הנתונים נשארים בטלפון, אבל שינויים חדשים לא יגיעו לענן.</div>
          </>
        )}
        {msg && <div class="issue">{msg}</div>}
      </main>
    </>
  );
}
