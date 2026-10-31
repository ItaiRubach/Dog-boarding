// Keeps the phone's copy and the cloud copy of one pension in step.
// The phone always works offline; changes go up when there is a connection.
// If another device saved first, the cloud copy wins and Yuval is told.
import { get, set } from 'idb-keyval';
import { useEffect, useState } from 'preact/hooks';
import { getState, applyRemote, onLocalChange } from './store.js';

const META = 'pension-meta';
const EMPTY = { pensionId: null, version: 0, name: '', joinCode: '', dirty: false };

let cloud = null;
let meta = { ...EMPTY };
let session = null;
let status = 'off'; // off | signedout | nopension | saving | synced | offline | conflict
let changeSeq = 0;
let busy = false;
let timer = null;
let unsub = null;
const subs = new Set();

const snapshot = () => ({ enabled: !!cloud, status, session, email: session?.user?.email || '', ...meta });
const emit = () => subs.forEach((f) => f(snapshot()));
const setStatus = (s) => {
  status = s;
  emit();
};
const saveMeta = () => {
  try {
    set(META, meta).catch(() => {});
  } catch {}
};

export const getSync = snapshot;
export const getCloud = () => cloud;

export function useSync() {
  const [s, setS] = useState(snapshot());
  useEffect(() => {
    subs.add(setS);
    setS(snapshot());
    return () => subs.delete(setS);
  }, []);
  return s;
}

export async function initSync(c) {
  cloud = c;
  if (!cloud) return setStatus('off');
  try {
    meta = { ...EMPTY, ...((await get(META)) || {}) };
  } catch {}
  onLocalChange(() => {
    if (!meta.pensionId) return;
    changeSeq++;
    meta.dirty = true;
    saveMeta();
    schedule();
  });
  cloud.onAuth((s) => {
    session = s;
    emit();
  });
  try {
    session = await cloud.session();
  } catch {
    session = null;
  }
  if (typeof addEventListener === 'function') {
    addEventListener('online', () => meta.pensionId && connect());
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && meta.pensionId && session && connect());
  }
  if (session && meta.pensionId) await connect();
  else setStatus(session ? 'nopension' : 'signedout');
}

function adopt(row, lostLocal) {
  applyRemote(row.data);
  meta = { ...meta, pensionId: row.id, version: row.version, name: row.name, joinCode: row.join_code, dirty: false };
  saveMeta();
  setStatus(lostLocal ? 'conflict' : 'synced');
}

/** Bring this phone up to date, push what is waiting, listen for the other phone. */
export async function connect() {
  if (!cloud || !meta.pensionId) return;
  try {
    const row = await cloud.fetch(meta.pensionId);
    meta = { ...meta, name: row.name, joinCode: row.join_code };
    if (row.version === meta.version) {
      if (meta.dirty) await pushNow();
      else setStatus('synced');
    } else {
      adopt(row, meta.dirty);
    }
    unsub?.();
    unsub = cloud.subscribe(meta.pensionId, onRemote);
  } catch {
    setStatus('offline');
  }
}

async function onRemote() {
  if (busy || meta.dirty) return;
  try {
    const row = await cloud.fetch(meta.pensionId);
    if (row.version > meta.version) adopt(row, false);
  } catch {}
}

function schedule() {
  clearTimeout(timer);
  setStatus('saving');
  timer = setTimeout(pushNow, 800);
}

export async function pushNow() {
  clearTimeout(timer);
  if (!cloud || !meta.pensionId || busy) return;
  busy = true;
  const seq = changeSeq;
  try {
    const v = await cloud.save(meta.pensionId, getState(), meta.version);
    if (v === -1) {
      adopt(await cloud.fetch(meta.pensionId), true);
    } else {
      meta = { ...meta, version: v, dirty: changeSeq !== seq };
      saveMeta();
      setStatus('synced');
    }
  } catch {
    setStatus('offline');
  } finally {
    busy = false;
  }
  if (meta.dirty && status === 'synced') schedule();
}

// ---- account ----
/** After any successful login: a phone that belongs to exactly one pension connects by itself. */
async function afterLogin() {
  session = await cloud.session();
  const list = await cloud.myPensions();
  if (list.length === 1) {
    meta = { ...meta, pensionId: list[0].id, version: -1, dirty: false };
    await connect();
  } else setStatus('nopension');
}

export async function signIn(email, password) {
  await cloud.signIn(email.trim(), password);
  await afterLogin();
}

/** Sign-up logs in right away (no confirmation email), so it continues like a login. */
export async function signUp(email, password) {
  const r = await cloud.signUp(email.trim(), password);
  if (r?.session) await afterLogin();
  return r;
}
export const resetPassword = (email) => cloud.resetPassword(email.trim());

/** Yuval's first login: the data already on the phone becomes the shared pension. */
export async function createFromPhone(name) {
  const row = await cloud.create(name, getState());
  meta = { ...EMPTY, pensionId: row.id, version: row.version, name: row.name, joinCode: row.join_code };
  saveMeta();
  setStatus('synced');
  unsub?.();
  unsub = cloud.subscribe(meta.pensionId, onRemote);
}

/** Itai's phone: join with Yuval's code; the phone switches to the shared data. */
export async function joinWithCode(code) {
  const row = await cloud.join(code);
  meta = { ...EMPTY, pensionId: row.id, version: -1 };
  await connect();
}

export async function signOut() {
  unsub?.();
  unsub = null;
  await cloud.signOut();
  session = null;
  meta = { ...EMPTY };
  saveMeta();
  setStatus('signedout');
}

export const syncLabel = (s) =>
  ({ saving: 'שומר…', synced: 'מגובה בענן', offline: 'אין חיבור · יישמר כשיחזור', conflict: 'עודכן ממכשיר אחר', nopension: 'מחובר · לא משויך לפנסיון', signedout: 'לא מחובר לענן' })[s.status] || '';
