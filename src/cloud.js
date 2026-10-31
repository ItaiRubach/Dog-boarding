// Thin wrapper over Supabase, so the sync logic can be tested with a fake.
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export function makeCloud(url = SUPABASE_URL, key = SUPABASE_ANON_KEY) {
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: true, storageKey: 'pension-auth', detectSessionInUrl: true } });
  return {
    async session() {
      return must(await sb.auth.getSession()).session;
    },
    onAuth(fn) {
      sb.auth.onAuthStateChange((_event, session) => fn(session));
    },
    async signIn(email, password) {
      must(await sb.auth.signInWithPassword({ email, password }));
    },
    async signUp(email, password) {
      return must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.href.split('#')[0] } }));
    },
    async resetPassword(email) {
      must(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] }));
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async myPensions() {
      return must(await sb.from('pensions').select('id,name,version,join_code,updated_at'));
    },
    async fetch(id) {
      return must(await sb.from('pensions').select('*').eq('id', id).single());
    },
    async create(name, data) {
      return must(await sb.rpc('create_pension', { p_name: name, p_data: data }));
    },
    async join(code) {
      return must(await sb.rpc('join_pension', { p_code: code }));
    },
    async save(id, data, version) {
      return must(await sb.rpc('save_pension', { p_id: id, p_data: data, p_version: version }));
    },
    /** Calls fn when another device saved. Returns unsubscribe. */
    subscribe(id, fn) {
      const ch = sb
        .channel('pension-' + id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pensions', filter: `id=eq.${id}` }, () => fn())
        .subscribe();
      return () => sb.removeChannel(ch);
    },
  };
}
