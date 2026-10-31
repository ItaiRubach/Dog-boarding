// Push on the phone: register the service worker, ask permission, hand the subscription to the server.
import { getCloud, getSync } from './sync.js';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
/** iPhone only allows push for an app opened from the home screen. */
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);

export function registerWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('service worker', e));
}

const keyBytes = (b64) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Must be called from a tap. Returns 'on' | 'denied' | throws. */
export async function enablePush() {
  const { pensionId } = getSync();
  if (!pensionId) throw new Error('צריך קודם להתחבר לפנסיון בענן');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('./sw.js'));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  await getCloud().savePush(pensionId, sub);
  return 'on';
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await getCloud().deletePush(sub.endpoint);
  } finally {
    await sub.unsubscribe();
  }
}

export const sendTest = () => getCloud().testPush();
