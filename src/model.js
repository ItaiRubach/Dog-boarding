import { uid, dayStart, addDays } from './logic/util.js';
import { autoCharges, chargeLine } from './logic/pricing.js';

export const SCHEMA = 1;

export const ROLE_LABELS = { owner: 'בעלים', extra: 'איש קשר נוסף', vet: 'וטרינר' };

export function defaultSettings() {
  return {
    times: { morning: '08:00', noon: '12:00', evening: '18:00' },
    cleaningGapMin: 0,
    pricing: { method: 'nights', lateHour: 14, lateFraction: 0.5 },
    priceList: [
      { id: 'night', kind: 'night', group: 'פנסיון', label: 'לינה ללילה', price: 130 },
      { id: 'second', kind: 'secondDog', group: 'פנסיון', label: 'כלב שני מאותו בית · ללילה', price: 90 },
      { id: 'day', kind: 'dayNoLodging', group: 'פנסיון', label: 'יום בלי לינה', price: 80 },
      { id: 'lesson', kind: 'lesson', group: 'אילוף', label: 'שיעור אילוף', price: 250 },
      { id: 'bath', group: 'תוספות', label: 'אמבטיה', price: 50 },
    ],
    adminPin: '1234',
    homeAddress: '',
    messageTemplate: 'היי {בעלים}, {כלב} רשום/ה אצלי בפנסיון 🐾\nהגעה: {הגעה}\nאיסוף: {איסוף}\nסה״כ: ₪{סכום}\nלהוספה ליומן: {קישור}\nיובל',
    reminders: [7, 2],
    lessonTemplate: 'היי {בעלים}, נקבע שיעור אילוף ל{כלב} 🐾\nמתי: {מתי}\nאיפה: {כתובת}\nלהוספה ליומן: {קישור}\nיובל',
    lessonReminders: [1440],
  };
}

/** 3 columns × 5 rows: kennels 1–4 | path | kennels 5–8, entrance at the bottom of the path. */
export function defaultPlan(kennels) {
  const cells = {};
  kennels.forEach((k, i) => {
    const col = i < 4 ? 0 : 2;
    cells[`${i % 4},${col}`] = { type: 'kennel', kennelId: k.id };
  });
  for (let r = 0; r < 4; r++) cells[`${r},1`] = { type: 'aisle' };
  cells['4,1'] = { type: 'door' };
  return { rows: 5, cols: 3, cells };
}

export function defaultState() {
  const kennels = Array.from({ length: 8 }, (_, i) => ({ id: uid(), name: `תא ${i + 1}`, capacity: 2, note: '' }));
  return {
    schema: SCHEMA,
    settings: defaultSettings(),
    kennels,
    plan: defaultPlan(kennels),
    dogs: [],
    contacts: [],
    stays: [],
    trainings: [],
    journal: [],
  };
}

export function migrate(s) {
  const base = defaultState();
  const out = {
    ...base,
    ...s,
    settings: { ...base.settings, ...s.settings, pricing: { ...base.settings.pricing, ...s.settings?.pricing } },
  };
  // the first version promised an attached file, which WhatsApp cannot carry
  out.settings.messageTemplate = out.settings.messageTemplate.replace('מצרף קובץ להוספה ליומן.', 'להוספה ליומן: {קישור}');
  return out;
}

// ---- selectors ----
export const byId = (list, id) => list.find((x) => x.id === id);

export function primaryContact(state, dog) {
  if (!dog) return null;
  const link = dog.contacts.find((c) => c.primary) || dog.contacts.find((c) => c.role === 'owner') || dog.contacts[0];
  return link ? byId(state.contacts, link.contactId) : null;
}

export function ownersLabel(state, dog) {
  return dog.contacts
    .filter((c) => c.role === 'owner')
    .map((c) => byId(state.contacts, c.contactId)?.name)
    .filter(Boolean)
    .join(' ו');
}

export const dogNames = (state, ids) => ids.map((id) => byId(state.dogs, id)?.name || '?').join(' ו');

export const stayPrimary = (state, stay) => primaryContact(state, byId(state.dogs, stay.dogIds[0]));

export const kennelName = (state, id) => byId(state.kennels, id)?.name || '—';

// ---- demo data (fictional) ----
export function seedDemo(state) {
  const today = dayStart(Date.now());
  const t = (d, h, m = 0) => addDays(today, d) + (h * 60 + m) * 60000;
  const K = state.kennels.map((k) => k.id);
  const contact = (name, phone, address = '') => {
    const c = { id: uid(), name, phone, address };
    state.contacts.push(c);
    return c.id;
  };
  const dog = (name, breed, owners, extra = {}) => {
    const d = {
      id: uid(), name, breed, sex: '', birthYear: '', weight: '', health: '', food: '', behavior: '', vaccines: '',
      flag: '', aloneOnly: false, blocked: false,
      contacts: owners.map((cid, i) => ({ contactId: cid, role: 'owner', primary: i === 0 })),
      ...extra,
    };
    state.dogs.push(d);
    return d.id;
  };
  const c1 = contact('משפחת דהן', '050-1111111');
  const c2 = contact('משפחת שגיא', '050-2222222');
  const c3 = contact('עדי ברק', '050-3333333');
  const c4 = contact('משפחת אברהם', '050-4444444');
  const c5 = contact('רון לוי', '050-5555555', 'הדקלים 14, רמת השרון');
  const c5b = contact('מאיה לוי', '050-5555556');
  const c6 = contact('נועה גל', '050-6666666');
  const c7 = contact('משפחת פרץ', '050-7777777', 'הגפן 3, הוד השרון');
  const c8 = contact('יואב כץ', '050-8888888');

  const lola = dog('לולה', 'מעורב', [c1]);
  const buddy = dog('באדי', 'גולדן', [c2]);
  const choco = dog('שוקו', 'גולדן', [c2]);
  const nela = dog('נלה', 'פודל', [c3]);
  const mika = dog('מיקה', 'שי טסו', [c4]);
  const tofi = dog('טופי', 'לברדור', [c5, c5b], {
    flag: 'נוהם כשניגשים לקערה. להאכיל לבד בתא.', aloneOnly: true, sex: 'זכר מסורס', weight: '32',
    health: 'רגיש לעוף · כדור לב בבוקר', food: '2 ארוחות · 250 ג׳ · מביא שק', behavior: 'טוב עם נקבות · מושך ברצועה', vaccines: 'כלבת עד 03/2027',
  });
  const zigi = dog('זיגי', 'ביגל', [c6]);
  const pilpel = dog('פלפל', 'מעורב', [c7]);
  const rexy = dog('רקסי', 'רועה גרמני', [c8]);
  const ginger = dog('ג׳ינג׳ר', 'האסקי', [c7]);

  const s = state.settings;
  const add = (kennel, dogIds, start, end, paid, extra = {}) => {
    const charges = autoCharges(start, end, dogIds.length, s);
    const amount = charges.reduce((a, c) => a + c.qty * c.unitPrice, 0);
    state.stays.push({
      id: uid(), kennelId: K[kennel], dogIds, start, end, charges,
      payments: paid ? [{ id: uid(), amount, at: start }] : [],
      notes: '', approvals: [], arrivedAt: start < Date.now() ? start : null, departedAt: null, cancelled: false,
      ...extra,
    });
  };
  add(0, [lola], t(-1, 16), t(4, 18), false);
  add(1, [buddy, choco], t(-2, 8), t(1, 12), true);
  add(2, [nela], t(-2, 12), t(0, 14), false);
  add(2, [mika], t(0, 12), t(2, 18), true, { approvals: [] });
  add(3, [tofi], t(-3, 8), t(3, 18), true);
  add(4, [zigi], t(0, 18), t(3, 8), true);
  add(5, [pilpel], t(-4, 8), t(0, 9), false);
  add(6, [rexy], t(0, 10, 30), t(5, 8), true);
  // overlap in kennel 3 was approved when booked
  const mikaStay = state.stays.find((x) => x.dogIds[0] === mika);
  const nelaStay = state.stays.find((x) => x.dogIds[0] === nela);
  mikaStay.approvals.push({ key: `overlap:${nelaStay.id}`, at: Date.now(), by: 'confirm' });

  const lesson = s.priceList.find((p) => p.kind === 'lesson');
  state.trainings.push({
    id: uid(), dogId: ginger, start: t(0, 16), end: t(0, 17), locationType: 'client', address: 'הגפן 3, הוד השרון',
    charges: lesson ? [chargeLine(lesson, 1)] : [], payments: [], notes: '',
  });
  state.journal.push({ id: uid(), dogId: tofi, at: t(-2, 19), text: 'אכל רק חצי מנה בערב הראשון. ביום השני חזר לאכול רגיל.' });
}
