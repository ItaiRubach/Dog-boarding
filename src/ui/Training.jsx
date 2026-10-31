import { useState } from 'preact/hooks';
import { Top, Field, Seg, useUI } from './common.jsx';
import { Money } from './Stay.jsx';
import { DogPicker } from './DogPicker.jsx';
import { update } from '../store.js';
import { dateKey, fmtTime, toMs, uid, dayStart } from '../logic/util.js';
import { chargeLine } from '../logic/pricing.js';
import { byId, primaryContact, ownersLabel } from '../model.js';
import { wazeLink, mapsLink } from '../logic/messages.js';

/** Where the lesson is: the address comes from the dog's file or from settings; only "other" is typed. */
export function lessonAddress(state, draft) {
  if (draft.locationType === 'client') return primaryContact(state, byId(state.dogs, draft.dogId))?.address || '';
  if (draft.locationType === 'home') return state.settings.homeAddress || '';
  return draft.address || '';
}

export function Training({ state, params }) {
  const ui = useUI();
  const existing = params.id && byId(state.trainings, params.id);
  const [draft, setDraft] = useState(() => {
    if (existing) return structuredClone(existing);
    const date = params.date || dateKey(dayStart(Date.now()));
    const lesson = state.settings.priceList.find((p) => p.kind === 'lesson');
    return { id: uid(), dogId: '', start: toMs(date, '16:00'), end: toMs(date, '17:00'), locationType: 'client', address: '', charges: lesson ? [chargeLine(lesson, 1)] : [], payments: [], notes: '' };
  });
  const [picking, setPicking] = useState(!existing);
  const [confirmDel, setConfirmDel] = useState(false);
  const [sendInvite, setSendInvite] = useState(!existing);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const dog = byId(state.dogs, draft.dogId);
  const contact = primaryContact(state, dog);
  const address = lessonAddress(state, draft);

  const save = (invite = sendInvite) => {
    if (!draft.dogId) return ui.toast('בחר כלב');
    if (draft.end <= draft.start) return ui.toast('הסיום לפני ההתחלה');
    const saved = { ...draft, address };
    update((s) => {
      const i = s.trainings.findIndex((t) => t.id === saved.id);
      if (i >= 0) s.trainings[i] = saved;
      else s.trainings.push(saved);
    });
    ui.toast('נשמר');
    ui.back();
    if (invite) ui.invite({ kind: 'lesson', id: saved.id });
  };

  if (picking) {
    return (
      <>
        <Top title="שיעור אילוף · איזה כלב?" back={existing ? () => setPicking(false) : true} />
        <main class="main">
          <DogPicker state={state} withAddress onPick={(id) => { set({ dogId: id }); setPicking(false); }} />
        </main>
      </>
    );
  }

  return (
    <>
      <Top title="שיעור אילוף" back right={<button class="textbtn" type="button" onClick={() => save()}>שמור</button>} />
      <main class="main">
        <div class="list">
          <div class="row static">
            <span class="grow">
              <b>{dog?.name}{dog?.flag ? ' ⚠' : ''}</b>
              <small>{[ownersLabel(state, dog || { contacts: [] }), contact?.phone].filter(Boolean).join(' · ')}</small>
            </span>
            <button class="textbtn" type="button" onClick={() => setPicking(true)}>החלף</button>
          </div>
        </div>
        {dog?.flag && <div class="flag">⚠ {dog.flag}</div>}

        <div class="sec">איפה</div>
        <Seg value={draft.locationType} onChange={(v) => set({ locationType: v })} options={[['client', 'אצל הלקוח'], ['home', 'אצל יובל'], ['other', 'כתובת אחרת']]} />

        {draft.locationType === 'client' &&
          (contact?.address ? (
            <div class="row static card"><span class="grow">{contact.address}<small>מהתיק של {contact.name || dog?.name}</small></span></div>
          ) : (
            <Field label={`אין כתובת בתיק של ${contact?.name || dog?.name || 'הלקוח'} · נשמור אותה בתיק`}>
              <input id="tr-client-addr" placeholder="רחוב, מספר, עיר" onChange={(e) => { const v = e.currentTarget.value.trim(); if (v && contact) update((s) => { byId(s.contacts, contact.id).address = v; }); }} />
            </Field>
          ))}
        {draft.locationType === 'home' &&
          (state.settings.homeAddress ? (
            <div class="row static card"><span class="grow">{state.settings.homeAddress}<small>הכתובת שלך מההגדרות</small></span></div>
          ) : (
            <Field label="הכתובת שלך עוד לא מוגדרת · נשמור אותה בהגדרות">
              <input id="tr-home-addr" placeholder="רחוב, מספר, עיר" onChange={(e) => { const v = e.currentTarget.value.trim(); if (v) update((s) => { s.settings.homeAddress = v; }); }} />
            </Field>
          ))}
        {draft.locationType === 'other' && (
          <Field label="כתובת"><input id="tr-addr" placeholder="רחוב, מספר, עיר · או פארק, חוף…" value={draft.address} onInput={(e) => set({ address: e.currentTarget.value })} /></Field>
        )}
        {address && (
          <div class="btnrow">
            <a class="btn" style="text-align:center;text-decoration:none;background:var(--paid);color:#fff" href={wazeLink(address)} target="_blank" rel="noopener">נווט בוויז</a>
            <a class="btn ghost" style="text-align:center;text-decoration:none" href={mapsLink(address)} target="_blank" rel="noopener">Google Maps</a>
          </div>
        )}

        <div class="sec">מתי</div>
        <Field label="תאריך"><input id="tr-date" type="date" value={dateKey(draft.start)} onInput={(e) => { const v = e.currentTarget.value; if (v) set({ start: toMs(v, fmtTime(draft.start)), end: toMs(v, fmtTime(draft.end)) }); }} /></Field>
        <div class="two">
            <Field label="מ-"><input id="tr-from" type="time" value={fmtTime(draft.start)} onInput={(e) => e.currentTarget.value && set({ start: toMs(dateKey(draft.start), e.currentTarget.value) })} /></Field>
            <Field label="עד"><input id="tr-to" type="time" value={fmtTime(draft.end)} onInput={(e) => e.currentTarget.value && set({ end: toMs(dateKey(draft.start), e.currentTarget.value) })} /></Field>
        </div>
        <Money draft={draft} setDraft={setDraft} settings={state.settings} />
        <Field label="הערות"><textarea id="tr-notes" value={draft.notes} onInput={(e) => set({ notes: e.currentTarget.value })} /></Field>
        {existing ? (
          <button class="btn soft" type="button" onClick={() => save(true)}>שמור ושלח זימון</button>
        ) : (
          <label class="check"><span>לשלוח זימון ללקוח וליומן שלי אחרי השמירה</span><input id="tr-invite" type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.currentTarget.checked)} /></label>
        )}
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
