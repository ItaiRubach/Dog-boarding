import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { Top, Field, Seg, useUI } from './common.jsx';
import { update, replaceState } from '../store.js';
import { uid, money, dateKey } from '../logic/util.js';
import { isActive } from '../logic/occupancy.js';
import { byId, defaultState, seedDemo } from '../model.js';

const METHODS = { nights: 'לפי לילות', days: 'לפי ימים בלוח', nightsLate: 'לילות + איסוף מאוחר' };

export function Settings({ state }) {
  const ui = useUI();
  const s = state.settings;
  const row = (label, end, route) => (
    <button type="button" class="row" onClick={() => ui.go(route)}>
      <span class="grow">{label}</span>
      <span class="end">{end}</span>
      <span class="chev">‹</span>
    </button>
  );
  return (
    <>
      <Top title="הגדרות" back />
      <main class="main">
        <div class="sec">הפנסיון</div>
        <div class="list">
          {row('מפת התאים', `${state.kennels.length} תאים`, 'set-plan')}
          {row('שעות, ניקוי, כתובת', `${s.times.morning} · ${s.times.noon} · ${s.times.evening}`, 'set-general')}
        </div>
        <div class="sec">כסף</div>
        <div class="list">
          {row('מחירון וחישוב לינה', `${s.priceList.length} סעיפים · ${METHODS[s.pricing.method]}`, 'set-prices')}
        </div>
        <div class="sec">לקוחות</div>
        <div class="list">
          {row('נוסח הודעת זימון ותזכורות', `${s.reminders.join(' ו-')} ימים לפני`, 'set-message')}
        </div>
        <div class="sec">מערכת</div>
        <div class="list">
          {row('קוד מנהל', '••••', 'set-general')}
          {row('גיבוי, שחזור ונתוני דוגמה', '', 'set-backup')}
          <div class="row static"><span class="grow">יומן Google<small>יחובר כשיהיה חשבון Google Cloud אישי</small></span><span class="pill w">בהמשך</span></div>
        </div>
      </main>
    </>
  );
}

export function SetGeneral({ state }) {
  const s = state.settings;
  const set = (fn) => update((st) => fn(st.settings));
  return (
    <>
      <Top title="כללי" back />
      <main class="main">
        <div class="sec">שעות קבועות לקביעה מהירה</div>
        <div class="two">
          <Field label="בוקר"><input id="g-m" type="time" value={s.times.morning} onInput={(e) => set((x) => { x.times.morning = e.currentTarget.value; })} /></Field>
          <Field label="צהריים"><input id="g-n" type="time" value={s.times.noon} onInput={(e) => set((x) => { x.times.noon = e.currentTarget.value; })} /></Field>
        </div>
        <Field label="ערב"><input id="g-e" type="time" value={s.times.evening} onInput={(e) => set((x) => { x.times.evening = e.currentTarget.value; })} /></Field>
        <Field label="מרווח ניקוי בין כלבים בתא (דקות, 0 = בלי)">
          <input id="g-gap" type="number" min="0" step="15" value={s.cleaningGapMin} onInput={(e) => set((x) => { x.cleaningGapMin = Number(e.currentTarget.value) || 0; })} />
        </Field>
        <Field label="הכתובת שלי (לאילוף אצלי ולזימון)">
          <input id="g-home" value={s.homeAddress} onInput={(e) => set((x) => { x.homeAddress = e.currentTarget.value; })} />
        </Field>
        <Field label="קוד מנהל (לאישור מעל קיבולת ו״רק לבד״)">
          <input id="g-pin" inputMode="numeric" value={s.adminPin} onInput={(e) => set((x) => { x.adminPin = e.currentTarget.value; })} />
        </Field>
      </main>
    </>
  );
}

export function SetMessage({ state }) {
  const s = state.settings;
  return (
    <>
      <Top title="הודעת זימון" back />
      <main class="main">
        <Field label="נוסח ההודעה">
          <textarea id="m-t" style="min-height:180px" value={s.messageTemplate} onInput={(e) => update((st) => { st.settings.messageTemplate = e.currentTarget.value; })} />
        </Field>
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">אפשר להשתמש ב: {'{כלב} {בעלים} {הגעה} {איסוף} {סכום}'}</div>
        <Field label="תזכורות ביומן של הלקוח (ימים לפני, מופרדים בפסיק)">
          <input id="m-r" value={s.reminders.join(', ')} onChange={(e) => update((st) => {
            const r = e.currentTarget.value.split(/[,\s]+/).map(Number).filter((n) => n > 0);
            st.settings.reminders = r.length ? r : [7, 2];
          })} />
        </Field>
      </main>
    </>
  );
}

export function SetPrices({ state }) {
  const s = state.settings;
  const setItem = (id, patch) => update((st) => Object.assign(st.settings.priceList.find((p) => p.id === id), patch));
  const groups = [...new Set(s.priceList.map((p) => p.group || 'כללי'))];
  const KIND = { night: 'לינה', secondDog: 'כלב שני', dayNoLodging: 'יום בלי לינה', lesson: 'שיעור' };
  return (
    <>
      <Top title="מחירון" back />
      <main class="main">
        <div class="sec">שיטת חישוב לינה</div>
        <Seg value={s.pricing.method} onChange={(v) => update((st) => { st.settings.pricing.method = v; })} options={Object.entries(METHODS)} />
        {s.pricing.method === 'nightsLate' && (
          <div class="two">
            <Field label="איסוף מאוחר מהשעה"><input id="p-lh" type="number" min="0" max="23" value={s.pricing.lateHour} onInput={(e) => update((st) => { st.settings.pricing.lateHour = Number(e.currentTarget.value); })} /></Field>
            <Field label="תוספת (חלק מלילה)">
              <select id="p-lf" value={s.pricing.lateFraction} onChange={(e) => update((st) => { st.settings.pricing.lateFraction = Number(e.currentTarget.value); })}>
                <option value="0.5">חצי לילה</option>
                <option value="1">לילה שלם</option>
              </select>
            </Field>
          </div>
        )}
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">דוגמה: הגעה ראשון 08:00, איסוף שלישי 18:00 → {s.pricing.method === 'nights' ? '2 לילות' : s.pricing.method === 'days' ? '3 ימים' : `${2 + (18 >= s.pricing.lateHour ? s.pricing.lateFraction : 0)} לילות`}. שינוי חל רק על קביעות חדשות.</div>

        {groups.map((g) => (
          <Fragment key={g}>
            <div class="sec">{g}</div>
            <div class="list">
              {s.priceList.filter((p) => (p.group || 'כללי') === g).map((p) => (
                <div class="row static" key={p.id}>
                  <input aria-label="שם הסעיף" value={p.label} onInput={(e) => setItem(p.id, { label: e.currentTarget.value })} style="flex:1;border:0;background:none;min-width:0" />
                  {p.kind && <span class="pill g">{KIND[p.kind]}</span>}
                  <input aria-label="מחיר" type="number" min="0" value={p.price} onInput={(e) => setItem(p.id, { price: Number(e.currentTarget.value) })} style="width:76px" class="num" />
                  {!p.kind && <button class="textbtn" type="button" aria-label="מחק סעיף" onClick={() => update((st) => { st.settings.priceList = st.settings.priceList.filter((x) => x.id !== p.id); })}>✕</button>}
                </div>
              ))}
            </div>
          </Fragment>
        ))}
        <div class="btnrow">
          {['פנסיון', 'אילוף', 'תוספות'].map((g) => (
            <button key={g} class="btn small ghost" type="button" onClick={() => update((st) => st.settings.priceList.push({ id: uid(), group: g, label: 'סעיף חדש', price: 0 }))}>+ ל{g}</button>
          ))}
        </div>
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">סעיפים עם תג ירוק משמשים לחישוב אוטומטי, ולכן אי אפשר למחוק אותם. שינוי מחיר כאן לא משנה שהיות שכבר נקבעו.</div>
      </main>
    </>
  );
}

const TOOLS = [['kennel', 'תא'], ['aisle', 'שביל'], ['door', 'כניסה'], ['erase', 'מחק']];

export function SetPlan({ state }) {
  const ui = useUI();
  const { plan } = state;
  const [tool, setTool] = useState('kennel');
  const [sel, setSel] = useState(null);
  const selK = sel && byId(state.kennels, sel);
  const hasStays = (kid) => state.stays.some((s) => isActive(s) && s.kennelId === kid && s.end > Date.now());

  const tap = (r, c) => {
    const key = `${r},${c}`;
    const cell = plan.cells[key];
    if (cell?.type === 'kennel' && tool !== 'erase') return setSel(cell.kennelId);
    if (tool === 'erase') {
      if (cell?.type === 'kennel' && hasStays(cell.kennelId)) return ui.toast('יש שהיות עתידיות בתא הזה. העבר אותן קודם.');
      update((st) => {
        if (cell?.type === 'kennel') st.kennels = st.kennels.filter((k) => k.id !== cell.kennelId);
        delete st.plan.cells[key];
      });
      return setSel(null);
    }
    if (tool === 'kennel') {
      const id = uid();
      update((st) => {
        st.kennels.push({ id, name: `תא ${st.kennels.length + 1}`, capacity: 2, note: '' });
        st.plan.cells[key] = { type: 'kennel', kennelId: id };
      });
      return setSel(id);
    }
    update((st) => { st.plan.cells[key] = { type: tool }; });
  };
  const resize = (dr, dc) => {
    const rows = Math.max(1, plan.rows + dr);
    const cols = Math.max(1, plan.cols + dc);
    const lost = Object.entries(plan.cells).filter(([k, v]) => { const [r, c] = k.split(',').map(Number); return (r >= rows || c >= cols) && v.type === 'kennel'; });
    if (lost.length) return ui.toast('יש תאים בשורה/עמודה הזאת. מחק אותם קודם.');
    update((st) => {
      st.plan.rows = rows;
      st.plan.cols = cols;
      for (const k of Object.keys(st.plan.cells)) { const [r, c] = k.split(',').map(Number); if (r >= rows || c >= cols) delete st.plan.cells[k]; }
    });
  };

  const cells = [];
  for (let r = 0; r < plan.rows; r++)
    for (let c = 0; c < plan.cols; c++) {
      const cell = plan.cells[`${r},${c}`];
      const k = cell?.type === 'kennel' && byId(state.kennels, cell.kennelId);
      cells.push(
        <button type="button" key={r + ',' + c} style={`grid-row:${r + 1};grid-column:${c + 1}`}
          class={'ecell ' + (k ? 'kennel-e' : cell?.type || '') + (k && k.id === sel ? ' sel' : '')} onClick={() => tap(r, c)}>
          {k ? k.name : cell?.type === 'door' ? 'כניסה' : cell?.type === 'aisle' ? '' : '+'}
        </button>,
      );
    }

  return (
    <>
      <Top title="מפת התאים" back sub={`${state.kennels.length} תאים`} />
      <main class="main">
        <Seg value={tool} onChange={setTool} options={TOOLS} />
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">בחר כלי ולחץ על משבצת. לחיצה על תא קיים בוחרת אותו לעריכה.</div>
        <div class="editor" style={`grid-template-columns:repeat(${plan.cols},minmax(0,1fr))`}>{cells}</div>
        <div class="two">
          <div class="card stepper" style="padding:8px"><button type="button" aria-label="פחות שורות" onClick={() => resize(-1, 0)}>−</button><span style="flex:1;text-align:center">{plan.rows} שורות</span><button type="button" aria-label="עוד שורה" onClick={() => resize(1, 0)}>+</button></div>
          <div class="card stepper" style="padding:8px"><button type="button" aria-label="פחות עמודות" onClick={() => resize(0, -1)}>−</button><span style="flex:1;text-align:center">{plan.cols} עמודות</span><button type="button" aria-label="עוד עמודה" onClick={() => resize(0, 1)}>+</button></div>
        </div>
        {selK && (
          <>
            <div class="sec">{selK.name}</div>
            <Field label="שם"><input id="k-name" value={selK.name} onInput={(e) => update((st) => { byId(st.kennels, selK.id).name = e.currentTarget.value; })} /></Field>
            <div class="card stepper" style="padding:8px 12px">
              <span style="flex:1">כמה כלבים בתא</span>
              <button type="button" aria-label="פחות" onClick={() => update((st) => { const k = byId(st.kennels, selK.id); k.capacity = Math.max(1, k.capacity - 1); })}>−</button>
              <b class="num">{selK.capacity}</b>
              <button type="button" aria-label="יותר" onClick={() => update((st) => { byId(st.kennels, selK.id).capacity += 1; })}>+</button>
            </div>
            <Field label="הערה"><input id="k-note" value={selK.note} onInput={(e) => update((st) => { byId(st.kennels, selK.id).note = e.currentTarget.value; })} /></Field>
            <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">מעל הכמות הזאת השמירה תדרוש קוד מנהל.</div>
          </>
        )}
      </main>
    </>
  );
}

export function SetBackup({ state }) {
  const ui = useUI();
  const [confirm, setConfirm] = useState(null);
  const exportJson = async () => {
    const file = new File([JSON.stringify(state)], `pension-backup-${dateKey(Date.now())}.json`, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
  };
  const importJson = async (e) => {
    const f = e.currentTarget.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!Array.isArray(data.kennels) || !Array.isArray(data.stays)) throw new Error();
      replaceState(data);
      ui.toast('הגיבוי שוחזר');
    } catch {
      ui.toast('הקובץ לא גיבוי של האפליקציה');
    }
  };
  return (
    <>
      <Top title="גיבוי ושחזור" back />
      <main class="main">
        <div class="issue">הנתונים שמורים כרגע רק בטלפון הזה. כדאי לשמור גיבוי פעם בשבוע (למשל לוואטסאפ לעצמך או ל-iCloud Drive).</div>
        <button class="btn" type="button" onClick={exportJson}>שמור גיבוי</button>
        <label class="btn ghost" style="text-align:center">
          שחזר מגיבוי
          <input type="file" accept="application/json,.json" style="display:none" onChange={importJson} />
        </label>
        <div class="sec">נתוני דוגמה</div>
        {confirm === 'demo' ? (
          <div class="btnrow">
            <button class="btn warn" type="button" onClick={() => { const st = defaultState(); seedDemo(st); replaceState(st); setConfirm(null); ui.toast('נטענו נתוני דוגמה'); }}>כן, החלף הכל בדוגמה</button>
            <button class="btn ghost" type="button" onClick={() => setConfirm(null)}>לא</button>
          </div>
        ) : (
          <button class="btn soft" type="button" onClick={() => setConfirm('demo')}>טען נתוני דוגמה (מוחק את הקיים)</button>
        )}
        {confirm === 'wipe' ? (
          <div class="btnrow">
            <button class="btn red" type="button" onClick={() => { replaceState(defaultState()); setConfirm(null); ui.toast('הכל נמחק'); }}>כן, מחק הכל</button>
            <button class="btn ghost" type="button" onClick={() => setConfirm(null)}>לא</button>
          </div>
        ) : (
          <button class="btn red" type="button" onClick={() => setConfirm('wipe')}>מחק הכל והתחל מאפס</button>
        )}
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">{state.dogs.length} כלבים · {state.stays.length} שהיות · {state.trainings.length} שיעורים · מחירון {money(state.settings.priceList[0]?.price || 0)} ללילה</div>
      </main>
    </>
  );
}
