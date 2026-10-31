import { useState, useMemo, useRef } from 'preact/hooks';
import { UI, IssuesSheet } from './common.jsx';
import { InviteSheet } from './Invite.jsx';
import { Home } from './Home.jsx';
import { Avail } from './Avail.jsx';
import { Stay } from './Stay.jsx';
import { Board } from './Board.jsx';
import { Dogs, Dog } from './Dogs.jsx';
import { Training } from './Training.jsx';
import { Settings, SetGeneral, SetMessage, SetPrices, SetPlan, SetBackup } from './Settings.jsx';
import { Account } from './Account.jsx';
import { useSync } from '../sync.js';
import { useStore, update, getState } from '../store.js';
import { checkStay } from '../logic/occupancy.js';

const SCREENS = {
  home: Home, board: Board, dogs: Dogs, dog: Dog, stay: Stay, avail: Avail, training: Training,
  settings: Settings, 'set-general': SetGeneral, 'set-message': SetMessage, 'set-prices': SetPrices, 'set-plan': SetPlan, 'set-backup': SetBackup, account: Account,
};
const TABS = [['home', '◉', 'היום'], ['board', '▦', 'לוח'], ['dogs', '🐾', 'כלבים']];

export function App() {
  const state = useStore();
  const [stack, setStack] = useState([{ name: 'home', params: {}, key: 0 }]);
  const [pending, setPending] = useState(null); // {stay, issues, opts}
  const [invite, setInvite] = useState(null); // {kind: stay|lesson, id}
  const [toastMsg, setToastMsg] = useState('');
  const toastTimer = useRef();
  const keyRef = useRef(1);
  const sync = useSync();
  const lastStatus = useRef(sync.status);

  const commitStay = (stay, opts, approvals = []) => {
    update((s) => {
      opts.before?.(s);
      const next = { ...stay, approvals: [...(stay.approvals || []), ...approvals] };
      const i = s.stays.findIndex((x) => x.id === stay.id);
      if (i >= 0) s.stays[i] = next;
      else s.stays.push(next);
    });
    setPending(null);
    opts.onSaved?.();
  };

  const ui = useMemo(
    () => ({
      go: (name, params = {}) => setStack((st) => [...st, { name, params, key: keyRef.current++ }]),
      back: () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st)),
      reset: (name) => setStack([{ name, params: {}, key: keyRef.current++ }]),
      toast: (msg) => {
        setToastMsg(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToastMsg(''), 2200);
      },
      invite: (target) => setInvite(typeof target === 'string' ? { kind: 'stay', id: target } : target),
      /** Check occupancy rules; save directly or ask for confirmation / admin PIN. */
      saveStay: (stay, opts = {}) => {
        const st = getState();
        const ctx = { ...st, ...(opts.extraState || {}) };
        const issues = checkStay(stay, ctx);
        if (opts.warn) issues.push({ type: 'custom', level: 'confirm', key: 'custom:blocked', text: opts.warn });
        if (!issues.length) return commitStay(stay, opts);
        setPending({ stay, issues, opts });
      },
    }),
    [],
  );

  if (sync.status !== lastStatus.current) {
    if (sync.status === 'conflict') setTimeout(() => ui.toast('עודכן ממכשיר אחר · השינוי האחרון לא נשמר'), 0);
    lastStatus.current = sync.status;
  }

  const top = stack[stack.length - 1];
  const Screen = SCREENS[top.name] || Home;
  const tabRoot = stack[0].name;

  return (
    <UI.Provider value={ui}>
      <div class="shell">
        <Screen key={top.key} state={state} params={top.params} />
        {stack.length === 1 && (
          <nav class="tabbar">
            {TABS.map(([name, icon, label]) => (
              <button type="button" key={name} aria-current={tabRoot === name ? 'page' : undefined} onClick={() => ui.reset(name)}>
                <i>{icon}</i>
                {label}
              </button>
            ))}
          </nav>
        )}
      </div>
      {pending && (
        <IssuesSheet
          issues={pending.issues}
          state={{ ...state, ...(pending.opts.extraState || {}) }}
          onCancel={() => setPending(null)}
          onApprove={(approvals) => commitStay(pending.stay, pending.opts, approvals)}
        />
      )}
      {invite && <InviteSheet state={state} target={invite} onClose={() => setInvite(null)} />}
      {toastMsg && <div class="toast" role="status">{toastMsg}</div>}
    </UI.Provider>
  );
}
