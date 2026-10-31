import { useState } from 'preact/hooks';
import { Top, useUI } from './common.jsx';
import { addDays, weekStart, dayStart, dayLetter, DAY } from '../logic/util.js';
import { isActive, effEnd } from '../logic/occupancy.js';
import { isPaid } from '../logic/pricing.js';
import { byId } from '../model.js';

/** Greedy lanes so overlapping stays in one kennel sit on separate lines. */
function lanes(items) {
  const ends = [];
  return items
    .sort((a, b) => a.start - b.start)
    .map((it) => {
      let lane = ends.findIndex((e) => e <= it.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = it.end;
      return { ...it, lane };
    });
}

export function Board({ state }) {
  const ui = useUI();
  const [from, setFrom] = useState(weekStart(Date.now()));
  const to = addDays(from, 7);
  const span = to - from;
  const pct = (ms) => ((Math.min(Math.max(ms, from), to) - from) / span) * 100;
  const now = Date.now();
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const name = (s) => s.dogIds.map((id) => byId(state.dogs, id)?.name).join(' ו');

  const bar = (key, cls, start, end, label, onClick, lane) => (
    <button type="button" key={key} class={'bbar ' + cls} onClick={onClick}
      style={`right:${pct(start)}%;width:${Math.max(pct(end) - pct(start), 1.5)}%;top:${2 + lane * 21}px`}>
      {label}
    </button>
  );

  const rows = state.kennels.map((k) => {
    const items = lanes(state.stays.filter((s) => isActive(s) && s.kennelId === k.id && s.start < to && effEnd(s) > from).map((s) => ({ s, start: s.start, end: effEnd(s) })));
    const n = Math.max(1, ...items.map((i) => i.lane + 1));
    return (
      <div class="brow" key={k.id}>
        <span class="bl">{k.name}</span>
        <div class="btrack" style={`height:${n * 21 + 4}px`}>
          {items.map((i) => bar(i.s.id, isPaid(i.s) ? 'p' : 'u', i.start, i.end, name(i.s), () => ui.go('stay', { id: i.s.id }), i.lane))}
          {now >= from && now < to && <span class="nowl" style={`right:${pct(now)}%`} />}
        </div>
      </div>
    );
  });

  const trs = lanes(state.trainings.filter((t) => t.start < to && t.end > from).map((t) => ({ t, start: t.start, end: Math.max(t.end, t.start + DAY / 12) })));
  const trLanes = Math.max(1, ...trs.map((i) => i.lane + 1));

  return (
    <>
      <Top title="לוח" sub={`${new Date(from).getDate()}.${new Date(from).getMonth() + 1} – ${new Date(addDays(to, -1)).getDate()}.${new Date(addDays(to, -1)).getMonth() + 1}`}
        right={<>
          <button class="iconbtn" type="button" aria-label="שבוע קודם" onClick={() => setFrom(addDays(from, -7))}>›</button>
          <button class="iconbtn" type="button" aria-label="השבוע" onClick={() => setFrom(weekStart(Date.now()))}>◉</button>
          <button class="iconbtn" type="button" aria-label="שבוע הבא" onClick={() => setFrom(addDays(from, 7))}>‹</button>
        </>} />
      <main class="main">
        <div class="board">
          <div class="bdays">
            <span />
            {days.map((d) => (
              <span key={d} class={d === dayStart(now) ? 'today' : ''}>{dayLetter(d)} {new Date(d).getDate()}</span>
            ))}
          </div>
          {rows}
          <div class="brow">
            <span class="bl">אילוף</span>
            <div class="btrack" style={`height:${trLanes * 21 + 4}px`}>
              {trs.map((i) => bar(i.t.id, 'tr', i.start, i.end, byId(state.dogs, i.t.dogId)?.name || 'אילוף', () => ui.go('training', { id: i.t.id }), i.lane))}
            </div>
          </div>
        </div>
        <div class="sub" style="color:var(--mute);font-size:13px;padding:0 4px">כחול שולם · אדום לא שולם · ירוק אילוף. פס כפול בתא = שני כלבים באותו זמן. לחיצה על פס פותחת אותו.</div>
      </main>
    </>
  );
}
