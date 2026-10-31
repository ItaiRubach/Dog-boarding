import { DAY, dayStart, minutesOfDay, uid } from './util.js';

export const nightsBetween = (start, end) => Math.max(0, Math.round((dayStart(end) - dayStart(start)) / DAY));

/** Billing units for a stay by the method Yuval chose in settings. */
export function stayUnits(start, end, pricing) {
  const n = nightsBetween(start, end);
  if (n === 0) return 0;
  if (pricing.method === 'days') return n + 1;
  if (pricing.method === 'nightsLate') return n + (minutesOfDay(end) >= pricing.lateHour * 60 ? pricing.lateFraction : 0);
  return n;
}

export const chargeLine = (item, qty) => ({ id: uid(), itemId: item.id, label: item.label, qty, unitPrice: item.price });

/** Suggested charge lines for a new stay, from the price list. */
export function autoCharges(start, end, dogCount, settings) {
  const find = (kind) => settings.priceList.find((p) => p.kind === kind);
  const units = stayUnits(start, end, settings.pricing);
  if (units === 0) {
    const day = find('dayNoLodging');
    return day ? [chargeLine(day, dogCount)] : [];
  }
  const lines = [];
  const night = find('night');
  if (night) lines.push(chargeLine(night, units));
  if (dogCount > 1) {
    const second = find('secondDog') || night;
    if (second) lines.push(chargeLine(second, units * (dogCount - 1)));
  }
  return lines;
}

export const total = (charges = []) => charges.reduce((s, c) => s + (Number(c.qty) || 0) * (Number(c.unitPrice) || 0), 0);
export const paidSum = (payments = []) => payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
export const balance = (x) => total(x.charges) - paidSum(x.payments);
/** Blue only when everything is paid. */
export const isPaid = (x) => balance(x) <= 0;
