export const DAY = 86400000;

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);

const DAY_LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const pad = (n) => String(n).padStart(2, '0');

export function dayStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function addDays(ms, n) {
  const d = new Date(ms);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function weekStart(ms) {
  const d = new Date(dayStart(ms));
  d.setDate(d.getDate() - d.getDay());
  return d.getTime();
}

/** 'YYYY-MM-DD' for <input type=date> */
export function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'HH:MM' */
export function fmtTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 'ה׳ 5.11' */
export function fmtDay(ms) {
  const d = new Date(ms);
  return `${DAY_LETTERS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

/** 'חמישי, 5.11' */
export function fmtDayLong(ms) {
  const d = new Date(ms);
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}.${d.getMonth() + 1}`;
}

export const fmtDateTime = (ms) => `${fmtDay(ms)} ${fmtTime(ms)}`;

export const dayLetter = (ms) => DAY_LETTERS[new Date(ms).getDay()];

/** date 'YYYY-MM-DD' + time 'HH:MM' → local ms */
export function toMs(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}

export const minutesOfDay = (ms) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
};

export const money = (n) => '₪' + Math.round(n).toLocaleString('he-IL');
