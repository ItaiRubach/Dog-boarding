// Runs every 5 minutes (pg_cron) and sends what is due to every phone that asked for notifications.
// Also answers "send a test notification" from a signed-in user.
// The logic in ../_shared/logic is a copy of src/logic (scripts/sync-shared.mjs).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { dueNotifications } from '../_shared/logic/digest.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails('https://itairubach.github.io/Dog-boarding/', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info' } });

type Sub = { endpoint: string; p256dh: string; auth: string; pension_id: string };

/** Send to each phone; forget phones whose subscription is gone. */
async function send(subs: Sub[], msg: { title: string; body: string; key?: string }) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: msg.title, body: msg.body, tag: msg.key }), { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      else console.error('push failed', code, (e as Error).message);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({});
  const body = await req.json().catch(() => ({}));

  if (body.test) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const { data } = await db.auth.getUser(jwt);
    if (!data.user) return json({ error: 'not signed in' }, 401);
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', data.user.id);
    const sent = await send(subs || [], { title: 'התראת בדיקה 🐾', body: 'ההתראות בטלפון הזה עובדות.' });
    return json({ sent });
  }

  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'forbidden' }, 403);
  const to = Date.now();
  const from = to - 6 * 60000; // 1 minute overlap with the previous run; push_log prevents doubles
  const { data: subs } = await db.from('push_subscriptions').select('*');
  const byPension = new Map<string, Sub[]>();
  for (const s of subs || []) byPension.set(s.pension_id, [...(byPension.get(s.pension_id) || []), s]);

  let total = 0;
  for (const [pensionId, list] of byPension) {
    const { data: row } = await db.from('pensions').select('data').eq('id', pensionId).single();
    if (!row) continue;
    for (const msg of dueNotifications(row.data, from, to)) {
      const { error } = await db.from('push_log').insert({ pension_id: pensionId, key: msg.key });
      if (error) continue; // already sent
      total += await send(list, msg);
    }
  }
  return json({ pensions: byPension.size, sent: total });
});
