import { useState } from 'preact/hooks';
import { Top, Field, useUI } from './common.jsx';
import { update } from '../store.js';
import { dateKey, fmtTime, toMs, uid, money, fmtDateTime } from '../logic/util.js';
import { rankKennels } from '../logic/occupancy.js';
import { total, paidSum, balance, isPaid, autoCharges } from '../logic/pricing.js';
import { byId, ownersLabel } from '../model.js';

/** Charge lines + payments, shared by stays and training sessions. */
export function Money({ draft, setDraft, settings }) {
  const [addItem, setAddItem] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const setLine = (id, patch) => setDraft({ ...draft, charges: draft.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  const addFromList = (itemId) => {
    const item = settings.priceList.find((p) => p.id === itemId);
    if (item) setDraft({ ...draft, charges: [...draft.charges, { id: uid(), itemId: item.id, label: item.label, qty: 1, unitPrice: item.price }] });
    setAddItem('');
  };
  const pay = (amount) => amount > 0 && setDraft({ ...draft, payments: [...draft.payments, { id: uid(), amount, at: Date.now() }] });
  return (
    <>
      <div class="sec">חיובים</div>
      <div class="list">
        {draft.charges.map((c) => (
          <div class="row static" key={c.id} style="flex-wrap:wrap">
            <input aria-label="תיאור" value={c.label} onInput={(e) => setLine(c.id, { label: e.currentTarget.value })} style="flex:1 1 100%;border:0;background:none;font-weight:700;padding:0" />
            <small style="color:var(--mute)">{c.itemId ? 'מהמחירון' : 'חד-פעמי'}</small>
            <input aria-label="כמות" type="number" step="0.5" min="0" value={c.qty} onInput={(e) => setLine(c.id, { qty: Number(e.currentTarget.value) })} style="width:58px" class="num" />
            ×
            <input aria-label="מחיר" type="number" min="0" value={c.unitPrice} onInput={(e) => setLine(c.id, { unitPrice: Number(e.currentTarget.value) })} style="width:72px" class="num" />
            <span class="num" style="margin-inline-start:auto;font-weight:700">{money(c.qty * c.unitPrice)}</span>
            <button class="textbtn" type="button" aria-label="מחק שורה" onClick={() => setDraft({ ...draft, charges: draft.charges.filter((x) => x.id !== c.id) })}>✕</button>
          </div>
        ))}
        <div class="row static">
          <select aria-label="הוסף מהמחירון" value={addItem} onChange={(e) => addFromList(e.currentTarget.value)} style="flex:1;border:0;background:none;color:var(--accent);font-weight:700">
            <option value="">+ מהמחירון</option>
            {settings.priceList.map((p) => <option value={p.id} key={p.id}>{p.label} · {money(p.price)}</option>)}
          </select>
          <button class="textbtn" type="button" onClick={() => setDraft({ ...draft, charges: [...draft.charges, { id: uid(), itemId: null, label: 'חיוב חד-פעמי', qty: 1, unitPrice: 0 }] })}>+ חד-פעמי</button>
        </div>
        <div class="row static"><b class="grow">סה״כ</b><b class="num">{money(total(draft.charges))}</b></div>
      </div>

      <div class="sec">תשלומים · {isPaid(draft) ? <span class="pill p">שולם הכל</span> : <span class="pill u">יתרה {money(balance(draft))}</span>}</div>
      <div class="list">
        {draft.payments.map((p) => (
          <div class="row static" key={p.id}>
            <span class="grow">{money(p.amount)}<small>{fmtDateTime(p.at)}</small></span>
            <button class="textbtn" type="button" aria-label="מחק תשלום" onClick={() => setDraft({ ...draft, payments: draft.payments.filter((x) => x.id !== p.id) })}>✕</button>
          </div>
        ))}
        <div class="row static">
          <input aria-label="סכום ששולם" type="number" min="0" placeholder="סכום" value={payAmount} onInput={(e) => setPayAmount(e.currentTarget.value)} style="width:110px" class="num" />
          <button class="btn small soft" type="button" onClick={() => { pay(Number(payAmount)); setPayAmount(''); }}>רשום תשלום</button>
          {!isPaid(draft) && <button class="btn small" type="button" onClick={() => pay(balance(draft))}>שולם הכל</button>}
        </div>
      </div>
      <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">שולם {money(paidSum(draft.payments))} מתוך {money(total(draft.charges))}. אדום עד ששולם הכל.</div>
    </>
  );
}

export function Stay({ state, params }) {
  const ui = useUI();
  const orig = byId(state.stays, params.id);
  const [draft, setDraft] = useState(() => (orig ? structuredClone(orig) : null));
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!draft) return (<><Top title="שהייה" back /><main class="main"><div class="empty">השהייה לא נמצאה.</div></main></>);

  const set = (patch) => setDraft({ ...draft, ...patch });
  const ranked = draft.end > draft.start ? rankKennels(draft.start, draft.end, draft.dogIds.length, { ...state, stays: state.stays.filter((s) => s.id !== draft.id) }) : [];
  const status = Object.fromEntries(ranked.map((r) => [r.kennel.id, r.status]));
  const otherDogs = state.dogs.filter((d) => !draft.dogIds.includes(d.id));

  const save = (after) => {
    if (draft.end <= draft.start) return ui.toast('היציאה לפני ההגעה');
    ui.saveStay(draft, { onSaved: () => { ui.toast('נשמר'); after ? after() : ui.back(); } });
  };

  return (
    <>
      <Top title={draft.dogIds.map((id) => byId(state.dogs, id)?.name).join(' ו') || 'שהייה'} sub={draft.cancelled ? 'בוטלה' : ownersLabel(state, byId(state.dogs, draft.dogIds[0]) || { contacts: [] })} back right={<button class="textbtn" type="button" onClick={() => save()}>שמור</button>} />
      <main class="main">
        <div class="sec">כלבים</div>
        <div class="list">
          {draft.dogIds.map((id) => (
            <div class="row static" key={id}>
              <button type="button" class="grow" style="border:0;background:none;text-align:right;cursor:pointer;padding:0;font-weight:700" onClick={() => ui.go('dog', { id })}>
                {byId(state.dogs, id)?.name}{byId(state.dogs, id)?.flag ? ' ⚠' : ''}
              </button>
              {draft.dogIds.length > 1 && <button class="textbtn" type="button" onClick={() => set({ dogIds: draft.dogIds.filter((x) => x !== id) })}>הסר</button>}
            </div>
          ))}
          <div class="row static">
            <select aria-label="הוסף כלב" value="" onChange={(e) => e.currentTarget.value && set({ dogIds: [...draft.dogIds, e.currentTarget.value] })} style="flex:1;border:0;background:none;color:var(--accent);font-weight:700">
              <option value="">+ כלב נוסף לשהייה</option>
              {otherDogs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div class="two">
          <Field label="הגעה"><input id="st-sd" type="date" value={dateKey(draft.start)} onInput={(e) => e.currentTarget.value && set({ start: toMs(e.currentTarget.value, fmtTime(draft.start)) })} /></Field>
          <Field label="שעה"><input id="st-st" type="time" value={fmtTime(draft.start)} onInput={(e) => e.currentTarget.value && set({ start: toMs(dateKey(draft.start), e.currentTarget.value) })} /></Field>
          <Field label="יציאה"><input id="st-ed" type="date" value={dateKey(draft.end)} onInput={(e) => e.currentTarget.value && set({ end: toMs(e.currentTarget.value, fmtTime(draft.end)) })} /></Field>
          <Field label="שעה"><input id="st-et" type="time" value={fmtTime(draft.end)} onInput={(e) => e.currentTarget.value && set({ end: toMs(dateKey(draft.end), e.currentTarget.value) })} /></Field>
        </div>
        <Field label="תא">
          <select id="st-kennel" value={draft.kennelId} onChange={(e) => set({ kennelId: e.currentTarget.value })}>
            {state.kennels.map((k) => (
              <option key={k.id} value={k.id}>{k.name} · {status[k.id] === 'free' ? 'פנוי' : status[k.id] === 'partial' ? 'חפיפה' : status[k.id] === 'full' ? 'תפוס' : ''}</option>
            ))}
          </select>
        </Field>
        <button class="btn ghost small" type="button" onClick={() => set({ charges: autoCharges(draft.start, draft.end, draft.dogIds.length, state.settings) })}>חשב מחדש לפי המחירון</button>

        <Money draft={draft} setDraft={setDraft} settings={state.settings} />

        <div class="two">
          <label class="check"><span>הגיע{draft.arrivedAt ? ` ${fmtTime(draft.arrivedAt)}` : ''}</span><input id="st-arr" type="checkbox" checked={!!draft.arrivedAt} onChange={(e) => set({ arrivedAt: e.currentTarget.checked ? Date.now() : null })} /></label>
          <label class="check"><span>יצא{draft.departedAt ? ` ${fmtTime(draft.departedAt)}` : ''}</span><input id="st-dep" type="checkbox" checked={!!draft.departedAt} onChange={(e) => set({ departedAt: e.currentTarget.checked ? Date.now() : null })} /></label>
        </div>
        <Field label="הערה לשהייה"><textarea id="st-notes" value={draft.notes} onInput={(e) => set({ notes: e.currentTarget.value })} /></Field>

        {draft.approvals?.length > 0 && <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">אושרו {draft.approvals.length} חריגות ({draft.approvals.some((a) => a.by === 'admin') ? 'כולל אישור מנהל' : 'אישור רגיל'}).</div>}

        <button class="btn soft" type="button" onClick={() => save(() => ui.invite(draft.id))}>שמור ושלח זימון</button>
        {confirmCancel ? (
          <div class="btnrow">
            <button class="btn red" type="button" onClick={() => { update((s) => { byId(s.stays, draft.id).cancelled = !draft.cancelled; }); ui.toast(draft.cancelled ? 'השהייה שוחזרה' : 'השהייה בוטלה'); ui.back(); }}>כן, {draft.cancelled ? 'שחזר' : 'בטל שהייה'}</button>
            <button class="btn ghost" type="button" onClick={() => setConfirmCancel(false)}>לא</button>
          </div>
        ) : (
          <button class="btn red" type="button" onClick={() => setConfirmCancel(true)}>{draft.cancelled ? 'שחזר שהייה' : 'בטל שהייה'}</button>
        )}
      </main>
    </>
  );
}
