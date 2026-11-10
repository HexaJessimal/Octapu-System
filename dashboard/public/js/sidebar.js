// Right-hand sidebar: status-prefixed todo items from every project.
(function () {
  'use strict';
  const { presentTypes, markdown, status, component, getJson } = window.PMS;

  const root = document.getElementById('todo-sidebar');
  if (!root) return;

  const STORAGE_KEY = 'pms.sidebar';
  const FILE_ORDER = 'file';
  const HIGHLIGHT_NOTES = {
    milestone: 'Named in the latest focus',
    project: 'Its project is in the latest focus',
    inactive: 'Its project is not active',
  };

  let statuses = [];
  let types = [];
  let items = [];
  let filter = 'all';
  let sort = FILE_ORDER;
  let shellReady = false;

  const isArchived = (type) => type === 'ARCHIVED';
  const isDone = (type) => type === 'DONE';

  function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      if (typeof saved.filter === 'string') filter = saved.filter;
      if (typeof saved.sort === 'string') sort = saved.sort;
    } catch (_) {
      /* storage unavailable: use defaults */
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ filter, sort }));
    } catch (_) {
      /* storage unavailable: choices just won't persist */
    }
  }

  // "status:JESSIE" -> { kind: 'status', name: 'JESSIE' }
  function split(value) {
    const at = value.indexOf(':');
    return { kind: value.slice(0, at), name: value.slice(at + 1) };
  }

  function matches(item, kind, name) {
    return kind === 'status' ? item.status === name : item.type === name;
  }

  // Archived items only appear when the filter itself selects an archived status or type.
  function visibleItems() {
    if (filter === 'all') return items.filter((i) => !isArchived(i.type));
    const { kind, name } = split(filter);
    return items.filter((i) => matches(i, kind, name));
  }

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

  function filterOptions() {
    const count = (kind, name) => items.filter((i) => matches(i, kind, name)).length;
    return (
      option('all', 'Live (' + items.filter((i) => !isArchived(i.type)).length + ')', filter) +
      group('Status types', types.map((t) => option('type:' + t, t + ' (' + count('type', t) + ')', filter))) +
      group('Statuses', statuses.map((s) => option('status:' + s.name, s.name + ' (' + count('status', s.name) + ')', filter)))
    );
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

  function validateChoices() {
    const known = (kind, name) => (kind === 'status' ? statuses.some((s) => s.name === name) : types.includes(name));
    if (filter !== 'all') {
      const { kind, name } = split(filter);
      if (!known(kind, name)) filter = 'all';
    }
    if (![FILE_ORDER, 'by-status', 'by-type'].includes(sort)) {
      const { kind, name } = split(sort);
      const key = kind.replace('first-', '');
      const type = key === 'status' ? (statuses.find((s) => s.name === name) || {}).type : name;
      if (!known(key, name) || !type || isArchived(type) || isDone(type)) sort = FILE_ORDER;
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

  function renderList() {
    const list = sorted(visibleItems());
    const open = list.filter((i) => !isDone(i.type));
    const done = list.filter((i) => isDone(i.type));
    root.querySelector('#todo-count').textContent = list.length;
    root.querySelector('#todo-list').innerHTML = list.length
      ? open.map(renderItem).join('') + (done.length ? component('todo-divider') + done.map(renderItem).join('') : '')
      : component('empty-item', { message: 'Nothing here.' });
  }

  function renderShell() {
    root.innerHTML = component('sidebar-shell', { filter: filterOptions(), sort: sortOptions() });

    const bind = (id, apply) =>
      root.querySelector(id).addEventListener('change', (e) => {
        apply(e.target.value);
        savePrefs();
        renderList();
      });
    bind('#todo-filter', (v) => (filter = v));
    bind('#todo-sort', (v) => (sort = v));
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
        items = data.items;
        status.setStatuses(statuses);
        validateChoices();
        if (shellReady) {
          // Refresh in place so the list keeps its scroll position.
          root.querySelector('#todo-filter').innerHTML = filterOptions();
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
