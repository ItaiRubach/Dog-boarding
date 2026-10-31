import { useState } from 'preact/hooks';
import { Top, Field, Seg, useUI } from './common.jsx';
import { Money } from './Stay.jsx';
import { update } from '../store.js';
import { dateKey, fmtTime, toMs, uid, dayStart } from '../logic/util.js';
import { chargeLine } from '../logic/pricing.js';
import { byId, primaryContact } from '../model.js';
import { wazeLink, mapsLink } from '../logic/messages.js';

export function Training({ state, params }) {
  const ui = useUI();
  const existing = params.id && byId(state.trainings, params.id);
  const [draft, setDraft] = useState(() => {
    if (existing) return structuredClone(existing);
    const date = params.date || dateKey(dayStart(Date.now()));
    const lesson = state.settings.priceList.find((p) => p.kind === 'lesson');
    return { id: uid(), dogId: '', start: toMs(date, '16:00'), end: toMs(date, '17:00'), locationType: 'client', address: '', charges: lesson ? [chargeLine(lesson, 1)] : [], payments: [], notes: '' };
  });
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const dog = byId(state.dogs, draft.dogId);
  const clientAddress = primaryContact(state, dog)?.address || '';

  const setLocation = (type) => {
    const address = type === 'client' ? clientAddress : type === 'home' ? state.settings.homeAddress : '';
    set({ locationType: type, address });
  };
  const setDog = (dogId) => {
    const d = byId(state.dogs, dogId);
    set({ dogId, address: draft.locationType === 'client' ? primaryContact(state, d)?.address || '' : draft.address });
  };
  const save = () => {
    if (!draft.dogId) return ui.toast('בחר כלב');
    if (draft.end <= draft.start) return ui.toast('הסיום לפני ההתחלה');
    update((s) => {
      const i = s.trainings.findIndex((t) => t.id === draft.id);
      if (i >= 0) s.trainings[i] = draft;
      else s.trainings.push(draft);
    });
    ui.toast('נשמר');
    ui.back();
  };

  return (
    <>
      <Top title="שיעור אילוף" back right={<button class="textbtn" type="button" onClick={save}>שמור</button>} />
      <main class="main">
        <div class="sec">מקום</div>
        <Seg value={draft.locationType} onChange={setLocation} options={[['client', 'אצל הלקוח'], ['home', 'אצל יובל'], ['other', 'כתובת אחרת']]} />
        <Field label={draft.locationType === 'client' ? 'כתובת הלקוח (מהתיק)' : 'כתובת'}>
          <input id="tr-addr" value={draft.address} onInput={(e) => set({ address: e.currentTarget.value })} />
        </Field>
        {draft.address && (
          <div class="btnrow">
            <a class="btn" style="text-align:center;text-decoration:none;background:var(--paid);color:#fff" href={wazeLink(draft.address)} target="_blank" rel="noopener">נווט בוויז</a>
            <a class="btn ghost" style="text-align:center;text-decoration:none" href={mapsLink(draft.address)} target="_blank" rel="noopener">Google Maps</a>
          </div>
        )}
        <Field label="כלב">
          <select id="tr-dog" value={draft.dogId} onChange={(e) => setDog(e.currentTarget.value)}>
            <option value="">בחר כלב…</option>
            {[...state.dogs].sort((a, b) => a.name.localeCompare(b.name, 'he')).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <div class="two">
          <Field label="תאריך"><input id="tr-date" type="date" value={dateKey(draft.start)} onInput={(e) => { const v = e.currentTarget.value; if (v) set({ start: toMs(v, fmtTime(draft.start)), end: toMs(v, fmtTime(draft.end)) }); }} /></Field>
          <div class="two">
            <Field label="מ-"><input id="tr-from" type="time" value={fmtTime(draft.start)} onInput={(e) => e.currentTarget.value && set({ start: toMs(dateKey(draft.start), e.currentTarget.value) })} /></Field>
            <Field label="עד"><input id="tr-to" type="time" value={fmtTime(draft.end)} onInput={(e) => e.currentTarget.value && set({ end: toMs(dateKey(draft.start), e.currentTarget.value) })} /></Field>
          </div>
        </div>
        <Money draft={draft} setDraft={setDraft} settings={state.settings} />
        <Field label="הערות"><textarea id="tr-notes" value={draft.notes} onInput={(e) => set({ notes: e.currentTarget.value })} /></Field>
        {existing && (confirmDel ? (
          <div class="btnrow">
            <button class="btn red" type="button" onClick={() => { update((s) => { s.trainings = s.trainings.filter((t) => t.id !== draft.id); }); ui.toast('נמחק'); ui.back(); }}>כן, מחק</button>
            <button class="btn ghost" type="button" onClick={() => setConfirmDel(false)}>לא</button>
          </div>
        ) : (
          <button class="btn red" type="button" onClick={() => setConfirmDel(true)}>מחק שיעור</button>
        ))}
      </main>
    </>
  );
}
