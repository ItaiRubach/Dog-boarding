// One state object, kept in IndexedDB on the phone. Every change goes through update().
import { get, set } from 'idb-keyval';
import { useEffect, useState } from 'preact/hooks';
import { defaultState, migrate } from './model.js';

const KEY = 'pension-state';
let state = defaultState();
const subs = new Set();
let saveTimer;

function emit() {
  subs.forEach((f) => f(state));
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      set(KEY, state).catch((e) => console.error('save failed', e));
    } catch (e) {
      console.error('save failed', e);
    }
  }, 150);
}

export async function loadState() {
  try {
    const saved = await get(KEY);
    if (saved) state = migrate(saved);
  } catch (e) {
    console.warn('no storage, starting empty', e);
  }
  try {
    await navigator.storage?.persist?.();
  } catch {}
  emit();
  return state;
}

export const getState = () => state;

/** fn receives a copy and may mutate it. */
export function update(fn) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  emit();
  persist();
}

export function replaceState(next) {
  state = migrate(next);
  emit();
  persist();
}

export function useStore() {
  const [s, setS] = useState(state);
  useEffect(() => {
    subs.add(setS);
    setS(state);
    return () => subs.delete(setS);
  }, []);
  return s;
}
