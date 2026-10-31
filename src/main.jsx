import { render } from 'preact';
import './styles.css';
import { App } from './ui/App.jsx';
import { loadState } from './store.js';

loadState().then(() => render(<App />, document.getElementById('app')));
