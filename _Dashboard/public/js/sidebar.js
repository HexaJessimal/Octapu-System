// Right-hand sidebar: status-prefixed todo items from every project.
(function () {
  'use strict';
  const { presentTypes, parseFolder, markdown, status, component, getJson } = window.PMS;

  const root = document.getElementById('todo-sidebar');
  if (!root) return;

  const STORAGE_KEY = 'pms.sidebar';
  const FILE_ORDER = 'file';
  const NO_PRIORITY = 'none';
  // The filter's dropdowns, in the order they're laid out. Any number of choices can be
  // ticked in each. Ticking none in Status, Priority, Entity or Project lets everything through.
  const FILTERS = [
    ['type', 'Type'],
    ['status', 'Status'],
    ['priority', 'Priority'],
    ['entity', 'Entity'],
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
  let picked = { status: [], priority: [], entity: [], project: [] };
  let sort = FILE_ORDER;
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

  // "first-status:JESSIE" -> { kind: 'first-status', name: 'JESSIE' }
  function split(value) {
    const at = value.indexOf(':');
    return { kind: value.slice(0, at), name: value.slice(at + 1) };
  }

  function matches(item, kind, name) {
    return kind === 'status' ? item.status === name : item.type === name;
  }

  // Items from an entity's own files belong to no project.
  const projectOf = (item) => (item.entity ? null : item.folder);

  // Each dropdown's test for one choice. An item passes a dropdown if it matches any ticked
  // choice, or if nothing is ticked.
  const TESTS = {
    status: (item, value) => item.status === value,
    priority: (item, value) => (value === NO_PRIORITY ? !item.priority : item.priority === value),
    entity: (item, value) => item.entityName === value,
    project: (item, value) => projectOf(item) === value,
  };

  // `except` leaves one dropdown out, to count what each of its choices would show.
  const passes = (item, except) =>
    (except === 'type' || shown.has(item.type)) &&
    Object.keys(TESTS).every((key) => key === except || !picked[key].length || picked[key].some((value) => TESTS[key](item, value)));

  const visibleItems = () => items.filter((item) => passes(item));

  function sorted(list) {
    if (sort === FILE_ORDER) return list;
    const copy = list.slice(); // Array#sort is stable, so ties keep file order.
    if (sort === 'by-status') {
      const rank = new Map(statuses.map((s, i) => [s.name, i]));
      return copy.sort((a, b) => rank.get(a.status) - rank.get(b.status));
    }
    if (sort === 'by-type') {
      return copy.sort((a, b) => types.indexOf(a.type) - types.indexOf(b.type));
    }
    const { kind, name } = split(sort); // "first-status:X" / "first-type:X"
    const key = kind.replace('first-', '');
    const rankOf = (i) => (matches(i, key, name) ? 0 : 1);
    return copy.sort((a, b) => rankOf(a) - rankOf(b));
  }

  function option(value, label, selected) {
    return component('option', { value, selected: value === selected, label });
  }

  function group(label, options) {
    return options.length ? component('optgroup', { label, options: options.join('') }) : '';
  }

  const byLabel = (a, b) => a[1].localeCompare(b[1]);

  function entityList() {
    const names = [...new Set(items.map((i) => i.entityName).filter(Boolean))];
    return names.map((name) => [name, name]).sort(byLabel);
  }

  // Projects with items of a ticked type, and only those of the ticked entities if there are any.
  function projectList() {
    const folders = new Set(items.filter((i) => projectOf(i) && shown.has(i.type) && (!picked.entity.length || picked.entity.includes(i.entityName))).map(projectOf));
    return [...folders].map((folder) => [folder, parseFolder(folder).title]).sort(byLabel);
  }

  // Each dropdown's choices as [value, label] pairs.
  const CHOICES = {
    type: () => types.map((t) => [t, t]),
    status: () => statuses.map((s) => [s.name, s.name]),
    priority: () => [...priorities.map((p) => [p, p]), [NO_PRIORITY, 'None']],
    entity: entityList,
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

  function sortOptions() {
    // Archived items are never mixed with others and done items always go last,
    // so putting either of them first would do nothing.
    const liveTypes = types.filter((t) => !isArchived(t) && !isDone(t));
    const liveStatuses = statuses.filter((s) => !isArchived(s.type) && !isDone(s.type));
    return (
      group('Order', [option(FILE_ORDER, 'Project order', sort), option('by-status', 'Status', sort), option('by-type', 'Status type', sort)]) +
      group('Type first', liveTypes.map((t) => option('first-type:' + t, t + ' first', sort))) +
      group('Status first', liveStatuses.map((s) => option('first-status:' + s.name, s.name + ' first', sort)))
    );
  }

  // Drops any choice that no longer exists, such as a renamed status or a closed project.
  function validateChoices() {
    if (!shown) shown = new Set(types.filter((t) => !isArchived(t)));
    const known = {
      status: statuses.map((s) => s.name),
      priority: [...priorities, NO_PRIORITY],
      entity: entityList().map(([value]) => value),
      project: projectList().map(([value]) => value),
    };
    Object.keys(picked).forEach((key) => {
      picked[key] = picked[key].filter((value) => known[key].includes(value));
    });
    if (![FILE_ORDER, 'by-status', 'by-type'].includes(sort)) {
      const { kind, name } = split(sort);
      const key = kind.replace('first-', '');
      const type = key === 'status' ? (statuses.find((s) => s.name === name) || {}).type : name;
      const exists = key === 'status' ? known.status.includes(name) : types.includes(name);
      if (!exists || !type || isArchived(type) || isDone(type)) sort = FILE_ORDER;
    }
  }

  function renderItem(item) {
    const { label, href } = status.itemLink(item);
    return component('todo-item', {
      ticked: item.mark === 'x',
      tint: item.highlight,
      note: HIGHLIGHT_NOTES[item.highlight],
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

  // Redraws the filter's choices, whose counts depend on each other, and then the list.
  function renderList() {
    FILTERS.forEach(([key]) => renderFilter(key));
    const list = sorted(visibleItems());
    const open = list.filter((i) => !isDone(i.type));
    const done = list.filter((i) => isDone(i.type));
    root.querySelector('#todo-count').textContent = list.length;
    root.querySelector('#todo-list').innerHTML = list.length
      ? open.map(renderItem).join('') + (done.length ? component('todo-divider') + done.map(renderItem).join('') : '')
      : component('empty-item', { message: 'Nothing here.' });
  }

  const changed = () => {
    validateChoices(); // a new entity can rule out the chosen project
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
