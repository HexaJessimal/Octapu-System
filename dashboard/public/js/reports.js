// The Dashboard's Report tab: the figures logged to Entities/Reports.md with each review, over
// time, as headline tiles, charts and a table.
(function () {
  'use strict';
  const { displayDate, dayNumber, setDateFormat, status, component, getJson, loadError } = window.PMS;

  const panel = document.getElementById('report-panel');
  if (!panel) return;
  const RECENT = 4; // how many reviews make "your recent pace"

  let reports = []; // oldest first
  let interval = 7; // ROUNDUP: a review within this many days of the last is on time
  const charts = {}; // each drawn chart's scales and series, by its key, for the tooltip

  // ---------- figures ----------

  const sum = (list) => list.reduce((a, b) => a + b, 0);
  const average = (list) => (list.length ? sum(list) / list.length : null);
  const known = (list) => list.filter((v) => v !== null);
  const show = (v) => (v === null ? '–' : String(v));

  // Figures worked out from the logged ones. Each takes a report's position, so it can look
  // at the report before.
  const DERIVED = {
    open: (i) => {
      const v = reports[i].values;
      return v.assigned === null && v.waiting === null && v.unassigned === null ? null : (v.assigned || 0) + (v.waiting || 0) + (v.unassigned || 0);
    },
    planPercent: (i) => {
      const { planItems, planDone } = reports[i].values;
      return planItems ? Math.round((planDone / planItems) * 100) : null;
    },
  };

  // One series' value at a report: a derived figure, or one logged in the file.
  const valueAt = (s, i) => (DERIVED[s.key] ? DERIVED[s.key](i) : reports[i].values[s.key]);
  const seriesValues = (s) => reports.map((_, i) => valueAt(s, i));
  const latest = (key) => valueAt({ key }, reports.length - 1);
  const previous = (key) => (reports.length > 1 ? valueAt({ key }, reports.length - 2) : null);

  // ---------- tiles ----------

  // The change since the review before. `better` is 'up', 'down' or null when neither
  // direction is good or bad; the arrow always says which way it went. `unit` follows the number.
  function change(key, better, unit) {
    const now = latest(key);
    const before = previous(key);
    if (now === null || before === null) return { delta: '', tone: '' };
    const by = now - before;
    if (by === 0) return { delta: 'No change since last review', tone: '' };
    return { delta: (by > 0 ? '▲ ' : '▼ ') + Math.abs(by) + (unit || '') + ' since last review', tone: better ? ((by > 0) === (better === 'up') ? 'good' : 'bad') : '' };
  }

  function tile(label, value, moved, note) {
    const { delta, tone } = moved || { delta: '', tone: '' };
    return component('report-tile', { label, value, delta, tone, note: note || '' });
  }

  // Reviews in a row, up to the latest, each within ROUNDUP days of the one before.
  function streak() {
    let count = reports.length ? 1 : 0;
    for (let i = reports.length - 1; i > 0 && dayNumber(reports[i].date) - dayNumber(reports[i - 1].date) <= interval; i--) count++;
    return count;
  }

  function tiles() {
    const pace = average(known(reports.map((r) => r.values.completed)).slice(-RECENT));
    const open = latest('open');
    const { planItems, planDone, active, stalled } = reports[reports.length - 1].values;
    return component('report-tiles', {
      tiles:
        tile('Tasks completed', show(latest('completed')), change('completed', 'up')) +
        tile('Reviews to clear open tasks', open === null || !pace ? '–' : String(Math.ceil(open / pace)), null, pace ? open + ' open, at ' + Math.round(pace * 10) / 10 + ' a review' : 'Nothing completed recently') +
        tile('Plan follow-through', planItems ? planDone + ' of ' + planItems : '–', change('planPercent', 'up', ' points'), planItems ? latest('planPercent') + '% of focuses done' : 'No plan this period') +
        tile('Stalled projects', show(stalled), change('stalled', 'down'), active === null ? '' : 'Of ' + active + ' active, with nothing finished') +
        tile('Overdue tasks', show(latest('overdue')), change('overdue', 'down')) +
        tile('Review streak', String(streak()), null, 'In a row, each within ' + interval + ' days'),
    });
  }

  // ---------- charts ----------

  const W = 560; // a chart in half the page
  const WIDE = 1140; // two half charts and the gap between them, so its text is the same size
  const H = 230;
  const PAD = { top: 14, bottom: 30, left: 40 };
  const r1 = (n) => Math.round(n * 10) / 10;

  // A tidy axis top and step: 1, 2 or 5 times a power of ten, about four steps high. Every
  // figure is a count or a percentage, so a step is never less than 1.
  function niceScale(max) {
    if (max <= 0) return { top: 4, step: 1 };
    const rough = max / 4;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const step = Math.max(1, [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough));
    return { top: Math.ceil(max / step) * step, step };
  }

  // The frame every chart shares: x by report, so each review is one step, and y from 0 to
  // just above `max`, `width` units across.
  function frame(max, right, width) {
    const { top, step } = niceScale(max);
    const plotRight = width - right;
    const band = (plotRight - PAD.left) / reports.length;
    return {
      top,
      step,
      band,
      plotRight,
      x: (i) => r1(PAD.left + band * (i + 0.5)),
      y: (v) => r1(H - PAD.bottom - (v / top) * (H - PAD.top - PAD.bottom)),
    };
  }

  function axes(f, unit) {
    let out = '';
    for (let v = 0; v <= f.top; v += f.step) {
      out += component('chart-gridline', { x1: PAD.left, x2: f.plotRight, y: f.y(v) });
      out += component('chart-tick', { x: PAD.left - 8, y: f.y(v) + 4, anchor: 'end', text: v + (unit || '') });
    }
    // Dates along the bottom: at most six, always including the newest.
    const n = reports.length;
    const every = Math.ceil(n / 6);
    reports.forEach((r, i) => {
      if ((n - 1 - i) % every === 0) out += component('chart-tick', { x: f.x(i), y: H - 10, anchor: 'middle', text: displayDate(r.date) });
    });
    return out;
  }

  // A line's path, broken where a value is missing. Each run starts with M.
  function runs(f, values) {
    const out = [];
    let run = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (run.length) out.push(run);
        run = [];
      } else run.push([f.x(i), f.y(v)]);
    });
    if (run.length) out.push(run);
    return out;
  }

  const linePath = (run) => run.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');

  // A 2px line, with a dot on the newest point and on any point standing alone. `endLabel`
  // puts the newest value beside it, and `halo` rings it where it crosses columns.
  function line(f, s, { endLabel, halo, unit }) {
    const values = seriesValues(s);
    let out = '';
    runs(f, values).forEach((run) => {
      if (halo && run.length > 1) out += component('chart-halo', { d: linePath(run) });
      if (run.length > 1) out += component('chart-line', { series: s.series, d: linePath(run) });
    });
    values.forEach((v, i) => {
      const alone = v !== null && (i === 0 || values[i - 1] === null) && (i === values.length - 1 || values[i + 1] === null);
      if (v !== null && (i === values.length - 1 || alone)) out += component('chart-dot', { series: s.series, x: f.x(i), y: f.y(v), index: i });
    });
    const last = values.length - 1;
    if (endLabel && values[last] !== null) out += component('chart-end-label', { x: f.x(last) + 9, y: f.y(values[last]) + 4, text: s.short + ' ' + values[last] + (unit || '') });
    return out;
  }

  // A column's path: square at the bottom, with a 4px rounded top when `round`.
  function columnPath(left, width, base, top, round) {
    const right = r1(left + width);
    const r = round ? Math.min(4, width / 2, base - top) : 0;
    return `M${left} ${r1(base)} L${left} ${r1(top + r)} Q${left} ${top} ${r1(left + r)} ${top} L${r1(right - r)} ${top} Q${right} ${top} ${right} ${r1(top + r)} L${right} ${r1(base)} Z`;
  }

  // One column per report, up to 24px wide, with each series stacked on the one before. A 2px
  // gap separates the parts, and only the top part has the rounded end.
  function stack(f, seriesList) {
    const width = Math.min(24, Math.max(4, f.band - 4));
    let out = '';
    reports.forEach((_, i) => {
      const parts = seriesList.map((s) => ({ s, v: valueAt(s, i) || 0 })).filter((p) => p.v > 0);
      const left = r1(f.x(i) - width / 2);
      let total = 0;
      parts.forEach((p, k) => {
        const base = k ? f.y(total) - 2 : f.y(0);
        total += p.v;
        const top = f.y(total);
        if (base - top >= 1) out += component('chart-bar', { series: p.s.series, d: columnPath(left, width, base, top, k === parts.length - 1), index: i });
      });
    });
    return out;
  }

  const format = (s, v) => (v === null ? '–' : v + (s.unit || ''));

  function hits(f, seriesList) {
    return reports
      .map((r, i) =>
        component('chart-hit', {
          x: r1(PAD.left + f.band * i),
          y: PAD.top,
          width: r1(f.band),
          height: H - PAD.top - PAD.bottom,
          index: i,
          label: displayDate(r.date) + ': ' + seriesList.map((s) => s.label + ' ' + format(s, valueAt(s, i))).join(', '),
        })
      )
      .join('');
  }

  // One chart card: `bars` stacked in a column per report, then `lines` drawn over
  // them on the same axis. A legend is shown for two or more series, with a box for a column
  // and a line for a line, like the marks. `top` fixes the axis, as for a percentage.
  function chart({ key, title, subtitle, bars = [], lines = [], right, top, unit, wide }) {
    const series = [...bars, ...lines];
    const columnMax = reports.map((_, i) => sum(bars.map((s) => valueAt(s, i) || 0)));
    const max = top || Math.max(0, ...columnMax, ...lines.flatMap((s) => known(seriesValues(s))));
    const width = wide ? WIDE : W;
    const f = frame(max, right || 16, width);
    const marks = stack(f, bars) + lines.map((s) => line(f, s, { endLabel: series.length > 1, halo: bars.length > 0, unit })).join('');
    const body = axes(f, unit) + component('chart-crosshair', { top: PAD.top, bottom: H - PAD.bottom }) + marks + hits(f, series);
    charts[key] = { f, series };
    const keyOf = (s) => component('chart-key', { series: s.series, label: s.label, bar: bars.includes(s) });
    return component('report-chart', {
      key,
      title,
      subtitle,
      legend: series.length > 1 ? series.map(keyOf).join('') : '',
      svg: component('chart-svg', { width, height: H, label: title + ', ' + subtitle, body }),
    });
  }

  // ---------- hover and focus ----------

  function showTip(hit) {
    const card = hit.closest('[data-chart]');
    const { f, series } = charts[card.dataset.chart];
    const i = Number(hit.dataset.index);
    const cross = card.querySelector('.chart-crosshair');
    cross.setAttribute('x1', f.x(i));
    cross.setAttribute('x2', f.x(i));
    cross.setAttribute('visibility', 'visible');
    card.querySelectorAll('.is-lifted').forEach((el) => el.classList.remove('is-lifted'));
    card.querySelectorAll('.chart-bar[data-index="' + i + '"]').forEach((el) => el.classList.add('is-lifted'));
    const tip = card.querySelector('.chart-tip');
    tip.innerHTML = component('chart-tip-head', { date: displayDate(reports[i].date) }) + series.map((s) => component('chart-tip-row', { series: s.series, value: format(s, valueAt(s, i)), label: s.label })).join('');
    tip.hidden = false;
    // In the top corner away from the crosshair, so it never covers the point being read.
    tip.classList.toggle('is-left', f.x(i) > (PAD.left + f.plotRight) / 2);
  }

  function hideTip(card) {
    card.querySelector('.chart-crosshair').setAttribute('visibility', 'hidden');
    card.querySelector('.chart-tip').hidden = true;
    card.querySelectorAll('.is-lifted').forEach((el) => el.classList.remove('is-lifted'));
  }

  const hitOf = (e) => e.target.closest && e.target.closest('.chart-hit');
  panel.addEventListener('pointerover', (e) => hitOf(e) && showTip(hitOf(e)));
  panel.addEventListener('focusin', (e) => hitOf(e) && showTip(hitOf(e)));
  panel.addEventListener('pointerout', (e) => hitOf(e) && !(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.chart-hit')) && hideTip(hitOf(e).closest('[data-chart]')));
  panel.addEventListener('focusout', (e) => hitOf(e) && hideTip(hitOf(e).closest('[data-chart]')));

  // ---------- the tab ----------

  function table(fields) {
    return component('report-table', {
      count: reports.length,
      heads: fields.map((field) => component('report-table-head', { label: field.label })).join(''),
      rows: reports
        .slice()
        .reverse()
        .map((r) => component('report-table-row', { date: displayDate(r.date), cells: fields.map((field) => component('report-table-cell', { value: show(r.values[field.key]) })).join('') }))
        .join(''),
    });
  }

  function render(data) {
    reports = data.reports;
    interval = data.interval;
    if (!reports.length) {
      panel.innerHTML = component('empty-card', { message: 'No reports yet. One is added to Entities/Reports.md each time you submit a Review.' });
      return;
    }
    const label = (key) => data.fields.find((field) => field.key === key).label;
    // Task flow stacks the tasks finished in each period under those still open at its end,
    // so the column shows the work in play and how much of it got done.
    panel.innerHTML =
      component('report-actions') +
      tiles() +
      component('report-charts', {
        charts:
          chart({
            key: 'flow',
            wide: true,
            title: 'Task flow',
            subtitle: 'Tasks completed in each period, under those still open at each review, and how many are overdue',
            right: 76,
            bars: [
              { key: 'completed', series: 'green', label: label('completed') },
              { key: 'assigned', series: 'orange', label: label('assigned') },
              { key: 'waiting', series: 'yellow', label: label('waiting') },
              { key: 'unassigned', series: 'soft', label: label('unassigned') },
            ],
            lines: [{ key: 'overdue', series: 'pink', label: label('overdue'), short: 'Overdue' }],
          }) +
          chart({
            key: 'plan',
            title: 'Plan follow-through',
            subtitle: 'Share of the latest Plan’s focuses done by each review',
            bars: [{ key: 'planPercent', series: 'accent', label: 'Focuses done', unit: '%' }],
            top: 100,
            unit: '%',
          }) +
          chart({ key: 'wins', title: 'Wins logged', subtitle: 'Lines in each review’s wins', bars: [{ key: 'wins', series: 'accent', label: label('wins') }] }),
      }) +
      table(data.fields);
  }

  function load() {
    return getJson('api/reports')
      .then((data) => {
        setDateFormat(data.dateFormat);
        render(data);
      })
      .catch((err) => {
        panel.innerHTML = loadError('the report', err);
      });
  }

  status.onChange(load);
  load();
})();
