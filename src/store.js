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

function saveNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    set(KEY, state).catch((e) => console.error('save failed', e));
  } catch (e) {
    console.error('save failed', e);
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 150);
}

// iPhone may close the app right after a tap: save pending changes when it goes to the background
if (typeof document !== 'undefined') {
  const flush = () => saveTimer && saveNow();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  addEventListener('pagehide', flush);
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

// Changes Yuval makes on this phone (not ones that arrive from the cloud) – the sync listens here.
const localSubs = new Set();
export const onLocalChange = (fn) => (localSubs.add(fn), () => localSubs.delete(fn));
const localChanged = () => localSubs.forEach((f) => f());

/** fn receives a copy and may mutate it. */
export function update(fn) {
  const next = structuredClone(state);
  fn(next);
  state = next;
  emit();
  persist();
  localChanged();
}

export function replaceState(next) {
  state = migrate(next);
  emit();
  persist();
  localChanged();
}

/** A newer copy from the cloud: show and keep it, without sending it back. */
export function applyRemote(next) {
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
