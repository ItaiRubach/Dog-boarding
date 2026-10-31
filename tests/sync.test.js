import { describe, it, expect, beforeEach, vi } from 'vitest';

/** In-memory stand-in for Supabase, shared by "phones" in one test. */
function fakeCloud(world) {
  let session = null;
  const clone = (x) => structuredClone(x);
  return {
    session: async () => session,
    onAuth() {},
    signIn: async (email) => { session = { user: { id: email, email } }; },
    signOut: async () => { session = null; },
    signUp: async () => ({}),
    resetPassword: async () => {},
    myPensions: async () => Object.values(world.rows).filter((r) => r.members.includes(session.user.id)).map(clone),
    fetch: async (id) => { if (world.offline) throw new Error('fetch failed'); return clone(world.rows[id]); },
    create: async (name, data) => {
      const r = { id: 'p1', name, data: clone(data), version: 1, join_code: 'ABCD1234', members: [session.user.id] };
      world.rows.p1 = r;
      return clone(r);
    },
    join: async (code) => {
      const r = Object.values(world.rows).find((x) => x.join_code === code.trim().toUpperCase());
      if (!r) throw new Error('wrong code');
      r.members.push(session.user.id);
      return clone(r);
    },
    save: async (id, data, version) => {
      if (world.offline) throw new Error('fetch failed');
      const r = world.rows[id];
      if (r.version !== version) return -1;
      r.data = clone(data);
      r.version++;
      (world.subs[id] || []).forEach((f) => f());
      return r.version;
    },
    subscribe: (id, fn) => {
      (world.subs[id] ??= []).push(fn);
      return () => {};
    },
  };
}

/** A fresh phone: its own store + sync modules. */
async function phone() {
  vi.resetModules();
  const store = await import('../src/store.js');
  const sync = await import('../src/sync.js');
  const model = await import('../src/model.js');
  return { store, sync, model };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
let world;
beforeEach(() => {
  world = { rows: {}, subs: {}, offline: false };
});

describe('cloud sync', () => {
  it('without cloud settings the app stays local', async () => {
    const { sync } = await phone();
    await sync.initSync(null);
    expect(sync.getSync()).toMatchObject({ enabled: false, status: 'off' });
  });

  it("Yuval's first login uploads the phone's data; later changes follow", async () => {
    const { store, sync, model } = await phone();
    const s = model.defaultState();
    model.seedDemo(s);
    store.replaceState(s);
    await sync.initSync(fakeCloud(world));
    expect(sync.getSync().status).toBe('signedout');
    await sync.signIn('yuval@x', 'pw');
    expect(sync.getSync().status).toBe('nopension');
    await sync.createFromPhone('הפנסיון של יובל');
    expect(world.rows.p1.data.dogs).toHaveLength(s.dogs.length);
    expect(sync.getSync()).toMatchObject({ status: 'synced', joinCode: 'ABCD1234', version: 1 });

    store.update((st) => { st.settings.adminPin = '9999'; });
    expect(sync.getSync().status).toBe('saving');
    await sync.pushNow();
    expect(world.rows.p1.version).toBe(2);
    expect(world.rows.p1.data.settings.adminPin).toBe('9999');
    expect(sync.getSync().status).toBe('synced');
  });

  it("a second phone joins with the code and gets Yuval's data; changes reach it", async () => {
    world.rows.p1 = { id: 'p1', name: 'הפנסיון של יובל', data: { ...(await import('../src/model.js')).defaultState(), dogs: [{ id: 'd1', name: 'טופי', contacts: [] }] }, version: 5, join_code: 'ABCD1234', members: ['yuval@x'] };
    const { store, sync } = await phone();
    await sync.initSync(fakeCloud(world));
    await sync.signIn('itai@x', 'pw');
    await sync.joinWithCode('abcd1234');
    expect(store.getState().dogs.map((d) => d.name)).toEqual(['טופי']);
    expect(sync.getSync()).toMatchObject({ status: 'synced', version: 5 });

    // Yuval saves on his phone
    world.rows.p1.data = { ...world.rows.p1.data, dogs: [{ id: 'd1', name: 'טופי', contacts: [] }, { id: 'd2', name: 'לולה', contacts: [] }] };
    world.rows.p1.version = 6;
    world.subs.p1.forEach((f) => f());
    await tick();
    await tick();
    expect(store.getState().dogs.map((d) => d.name)).toEqual(['טופי', 'לולה']);
  });

  it('a phone that already belongs to one pension connects by itself at login', async () => {
    world.rows.p1 = { id: 'p1', name: 'פנסיון', data: { dogs: [{ id: 'd1', name: 'רקסי', contacts: [] }] }, version: 3, join_code: 'X', members: ['yuval@x'] };
    const { store, sync } = await phone();
    await sync.initSync(fakeCloud(world));
    await sync.signIn('yuval@x', 'pw');
    expect(store.getState().dogs.map((d) => d.name)).toEqual(['רקסי']);
    expect(sync.getSync().status).toBe('synced');
  });

  it('offline: changes wait on the phone and go up when the connection is back', async () => {
    const { store, sync } = await phone();
    await sync.initSync(fakeCloud(world));
    await sync.signIn('yuval@x', 'pw');
    await sync.createFromPhone('פנסיון');
    world.offline = true;
    store.update((st) => { st.settings.homeAddress = 'הרצל 1'; });
    await sync.pushNow();
    expect(sync.getSync()).toMatchObject({ status: 'offline', dirty: true });
    expect(world.rows.p1.version).toBe(1);
    world.offline = false;
    await sync.connect();
    expect(world.rows.p1.data.settings.homeAddress).toBe('הרצל 1');
    expect(sync.getSync()).toMatchObject({ status: 'synced', dirty: false });
  });

  it('two phones saving at once: the cloud copy wins and Yuval is told', async () => {
    const { store, sync } = await phone();
    await sync.initSync(fakeCloud(world));
    await sync.signIn('yuval@x', 'pw');
    await sync.createFromPhone('פנסיון');
    // the other phone saves first
    world.rows.p1.data = { ...world.rows.p1.data, settings: { ...world.rows.p1.data.settings, homeAddress: 'מהטלפון השני' } };
    world.rows.p1.version = 2;
    store.update((st) => { st.settings.homeAddress = 'מהטלפון הזה'; });
    await sync.pushNow();
    expect(sync.getSync().status).toBe('conflict');
    expect(store.getState().settings.homeAddress).toBe('מהטלפון השני');
    expect(world.rows.p1.version).toBe(2);
  });
});
