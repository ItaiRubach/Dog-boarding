import { byId } from '../model.js';

/** Columns that hold no kennel (the path) are drawn narrow. */
export function columnTemplate(plan) {
  const cols = [];
  for (let c = 0; c < plan.cols; c++) {
    let hasKennel = false;
    for (let r = 0; r < plan.rows; r++) if (plan.cells[`${r},${c}`]?.type === 'kennel') hasKennel = true;
    cols.push(hasKennel ? 'minmax(0,1fr)' : 'minmax(34px,.35fr)');
  }
  return cols.join(' ');
}

/** Yuval's own drawing of the pension; renderKennel draws each kennel's content. */
export function FloorPlan({ state, renderKennel }) {
  const { plan } = state;
  const cells = [];
  for (let r = 0; r < plan.rows; r++) {
    for (let c = 0; c < plan.cols; c++) {
      const cell = plan.cells[`${r},${c}`];
      const style = `grid-row:${r + 1};grid-column:${c + 1}`;
      if (!cell) cells.push(<div class="pcell void" style={style} key={r + ',' + c} />);
      else if (cell.type === 'aisle') cells.push(<div class="pcell aisle" style={style} key={r + ',' + c} />);
      else if (cell.type === 'door') cells.push(<div class="pcell door" style={style} key={r + ',' + c}>כניסה</div>);
      else {
        const k = byId(state.kennels, cell.kennelId);
        if (k) cells.push(<div style={style} key={k.id} class="kcell">{renderKennel(k)}</div>);
      }
    }
  }
  return (
    <div class="plan" style={`grid-template-columns:${columnTemplate(plan)}`}>
      {cells}
    </div>
  );
}
