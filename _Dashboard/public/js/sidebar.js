// Right-hand sidebar: status-prefixed todo items from every project.
(function () {
  'use strict';
  const { presentTypes, parseFolder, markdown, status, component, getJson } = window.PMS;

  const root = document.getElementById('todo-sidebar');
  if (!root) return;

  const STORAGE_KEY = 'pms.sidebar.' + (window.PMS_ENTITY || ''); // its filters name this entity's projects and tentacles
  const DEFAULT_SORT = 'project';
  // Sort values saved by earlier versions, and what they've become. Anything else, such as the
  // old "first" orders, goes back to the default.
  const OLD_SORTS = { file: 'project', 'by-status': 'status', 'by-type': 'type' };
  const NO_PRIORITY = 'none';
  // The filter's dropdowns, in the order they're laid out. Any number of choices can be
  // ticked in each. Ticking none in Status, Priority, Tentacle or Project lets everything through.
  const FILTERS = [
    ['type', 'Type'],
    ['status', 'Status'],
    ['priority', 'Priority'],
    ['tentacle', 'Tentacle'],
    ['project', 'Project'],
  ];
  const HIGHLIGHT_NOTES = {
    milestone: 'Named in the latest focus',
    project: 'Its project is in the latest focus',
    inactive: 'Its project is not active',
  };

  let statuses = [];
  let types = [];
  let priorities = [];
  let items = [];
  // The filter. `shown` holds the ticked status types, or null until the first load ticks
  // every type but ARCHIVED.
  let shown = null;
  let picked = { status: [], priority: [], tentacle: [], project: [] };
  let sort = DEFAULT_SORT;
  let shellReady = false;

  const isArchived = (type) => type === 'ARCHIVED';
  const isDone = (type) => type === 'DONE';

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      if (Array.isArray(saved.shown)) shown = new Set(saved.shown.filter((t) => typeof t === 'string'));
      if (saved.picked && typeof saved.picked === 'object') {
        Object.keys(picked).forEach((key) => {
          const value = saved.picked[key];
          // Older versions saved one choice per dropdown, with '' for All.
          if (typeof value === 'string') picked[key] = value ? [value] : [];
          else if (Array.isArray(value)) picked[key] = value.filter((v) => typeof v === 'string');
        });
      }
      if (typeof saved.sort === 'string') sort = saved.sort;
    } catch (_) {
      /* storage unavailable: use defaults */
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ shown: [...shown], picked, sort }));
    } catch (_) {
      /* storage unavailable: choices just won't persist */
    }
  }

  // Items from a tentacle's own files, Contacts or Events belong to no project.
  const projectOf = (item) => (item.tentacle || item.networking ? null : item.folder);

  // Each dropdown's test for one choice. An item passes a dropdown if it matches any ticked
  // choice, or if nothing is ticked.
  const TESTS = {
    status: (item, value) => item.status === value,
    priority: (item, value) => (value === NO_PRIORITY ? !item.priority : item.priority === value),
    tentacle: (item, value) => item.tentacleName === value,
    project: (item, value) => projectOf(item) === value,
  };

  // `except` leaves one dropdown out, to count what each of its choices would show.
  const passes = (item, except) =>
    (except === 'type' || shown.has(item.type)) &&
    Object.keys(TESTS).every((key) => key === except || !picked[key].length || picked[key].some((value) => TESTS[key](item, value)));

  const visibleItems = () => items.filter((item) => passes(item));

  const byText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  // Earlier comes first, and nothing comes last.
  const byMissingLast = (a, b) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);
  // The YYYY-MM-DD a task is scheduled or due, the start of a range, or null.
  const dateOf = (item, kind) => {
    const found = item.dates.find((d) => d.kind === kind);
    const day = found && found.value.match(/\d{4}-\d{2}-\d{2}/);
    return day ? day[0] : null;
  };
  const statusRank = (item) => statuses.findIndex((s) => s.name === item.status);

  // The Sort list, in order, each with how it compares two items.
  const SORTS = [
    ['project', 'Project', (a, b) => byText(status.itemLink(a).label, status.itemLink(b).label)],
    ['status', 'Status (alphabetical)', (a, b) => byText(a.status || '', b.status || '')],
    ['type', 'Status (type)', (a, b) => types.indexOf(a.type) - types.indexOf(b.type) || statusRank(a) - statusRank(b)],
    ['priority', 'Priority', (a, b) => byMissingLast(a.priority || null, b.priority || null)],
    ['scheduled', 'Scheduled date', (a, b) => byMissingLast(dateOf(a, 'SCHEDULED'), dateOf(b, 'SCHEDULED'))],
    ['deadline', 'Deadline date', (a, b) => byMissingLast(dateOf(a, 'DEADLINE'), dateOf(b, 'DEADLINE'))],
  ];

  // Array#sort is stable, so ties keep file order.
  function sorted(list) {
    const chosen = SORTS.find(([value]) => value === sort) || SORTS[0];
    return list.slice().sort(chosen[2]);
  }

  const byLabel = (a, b) => a[1].localeCompare(b[1]);

  function tentacleList() {
    const names = [...new Set(items.map((i) => i.tentacleName).filter(Boolean))];
    return names.map((name) => [name, name]).sort(byLabel);
  }

  // Projects with items of a ticked type, and only those of the ticked tentacles if there are any.
  function projectList() {
    const folders = new Set(items.filter((i) => projectOf(i) && shown.has(i.type) && (!picked.tentacle.length || picked.tentacle.includes(i.tentacleName))).map(projectOf));
    return [...folders].map((folder) => [folder, parseFolder(folder).title]).sort(byLabel);
  }

  // Each dropdown's choices as [value, label] pairs.
  const CHOICES = {
    type: () => types.map((t) => [t, t]),
    status: () => statuses.map((s) => [s.name, s.name]),
    priority: () => [...priorities.map((p) => [p, p]), [NO_PRIORITY, 'None']],
    tentacle: tentacleList,
    project: projectList,
  };

  const isTicked = (key, value) => (key === 'type' ? shown.has(value) : picked[key].includes(value));

  // How many items a choice would show alongside the other dropdowns.
  function count(key, value) {
    const test = key === 'type' ? (item) => item.type === value : (item) => TESTS[key](item, value);
    return items.filter((item) => passes(item, key) && test(item)).length;
  }

  // What the dropdown's button says: All, None, or the ticked choices' names.
  function summary(key, list) {
    const ticked = list.filter(([value]) => isTicked(key, value)).map(([, label]) => label);
    if (key === 'type') return ticked.length === list.length ? 'All' : ticked.length ? ticked.join(', ') : 'None';
    return ticked.length ? ticked.join(', ') : 'All';
  }

  function renderFilter(key) {
    const list = CHOICES[key]();
    const options = list.map(([value, label]) => {
      const on = isTicked(key, value);
      return component('multi-option', { on, checked: String(on), value, label, count: count(key, value) });
    });
    root.querySelector('#todo-' + key).innerHTML = list.length
      ? component('multi-options', { all: 'Show all', options: options.join('') })
      : component('multi-empty', { message: 'Nothing to choose from.' });
    const text = summary(key, list);
    const valueEl = root.querySelector('#todo-' + key + '-value');
    valueEl.textContent = text;
    valueEl.title = text;
  }

  // Ticks or unticks one choice. Unticking the last choice of a dropdown other than Type
  // shows everything again.
  function toggleChoice(key, value) {
    if (key === 'type') {
      if (shown.has(value)) shown.delete(value);
      else shown.add(value);
      return;
    }
    picked[key] = picked[key].includes(value) ? picked[key].filter((v) => v !== value) : picked[key].concat(value);
  }

  function showAll(key) {
    if (key === 'type') shown = new Set(types);
    else picked[key] = [];
  }

  // Done items always stay below the divider, whichever order is chosen.
  const sortOptions = () => SORTS.map(([value, label]) => component('option', { value, label, selected: value === sort })).join('');

  // Drops any choice that no longer exists, such as a renamed status or a closed project.
  function validateChoices() {
    if (!shown) shown = new Set(types.filter((t) => !isArchived(t)));
    const known = {
      status: statuses.map((s) => s.name),
      priority: [...priorities, NO_PRIORITY],
      tentacle: tentacleList().map(([value]) => value),
      project: projectList().map(([value]) => value),
    };
    Object.keys(picked).forEach((key) => {
      picked[key] = picked[key].filter((value) => known[key].includes(value));
    });
    if (OLD_SORTS[sort]) sort = OLD_SORTS[sort];
    if (!SORTS.some(([value]) => value === sort)) sort = DEFAULT_SORT;
  }

  // How long each recurring unit is, in days, near enough to pick how early it's highlighted.
  const UNIT_DAYS = { D: 1, W: 7, M: 30, Y: 365 };
  // How many days before its date a recurring task is highlighted, by how often it comes round:
  // more often than weekly only on the day, weekly up to monthly from the day before, and
  // monthly (4 weeks counts) or less often from a week before.
  const leadDays = (recur) => {
    const period = recur ? recur.count * UNIT_DAYS[recur.unit] : 0;
    return period >= 28 ? 7 : period >= 7 ? 1 : 0;
  };
  // Past its date it's overdue, and more than this many days past it's late.
  const RECUR_LATE_DAYS = 3;
  const DAY_MS = 24 * 60 * 60 * 1000;
  // Whole days from today to an ISO date, by the calendar, so the time of day doesn't matter.
  const daysUntil = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    const now = new Date();
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / DAY_MS);
  };

  // 'late', 'overdue', 'due' or null, for an open recurring task, from its SCHEDULED date.
  function recurState(item) {
    if (item.priority !== 'R' || isDone(item.type) || isArchived(item.type)) return null;
    const scheduled = item.dates.find((d) => d.kind === 'SCHEDULED');
    const day = scheduled && scheduled.value.slice(0, 10);
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    const days = daysUntil(day);
    if (days < -RECUR_LATE_DAYS) return 'late';
    if (days < 0) return 'overdue';
    return days <= leadDays(item.recur) ? 'due' : null;
  }
  const RECUR_NOTES = {
    late: 'Recurring task, more than ' + RECUR_LATE_DAYS + ' days overdue',
    overdue: 'Recurring task, overdue',
    due: 'Recurring task, due soon',
  };

  function renderItem(item) {
    const { label, href } = status.itemLink(item);
    const recur = recurState(item);
    return component('todo-item', {
      recur,
      note: recur ? RECUR_NOTES[recur] : HIGHLIGHT_NOTES[item.highlight],
      ticked: item.mark === 'x',
      tint: recur ? null : item.highlight,
      checkbox: item.mark === null ? '' : status.checkbox(item),
      control: status.control(item),
      menu: status.rowMenu(item), // Cancel and Delete only, here
      href,
      location: item.file + ', line ' + item.line,
      label,
      text: item.text ? markdown.inline(item.text) : '',
      dates: item.dates.map((d) => component('todo-date', { kind: d.kind, value: window.PMS.displayDates(d.value) })).join(''),
    });
  }

  // The same todo in the collapsed rail, where only its icon shows.
  function railItem(item) {
    const { label, href } = status.itemLink(item);
    const recur = recurState(item);
    return component('todo-rail-item', {
      icon: status.iconOf(item),
      href,
      title: label + (item.text ? ': ' + item.text : ''),
      recur,
      tint: recur ? null : item.highlight,
    });
  }

  // Redraws the filter's choices, whose counts depend on each other, and then the list.
  function renderList() {
    FILTERS.forEach(([key]) => renderFilter(key));
    const list = sorted(visibleItems());
    // Late recurring tasks come first, then overdue, then due, each in the chosen order.
    const rank = (i) => ({ late: 0, overdue: 1, due: 2 }[recurState(i)] ?? 3);
    const open = list.filter((i) => !isDone(i.type)).sort((a, b) => rank(a) - rank(b));
    const done = list.filter((i) => isDone(i.type));
    root.querySelector('#todo-count').textContent = list.length;
    root.querySelector('#todo-rail').innerHTML = open.concat(done).map(railItem).join('');
    root.querySelector('#todo-list').innerHTML = list.length
      ? open.map(renderItem).join('') + (done.length ? component('todo-divider') + done.map(renderItem).join('') : '')
      : component('empty-item', { message: 'Nothing here.' });
  }

  const changed = () => {
    validateChoices(); // a new tentacle can rule out the chosen project
    savePrefs();
    renderList();
  };

  const openDropdowns = () => Array.from(root.querySelectorAll('.multi-select[open]'));

  function renderShell() {
    const filters = FILTERS.map(([key, label]) => component('multi-select', { key, label })).join('');
    root.innerHTML = component('sidebar-shell', { filters, sort: sortOptions() });
    const controls = root.querySelector('.sidebar-controls');
    root.querySelector('#todo-sort').addEventListener('change', (e) => {
      sort = e.target.value;
      changed();
    });
    controls.addEventListener('click', (e) => {
      const dropdown = e.target.closest('.multi-select');
      if (!dropdown) return;
      const key = dropdown.dataset.filter;
      let focus;
      if (e.target.closest('[data-all]')) {
        showAll(key);
        focus = '[data-all]';
      } else {
        const choice = e.target.closest('.multi-option');
        if (!choice) return;
        e.preventDefault(); // a click on the label would otherwise click the box a second time
        const value = choice.querySelector('[data-value]').dataset.value;
        toggleChoice(key, value);
        focus = '[data-value="' + CSS.escape(value) + '"]';
      }
      changed();
      const target = dropdown.querySelector(focus); // the choices were redrawn
      if (target) target.focus();
    });
    // Only one dropdown is open at a time. <details> toggle events don't bubble.
    controls.addEventListener(
      'toggle',
      (e) => {
        if (e.target.open) openDropdowns().forEach((d) => d !== e.target && (d.open = false));
      },
      true
    );
    controls.addEventListener('keydown', (e) => {
      const dropdown = e.key === 'Escape' && e.target.closest('.multi-select[open]');
      if (!dropdown) return;
      dropdown.open = false;
      dropdown.querySelector('summary').focus();
    });
  }

  // A click anywhere on a todo opens its task, as its grey link does. Its status, priority,
  // tick box and menu keep their own clicks, as do links in its text, and a click that only
  // closes an open menu or finishes selecting text goes no further.
  root.addEventListener('click', (e) => {
    const row = e.target.closest('li.todo');
    if (!row || e.target.closest('a, button, input, select, .status-control, .status-menu')) return;
    if (document.querySelector('.status-menu') || String(window.getSelection())) return;
    const link = row.querySelector('.todo-project');
    if (!link) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) window.open(link.href, '_blank');
    else location.assign(link.href);
  });

  // A click anywhere outside an open dropdown closes it. Ticking a choice redraws the
  // choices, so a click whose target has gone was inside one.
  document.addEventListener('click', (e) => {
    if (!e.target.isConnected) return;
    openDropdowns().forEach((d) => {
      if (!d.contains(e.target)) d.open = false;
    });
  });

  function showMessage(text) {
    shellReady = false;
    root.innerHTML = component('sidebar-message', { text });
  }

  function load() {
    return getJson('api/todos')
      .then((data) => {
        window.PMS.setDateFormat(data.dateFormat);
        statuses = data.statuses;
        types = presentTypes(statuses);
        priorities = data.priorities || [];
        items = data.items;
        status.setStatuses(statuses);
        validateChoices();
        if (shellReady) {
          // Refresh in place so the list keeps its scroll position.
          root.querySelector('#todo-sort').innerHTML = sortOptions();
        } else {
          renderShell();
          shellReady = true;
        }
        renderList();
      })
      .catch((err) => showMessage('Could not load todos (' + err.message + ').'));
  }

  loadPrefs();
  status.onChange(load);
  load();
})();
