import { useState } from 'preact/hooks';
import { addDays, dateKey, dayStart, toMs } from '../logic/util.js';
import { isActive, effStart, effEnd } from '../logic/occupancy.js';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/** Kennels with no dog at any moment of that day. */
export function emptyKennelsOn(day, state) {
  const end = addDays(day, 1);
  const busy = new Set(state.stays.filter((s) => isActive(s) && effStart(s) < end && effEnd(s) > day).map((s) => s.kennelId));
  return state.kennels.filter((k) => !busy.has(k.id)).length;
}

/**
 * Hotel-style range picker: first tap = arrival, second tap = pickup.
 * Each day shows how many kennels are completely empty that day.
 */
export function RangeCalendar({ state, from, to, onChange }) {
  const today = dayStart(Date.now());
  const [month, setMonth] = useState(() => {
    const d = new Date(from ? toMs(from, '00:00') : today);
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const m = new Date(month);
  const first = new Date(m.getFullYear(), m.getMonth(), 1);
  const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const shift = (n) => setMonth(new Date(m.getFullYear(), m.getMonth() + n, 1).getTime());

  const tap = (key) => {
    if (!from || to) return onChange(key, null);
    if (key > from) return onChange(from, key);
    if (key === from) return onChange(from, key); // same-day visit
    onChange(key, null);
  };

  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(<span key={'b' + i} />);
  for (let d = 1; d <= daysInMonth; d++) {
    const ms = new Date(m.getFullYear(), m.getMonth(), d).getTime();
    const key = dateKey(ms);
    const past = ms < today;
    const inRange = from && to && key > from && key < to;
    const isEdge = key === from || key === to;
    const free = past ? null : emptyKennelsOn(ms, state);
    cells.push(
      <button type="button" key={key} disabled={past} onClick={() => tap(key)}
        class={'cal-d' + (isEdge ? ' edge' : '') + (inRange ? ' mid' : '') + (ms === today ? ' today' : '')}
        aria-pressed={String(isEdge)} aria-label={`${d} ב${MONTHS[m.getMonth()]}${free != null ? `, ${free} תאים ריקים` : ''}`}>
        <b>{d}</b>
        {free != null && <small class={free === 0 ? 'none' : ''}>{free === 0 ? 'מלא' : free}</small>}
      </button>,
    );
  }

  return (
    <div class="cal">
      <div class="cal-h">
        <button type="button" class="iconbtn" aria-label="חודש קודם" onClick={() => shift(-1)} disabled={month <= new Date(new Date(today).getFullYear(), new Date(today).getMonth(), 1).getTime()}><span dir="ltr">›</span></button>
        <b>{MONTHS[m.getMonth()]} {m.getFullYear()}</b>
        <button type="button" class="iconbtn" aria-label="חודש הבא" onClick={() => shift(1)}><span dir="ltr">‹</span></button>
      </div>
      <div class="cal-g">
        {DAYS.map((d) => <span class="cal-w" key={d}>{d}</span>)}
        {cells}
      </div>
      <div class="cal-f">{!from ? 'לחץ על יום ההגעה' : !to ? 'עכשיו לחץ על יום האיסוף' : 'המספר בכל יום = תאים ריקים לגמרי'}</div>
    </div>
  );
}
