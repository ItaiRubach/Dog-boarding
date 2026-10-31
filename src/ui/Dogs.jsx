import { useState } from 'preact/hooks';
import { Top, Field, Seg, useUI } from './common.jsx';
import { update } from '../store.js';
import { uid, fmtDay, fmtDateTime, money } from '../logic/util.js';
import { total, balance, isPaid } from '../logic/pricing.js';
import { byId, ownersLabel, kennelName, ROLE_LABELS } from '../model.js';
import { telLink, waLink } from '../logic/messages.js';

export function Dogs({ state }) {
  const ui = useUI();
  const [q, setQ] = useState('');
  const debt = (d) => state.stays.filter((s) => !s.cancelled && s.dogIds.includes(d.id)).reduce((a, s) => a + Math.max(0, balance(s)), 0);
  const list = state.dogs
    .filter((d) => !q || (d.name + ' ' + d.breed + ' ' + ownersLabel(state, d)).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const addDog = () => {
    const id = uid();
    update((s) => s.dogs.push({ id, name: q || 'כלב חדש', breed: '', sex: '', birthYear: '', weight: '', health: '', food: '', behavior: '', vaccines: '', flag: '', aloneOnly: false, blocked: false, contacts: [] }));
    ui.go('dog', { id });
  };
  return (
    <>
      <Top title="כלבים" sub={`${state.dogs.length} בתיק`} right={<button class="iconbtn" type="button" aria-label="כלב חדש" onClick={addDog}>+</button>} />
      <main class="main">
        <Field label="חיפוש"><input id="dogs-q" type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} /></Field>
        {list.length === 0 ? (
          <div class="empty">{state.dogs.length ? 'לא נמצא כלב.' : 'עוד אין כלבים. כלב נוסף אוטומטית כשקובעים שהייה, או בכפתור +.'}</div>
        ) : (
          <div class="list">
            {list.map((d) => {
              const owe = debt(d);
              return (
                <button type="button" class="row" key={d.id} onClick={() => ui.go('dog', { id: d.id })}>
                  <span class="grow">
                    {d.name}{d.flag ? ' ⚠' : ''}
                    <small>{[d.breed, ownersLabel(state, d)].filter(Boolean).join(' · ') || 'בלי פרטים'}</small>
                  </span>
                  {d.blocked && <span class="pill u">לא לקבל</span>}
                  {owe > 0 && <span class="pill u">{money(owe)}</span>}
                  <span class="chev" dir="ltr">‹</span>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

function ContactRow({ state, dog, link }) {
  const c = byId(state.contacts, link.contactId);
  const setLink = (patch) =>
    update((s) => {
      const d = byId(s.dogs, dog.id);
      d.contacts = d.contacts.map((l) => (l.contactId === link.contactId ? { ...l, ...patch } : patch.primary ? { ...l, primary: false } : l));
    });
  const setC = (patch) => update((s) => Object.assign(byId(s.contacts, link.contactId), patch));
  if (!c) return null;
  return (
    <div class="card" style="padding:10px;display:grid;gap:8px">
      <div class="two">
        <Field label="שם"><input value={c.name} onInput={(e) => setC({ name: e.currentTarget.value })} /></Field>
        <Field label="טלפון"><input type="tel" value={c.phone} onInput={(e) => setC({ phone: e.currentTarget.value })} /></Field>
      </div>
      <Field label="כתובת (לאילוף בבית)"><input value={c.address || ''} onInput={(e) => setC({ address: e.currentTarget.value })} /></Field>
      <div class="btnrow" style="align-items:center">
        <select aria-label="תפקיד" value={link.role} onChange={(e) => setLink({ role: e.currentTarget.value })} class="btn small ghost">
          {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button type="button" class={'btn small ' + (link.primary ? '' : 'ghost')} onClick={() => setLink({ primary: true })}>{link.primary ? 'מקבל הודעות ✓' : 'מקבל הודעות'}</button>
      </div>
      <div class="btnrow">
        <a class="btn small soft" style="text-align:center;text-decoration:none" href={c.phone ? telLink(c.phone) : undefined}>📞 התקשר</a>
        <a class="btn small soft" style="text-align:center;text-decoration:none" href={c.phone ? waLink(c.phone) : undefined} target="_blank" rel="noopener">💬 וואטסאפ</a>
        <button class="btn small red" type="button" onClick={() => update((s) => { const d = byId(s.dogs, dog.id); d.contacts = d.contacts.filter((l) => l.contactId !== link.contactId); })}>נתק</button>
      </div>
    </div>
  );
}

export function Dog({ state, params }) {
  const ui = useUI();
  const [tab, setTab] = useState(params.tab || 'info');
  const [note, setNote] = useState('');
  const [pick, setPick] = useState('');
  const dog = byId(state.dogs, params.id);
  if (!dog) return (<><Top title="כלב" back /><main class="main"><div class="empty">הכלב לא נמצא.</div></main></>);
  const set = (patch) => update((s) => Object.assign(byId(s.dogs, dog.id), patch));
  const txt = (key, label, area) => (
    <Field label={label}>
      {area ? <textarea value={dog[key]} onInput={(e) => set({ [key]: e.currentTarget.value })} /> : <input value={dog[key]} onInput={(e) => set({ [key]: e.currentTarget.value })} />}
    </Field>
  );
  const stays = state.stays.filter((s) => s.dogIds.includes(dog.id)).sort((a, b) => b.start - a.start);
  const trainings = state.trainings.filter((t) => t.dogId === dog.id).sort((a, b) => b.start - a.start);
  const journal = state.journal.filter((j) => j.dogId === dog.id).sort((a, b) => b.at - a.at);
  const linked = new Set(dog.contacts.map((l) => l.contactId));

  const addContact = (role) => {
    const id = uid();
    update((s) => {
      s.contacts.push({ id, name: '', phone: '', address: '' });
      byId(s.dogs, dog.id).contacts.push({ contactId: id, role, primary: !dog.contacts.length });
    });
  };
  const pickPhoneContact = async () => {
    try {
      const [p] = await navigator.contacts.select(['name', 'tel'], { multiple: false });
      if (!p) return;
      const id = uid();
      update((s) => {
        s.contacts.push({ id, name: p.name?.[0] || '', phone: p.tel?.[0] || '', address: '' });
        byId(s.dogs, dog.id).contacts.push({ contactId: id, role: 'owner', primary: !dog.contacts.length });
      });
    } catch {}
  };

  return (
    <>
      <Top title={dog.name || 'כלב'} sub={[dog.breed, ownersLabel(state, dog)].filter(Boolean).join(' · ')} back />
      <main class="main">
        {dog.flag && <div class="flag">⚠ {dog.flag}</div>}
        <Seg value={tab} onChange={setTab} options={[['info', 'פרטים'], ['visits', `ביקורים ${stays.length + trainings.length}`], ['journal', `יומן ${journal.length}`]]} />

        {tab === 'info' && (
          <>
            <div class="two">{txt('name', 'שם')}{txt('breed', 'גזע')}</div>
            <div class="two">{txt('sex', 'מין')}{txt('birthYear', 'שנת לידה')}</div>
            <div class="two">{txt('weight', 'משקל (ק״ג)')}{txt('vaccines', 'חיסונים ותוקף')}</div>
            {txt('flag', '⚠ כלב בעייתי – ממה להיזהר (ריק = לא בעייתי)', true)}
            <label class="check"><span>רק לבד בתא</span><input type="checkbox" checked={dog.aloneOnly} onChange={(e) => set({ aloneOnly: e.currentTarget.checked })} /></label>
            {txt('health', 'בריאות', true)}
            {txt('food', 'אוכל', true)}
            {txt('behavior', 'התנהגות', true)}

            <div class="sec">אנשי קשר</div>
            {dog.contacts.map((l) => <ContactRow key={l.contactId} state={state} dog={dog} link={l} />)}
            <div class="btnrow">
              <button class="btn small ghost" type="button" onClick={() => addContact('owner')}>+ בעלים</button>
              <button class="btn small ghost" type="button" onClick={() => addContact('extra')}>+ איש קשר נוסף</button>
              {'contacts' in navigator && <button class="btn small ghost" type="button" onClick={pickPhoneContact}>מאנשי הקשר בטלפון</button>}
            </div>
            <select aria-label="קשר לאיש קשר קיים" class="btn small ghost" value={pick} onChange={(e) => {
              const cid = e.currentTarget.value;
              setPick('');
              if (cid) update((s) => byId(s.dogs, dog.id).contacts.push({ contactId: cid, role: 'owner', primary: !dog.contacts.length }));
            }}>
              <option value="">קשר לאיש קשר קיים (למשל בעלים של כלב אחר)</option>
              {state.contacts.filter((c) => !linked.has(c.id) && c.name).map((c) => <option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}
            </select>

            <label class="check"><span>לא לקבל שוב</span><input type="checkbox" checked={dog.blocked} onChange={(e) => set({ blocked: e.currentTarget.checked })} /></label>
          </>
        )}

        {tab === 'visits' && (
          <div class="list">
            {[...stays.map((s) => ({ at: s.start, s })), ...trainings.map((t) => ({ at: t.start, t }))].sort((a, b) => b.at - a.at).map(({ s, t }) =>
              s ? (
                <button type="button" class="row" key={s.id} onClick={() => ui.go('stay', { id: s.id })}>
                  <span class="grow">
                    {fmtDay(s.start)} – {fmtDay(s.end)} · {kennelName(state, s.kennelId)}
                    <small>{s.cancelled ? 'בוטלה' : `${money(total(s.charges))}${s.notes ? ' · ' + s.notes : ''}`}</small>
                  </span>
                  {!s.cancelled && <span class={'pill ' + (isPaid(s) ? 'p' : 'u')}>{isPaid(s) ? 'שולם' : money(balance(s))}</span>}
                </button>
              ) : (
                <button type="button" class="row" key={t.id} onClick={() => ui.go('training', { id: t.id })}>
                  <span class="grow">אילוף · {fmtDateTime(t.start)}<small>{t.address}</small></span>
                  <span class={'pill ' + (isPaid(t) ? 'p' : 'u')}>{isPaid(t) ? 'שולם' : money(balance(t))}</span>
                </button>
              ),
            )}
            {!stays.length && !trainings.length && <div class="row static">עוד אין ביקורים.</div>}
          </div>
        )}

        {tab === 'journal' && (
          <>
            <Field label="הערה חדשה"><textarea id="j-new" value={note} onInput={(e) => setNote(e.currentTarget.value)} /></Field>
            <button class="btn" type="button" disabled={!note.trim()} onClick={() => { update((s) => s.journal.push({ id: uid(), dogId: dog.id, at: Date.now(), text: note.trim() })); setNote(''); }}>הוסף ליומן</button>
            <div class="list">
              {journal.map((j) => (
                <div class="row static" key={j.id}>
                  <span class="grow" style="white-space:pre-wrap">{j.text}<small>{fmtDateTime(j.at)}</small></span>
                  <button class="textbtn" type="button" aria-label="מחק" onClick={() => update((s) => { s.journal = s.journal.filter((x) => x.id !== j.id); })}>✕</button>
                </div>
              ))}
              {!journal.length && <div class="row static">היומן ריק.</div>}
            </div>
          </>
        )}
      </main>
    </>
  );
}
