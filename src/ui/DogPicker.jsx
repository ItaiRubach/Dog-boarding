import { useMemo, useState } from 'preact/hooks';
import { Field } from './common.jsx';
import { searchDogs } from './Avail.jsx';
import { update } from '../store.js';
import { uid } from '../logic/util.js';
import { byId, ownersLabel } from '../model.js';

/** Pick one dog: search, 2 most recent, or open a new file (dog + owner) on the spot. */
export function DogPicker({ state, onPick, withAddress }) {
  const [q, setQ] = useState('');
  const [nd, setNd] = useState(null);
  const recent = useMemo(() => {
    const seen = [];
    const dated = [...state.stays.map((s) => ({ at: s.start, ids: s.dogIds })), ...state.trainings.map((t) => ({ at: t.start, ids: [t.dogId] }))].sort((a, b) => b.at - a.at);
    for (const x of dated) for (const id of x.ids) if (id && !seen.includes(id)) seen.push(id);
    return seen.slice(0, 2).map((id) => byId(state.dogs, id)).filter(Boolean);
  }, [state]);
  const results = searchDogs(state, q);

  const row = (d) => {
    const c = byId(state.contacts, d.contacts[0]?.contactId);
    return (
      <button type="button" class="row" key={d.id} onClick={() => onPick(d.id)}>
        <span class="grow">
          <b>{d.name}{d.flag ? ' ⚠' : ''}</b>
          <small>{[ownersLabel(state, d), c?.phone].filter(Boolean).join(' · ') || 'בלי בעלים'}</small>
          {withAddress && <small>{c?.address || 'אין כתובת בתיק'}</small>}
        </span>
        <span class="chev" dir="ltr">‹</span>
      </button>
    );
  };

  const create = () => {
    const cid = uid();
    const did = uid();
    update((s) => {
      s.contacts.push({ id: cid, name: nd.owner.trim(), phone: nd.phone.trim(), address: nd.address.trim() });
      s.dogs.push({ id: did, name: nd.name.trim(), breed: '', sex: '', birthYear: '', weight: '', health: '', food: '', behavior: '', vaccines: '', flag: '', aloneOnly: false, blocked: false, contacts: [{ contactId: cid, role: 'owner', primary: true }] });
    });
    onPick(did);
  };

  if (nd) {
    return (
      <div class="card" style="padding:10px;display:grid;gap:8px">
        <div class="sec">תיק חדש · את השאר משלימים אחר כך בתיק הכלב</div>
        <Field label="שם הכלב"><input id="dp-name" value={nd.name} onInput={(e) => setNd({ ...nd, name: e.currentTarget.value })} /></Field>
        <Field label="שם הבעלים"><input id="dp-owner" value={nd.owner} onInput={(e) => setNd({ ...nd, owner: e.currentTarget.value })} /></Field>
        <Field label="טלפון"><input id="dp-phone" type="tel" value={nd.phone} onInput={(e) => setNd({ ...nd, phone: e.currentTarget.value })} /></Field>
        {withAddress && <Field label="כתובת"><input id="dp-address" value={nd.address} onInput={(e) => setNd({ ...nd, address: e.currentTarget.value })} /></Field>}
        <div class="btnrow">
          <button class="btn" type="button" disabled={!nd.name.trim()} onClick={create}>פתח תיק ובחר</button>
          <button class="btn ghost" type="button" onClick={() => setNd(null)}>ביטול</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div class="searchbox">
        <span aria-hidden="true">⌕</span>
        <input id="dp-search" type="search" autoFocus enterKeyHint="search" placeholder="שם כלב, בעלים או טלפון" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        {q && <button type="button" class="textbtn" aria-label="נקה" onClick={() => setQ('')}>✕</button>}
      </div>
      {q ? (
        <>
          <div class="sec">{results.length ? `נמצאו ${results.length}` : 'לא נמצא'}</div>
          {results.length > 0 && <div class="list">{results.slice(0, 20).map(row)}</div>}
        </>
      ) : (
        recent.length > 0 && (<><div class="sec">אחרונים</div><div class="list">{recent.map(row)}</div></>)
      )}
      <button class="btn ghost" type="button" onClick={() => setNd({ name: /\d/.test(q) ? '' : q, owner: '', phone: /\d/.test(q) ? q : '', address: '' })}>
        + {q && !/\d/.test(q) ? `פתח תיק ל״${q}״` : 'כלב חדש'}
      </button>
    </>
  );
}
