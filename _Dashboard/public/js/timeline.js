// The Timeline on the Home page: a month-accurate Gantt chart of every project's Active Timeframes.
// A tentacle page has one too, with data-tentacle on its element: only that tentacle's own
// projects, and no event or release lines.
(function () {
  'use strict';
  const { parseFolder, STATUS_LABELS, legendItems, dependencyTitle, dependencyHref, markdown: md, status, component, getJson, loadError } = window.PMS;

  const contentEl = document.getElementById('timeline');
  if (!contentEl) return;
  const tentacle = contentEl.dataset.tentacle || '';
  const LINE_KINDS = ['deadlines', 'bookings', 'releases'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // The same states and colours as the milestone progress bar.
  const STATE_COLOURS = { done: 'var(--complete)', partial: 'var(--caution)', todo: 'var(--pending)', none: 'var(--alert)' };

  // Grades the bar through the project's milestones, left to right. A bar for a project
  // with no milestones keeps the plain bar colour.
  function barBackground(milestones) {
    if (!milestones.length) return 'var(--surface-raised)';
    const colours = milestones.map((m) => STATE_COLOURS[m.state]);
    if (colours.length === 1) return colours[0];
    const stops = colours.map((c, i) => c + ' ' + (((i + 0.5) / colours.length) * 100).toFixed(1) + '%');
    return 'linear-gradient(to right, ' + stops.join(', ') + ')';
  }

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

  function projectRow(row, index, start, end, now) {
    const { archive } = row;
    const archived = row.kind === 'archive';
    // A Date Closed archives a project whatever its folder is called.
    const info = archive ? { title: archive.title, status: 'archived' } : Object.assign(parseFolder(row.folder), archived ? { status: 'archived' } : {});
    const href = archive ? dependencyHref(row.folder) : 'project.html?folder=' + encodeURIComponent(row.folder) + '&file=' + encodeURIComponent(row.file);
    const bars = assignLanes(row.bars);
    const lanes = Math.max(...bars.map((b) => b.lane)) + 1;
    const column = (i) => i - start + 2; // column 1 holds the project name
    const milestones = md.parseMilestones(row.content).milestones;
    // A timeframe limited to some milestones is coloured, and described, by those alone.
    const key = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
    const covered = (bar) => (bar.milestones ? milestones.filter((m) => bar.milestones.some((name) => key(name) === key(m.title))) : milestones);
    // An archived project is finished, so it takes the complete colour.
    const backgroundOf = (bar) => (archived ? STATE_COLOURS.done : barBackground(covered(bar)));
    const summaryOf = (bar) => (archived ? 'archived' : (bar.milestones ? bar.milestones.join(', ') + ': ' : '') + progressText(covered(bar)));
    // Dependency arrows leave the project's last bar and arrive at its first.
    const lastBar = bars.reduce((a, b) => (b.last > a.last ? b : a));
    const firstBar = bars.reduce((a, b) => (b.first < a.first ? b : a));
    const dependsOn = row.dependency ? ' · depends on ' + dependencyTitle(row.dependency) : '';
    return component('gantt-project', {
      index,
      lanes,
      href,
      title: info.title,
      pill: component('pill', { status: info.status, label: STATUS_LABELS[info.status] }),
      now: now >= start && now <= end ? component('gantt-now', { column: column(now), lanes }) : '',
      // Bars come in date order, which is the order their arrows join them in.
      bars: bars
        .map((bar, order) =>
          component('gantt-bar', {
            order,
            href,
            detail: info.title + ': ' + window.PMS.displayDates(bar.raw) + ' (' + summaryOf(bar) + ')' + dependsOn,
            isLast: bar === lastBar,
            isFirst: bar === firstBar,
            folder: row.folder,
            background: backgroundOf(bar),
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
    // Two timeframes next to each other in one lane: a short straight join.
    if (y1 === y2 && x2 >= x1) return 'M' + x1 + ' ' + y1 + 'H' + Math.max(x2, x1 + 1);
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
    Array.from(gantt.querySelectorAll('.gantt-project:not([hidden]) .gantt-bar')).forEach((bar) => {
      if (bar.dataset.startOf) starts.set(bar.dataset.startOf, bar);
      if (bar.dataset.endOf) ends.set(bar.dataset.endOf, bar);
    });

    const box = gantt.getBoundingClientRect();
    const middle = (rect) => rect.top + rect.height / 2 - box.top;
    const join = (fromBar, toBar) => {
      const from = fromBar.getBoundingClientRect();
      const to = toBar.getBoundingClientRect();
      return component('gantt-arrow-path', { route: arrowPath(from.right - box.left, middle(from), to.left - box.left, middle(to)) });
    };
    const paths = rows.filter((row) => row.dependency && ends.has(row.dependency) && starts.has(row.folder)).map((row) => join(ends.get(row.dependency), starts.get(row.folder)));
    // A project with more than one timeframe has each joined to the next, whatever it depends on.
    Array.from(gantt.querySelectorAll('.gantt-project:not([hidden])')).forEach((project) => {
      const own = Array.from(project.querySelectorAll('.gantt-bar[data-order]')).sort((a, b) => a.dataset.order - b.dataset.order);
      for (let i = 1; i < own.length; i++) paths.push(join(own[i - 1], own[i]));
    });
    if (!paths.length) return;

    gantt.insertAdjacentHTML('beforeend', component('gantt-arrows', { width: box.width, height: box.height, paths: paths.join('') }));
  }

  let drawnRows = [];

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

  // ---------- which rows are shown ----------

  // Archived projects only come from the server while SHOWARCHIVED is on, so only then is
  // there anything for the Archive box to hide. The last three are lines rather than rows.
  const KINDS = [
    { kind: 'active', label: 'Active' },
    { kind: 'inactive', label: 'Inactive' },
    { kind: 'archive', label: 'Archive' },
    { kind: 'deadlines', label: 'Deadlines' },
    { kind: 'bookings', label: 'Bookings' },
    { kind: 'releases', label: 'Releases' },
  ].filter(({ kind }) => (kind !== 'archive' || window.PMS_SHOW_ARCHIVED) && !(tentacle && LINE_KINDS.includes(kind)));
  const HIDDEN_KEY = 'pms.timeline.hidden';
  function readHidden() {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY));
      return Array.isArray(saved) ? saved : [];
    } catch (_) {
      return [];
    }
  }
  const hidden = new Set(readHidden());

  function saveHidden() {
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
    } catch (_) {
      /* storage unavailable: the choice lasts until the page is left */
    }
  }

  // Grouping the projects by the tentacles at one level, on the Dashboard: '' for none, or the
  // level, 0 being the top-level tentacles. A tentacle page's Timeline has only one tentacle,
  // so it has no dropdown. Kept in this browser; 'pms.timeline.grouped' was the tick box it
  // replaced, which grouped by the top level.
  const GROUP_LEVELS = [['', 'None'], ['0', 'Parent'], ['1', 'Child'], ['2', 'Grandchild']];
  const GROUP_KEY = 'pms.timeline.groupBy';
  let groupBy = (() => {
    if (tentacle) return '';
    try {
      const saved = localStorage.getItem(GROUP_KEY);
      if (saved === null) return localStorage.getItem('pms.timeline.grouped') === 'true' ? '0' : '';
      return GROUP_LEVELS.some(([value]) => value === saved) ? saved : '';
    } catch (_) {
      return '';
    }
  })();
  const groupSelect = () =>
    tentacle
      ? ''
      : component('gantt-group-by', {
          options: GROUP_LEVELS.map(([value, label]) => component('option', { value, label, selected: value === groupBy })).join(''),
        });

  const toggles = () =>
    component('gantt-toggles', {
      boxes:
        KINDS.map(({ kind, label }) => {
          const on = !hidden.has(kind);
          return component('gantt-toggle', { kind, label, on, checked: String(on) });
        }).join(''),
      group: groupSelect(),
      zooms: ZOOMS.map((months) => component('gantt-zoom', { months, pressed: String(months === zoom) })).join(''),
    });

  // ---------- zoom, and which rows are near the months on screen ----------

  // How many months fit across the chart. The choice is kept in this browser.
  const ZOOMS = [3, 6, 12];
  const ZOOM_KEY = 'pms.timeline.zoom';
  const MIN_MONTH_WIDTH = 20; // px, so a very narrow screen still shows something
  const NEARBY_MONTHS = 2; // a row stays while a timeframe is this close to the months shown
  let zoom = (() => {
    try {
      const saved = Number(localStorage.getItem(ZOOM_KEY));
      return ZOOMS.includes(saved) ? saved : 6;
    } catch (_) {
      return 6;
    }
  })();

  let chart = null; // { start, monthWidth } for the chart on screen

  const scrollerEl = () => document.getElementById('gantt-scroll');
  const labelWidth = (scroller) => {
    const label = scroller.querySelector('.gantt-label');
    return label ? label.offsetWidth : 0;
  };

  // Sets the month width so that `zoom` months fill the space beside the names.
  function applyZoom() {
    const scroller = scrollerEl();
    if (!scroller || !chart) return;
    chart.monthWidth = Math.max(MIN_MONTH_WIDTH, (scroller.clientWidth - labelWidth(scroller)) / zoom);
    scroller.querySelector('.gantt').style.setProperty('--gantt-month', chart.monthWidth + 'px');
  }

  // The first month on screen, counted like the bars' months, with a fraction for a month
  // partly scrolled past.
  function firstShownMonth() {
    const scroller = scrollerEl();
    return scroller && chart ? chart.start + scroller.scrollLeft / chart.monthWidth : null;
  }

  function scrollToMonth(month) {
    const scroller = scrollerEl();
    if (scroller && chart) scroller.scrollLeft = Math.max(0, (month - chart.start) * chart.monthWidth);
  }

  // Hides each row with no timeframe within NEARBY_MONTHS of the months on screen, so the
  // chart only grows as tall as the stretch of time being looked at.
  function showNearbyRows() {
    const scroller = scrollerEl();
    if (!scroller || !chart) return;
    const first = Math.floor(firstShownMonth()) - NEARBY_MONTHS;
    const last = Math.ceil(firstShownMonth() + (scroller.clientWidth - labelWidth(scroller)) / chart.monthWidth) + NEARBY_MONTHS;
    let shown = 0;
    scroller.querySelectorAll('.gantt-project').forEach((el) => {
      const row = drawnRows[Number(el.dataset.row)];
      const near = showEverything || row.bars.some((bar) => bar.last >= first && bar.first <= last);
      el.hidden = !near;
      if (near) shown++;
    });
    // A group's heading goes with its projects: hidden when none of them are showing.
    scroller.querySelectorAll('.gantt-group').forEach((heading) => {
      let next = heading.nextElementSibling;
      let any = false;
      for (; next && next.classList.contains('gantt-project'); next = next.nextElementSibling) any = any || !next.hidden;
      heading.hidden = !any;
    });
    document.getElementById('gantt-none').hidden = shown > 0 || !drawnRows.length;
    drawArrows(drawnRows);
  }

  // ---------- the chart's height ----------

  // Dragging the handle under the chart sets how tall it can grow before it scrolls. Kept in
  // this browser, separately for a tentacle page; double-click the handle to go back to 12 rows.
  const HEIGHT_KEY = 'pms.timeline.height' + (tentacle ? '.tentacle' : '');
  const MIN_HEIGHT = 150; // px: the headings and a few rows
  const HEIGHT_STEP = 35; // px: one row, for the arrow keys
  let height = (() => {
    try {
      const saved = Number(localStorage.getItem(HEIGHT_KEY));
      return saved >= MIN_HEIGHT ? saved : null;
    } catch (_) {
      return null;
    }
  })();

  function applyHeight() {
    const scroller = scrollerEl();
    if (!scroller) return;
    if (height === null) scroller.style.removeProperty('--gantt-height');
    else scroller.style.setProperty('--gantt-height', height + 'px');
  }

  function setHeight(px) {
    height = px === null ? null : Math.max(MIN_HEIGHT, Math.round(px));
    applyHeight();
    try {
      if (height === null) localStorage.removeItem(HEIGHT_KEY);
      else localStorage.setItem(HEIGHT_KEY, String(height));
    } catch (_) {
      /* storage unavailable: the height lasts until the page is left */
    }
  }

  // The pointer's movement is added to the height the chart had when the drag began.
  contentEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('[data-gantt-resize]');
    if (!handle || e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = scrollerEl().getBoundingClientRect().height;
    handle.setPointerCapture(e.pointerId);
    handle.classList.add('is-dragging');
    const move = (ev) => setHeight(startHeight + ev.clientY - startY);
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      handle.classList.remove('is-dragging');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });

  contentEl.addEventListener('dblclick', (e) => {
    if (e.target.closest('[data-gantt-resize]')) setHeight(null);
  });

  // Up and Down on a focused handle make the chart a row shorter or taller.
  contentEl.addEventListener('keydown', (e) => {
    if (!e.target.closest('[data-gantt-resize]') || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    setHeight(scrollerEl().getBoundingClientRect().height + (e.key === 'ArrowDown' ? HEIGHT_STEP : -HEIGHT_STEP));
  });

  // Generate report copies the chart as it looks, so it asks for every row (and its arrows)
  // while it makes the copy, then for the usual view again.
  let showEverything = false;
  window.addEventListener('pms:report-start', () => {
    showEverything = true;
    showNearbyRows();
  });
  window.addEventListener('pms:report-end', () => {
    showEverything = false;
    showNearbyRows();
  });

  let pending = false;
  function onScroll() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      showNearbyRows();
    });
  }

  // A new width keeps the same month at the left edge.
  window.addEventListener('resize', () => {
    const first = firstShownMonth();
    applyZoom();
    if (first !== null) scrollToMonth(first);
    showNearbyRows();
  });

  // ---------- event and release lines ----------

  // Where a YYYY-MM-DD date falls, in months from the chart's first month: its month, plus
  // how far through that month it is. `after` places it at the end of the day instead.
  function monthPosition(date, start, after) {
    const [y, m, d] = date.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return y * 12 + m - 1 - start + (d - (after ? 0 : 1)) / days;
  }

  const monthOfDate = (date) => {
    const [y, m] = date.split('-').map(Number);
    return y * 12 + m - 1;
  };

  // A cyan line at each application deadline still to meet, and a line at each event, or a
  // band with a line at each end for an event of several days: purple once it's booked,
  // and grey until then.
  function eventMarks(events, start) {
    const show = window.PMS.displayDate;
    return events
      .flatMap((e) => {
        const marks = [];
        const kind = e.booked ? 'event' : 'unbooked';
        const note = e.booked ? '' : ' (not booked)';
        if (e.deadline && !hidden.has('deadlines')) marks.push(component('gantt-mark', { kind: 'deadline', at: monthPosition(e.deadline, start).toFixed(4), title: e.title + ': application deadline ' + show(e.deadline) }));
        if (hidden.has('bookings')) return marks;
        if (e.start && e.end !== e.start) {
          marks.push(component('gantt-span', { kind, from: monthPosition(e.start, start).toFixed(4), to: monthPosition(e.end, start, true).toFixed(4), title: e.title + ': ' + show(e.start) + ' – ' + show(e.end) + note }));
        } else if (e.start) {
          marks.push(component('gantt-mark', { kind, at: monthPosition(e.start, start).toFixed(4), title: e.title + ': ' + show(e.start) + note }));
        }
        return marks;
      })
      .join('');
  }

  // A white line on each catalog release's day, with its cover on hover.
  function releaseMarks(releases, start) {
    return releases
      .map((r) => component('gantt-release', { at: monthPosition(r.date, start).toFixed(4), title: r.title, date: window.PMS.displayDate(r.date), image: r.image }))
      .join('');
  }

  let lastData = null;

  // The project rows, each group's after its heading when grouped, in its tentacle's level
  // colour. Rows are numbered across the groups, as `data-row` indexes `drawnRows`.
  function projectRows(groups, start, end, now) {
    let index = 0;
    const heading = (g) =>
      component('gantt-group', { name: g.tentacle ? g.tentacle.name : 'Other', level: g.tentacle ? (g.tentacle.level > 2 ? 'deep' : g.tentacle.level) : 'deep' });
    return groups
      .map((g) => (groupBy !== '' ? heading(g) : '') + g.rows.map((row) => projectRow(row, index++, start, end, now)).join(''))
      .join('');
  }

  // The tentacle a row is grouped under at `level`: its own tentacle's ancestor at that level,
  // or its own tentacle if that's higher up, or null (Other) if its tentacle isn't known.
  const groupOf = (row, level) => (row.chain ? row.chain[Math.min(level, row.chain.length - 1)] : null);

  function render(data) {
    lastData = data;
    const shownRows = data.rows.filter((row) => !hidden.has(row.kind));
    const byDate = shownRows
      .filter((row) => row.ranges.length)
      .map((row) =>
        Object.assign({}, row, {
          bars: row.ranges.map((r) => ({ raw: r.dates || r.raw, milestones: r.milestones, first: r.first, last: r.last })),
        })
      )
      .map((row) => Object.assign(row, { earliest: Math.min(...row.bars.map((b) => b.first)) }))
      .sort((a, b) => a.earliest - b.earliest);
    // Grouped, the projects under each tentacle at the chosen level come together, in the
    // menu's tentacle order, with any whose tentacle isn't known last. Each group keeps the
    // usual order within it.
    const tree = data.groups || [];
    const level = Number(groupBy);
    const known = (id) => tree.some((t) => t.id === id);
    const groups =
      groupBy !== ''
        ? [...tree, null]
            .map((t) => ({ tentacle: t, rows: orderByDependency(byDate.filter((row) => (t ? groupOf(row, level) === t.id : !known(groupOf(row, level))))) }))
            .filter((g) => g.rows.length)
        : [{ tentacle: null, rows: orderByDependency(byDate) }];
    const rows = groups.flatMap((g) => g.rows);
    const events = data.events || [];
    const releases = hidden.has('releases') ? [] : data.releases || [];

    if (!rows.length && !events.length && !releases.length) {
      contentEl.innerHTML = toggles() + component('gantt-empty', { warnings: warnings(shownRows) });
      return;
    }

    const today = new Date();
    const now = today.getFullYear() * 12 + today.getMonth();
    const allBars = rows.flatMap((row) => row.bars);
    const eventMonths = events.flatMap((e) => [e.start, e.end, e.deadline].filter(Boolean)).concat(releases.map((r) => r.date)).map(monthOfDate);
    const start = Math.min(now, ...allBars.map((b) => b.first), ...eventMonths) - 1;
    const end = Math.max(now, ...allBars.map((b) => b.last), ...eventMonths) + 1;

    const previous = scrollerEl();
    const keptMonth = previous ? firstShownMonth() : null;
    const keptTop = previous ? previous.scrollTop : 0;

    const legend = [
      legendItems(),
      component('legend-no-milestones'),
      rows.some((row) => row.kind === 'archive') ? component('legend-archived') : '',
      rows.some((row) => row.dependency) ? component('legend-depends') : '',
      ...(tentacle
        ? []
        : [
            component('legend-line', { kind: 'deadline', label: 'Application deadline' }),
            component('legend-line', { kind: 'event', label: 'Booked event' }),
            component('legend-line', { kind: 'unbooked', label: 'Event not booked' }),
            component('legend-line', { kind: 'release', label: 'Release' }),
          ]),
    ];
    contentEl.innerHTML =
      toggles() +
      component('gantt-chart', {
        warnings: warnings(shownRows),
        months: end - start + 1,
        rows: headerRows(start, end, now) + projectRows(groups, start, end, now),
        marks: eventMarks(events, start) + releaseMarks(releases, start),
        legend: component('legend', { items: legend.join('') }),
      });

    drawnRows = rows;
    chart = { start, monthWidth: 0 };
    applyHeight();
    applyZoom();

    // Opens with the month before this one at the left, and stays where it was on a refresh.
    const scroller = scrollerEl();
    scrollToMonth(keptMonth !== null ? keptMonth : now - 1);
    scroller.scrollTop = keptTop;
    scroller.addEventListener('scroll', onScroll);
    showNearbyRows();
  }

  contentEl.addEventListener('click', (e) => {
    const zoomChip = e.target.closest('[data-timeline-zoom]');
    if (zoomChip && lastData) {
      zoom = Number(zoomChip.dataset.timelineZoom);
      try {
        localStorage.setItem(ZOOM_KEY, String(zoom));
      } catch (_) {
        /* storage unavailable: the zoom lasts until the page is left */
      }
      render(lastData); // keeps the same month at the left edge
      return;
    }
    const box = e.target.closest('[data-timeline-kind]');
    if (!box || !lastData) return;
    const { timelineKind: kind } = box.dataset;
    if (hidden.has(kind)) hidden.delete(kind);
    else hidden.add(kind);
    saveHidden();
    render(lastData);
  });

  contentEl.addEventListener('change', (e) => {
    const select = e.target.closest('[data-timeline-group]');
    if (!select || !lastData) return;
    groupBy = select.value;
    try {
      localStorage.setItem(GROUP_KEY, groupBy);
    } catch (_) {
      /* storage unavailable: the grouping lasts until the page is left */
    }
    render(lastData);
  });

  const RELEASE_CARD_ROOM = 175; // px: the card's width (see .release-card) and a margin
  // A release's card opens to the left of its line when there's no room on the right.
  contentEl.addEventListener('mouseover', (e) => {
    const mark = e.target.closest('.gantt-mark.is-release');
    const scroller = mark && scrollerEl();
    if (!scroller) return;
    mark.classList.toggle('is-flipped', mark.getBoundingClientRect().right + RELEASE_CARD_ROOM > scroller.getBoundingClientRect().right);
  });

  function load() {
    return getJson('api/timeline' + (tentacle ? '?tentacle=' + encodeURIComponent(tentacle) : ''))
      .then((data) => {
        window.PMS.setDateFormat(data.dateFormat);
        render(data);
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the timeline', err);
      });
  }

  status.onChange(load); // ticking a task off changes a project's milestone colours
  load();
})();
