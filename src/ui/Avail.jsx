import { useMemo, useState } from 'preact/hooks';
import { Top, Field, useUI } from './common.jsx';
import { FloorPlan } from './FloorPlan.jsx';
import { update } from '../store.js';
import { addDays, dateKey, dayStart, fmtDateTime, fmtDay, toMs, uid, money } from '../logic/util.js';
import { rankKennels } from '../logic/occupancy.js';
import { autoCharges, total } from '../logic/pricing.js';
import { byId, ownersLabel } from '../model.js';

const STATUS = { free: 'פנוי', partial: 'חפיפה / שיתוף', full: 'תפוס' };

/** "Is there room?" → pick dates → see free kennels → pick dog → save. */
export function Avail({ state, params }) {
  const ui = useUI();
  const { times } = state.settings;
  const today = dayStart(Date.now());
  // first fixed time that is still ahead today, otherwise tomorrow morning
  const [first] = useState(() => {
    const date = params?.date || dateKey(today);
    if (date !== dateKey(today)) return { date, time: times.morning };
    const ahead = [times.morning, times.noon, times.evening].find((t) => toMs(date, t) > Date.now() + 30 * 60000);
    return ahead ? { date, time: ahead } : { date: dateKey(addDays(today, 1)), time: times.morning };
  });
  const [sDate, setSDate] = useState(first.date);
  const [sTime, setSTime] = useState(first.time);
  const [nights, setNights] = useState(3);
  const [eDate, setEDate] = useState(null); // null = start + nights
  const [eTime, setETime] = useState(times.morning);
  const [count, setCount] = useState(1);
  const [kennelId, setKennelId] = useState(null);
  const [step, setStep] = useState(1);
  const [dogIds, setDogIds] = useState([]);
  const [q, setQ] = useState('');
  const [newDog, setNewDog] = useState(null);
  const [invite, setInvite] = useState(true);

  const start = toMs(sDate, sTime);
  const endDate = eDate || dateKey(addDays(toMs(sDate, '00:00'), nights));
  const end = toMs(endDate, eTime);
  const valid = end > start;
  const ranked = useMemo(() => (valid ? rankKennels(start, end, count, state) : []), [start, end, count, state]);
  const byKennel = Object.fromEntries(ranked.map((r) => [r.kennel.id, r]));
  const freeCount = ranked.filter((r) => r.status === 'free').length;
  const best = ranked[0];
  const chosen = kennelId && byKennel[kennelId] ? byKennel[kennelId] : best;

  const quickDates = [0, 1, 2].map((d) => dateKey(addDays(today, d)));
  if (!quickDates.includes(sDate)) quickDates.push(sDate);
  const timeChips = (val, set) => (
    <div class="chips">
      {[['morning', 'בוקר'], ['noon', 'צהריים'], ['evening', 'ערב']].map(([k, label]) => (
        <button type="button" class="chip" key={k} aria-pressed={String(val === times[k])} onClick={() => set(times[k])}>
          {label} {times[k]}
        </button>
      ))}
      <input type="time" value={val} onInput={(e) => set(e.currentTarget.value)} class="chip" aria-label="שעה אחרת" style="width:auto" />
    </div>
  );

  // ---- step 2: dogs ----
  const recent = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const s of [...state.stays].sort((a, b) => b.start - a.start)) {
      for (const id of s.dogIds) if (!seen.has(id)) { seen.add(id); out.push(id); }
    }
    for (const d of state.dogs) if (!seen.has(d.id)) out.push(d.id);
    return out.map((id) => byId(state.dogs, id)).filter(Boolean);
  }, [state]);
  const matches = q
    ? state.dogs.filter((d) => {
        const owners = ownersLabel(state, d);
        const phones = d.contacts.map((c) => byId(state.contacts, c.contactId)?.phone || '').join(' ');
        return (d.name + ' ' + owners + ' ' + phones).includes(q);
      })
    : recent.slice(0, 12);
  const toggleDog = (id) => setDogIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const charges = autoCharges(start, end, Math.max(1, dogIds.length + (newDog?.name ? 1 : 0)), state.settings);

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
        if (invite) ui.invite(stay.id);
      },
    });
  };

  if (step === 2) {
    return (
      <>
        <Top title="איזה כלב?" back={() => setStep(1)} sub={`${chosen.kennel.name} · ${fmtDateTime(start)} ← ${fmtDateTime(end)}`} />
        <main class="main">
          <Field label="חיפוש כלב, בעלים או טלפון">
            <input id="dog-search" type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
          </Field>
          <div class="list">
            {matches.map((d) => (
              <button type="button" class="row" key={d.id} onClick={() => toggleDog(d.id)} aria-pressed={String(dogIds.includes(d.id))}>
                <span style="font-size:20px">{dogIds.includes(d.id) ? '☑' : '☐'}</span>
                <span class="grow">
                  {d.name}
                  {d.flag ? ' ⚠' : ''}
                  <small>{ownersLabel(state, d) || 'בלי בעלים'}</small>
                </span>
                {d.blocked && <span class="pill u">לא לקבל</span>}
              </button>
            ))}
            {!matches.length && <div class="row static">לא נמצא. אפשר להוסיף כלב חדש למטה.</div>}
          </div>
          {newDog ? (
            <div class="card" style="padding:10px;display:grid;gap:8px">
              <div class="sec">כלב חדש · את שאר התיק משלימים אחר כך</div>
              <Field label="שם הכלב"><input id="nd-name" value={newDog.name} onInput={(e) => setNewDog({ ...newDog, name: e.currentTarget.value })} /></Field>
              <Field label="שם הבעלים"><input id="nd-owner" value={newDog.owner} onInput={(e) => setNewDog({ ...newDog, owner: e.currentTarget.value })} /></Field>
              <Field label="טלפון"><input id="nd-phone" type="tel" value={newDog.phone} onInput={(e) => setNewDog({ ...newDog, phone: e.currentTarget.value })} /></Field>
            </div>
          ) : (
            <button class="btn ghost" type="button" onClick={() => setNewDog({ name: q, owner: '', phone: '' })}>+ כלב חדש</button>
          )}
          <div class="sec">סיכום</div>
          <div class="list">
            <div class="row static"><span class="grow">תא</span><span class="end">{chosen.kennel.name} · {STATUS[chosen.status]}</span></div>
            {charges.map((c) => (
              <div class="row static" key={c.id}><span class="grow">{c.label}<small>{c.qty} × {money(c.unitPrice)}</small></span><span class="end num">{money(c.qty * c.unitPrice)}</span></div>
            ))}
            <div class="row static"><b class="grow">סה״כ</b><b class="num">{money(total(charges))}</b></div>
          </div>
          <label class="check"><span>לשלוח זימון לבעלים אחרי השמירה</span><input id="invite" type="checkbox" checked={invite} onChange={(e) => setInvite(e.currentTarget.checked)} /></label>
          <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">מחיר, תשלום, הערות ותוספות אפשר לשנות אחר כך במסך השהייה.</div>
        </main>
        <div class="dock">
          <button class="btn big" type="button" disabled={!dogIds.length && !newDog?.name} onClick={save}>שמור</button>
        </div>
      </>
    );
  }

  return (
    <>
      <Top title="יש מקום?" back="סגור" />
      <main class="main">
        <div class="sec">מגיע</div>
        <div class="chips">
          {quickDates.map((d, i) => (
            <button type="button" class="chip" key={d} aria-pressed={String(sDate === d)} onClick={() => setSDate(d)}>
              {i === 0 ? 'היום' : i === 1 ? 'מחר' : fmtDay(toMs(d, '00:00'))}
            </button>
          ))}
          <input type="date" class="chip" value={sDate} onInput={(e) => e.currentTarget.value && setSDate(e.currentTarget.value)} aria-label="תאריך הגעה" style="width:auto" />
        </div>
        {timeChips(sTime, setSTime)}

        <div class="sec">יוצא</div>
        <div class="chips">
          {[1, 2, 3, 7].map((n) => (
            <button type="button" class="chip" key={n} aria-pressed={String(!eDate && nights === n)} onClick={() => { setEDate(null); setNights(n); }}>
              {n === 7 ? 'שבוע' : `${n} ${n === 1 ? 'לילה' : 'לילות'}`}
            </button>
          ))}
          <input type="date" class="chip" value={endDate} onInput={(e) => e.currentTarget.value && setEDate(e.currentTarget.value)} aria-label="תאריך יציאה" style="width:auto" />
        </div>
        {timeChips(eTime, setETime)}

        <div class="sec">כמה כלבים</div>
        <div class="chips">
          {[1, 2, 3].map((n) => (
            <button type="button" class="chip" key={n} aria-pressed={String(count === n)} onClick={() => setCount(n)}>{n}</button>
          ))}
        </div>

        {!valid ? (
          <div class="issue block">היציאה לפני ההגעה.</div>
        ) : (
          <>
            <div class={'card'} style={`padding:14px;text-align:center;background:var(--${freeCount ? 'ok' : 'warn'}-soft)`}>
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
          {chosen ? `קבע ב${chosen.kennel.name}` : 'קבע'}
          <small>הבא: בחירת כלב</small>
        </button>
      </div>
    </>
  );
}
