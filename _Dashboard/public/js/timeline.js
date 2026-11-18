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
    // An archived project is finished, so it takes the complete colour.
    const background = archived ? STATE_COLOURS.done : barBackground(milestones);
    const summary = archived ? 'archived' : progressText(milestones);
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
    Array.from(gantt.querySelectorAll('.gantt-project:not([hidden]) .gantt-bar')).forEach((bar) => {
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
  // there anything for the Archive box to hide.
  const KINDS = [
    { kind: 'active', label: 'Active' },
    { kind: 'inactive', label: 'Inactive' },
    { kind: 'archive', label: 'Archive' },
  ].filter(({ kind }) => kind !== 'archive' || window.PMS_SHOW_ARCHIVED);
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

  const toggles = () =>
    component('gantt-toggles', {
      boxes: KINDS.map(({ kind, label }) => {
        const on = !hidden.has(kind);
        return component('gantt-toggle', { kind, label, on, checked: String(on) });
      }).join(''),
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
      const near = row.bars.some((bar) => bar.last >= first && bar.first <= last);
      el.hidden = !near;
      if (near) shown++;
    });
    document.getElementById('gantt-none').hidden = shown > 0 || !drawnRows.length;
    drawArrows(drawnRows);
  }

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

  // ---------- event lines ----------

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
        if (e.deadline) marks.push(component('gantt-mark', { kind: 'deadline', at: monthPosition(e.deadline, start).toFixed(4), title: e.title + ': application deadline ' + show(e.deadline) }));
        if (e.start && e.end !== e.start) {
          marks.push(component('gantt-span', { kind, from: monthPosition(e.start, start).toFixed(4), to: monthPosition(e.end, start, true).toFixed(4), title: e.title + ': ' + show(e.start) + ' – ' + show(e.end) + note }));
        } else if (e.start) {
          marks.push(component('gantt-mark', { kind, at: monthPosition(e.start, start).toFixed(4), title: e.title + ': ' + show(e.start) + note }));
        }
        return marks;
      })
      .join('');
  }

  let lastData = null;

  function render(data) {
    lastData = data;
    const shownRows = data.rows.filter((row) => !hidden.has(row.kind));
    const byDate = shownRows
      .filter((row) => row.ranges.length)
      .map((row) =>
        Object.assign({}, row, {
          bars: row.ranges.map((r) => ({ raw: r.raw, first: r.first, last: r.last })),
        })
      )
      .map((row) => Object.assign(row, { earliest: Math.min(...row.bars.map((b) => b.first)) }))
      .sort((a, b) => a.earliest - b.earliest);
    const rows = orderByDependency(byDate);
    const events = data.events || [];

    if (!rows.length && !events.length) {
      contentEl.innerHTML = toggles() + component('gantt-empty', { warnings: warnings(shownRows) });
      return;
    }

    const today = new Date();
    const now = today.getFullYear() * 12 + today.getMonth();
    const allBars = rows.flatMap((row) => row.bars);
    const eventMonths = events.flatMap((e) => [e.start, e.end, e.deadline].filter(Boolean).map(monthOfDate));
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
      component('legend-line', { kind: 'deadline', label: 'Application deadline' }),
      component('legend-line', { kind: 'event', label: 'Booked event' }),
      component('legend-line', { kind: 'unbooked', label: 'Event not booked' }),
    ];
    contentEl.innerHTML =
      toggles() +
      component('gantt-chart', {
        warnings: warnings(shownRows),
        months: end - start + 1,
        rows: headerRows(start, end, now) + rows.map((row, i) => projectRow(row, i, start, end, now)).join(''),
        marks: eventMarks(events, start),
        legend: component('legend', { items: legend.join('') }),
      });

    drawnRows = rows;
    chart = { start, monthWidth: 0 };
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

  function load() {
    return getJson('api/timeline')
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
