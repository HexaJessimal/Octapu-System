// Plan: pick unassigned milestone items into a Focus list, alongside everything already assigned, then log it.
(function () {
  'use strict';
  const { parseFolder, displayDates, setDateFormat, badgeClass, markdown: md, status, component, getJson, postJson, loadError, showFormError, storedList, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  const STORAGE_KEY = 'pms.weeklyFocus';
  const COLLAPSED_KEY = 'pms.planCollapsed';

  let projects = [];
  let available = []; // the rows shown in the upper lists, indexed by data-focus-add
  let focus = storedList(STORAGE_KEY); // the picked rows: { folder, file, milestone, text }, in the order they were picked
  const collapsed = new Set(storedList(COLLAPSED_KEY)); // the keys of the closed boxes

  function remember(key, list) {
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (_) {
      /* storage unavailable: it just won't survive a page reload */
    }
  }

  const saveFocus = () => remember(STORAGE_KEY, focus);

  // Rows are matched by text, as a status change can shift line numbers in the file.
  const sameRow = (entry, row) =>
    entry.folder === row.folder && entry.file === row.file && entry.milestone === row.milestone && entry.text === row.editText;

  const allRows = () => projects.flatMap((p) => p.rows);
  const inFocus = (row) => focus.some((entry) => sameRow(entry, row));

  function pickableRow(row) {
    available.push(row);
    return component('plan-pick', {
      index: available.length - 1,
      last: row.lastInMilestone,
      badge: row.status ? component('plan-badge', { className: badgeClass(row.type), status: row.status }) : '',
      text: displayDates(row.editText),
      milestone: row.milestone,
    });
  }

  function planBox({ key, suggested, title, count, items }) {
    const isCollapsed = collapsed.has(key);
    return component('plan-project', { suggested, collapsed: isCollapsed, expanded: !isCollapsed, key, title, count, items });
  }

  function pickLists() {
    available = [];
    const boxes = projects
      .map((project) => ({ project, rows: project.rows.filter((row) => row.available && !inFocus(row)) }))
      .filter((group) => group.rows.length)
      .map(({ project, rows }) =>
        planBox({
          key: 'pick:' + project.folder,
          suggested: project.suggested,
          title: project.name || parseFolder(project.folder).title,
          count: rows.length,
          items: rows.map(pickableRow).join(''),
        })
      );
    return boxes.length ? component('card-stack', { items: boxes.join('') }) : component('empty-card', { message: 'Nothing left to assign.' });
  }

  // Everything in the focus: picked rows, then assigned ones. `index` is its place among the picks.
  function focusEntries() {
    const rows = allRows();
    const picked = focus.map((entry, index) => ({ row: rows.find((r) => sameRow(entry, r)), index }));
    return picked.concat(rows.filter((row) => row.assigned && !inFocus(row)).map((row) => ({ row, index: null })));
  }

  // An assigned row stays in the focus until its status changes, so it has no Remove button.
  function focusRow({ row, index }) {
    return component('plan-focus-row', {
      checkbox: row.mark === null ? '' : status.checkbox(row),
      control: row.status ? status.control(row) : '',
      removable: !row.assigned,
      index,
      text: md.inline(row.editText),
      milestone: row.milestone,
    });
  }

  function focusList() {
    const groups = new Map();
    const titles = new Map();
    focusEntries().forEach((entry) => {
      const { folder, source } = entry.row;
      if (!groups.has(folder)) groups.set(folder, []);
      titles.set(folder, source || parseFolder(folder).title);
      groups.get(folder).push(focusRow(entry));
    });
    if (!groups.size) return component('empty-card', { message: 'Click an item above to add it to the focus.' });
    const boxes = [...groups].map(([folder, items]) =>
      planBox({ key: 'focus:' + folder, suggested: false, title: titles.get(folder), count: items.length, items: items.join('') })
    );
    return component('card-stack', { items: boxes.join('') });
  }

  function render() {
    contentEl.innerHTML = component('plan-page', { picks: pickLists(), focus: focusList() });
  }

  // Only the box changes, so nothing is redrawn.
  function toggleBox(button) {
    const box = button.closest('[data-box-key]');
    const nowCollapsed = box.classList.toggle('is-collapsed');
    button.setAttribute('aria-expanded', String(!nowCollapsed));
    if (nowCollapsed) collapsed.add(box.dataset.boxKey);
    else collapsed.delete(box.dataset.boxKey);
    remember(COLLAPSED_KEY, [...collapsed]);
  }

  contentEl.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-collapse]');
    if (toggle) return toggleBox(toggle);
    const add = e.target.closest('[data-focus-add]');
    if (add) {
      const row = available[Number(add.dataset.focusAdd)];
      focus.push({ folder: row.folder, file: row.file, milestone: row.milestone, text: row.editText });
    } else {
      const remove = e.target.closest('[data-focus-remove]');
      if (!remove) return;
      focus.splice(Number(remove.dataset.focusRemove), 1);
    }
    saveFocus();
    render();
  });

  contentEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = e.target.querySelector('.form-error');
    error.hidden = true;
    try {
      const result = await postJson('api/weekly-focus', { items: focusEntries().map(({ row }) => ({ folder: row.folder, text: row.editText })) });
      if (!result.ok) return showFormError(error, result.error || 'Could not save the focus.');
      focus = [];
      saveFocus();
      render();
      status.toast('Focus saved.');
      status.refresh(); // clears the menu's "due" highlight
    } catch (_) {
      showFormError(error, UNREACHABLE);
    }
  });

  function load() {
    return getJson('api/weekly-plan')
      .then((data) => {
        setDateFormat(data.dateFormat);
        status.setStatuses(data.statuses);
        projects = data.projects;
        // Anything deleted, cancelled or reworded elsewhere drops out of the list.
        focus = focus.filter((entry) => allRows().some((row) => sameRow(entry, row)));
        saveFocus();
        render();
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the plan', err);
      });
  }

  status.onChange(load);
  load();
})();
