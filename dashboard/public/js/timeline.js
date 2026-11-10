// The Timeline on the Home page: a month-accurate Gantt chart of every project's Active Timeframes.
(function () {
  'use strict';
  const { parseFolder, STATUS_LABELS, legendItems, dependencyTitle, dependencyHref, markdown: md, status, component, getJson, loadError } = window.PMS;

  const contentEl = document.getElementById('timeline');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The same states and colours as the milestone progress bar.
  const STATE_COLOURS = { done: 'var(--green)', partial: 'var(--yellow)', todo: 'var(--orange)', none: 'var(--pink)' };

  // Grades the bar through the project's milestones, left to right. A bar for a project
  // with no milestones keeps the plain bar colour.
  function barBackground(milestones) {
    if (!milestones.length) return 'var(--surface-raised)';
    const colours = milestones.map((m) => STATE_COLOURS[m.state]);
    if (colours.length === 1) return colours[0];
    const stops = colours.map((c, i) => c + ' ' + (((i + 0.5) / colours.length) * 100).toFixed(1) + '%');
    return 'linear-gradient(to right, ' + stops.join(', ') + ')';
  }

  // A commitment is one solid colour: priorities A, B and C share the milestone colours.
  const PRIORITY_COLOURS = { A: 'var(--green)', B: 'var(--yellow)', C: 'var(--pink)' };
  const commitmentBackground = (priority) => PRIORITY_COLOURS[priority] || 'var(--surface-raised)';

  function progressText(milestones) {
    if (!milestones.length) return 'N/A';
    return milestones.filter((m) => m.state === 'done').length + ' of ' + milestones.length + ' milestones complete';
  }

  // Months are numbered continuously so ranges can cross years.
  const yearOf = (i) => Math.floor(i / 12);
  const monthOf = (i) => i % 12;
  const shortMonth = (i) => MONTHS[monthOf(i)] + ' ' + String(yearOf(i)).slice(-2);

  function barLabel(bar) {
    return bar.first === bar.last ? shortMonth(bar.first) : shortMonth(bar.first) + ' – ' + shortMonth(bar.last);
  }

  // Overlapping timeframes in one project stack onto separate lanes.
  function assignLanes(bars) {
    const laneEnds = [];
    return bars
      .slice()
      .sort((a, b) => a.first - b.first || a.last - b.last)
      .map((bar) => {
        let lane = laneEnds.findIndex((end) => end < bar.first);
        if (lane === -1) lane = laneEnds.length;
        laneEnds[lane] = bar.last;
        return Object.assign({}, bar, { lane });
      });
  }

  function headerRows(start, end, now) {
    let years = '';
    let months = '';
    for (let i = start; i <= end; ) {
      const span = Math.min(12 - monthOf(i), end - i + 1);
      years += component('gantt-year', { span, year: yearOf(i) });
      i += span;
    }
    for (let i = start; i <= end; i++) {
      months += component('gantt-month', { now: i === now, name: MONTHS[monthOf(i)] });
    }
    return component('gantt-head', { cells: years }) + component('gantt-head', { cells: months });
  }

  function projectRow(row, start, end, now) {
    const { commitment } = row;
    const info = commitment ? { title: commitment.title } : parseFolder(row.folder);
    const href = commitment ? dependencyHref(row.folder) : 'project.html?folder=' + encodeURIComponent(row.folder) + '&file=' + encodeURIComponent(row.file);
    const bars = assignLanes(row.bars);
    const lanes = Math.max(...bars.map((b) => b.lane)) + 1;
    const column = (i) => i - start + 2; // column 1 holds the project name
    const milestones = md.parseMilestones(row.content).milestones;
    const background = commitment ? commitmentBackground(commitment.priority) : barBackground(milestones);
    const summary = commitment ? (commitment.priority ? 'priority ' + commitment.priority : 'no priority') : progressText(milestones);
    // Dependency arrows leave the project's last bar and arrive at its first.
    const lastBar = bars.reduce((a, b) => (b.last > a.last ? b : a));
    const firstBar = bars.reduce((a, b) => (b.first < a.first ? b : a));
    const dependsOn = row.dependency ? ' · depends on ' + dependencyTitle(row.dependency) : '';
    return component('gantt-project', {
      lanes,
      href,
      title: info.title,
      pill: commitment ? component('pill', { status: 'unknown', label: 'Commitment' }) : component('pill', { status: info.status, label: STATUS_LABELS[info.status] }),
      now: now >= start && now <= end ? component('gantt-now', { column: column(now), lanes }) : '',
      bars: bars
        .map((bar) =>
          component('gantt-bar', {
            href,
            detail: info.title + ': ' + window.PMS.displayDates(bar.raw) + ' (' + summary + ')' + dependsOn,
            isLast: bar === lastBar,
            isFirst: bar === firstBar,
            folder: row.folder,
            background,
            from: column(bar.first),
            to: column(bar.last) + 1,
            lane: bar.lane + 1,
            label: barLabel(bar),
          })
        )
        .join(''),
    });
  }

  // The route from the end of one bar to the start of another, always arriving rightwards.
  function arrowPath(x1, y1, x2, y2) {
    const clearance = 9;
    if (x2 - x1 >= clearance * 2) {
      const bend = x2 - clearance;
      return 'M' + x1 + ' ' + y1 + 'H' + bend + 'V' + y2 + 'H' + x2;
    }
    // The dependent project starts before its parent ends, so the line doubles back.
    const middle = (y1 + y2) / 2;
    return 'M' + x1 + ' ' + y1 + 'H' + (x1 + clearance) + 'V' + middle + 'H' + (x2 - clearance) + 'V' + y2 + 'H' + x2;
  }

  // Lines are measured from the rendered bars, so they follow the layout at any width.
  function drawArrows(rows) {
    const gantt = contentEl.querySelector('.gantt');
    if (!gantt) return;
    const previous = gantt.querySelector('.gantt-arrows');
    if (previous) previous.remove();

    const starts = new Map();
    const ends = new Map();
    Array.from(gantt.querySelectorAll('.gantt-bar')).forEach((bar) => {
      if (bar.dataset.startOf) starts.set(bar.dataset.startOf, bar);
      if (bar.dataset.endOf) ends.set(bar.dataset.endOf, bar);
    });

    const box = gantt.getBoundingClientRect();
    const paths = rows
      .filter((row) => row.dependency && ends.has(row.dependency) && starts.has(row.folder))
      .map((row) => {
        const from = ends.get(row.dependency).getBoundingClientRect();
        const to = starts.get(row.folder).getBoundingClientRect();
        const middle = (rect) => rect.top + rect.height / 2 - box.top;
        return component('gantt-arrow-path', { route: arrowPath(from.right - box.left, middle(from), to.left - box.left, middle(to)) });
      });
    if (!paths.length) return;

    gantt.insertAdjacentHTML('beforeend', component('gantt-arrows', { width: box.width, height: box.height, paths: paths.join('') }));
  }

  let drawnRows = [];
  window.addEventListener('resize', () => drawArrows(drawnRows));

  // Puts each project directly below the one it depends on, keeping date order otherwise.
  function orderByDependency(byDate) {
    const onChart = new Set(byDate.map((row) => row.folder));
    const placed = new Set();
    const ordered = [];
    const place = (row) => {
      if (placed.has(row.folder)) return;
      placed.add(row.folder);
      ordered.push(row);
      byDate.filter((child) => child.dependency === row.folder).forEach(place);
    };
    byDate.filter((row) => !onChart.has(row.dependency)).forEach(place);
    byDate.forEach(place); // only reaches anything if a hand-edited file made a loop
    return ordered;
  }

  function warnings(data) {
    const bad = data.filter((row) => row.invalid.length);
    if (!bad.length) return '';
    const items = bad.map((row) =>
      component('gantt-warning-item', {
        title: dependencyTitle(row.folder),
        values: row.invalid.map((value) => component('gantt-warning-value', { value })).join(', '),
      })
    );
    return component('gantt-warning', { items: items.join('') });
  }

  function render(data) {
    const byDate = data
      .filter((row) => row.ranges.length)
      .map((row) =>
        Object.assign({}, row, {
          bars: row.ranges.map((r) => ({ raw: r.raw, first: r.first, last: r.last })),
        })
      )
      .map((row) => Object.assign(row, { earliest: Math.min(...row.bars.map((b) => b.first)) }))
      .sort((a, b) => a.earliest - b.earliest);
    const rows = orderByDependency(byDate);

    if (!rows.length) {
      contentEl.innerHTML = component('gantt-empty', { warnings: warnings(data) });
      return;
    }

    const today = new Date();
    const now = today.getFullYear() * 12 + today.getMonth();
    const allBars = rows.flatMap((row) => row.bars);
    const start = Math.min(now, ...allBars.map((b) => b.first)) - 1;
    const end = Math.max(now, ...allBars.map((b) => b.last)) + 1;

    const previous = document.getElementById('gantt-scroll');
    const keptScroll = previous ? previous.scrollLeft : undefined;
    const keptTop = previous ? previous.scrollTop : 0;

    contentEl.innerHTML = component('gantt-chart', {
      warnings: warnings(data),
      months: end - start + 1,
      rows: headerRows(start, end, now) + rows.map((row) => projectRow(row, start, end, now)).join(''),
      legend: component('legend', {
        items: legendItems() + component('legend-no-milestones') + (rows.some((row) => row.dependency) ? component('legend-depends') : ''),
      }),
    });

    drawnRows = rows;
    drawArrows(rows);

    // Opens around the current month, and stays where it was scrolled to on a refresh.
    const scroller = document.getElementById('gantt-scroll');
    if (keptScroll !== undefined) {
      scroller.scrollLeft = keptScroll;
      scroller.scrollTop = keptTop;
      return;
    }
    const current = scroller.querySelector('.gantt-month.is-now');
    const label = scroller.querySelector('.gantt-label');
    if (current && label) scroller.scrollLeft = Math.max(0, current.offsetLeft - label.offsetWidth - current.offsetWidth);
  }

  function load() {
    return getJson('api/timeline')
      .then((data) => {
        window.PMS.setDateFormat(data.dateFormat);
        render(data.rows);
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the timeline', err);
      });
  }

  status.onChange(load); // ticking a task off changes a project's milestone colours
  load();
})();
