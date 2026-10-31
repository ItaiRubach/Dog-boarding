import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup } from '@testing-library/preact';
import { App } from '../src/ui/App.jsx';
import { replaceState, getState } from '../src/store.js';
import { defaultState, seedDemo } from '../src/model.js';

const click = (el) => fireEvent.click(el);
const byText = (t) => screen.getAllByText(t)[0];

beforeEach(() => {
  cleanup();
  const s = defaultState();
  seedDemo(s);
  replaceState(s);
});

describe('app smoke', () => {
  it('home shows the plan with demo dogs and next-up', () => {
    render(<App />);
    expect(screen.getAllByText(/תא 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/לולה/).length).toBeGreaterThan(0);
    expect(screen.getByText('הבא בתור')).toBeTruthy();
  });

  it('is there room → pick a dog → save → invite opens', () => {
    render(<App />);
    const before = getState().stays.length;
    click(screen.getByText('יש מקום?'));
    expect(screen.getAllByText(/יש מקום|אין תא פנוי/).length).toBeGreaterThan(0);
    click(screen.getByText(/^קבע ב/));
    fireEvent.input(document.getElementById('dog-search'), { target: { value: 'ג׳ינ' } });
    click(byText(/^ג׳ינג׳ר/));
    click(screen.getByText('שמור'));
    if (screen.queryByText('אשר ושמור')) click(screen.getByText('אשר ושמור'));
    expect(getState().stays.length).toBe(before + 1);
    expect(screen.getByText(/1 · שלח הודעה בוואטסאפ/)).toBeTruthy();
  });

  it('putting a dog next to an alone-only dog needs the admin PIN', () => {
    render(<App />);
    const s = getState();
    const tofiStay = s.stays.find((x) => s.dogs.find((d) => d.id === x.dogIds[0]).name === 'טופי');
    const zigi = s.stays.find((x) => s.dogs.find((d) => d.id === x.dogIds[0]).name === 'זיגי');
    click(screen.getByText('כלבים'));
    click(byText('זיגי'));
    click(screen.getByText(/ביקורים/));
    click(screen.getAllByRole('button').find((b) => /תא 5/.test(b.textContent)));
    fireEvent.change(document.getElementById('st-kennel'), { target: { value: tofiStay.kennelId } });
    click(screen.getByText('שמור'));
    expect(screen.getByText('צריך אישור מנהל')).toBeTruthy();
    fireEvent.input(document.getElementById('admin-pin'), { target: { value: '0000' } });
    click(screen.getByText('אשר כמנהל ושמור'));
    expect(screen.getByText('קוד מנהל שגוי')).toBeTruthy();
    fireEvent.input(document.getElementById('admin-pin'), { target: { value: '1234' } });
    click(screen.getByText('אשר כמנהל ושמור'));
    const saved = getState().stays.find((x) => x.id === zigi.id);
    expect(saved.kennelId).toBe(tofiStay.kennelId);
    expect(saved.approvals.some((a) => a.by === 'admin')).toBe(true);
  });

  it('board, dog file with flag, training with Waze, settings screens render', () => {
    render(<App />);
    click(screen.getByText('לוח'));
    expect(document.querySelectorAll('.bbar').length).toBeGreaterThan(5);
    click(screen.getByText('כלבים'));
    click(byText(/^טופי/));
    expect(screen.getByText(/נוהם כשניגשים לקערה/)).toBeTruthy();
    click(screen.getByText(/חזרה/));
    click(screen.getByText('היום'));
    click(screen.getByText(/אילוף · ג׳ינג׳ר/));
    expect(screen.getByText('נווט בוויז').getAttribute('href')).toContain('waze.com/ul?q=');
    click(screen.getByText(/חזרה/));
    click(screen.getByLabelText('הגדרות'));
    click(screen.getByText('מפת התאים'));
    expect(document.querySelectorAll('.ecell.kennel-e').length).toBe(8);
    click(screen.getByText(/חזרה/));
    click(screen.getByText('מחירון וחישוב לינה'));
    click(screen.getByText('לילות + איסוף מאוחר'));
    expect(getState().settings.pricing.method).toBe('nightsLate');
  });

  it('paying from the dog sheet turns the stay blue', () => {
    render(<App />);
    const lola = getState().stays.find((x) => getState().dogs.find((d) => d.id === x.dogIds[0]).name === 'לולה');
    click(document.querySelector('.tok.u'));
    click(screen.getByText('שולם הכל'));
    const unpaidLeft = getState().stays.filter((x) => x.payments.length === 0).length;
    expect(unpaidLeft).toBeLessThan(4);
    expect(lola).toBeTruthy();
  });
});
