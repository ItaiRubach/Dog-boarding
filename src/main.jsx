import { render } from 'preact';
import './styles.css';
import { App } from './ui/App.jsx';
import { loadState } from './store.js';
import { initSync } from './sync.js';
import { makeCloud } from './cloud.js';

// iOS ignores user-scalable=no in some cases; block pinch and double-tap zoom ourselves
for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
let lastTouch = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouch < 300 && !e.target.closest('input, textarea, select')) e.preventDefault();
  lastTouch = now;
}, { passive: false });

loadState().then(() => {
  render(<App />, document.getElementById('app'));
  initSync(makeCloud());
});
