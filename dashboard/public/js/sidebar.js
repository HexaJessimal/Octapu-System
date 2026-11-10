// Right-hand sidebar: status-prefixed todo items from every project.
(function () {
  'use strict';
  const { presentTypes, parseFolder, markdown, status, component, getJson } = window.PMS;

  const root = document.getElementById('todo-sidebar');
  if (!root) return;

  const STORAGE_KEY = 'pms.sidebar';
  const FILE_ORDER = 'file';
  const ANY = ''; // a dropdown left on "All"
  const NO_PRIORITY = 'none';
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
  let picked = { status: ANY, priority: ANY, entity: ANY, project: ANY };
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
          if (typeof saved.picked[key] === 'string') picked[key] = saved.picked[key];
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

  // Each dropdown's test. Leaving one on All lets everything through.
  const TESTS = {
    status: (item, value) => item.status === value,
    priority: (item, value) => (value === NO_PRIORITY ? !item.priority : item.priority === value),
    entity: (item, value) => item.entityName === value,
    project: (item, value) => projectOf(item) === value,
  };

  const passes = (item, except) => shown.has(item.type) && Object.keys(TESTS).every((key) => key === except || picked[key] === ANY || TESTS[key](item, picked[key]));

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

  // A dropdown's choices, each with how many items it would show alongside the other filters.
  function choices(key, list) {
    const count = (value) => items.filter((item) => passes(item, key) && TESTS[key](item, value)).length;
    const all = items.filter((item) => passes(item, key)).length;
    return option(ANY, 'All (' + all + ')', picked[key]) + list.map(([value, label]) => option(value, label + ' (' + count(value) + ')', picked[key])).join('');
  }

  const byLabel = (a, b) => a[1].localeCompare(b[1]);

  function entityList() {
    const names = [...new Set(items.map((i) => i.entityName).filter(Boolean))];
    return names.map((name) => [name, name]).sort(byLabel);
  }

  // Projects with items of a ticked type, and only those of the chosen entity if there is one.
  function projectList() {
    const folders = new Set(items.filter((i) => projectOf(i) && shown.has(i.type) && (picked.entity === ANY || i.entityName === picked.entity)).map(projectOf));
    return [...folders].map((folder) => [folder, parseFolder(folder).title]).sort(byLabel);
  }

  const selects = () => ({
    status: choices('status', statuses.map((s) => [s.name, s.name])),
    priority: choices('priority', [...priorities.map((p) => [p, p]), [NO_PRIORITY, 'None']]),
    entity: choices('entity', entityList()),
    project: choices('project', projectList()),
  });

  const typeBoxes = () => types.map((type) => component('todo-type', { on: shown.has(type), checked: String(shown.has(type)), type })).join('');

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
      if (picked[key] !== ANY && !known[key].includes(picked[key])) picked[key] = ANY;
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
      href,
      location: item.file + ', line ' + item.line,
      label,
      text: item.text ? markdown.inline(item.text) : '',
      dates: item.dates.map((d) => component('todo-date', { kind: d.kind, value: window.PMS.displayDates(d.value) })).join(''),
    });
  }

  // Redraws the filter's choices, whose counts depend on each other, and then the list.
  function renderList() {
    const options = selects();
    Object.keys(options).forEach((key) => {
      root.querySelector('#todo-' + key).innerHTML = options[key];
    });
    root.querySelector('#todo-types').innerHTML = typeBoxes();
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

  function renderShell() {
    const s = selects();
    root.innerHTML = component('sidebar-shell', { types: typeBoxes(), status: s.status, priority: s.priority, entity: s.entity, project: s.project, sort: sortOptions() });
    Object.keys(picked).forEach((key) =>
      root.querySelector('#todo-' + key).addEventListener('change', (e) => {
        picked[key] = e.target.value;
        changed();
      })
    );
    root.querySelector('#todo-sort').addEventListener('change', (e) => {
      sort = e.target.value;
      changed();
    });
    root.querySelector('#todo-types').addEventListener('click', (e) => {
      const box = e.target.closest('[data-type]');
      if (!box) return;
      e.preventDefault(); // a click on the label would otherwise click the box a second time
      const type = box.dataset.type;
      if (shown.has(type)) shown.delete(type);
      else shown.add(type);
      changed();
      root.querySelector('[data-type="' + CSS.escape(type) + '"]').focus(); // the boxes were redrawn
    });
  }

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
