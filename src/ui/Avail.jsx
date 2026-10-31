import { useMemo, useState } from 'preact/hooks';
import { Top, Field, useUI } from './common.jsx';
import { FloorPlan } from './FloorPlan.jsx';
import { RangeCalendar } from './RangeCalendar.jsx';
import { dateKey, dayStart, fmtDateTime, fmtDay, toMs, uid, money } from '../logic/util.js';
import { rankKennels } from '../logic/occupancy.js';
import { autoCharges, total, nightsBetween } from '../logic/pricing.js';
import { byId, ownersLabel } from '../model.js';

const STATUS = { free: 'פנוי', partial: 'חפיפה / שיתוף', full: 'תפוס' };

/** Search ignores spaces, dashes, geresh and quotes, so "0541234567" finds "054-123 4567". */
export const norm = (s = '') => s.replace(/[\s\-׳'"״.()]/g, '').toLowerCase();

export function searchDogs(state, q) {
  const n = norm(q);
  if (!n) return [];
  return state.dogs
    .map((d) => {
      const contacts = d.contacts.map((l) => byId(state.contacts, l.contactId)).filter(Boolean);
      let score = 0;
      if (norm(d.name).startsWith(n)) score = 4;
      else if (norm(d.name).includes(n)) score = 3;
      else if (contacts.some((c) => norm(c.name).includes(n))) score = 2;
      else if (contacts.some((c) => norm(c.phone).includes(n.replace(/^\+?972/, '0')))) score = 2;
      else if (norm(d.breed).includes(n)) score = 1;
      return { d, score };
    })
    .filter((x) => x.score)
    .sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name, 'he'))
    .map((x) => x.d);
}

/** "Is there room?" → pick dates → see free kennels → pick dog → save. */
export function Avail({ state, params }) {
  const ui = useUI();
  const { times } = state.settings;
  const today = dayStart(Date.now());
  const [sDate, setSDate] = useState(params?.date && params.date > dateKey(today) ? params.date : null);
  const [eDate, setEDate] = useState(null);
  const [sTime, setSTime] = useState(times.morning);
  const [eTime, setETime] = useState(times.morning);
  const [count, setCount] = useState(1);
  const [kennelId, setKennelId] = useState(null);
  const [step, setStep] = useState(1);
  const [dogIds, setDogIds] = useState([]);
  const [q, setQ] = useState('');
  const [newDog, setNewDog] = useState(null);
  const [invite, setInvite] = useState(true);

  const start = sDate ? toMs(sDate, sTime) : 0;
  const end = eDate ? toMs(eDate, eTime) : 0;
  const picked = !!(sDate && eDate);
  const valid = picked && end > start;
  const ranked = useMemo(() => (valid ? rankKennels(start, end, count, state) : []), [start, end, count, state, valid]);
  const byKennel = Object.fromEntries(ranked.map((r) => [r.kennel.id, r]));
  const freeCount = ranked.filter((r) => r.status === 'free').length;
  const best = ranked[0];
  const chosen = kennelId && byKennel[kennelId] ? byKennel[kennelId] : best;

  const timeChips = (val, set, label) => (
    <div class="timerow">
      <span>{label}</span>
      {[['morning', 'בוקר'], ['noon', 'צהריים'], ['evening', 'ערב']].map(([k, l]) => (
        <button type="button" class="chip" key={k} aria-pressed={String(val === times[k])} onClick={() => set(times[k])}>
          {l}
        </button>
      ))}
      <input type="time" value={val} onInput={(e) => e.currentTarget.value && set(e.currentTarget.value)} class="chip" aria-label={label + ' שעה מדויקת'} />
    </div>
  );

  // ---- step 2: dogs ----
  const recent = useMemo(() => {
    const out = [];
    for (const s of [...state.stays].sort((a, b) => b.start - a.start)) {
      for (const id of s.dogIds) if (!out.includes(id)) out.push(id);
      if (out.length >= 2) break;
    }
    return out.slice(0, 2).map((id) => byId(state.dogs, id)).filter(Boolean);
  }, [state]);
  const results = searchDogs(state, q);
  const toggleDog = (id) => setDogIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const lastVisit = (d) => {
    const s = state.stays.filter((x) => !x.cancelled && x.dogIds.includes(d.id) && x.start < Date.now()).sort((a, b) => b.start - a.start)[0];
    return s ? `ביקור אחרון ${fmtDay(s.start)}` : 'עוד לא היה';
  };
  const dogRow = (d) => {
    const on = dogIds.includes(d.id);
    const phone = byId(state.contacts, d.contacts[0]?.contactId)?.phone;
    return (
      <button type="button" class={'row dogpick' + (on ? ' on' : '')} key={d.id} onClick={() => toggleDog(d.id)} aria-pressed={String(on)}>
        <span class="tick">{on ? '✓' : ''}</span>
        <span class="grow">
          <b>{d.name}{d.flag ? ' ⚠' : ''}</b>
          <small>{[ownersLabel(state, d), phone, d.breed].filter(Boolean).join(' · ') || 'בלי בעלים'}</small>
          <small>{lastVisit(d)}</small>
        </span>
        {d.blocked && <span class="pill u">לא לקבל</span>}
      </button>
    );
  };
  const selectedDogs = dogIds.map((id) => byId(state.dogs, id)).filter(Boolean);

  const charges = picked ? autoCharges(start, end, Math.max(1, dogIds.length + (newDog?.name ? 1 : 0)), state.settings) : [];

  const save = () => {
    let ids = dogIds;
    let extra = null;
    if (newDog?.name) {
      const cid = uid();
      const did = uid();
      extra = { contact: { id: cid, name: newDog.owner || '', phone: newDog.phone || '', address: '' }, dog: { id: did, name: newDog.name, breed: '', sex: '', birthYear: '', weight: '', health: '', food: '', behavior: '', vaccines: '', flag: '', aloneOnly: false, blocked: false, contacts: [{ contactId: cid, role: 'owner', primary: true }] } };
      ids = [...ids, did];
    }
    const stay = { id: uid(), kennelId: chosen.kennel.id, dogIds: ids, start, end, charges, payments: [], notes: '', approvals: [], arrivedAt: null, departedAt: null, cancelled: false };
    const blocked = ids.map((id) => (extra?.dog.id === id ? extra.dog : byId(state.dogs, id))).filter((d) => d?.blocked);
    ui.saveStay(stay, {
      before: (s) => {
        if (extra) {
          s.contacts.push(extra.contact);
          s.dogs.push(extra.dog);
        }
      },
      extraState: extra ? { dogs: [...state.dogs, extra.dog], contacts: [...state.contacts, extra.contact] } : null,
      warn: blocked.length ? `${blocked.map((d) => d.name).join(', ')} מסומן ״לא לקבל שוב״.` : null,
      onSaved: () => {
        ui.toast('נשמר');
        ui.reset('home');
        if (invite) ui.invite({ kind: 'stay', id: stay.id });
      },
    });
  };

  if (step === 2) {
    return (
      <>
        <Top title="איזה כלב?" back={() => setStep(1)} sub={`${chosen.kennel.name} · ${fmtDateTime(start)} ← ${fmtDateTime(end)}`} />
        <main class="main">
          <div class="searchbox">
            <span aria-hidden="true">⌕</span>
            <input id="dog-search" type="search" autoFocus enterKeyHint="search" placeholder="שם כלב, בעלים או טלפון" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
            {q && <button type="button" class="textbtn" aria-label="נקה" onClick={() => setQ('')}>✕</button>}
          </div>

          {selectedDogs.length > 0 && (
            <div class="chips">
              {selectedDogs.map((d) => (
                <button type="button" class="chip" aria-pressed="true" key={d.id} onClick={() => toggleDog(d.id)}>{d.name} ✕</button>
              ))}
            </div>
          )}

          {q ? (
            <>
              <div class="sec">{results.length ? `נמצאו ${results.length}` : 'לא נמצא'}</div>
              {results.length > 0 && <div class="list">{results.slice(0, 20).map(dogRow)}</div>}
              {!newDog && (
                <button class="btn ghost" type="button" onClick={() => setNewDog({ name: /\d/.test(q) ? '' : q, owner: '', phone: /\d/.test(q) ? q : '' })}>
                  + {/\d/.test(q) ? 'כלב חדש עם הטלפון הזה' : `״${q}״ ככלב חדש`}
                </button>
              )}
            </>
          ) : (
            recent.length > 0 && (
              <>
                <div class="sec">אחרונים</div>
                <div class="list">{recent.map(dogRow)}</div>
              </>
            )
          )}

          {newDog ? (
            <div class="card" style="padding:10px;display:grid;gap:8px">
              <div class="sec">כלב חדש · את שאר התיק משלימים אחר כך</div>
              <Field label="שם הכלב"><input id="nd-name" value={newDog.name} onInput={(e) => setNewDog({ ...newDog, name: e.currentTarget.value })} /></Field>
              <Field label="שם הבעלים"><input id="nd-owner" value={newDog.owner} onInput={(e) => setNewDog({ ...newDog, owner: e.currentTarget.value })} /></Field>
              <Field label="טלפון"><input id="nd-phone" type="tel" value={newDog.phone} onInput={(e) => setNewDog({ ...newDog, phone: e.currentTarget.value })} /></Field>
              <button class="textbtn" type="button" onClick={() => setNewDog(null)}>ביטול כלב חדש</button>
            </div>
          ) : (
            !q && <button class="btn ghost" type="button" onClick={() => setNewDog({ name: '', owner: '', phone: '' })}>+ כלב חדש</button>
          )}

          {(dogIds.length > 0 || newDog?.name) && (
            <>
              <div class="sec">סיכום</div>
              <div class="list">
                <div class="row static"><span class="grow">תא</span><span class="end">{chosen.kennel.name} · {STATUS[chosen.status]}</span></div>
                {charges.map((c) => (
                  <div class="row static" key={c.id}><span class="grow">{c.label}<small>{c.qty} × {money(c.unitPrice)}</small></span><span class="end num">{money(c.qty * c.unitPrice)}</span></div>
                ))}
                <div class="row static"><b class="grow">סה״כ</b><b class="num">{money(total(charges))}</b></div>
              </div>
              <label class="check"><span>לשלוח זימון לבעלים אחרי השמירה</span><input id="invite" type="checkbox" checked={invite} onChange={(e) => setInvite(e.currentTarget.checked)} /></label>
            </>
          )}
        </main>
        <div class="dock">
          <button class="btn big" type="button" disabled={!dogIds.length && !newDog?.name} onClick={save}>שמור</button>
        </div>
      </>
    );
  }

  const nights = picked ? nightsBetween(start, end) : 0;
  return (
    <>
      <Top title="יש מקום?" back="סגור" sub={picked ? `${fmtDay(start)} ← ${fmtDay(end)} · ${nights ? `${nights} לילות` : 'יום בלי לינה'}` : 'בחר תאריכים בלוח'} />
      <main class="main">
        <RangeCalendar state={state} from={sDate} to={eDate} onChange={(a, b) => { setSDate(a); setEDate(b); setKennelId(null); }} />
        {timeChips(sTime, setSTime, 'הגעה')}
        {timeChips(eTime, setETime, 'איסוף')}
        <div class="timerow">
          <span>כלבים</span>
          {[1, 2, 3].map((n) => (
            <button type="button" class="chip" key={n} aria-pressed={String(count === n)} onClick={() => setCount(n)}>{n}</button>
          ))}
        </div>

        {picked && !valid && <div class="issue block">שעת האיסוף לפני שעת ההגעה.</div>}
        {valid && (
          <>
            <div class="card" style={`padding:14px;text-align:center;background:var(--${freeCount ? 'ok' : 'warn'}-soft)`}>
              <div style={`font-size:22px;font-weight:800;color:var(--${freeCount ? 'ok' : 'warn'})`}>{freeCount ? 'כן, יש מקום' : 'אין תא פנוי לגמרי'}</div>
              <div>{fmtDateTime(start)} ← {fmtDateTime(end)}</div>
              <div>{freeCount ? `${best.kennel.name} מתאים הכי טוב${freeCount > 1 ? ` · עוד ${freeCount - 1} פנויים` : ''}` : 'אפשר לבחור תא עם חפיפה ולאשר'}</div>
            </div>
            <div class="sec">בחר תא · ירוק פנוי, כתום חפיפה, אפור תפוס</div>
            <FloorPlan
              state={state}
              renderKennel={(k) => {
                const r = byKennel[k.id];
                return (
                  <button type="button" class={`pcell kennel st-${r.status}${chosen.kennel.id === k.id ? ' sel' : ''}`} style="width:100%;height:100%" onClick={() => setKennelId(k.id)}>
                    <div class="kh"><span>{k.name}{chosen.kennel.id === k.id ? ' ✓' : ''}</span></div>
                    <span class={'kn ' + (r.status === 'free' ? 'f' : r.status === 'partial' ? 'w' : '')}>{STATUS[r.status]}</span>
                  </button>
                );
              }}
            />
          </>
        )}
      </main>
      <div class="dock">
        <button class="btn big" type="button" disabled={!valid || !chosen} onClick={() => setStep(2)}>
          {valid && chosen ? `קבע ב${chosen.kennel.name}` : 'בחר הגעה ואיסוף'}
          <small>הבא: בחירת כלב</small>
        </button>
      </div>
    </>
  );
}
