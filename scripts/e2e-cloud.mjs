// End-to-end check against the real Supabase project with throwaway users.
// Usage: node scripts/e2e-cloud.mjs   (reads .env). Prints PASS/FAIL per step.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').trim().split(/\r?\n/).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const URL_ = env.VITE_SUPABASE_URL;
const KEY = env.VITE_SUPABASE_ANON_KEY;
const tag = Date.now().toString(36);
const mk = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
let fails = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  · ' + extra : ''}`);
  if (!ok) fails++;
};
const signUp = async (who) => {
  const c = mk();
  const { data, error } = await c.auth.signUp({ email: `e2e-${who}-${tag}@example.com`, password: 'e2e-pass-' + tag });
  if (error) throw new Error(`${who}: ${error.message}`);
  return { c, session: data.session };
};

const yuval = await signUp('yuval');
check('sign-up logs in immediately (no email needed)', !!yuval.session);

const anon = mk();
const { data: anonRows } = await anon.from('pensions').select('id');
check('without login: sees no pension', (anonRows || []).length === 0);
const { error: anonCreate } = await anon.rpc('create_pension', { p_name: 'x', p_data: {} });
check('without login: cannot create', !!anonCreate, anonCreate?.message);

const { data: p, error: e1 } = await yuval.c.rpc('create_pension', { p_name: 'E2E ' + tag, p_data: { dogs: [{ id: 'd1', name: 'טופי' }] } });
check('Yuval creates a pension', !e1 && p?.id && p.version === 1, e1?.message);

const { data: v2 } = await yuval.c.rpc('save_pension', { p_id: p.id, p_data: { dogs: [{ id: 'd1', name: 'טופי' }, { id: 'd2', name: 'לולה' }] }, p_version: 1 });
check('save with the right version', v2 === 2);
const { data: stale } = await yuval.c.rpc('save_pension', { p_id: p.id, p_data: { dogs: [] }, p_version: 1 });
check('save with an old version is refused', stale === -1);

const itai = await signUp('itai');
const { data: before } = await itai.c.from('pensions').select('id');
check('another user sees nothing before joining', (before || []).length === 0);
const { error: badCode } = await itai.c.rpc('join_pension', { p_code: 'WRONG123' });
check('wrong join code is refused', !!badCode, badCode?.message);
const { data: joined, error: e2 } = await itai.c.rpc('join_pension', { p_code: p.join_code.toLowerCase() });
check('join with the code', !e2 && joined?.id === p.id, e2?.message);
const { data: got } = await itai.c.from('pensions').select('*').eq('id', p.id).single();
check("joined user reads Yuval's data", got?.data?.dogs?.length === 2 && got.version === 2);

// live update: Itai listens, Yuval saves
const heard = new Promise((resolve) => {
  const t = setTimeout(() => resolve(false), 15000);
  itai.c
    .channel('e2e-' + tag)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pensions', filter: `id=eq.${p.id}` }, () => {
      clearTimeout(t);
      resolve(true);
    })
    // save only after the server confirms it is listening to the table
    .on('system', {}, async (m) => {
      if (m.extension === 'postgres_changes' && m.status === 'ok') await yuval.c.rpc('save_pension', { p_id: p.id, p_data: { dogs: [{ id: 'd1', name: 'טופי' }] }, p_version: 2 });
    })
    .subscribe();
});
check('live update reaches the other phone', await heard);

const stranger = await signUp('stranger');
const { data: sRows } = await stranger.c.from('pensions').select('id').eq('id', p.id);
check('a stranger cannot read the pension', (sRows || []).length === 0);
const { error: sSave } = await stranger.c.rpc('save_pension', { p_id: p.id, p_data: {}, p_version: 3 });
check('a stranger cannot write to it', !!sSave, sSave?.message);
const { error: direct } = await yuval.c.from('pensions').update({ name: 'hack' }).eq('id', p.id);
const { data: after } = await yuval.c.from('pensions').select('name').eq('id', p.id).single();
check('direct table writes are blocked (only the functions write)', after?.name === 'E2E ' + tag, direct?.message || 'no error, 0 rows');

console.log(`\nTAG=${tag}`);
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
