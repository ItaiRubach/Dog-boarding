import { useState } from 'preact/hooks';
import { Top, Seg, Sheet, useUI } from './common.jsx';
import { FloorPlan } from './FloorPlan.jsx';
import { update } from '../store.js';
import { addDays, dayStart, fmtDayLong, fmtTime, toMs, dateKey, uid, money } from '../logic/util.js';
import { presentAt, freeUntil, isActive, effEnd, sameFamily } from '../logic/occupancy.js';
import { isPaid, balance } from '../logic/pricing.js';
import { byId, dogNames, kennelName, stayPrimary } from '../model.js';
import { telLink, waLink } from '../logic/messages.js';
import { lessonAddress } from './Training.jsx';

export function Home({ state }) {
  const ui = useUI();
  const [day, setDay] = useState(dayStart(Date.now()));
  const isToday = day === dayStart(Date.now());
  const [slot, setSlot] = useState('now');
  const [sheet, setSheet] = useState(null); // {stayId, dogId}
  const [showDone, setShowDone] = useState(false);
  const { times } = state.settings;
  const slotTime = { morning: times.morning, noon: times.noon, evening: times.evening };
  const curSlot = !isToday && slot === 'now' ? 'morning' : slot;
  const t = curSlot === 'now' ? Date.now() : toMs(dateKey(day), slotTime[curSlot]);

  const dayEnd = addDays(day, 1);
  const stays = state.stays.filter(isActive);
  const dogsById = Object.fromEntries(state.dogs.map((d) => [d.id, d]));
  const here = stays.filter((s) => s.start <= t && t < effEnd(s));
  const dogCount = here.reduce((n, s) => n + s.dogIds.length, 0);

  const events = [];
  for (const s of stays) {
    if (s.start >= day && s.start < dayEnd) events.push({ at: s.start, kind: 'in', stay: s, done: !!s.arrivedAt });
    if (s.end >= day && s.end < dayEnd) events.push({ at: s.end, kind: 'out', stay: s, done: !!s.departedAt });
  }
  for (const tr of state.trainings) if (tr.start >= day && tr.start < dayEnd) events.push({ at: tr.start, kind: 'tr', tr, done: tr.start + 3600000 < Date.now() });
  events.sort((a, b) => a.at - b.at);
  const doneCount = isToday ? events.filter((e) => e.done).length : 0;
  const shown = isToday && !showDone ? events.filter((e) => !e.done) : events;

  const mark = (stayId, field) =>
    update((s) => {
      const x = byId(s.stays, stayId);
      x[field] = x[field] ? null : Date.now();
    });
  const payAll = (stayId) =>
    update((s) => {
      const x = byId(s.stays, stayId);
      const b = balance(x);
      if (b > 0) x.payments.push({ id: uid(), amount: b, at: Date.now() });
      else x.payments = [];
    });

  const renderKennel = (k) => {
    const inn = presentAt(k.id, t, stays);
    const coming = stays.filter((s) => s.kennelId === k.id && s.start > t && s.start < dayEnd);
    const families = inn.length > 1 && inn.some((a) => inn.some((b) => !sameFamily(a, b, dogsById)));
    const n = inn.reduce((a, s) => a + s.dogIds.length, 0);
    const until = !inn.length ? freeUntil(k.id, t, stays) : null;
    return (
      <div class={'pcell kennel' + (families ? ' over' : '') + (!inn.length && !coming.length ? ' empty-k' : '')}>
        <div class="kh">
          <span>{k.name}</span>
          <span class="num">{n}/{k.capacity}</span>
        </div>
        {inn.flatMap((s) =>
          s.dogIds.map((id) => (
            <button type="button" key={s.id + id} class={'tok ' + (isPaid(s) ? 'p' : 'u')} onClick={() => setSheet({ stayId: s.id, dogId: id })}>
              {dogsById[id]?.name}
              {dogsById[id]?.flag ? ' ⚠' : ''}
              {s.end < dayEnd && <span class="tm">↑{fmtTime(s.end)}</span>}
            </button>
          )),
        )}
        {coming.flatMap((s) =>
          s.dogIds.map((id) => (
            <button type="button" key={'c' + s.id + id} class={'tok ghost ' + (isPaid(s) ? 'p' : 'u')} onClick={() => setSheet({ stayId: s.id, dogId: id })}>
              {dogsById[id]?.name}
              <span class="tm">↓{fmtTime(s.start)}</span>
            </button>
          )),
        )}
        {families && <span class="kn w">חפיפה</span>}
        {!inn.length && <span class="kn f">{until ? (until < dayEnd ? `פנוי עד ${fmtTime(until)}` : 'פנוי היום') : 'פנוי'}</span>}
      </div>
    );
  };

  const sStay = sheet && byId(state.stays, sheet.stayId);
  const sDog = sheet && byId(state.dogs, sheet.dogId);
  const sContact = sStay && stayPrimary(state, sStay);

  return (
    <>
      <Top
        logo
        title={isToday ? 'היום' : fmtDayLong(day)}
        sub={`${isToday ? fmtDayLong(day) + ' · ' : ''}${dogCount} כלבים בפנסיון`}
        right={
          <>
            <button class="iconbtn" type="button" aria-label="יום קודם" onClick={() => setDay(addDays(day, -1))}><span dir="ltr">›</span></button>
            {!isToday && <button class="iconbtn" type="button" aria-label="היום" onClick={() => setDay(dayStart(Date.now()))}>◉</button>}
            <button class="iconbtn" type="button" aria-label="יום הבא" onClick={() => setDay(addDays(day, 1))}><span dir="ltr">‹</span></button>
            <button class="iconbtn" type="button" aria-label="הגדרות" onClick={() => ui.go('settings')}>⚙</button>
          </>
        }
      />
      <main class="main">
        <div class="sec">{isToday ? 'הבא בתור' : 'תנועות ביום הזה'}</div>
        {events.length === 0 ? (
          <div class="empty">אין הגעות, יציאות או שיעורים ביום הזה.</div>
        ) : (
          <div class="list">
            {shown.map((e) => {
              if (e.kind === 'tr') {
                return (
                  <div class={'nx' + (e.done ? ' done' : '')} key={'t' + e.tr.id}>
                    <span class="tm">{fmtTime(e.at)}</span>
                    <button type="button" class="tx" style="border:0;background:none;text-align:right;cursor:pointer;padding:0" onClick={() => ui.go('training', { id: e.tr.id })}>
                      אילוף · {byId(state.dogs, e.tr.dogId)?.name}
                      <small>{lessonAddress(state, e.tr) || 'בלי כתובת'}</small>
                    </button>
                    <span class="pill g">אילוף</span>
                  </div>
                );
              }
              const s = e.stay;
              const late = !e.done && e.at < Date.now();
              const paid = isPaid(s);
              return (
                <div class={'nx' + (e.done ? ' done' : '')} key={e.kind + s.id}>
                  <span class={'tm' + (late ? ' late' : '')}>{fmtTime(e.at)}</span>
                  <button type="button" class="tx" style="border:0;background:none;text-align:right;cursor:pointer;padding:0" onClick={() => ui.go('stay', { id: s.id })}>
                    {dogNames(state, s.dogIds)} {e.kind === 'in' ? 'נכנס' : 'יוצא'} · {kennelName(state, s.kennelId)}
                    <small>
                      {late ? (e.kind === 'in' ? 'עוד לא הגיע · ' : 'עוד לא יצא · ') : ''}
                      {e.done ? `${e.kind === 'in' ? 'הגיע' : 'יצא'} בפועל ${fmtTime(e.kind === 'in' ? s.arrivedAt : s.departedAt)} · ` : ''}
                      {paid ? 'שולם' : `לגבות ${money(balance(s))}`}
                    </small>
                  </button>
                  {e.kind === 'out' && !paid && (
                    <button class="btn small red" type="button" onClick={() => payAll(s.id)}>שולם</button>
                  )}
                  <button class={'btn small' + (e.done ? ' ghost' : '')} type="button" onClick={() => mark(s.id, e.kind === 'in' ? 'arrivedAt' : 'departedAt')}>
                    {e.done ? 'בטל' : e.kind === 'in' ? 'הגיע ✓' : 'יצא ✓'}
                  </button>
                </div>
              );
            })}
            {doneCount > 0 && (
              <button type="button" class="row" style="justify-content:center;color:var(--mute);font-size:13px" onClick={() => setShowDone(!showDone)}>
                {showDone ? 'הסתר מה שבוצע' : `הצג ${doneCount} שכבר בוצעו`}
              </button>
            )}
            {!shown.length && !doneCount && <div class="row static">אין עוד תנועות היום.</div>}
          </div>
        )}

        <Seg
          value={curSlot}
          onChange={setSlot}
          options={[
            ...(isToday ? [['now', 'עכשיו']] : []),
            ['morning', `בוקר ${times.morning}`],
            ['noon', `צהריים ${times.noon}`],
            ['evening', `ערב ${times.evening}`],
          ]}
        />
        <FloorPlan state={state} renderKennel={renderKennel} />
      </main>
      <div class="dock">
        <button class="btn big" type="button" onClick={() => ui.go('avail', { date: dateKey(day) })}>
          יש מקום?<small>בדיקה וקביעה</small>
        </button>
        <button class="btn big ghost" type="button" onClick={() => ui.go('training', { date: dateKey(day) })}>
          + אילוף<small>שיעור</small>
        </button>
      </div>

      {sStay && sDog && (
        <Sheet onClose={() => setSheet(null)} label={'פעולות ל' + sDog.name}>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2>{sDog.name}</h2>
            <span class={'pill ' + (isPaid(sStay) ? 'p' : 'u')}>{isPaid(sStay) ? 'שולם' : `חוב ${money(balance(sStay))}`}</span>
          </div>
          <div class="sub" style="color:var(--mute)">
            {kennelName(state, sStay.kennelId)} · {sContact?.name || 'בלי בעלים'} · עד {fmtDayLong(sStay.end)} {fmtTime(sStay.end)}
          </div>
          {sDog.flag && <div class="flag">⚠ {sDog.flag}</div>}
          <div class="acts">
            <a class="btn ghost" href={sContact?.phone ? telLink(sContact.phone) : undefined}><i>📞</i>התקשר</a>
            <a class="btn ghost" href={sContact?.phone ? waLink(sContact.phone) : undefined} target="_blank" rel="noopener"><i>💬</i>וואטסאפ</a>
            <button class={'btn' + (isPaid(sStay) ? ' ghost' : '')} type="button" onClick={() => payAll(sStay.id)}>
              <i>{isPaid(sStay) ? '↺' : '✓'}</i>{isPaid(sStay) ? 'בטל תשלום' : 'שולם הכל'}
            </button>
            <button class="btn ghost" type="button" onClick={() => { setSheet(null); ui.go('dog', { id: sDog.id, tab: 'journal' }); }}><i>✎</i>הערה</button>
            {sStay.start > Date.now() || !sStay.arrivedAt ? (
              <button class="btn ghost" type="button" onClick={() => mark(sStay.id, 'arrivedAt')}><i>↓</i>{sStay.arrivedAt ? 'בטל הגעה' : 'הגיע'}</button>
            ) : (
              <button class="btn ghost" type="button" onClick={() => mark(sStay.id, 'departedAt')}><i>↑</i>{sStay.departedAt ? 'בטל יציאה' : 'יצא'}</button>
            )}
            <button class="btn ghost" type="button" onClick={() => { setSheet(null); ui.go('stay', { id: sStay.id }); }}><i>☰</i>שהייה</button>
          </div>
          <button class="btn soft" type="button" onClick={() => { setSheet(null); ui.go('dog', { id: sDog.id }); }}>תיק הכלב</button>
        </Sheet>
      )}
    </>
  );
}
