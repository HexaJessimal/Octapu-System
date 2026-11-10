// The interactive status controls: a status name with a caret, and the checkbox.
(function (global) {
  'use strict';
  const { parseFolder, STATUS_LABELS, statusLabel, presentTypes, badgeClass, displayDate, displayDates, component, element, UNREACHABLE, postJson, showFormError, entityHref, openDialog } = global.PMS;

  // What an untagged checkbox's mark looks like.
  const MARK_TYPES = { ' ': 'UNASSIGNED', x: 'DONE', '/': 'ASSIGNED', '-': 'WAITING' };
  const NO_PRIORITY = '-';
  const PRIORITY_OPTIONS = [NO_PRIORITY, 'A', 'B', 'C'];
  // Each project status that can be switched, and what it switches to.
  const SWITCHABLE = { active: 'inactive', inactive: 'active' };

  let statuses = [];
  let types = [];
  let owners = [];
  let leaders = [];
  let dependencyOptions = [];
  let projectTypes = [];
  let commitmentOptions = { priorities: [], dependencies: [] };
  let dateFormat = '';
  let menu = null; // { el, caret, control } while the dropdown is open
  let busy = false;
  const listeners = [];

  function setStatuses(list) {
    statuses = list;
    types = presentTypes(list);
  }

  function setHeaderOptions(ownerList, leaderList, format, dependencyList = [], typeList = []) {
    owners = ownerList;
    leaders = leaderList;
    dateFormat = format;
    dependencyOptions = dependencyList;
    projectTypes = typeList;
  }

  function setCommitmentOptions(priorities, dependencies) {
    commitmentOptions = { priorities, dependencies };
  }

  // Registers a function that reloads a view; it should return a promise.
  function onChange(fn) {
    listeners.push(fn);
  }

  function refresh() {
    return Promise.all(listeners.map((fn) => fn()));
  }

  const definition = (name) => statuses.find((s) => s.name === name);

  // A row's SCHEDULED or DEADLINE date as YYYY-MM-DD, or nothing.
  const plannedDate = (item, kind) => {
    const found = (item.dates || []).find((d) => d.kind === kind);
    return found ? found.value.slice(0, 10) : '';
  };

  function dataAttrs(item) {
    return component('control-data', {
      folder: item.folder,
      file: item.file,
      line: item.line,
      status: item.status || '',
      hasText: item.editText !== undefined,
      text: item.editText,
      cancelled: item.cancelled,
      scheduled: plannedDate(item, 'SCHEDULED'),
      deadline: plannedDate(item, 'DEADLINE'),
    });
  }

  // Where clicking this item's checkbox moves it: the next status or, if it has no status
  // yet, the status named DONE (or the first of that type if the CSV no longer has one).
  function checkboxTarget(status) {
    if (status) return (definition(status) || {}).advance || null;
    const done = statuses.filter((s) => s.type === 'DONE');
    return (done.find((s) => s.name === 'DONE') || done[0] || {}).name || null;
  }

  function checkbox(item) {
    const iconType = item.type || MARK_TYPES[item.mark];
    const target = checkboxTarget(item.status);
    const clickable = item.mark !== 'x' && target;
    return component('control-checkbox', {
      attrs: dataAttrs(item),
      icon: iconType ? iconType.toLowerCase() : '',
      title: clickable ? 'Move to ' + target : item.mark === 'x' ? 'Ticked' : 'No next status',
      disabled: !clickable,
      caret: !item.status,
    });
  }

  // The attributes of a control belonging to the page's document rather than a todo.
  const documentAttrs = (project, line, status) => dataAttrs({ folder: project.folder, file: project.file, line, status });

  function personControl(project, line, value, label, leader) {
    return component('control-person', { attrs: documentAttrs(project, line, value), leader, describe: label || 'none', label });
  }

  // The owner keyword in the page title, shown by its friendly name.
  function ownerControl(project) {
    const id = project.title.owner;
    const owner = owners.find((o) => o.id === id);
    return personControl(project, project.title.line, id, owner ? owner.name : '', false);
  }

  // The value of the Owner field, shown by its friendly name if Leaders.csv knows it.
  function leaderControl(project) {
    const value = project.leader.value;
    const leader = leaders.find((l) => l.id === value);
    return personControl(project, project.leader.line, value, leader ? leader.name : value || 'Choose…', true);
  }

  // A commitment's controls. Its title travels as the status, so a stale page can be refused.
  const commitmentAttrs = (doc, commitment) => documentAttrs(doc, commitment.line, commitment.title);

  function commitmentPriorityControl(doc, commitment) {
    const { priority } = commitment;
    return component('control-commitment-priority', {
      attrs: commitmentAttrs(doc, commitment),
      value: priority || NO_PRIORITY,
      className: priority ? 'prio-' + priority.toLowerCase() : 'prio-none',
      describe: priority || 'none',
    });
  }

  function commitmentTimeframeControl(doc, commitment) {
    const [first = ''] = commitment.timeframes;
    return component('control-commitment-timeframe', { attrs: commitmentAttrs(doc, commitment), value: first, set: first, action: first ? 'Change the timeframe' : 'Add a timeframe' });
  }

  function commitmentDependencyControl(doc, commitment) {
    const value = commitment.dependency;
    return component('control-commitment-dependency', { attrs: commitmentAttrs(doc, commitment), value, set: value, action: value ? 'Change the dependency' : 'Add a dependency' });
  }

  // The status tag beside a project's title. Only active and inactive projects can be switched.
  function projectStatusControl(project) {
    const info = parseFolder(project.folder);
    if (!SWITCHABLE[info.status]) return component('pill', { status: info.status, label: statusLabel(info) });
    return component('control-project-status', { attrs: documentAttrs(project, 'status', info.status), status: info.status, label: STATUS_LABELS[info.status] });
  }

  // Milestone or Ongoing, with a menu to change it.
  function projectTypeControl(project) {
    const label = project.ongoing ? 'Ongoing' : 'Milestone';
    return component('control-project-type', { attrs: documentAttrs(project, 'type', label), label });
  }

  // The plus button that adds an Active Timeframe.
  function timeframeControl(project) {
    return component('control-timeframe-add', { attrs: documentAttrs(project, '', '') });
  }

  // The pencil and remove buttons beside one existing timeframe.
  function timeframeEntryControl(project, entry, index) {
    return component('control-timeframe-entry', { attrs: documentAttrs(project, 'timeframe-' + index, entry), index, label: displayDates(entry) });
  }

  // Project Dependency: a plus when empty, a pencil once set, opening a list of projects.
  function dependencyControl(project) {
    const value = project.dependency.value;
    return component('control-dependency', {
      attrs: documentAttrs(project, 'dependency', value),
      set: value,
      action: value ? 'Change the project dependency' : 'Add a project dependency',
    });
  }

  // Date Reviewed / Date Closed: a plus when empty, a pencil once set.
  function dateControl(project, field, label) {
    const value = project.dates[field].value;
    return component('control-date', {
      attrs: documentAttrs(project, field, ''),
      field,
      label,
      value: displayDate(value),
      stored: value,
      set: value,
      action: (value ? 'Change ' : 'Add ') + label,
    });
  }

  function priorityControl(item) {
    return component('control-priority', {
      attrs: dataAttrs(item),
      value: item.priority || NO_PRIORITY,
      className: item.priority ? 'prio-' + item.priority.toLowerCase() : 'prio-none',
      describe: item.priority || 'none',
    });
  }

  // The status name and caret, followed by its priority selector.
  function control(item) {
    const def = definition(item.status);
    return component('control-status', {
      attrs: dataAttrs(item),
      className: badgeClass(item.type),
      advance: def && def.advance,
      name: item.status,
      priority: priorityControl(item),
    });
  }

  function toast(message) {
    const el = element('toast', { message });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function sameLine(a, b) {
    return ['folder', 'file', 'line'].every((k) => a.dataset[k] === b.dataset[k]);
  }

  // Where a todo links to, and the name to show for it.
  function itemLink(item) {
    const { entity } = item;
    const page = entity ? entityHref(entity.root, entity.id) : 'project.html?folder=' + encodeURIComponent(item.folder);
    return { label: entity ? entity.name : global.PMS.parseFolder(item.folder).title, href: page + '&file=' + encodeURIComponent(item.file) };
  }

  function controlKind(el) {
    return ['check', 'priority', 'leader', 'owner', 'date', 'dependency', 'timeframe'].find((k) => el.matches('.' + k + '-control')) || 'status';
  }

  const post = (url, ctrl, fields) => postJson(url, Object.assign({ folder: ctrl.dataset.folder, file: ctrl.dataset.file }, fields));

  // Reloads every view, then puts keyboard focus back on the same control.
  async function reloadAndRefocus(ctrl, scope) {
    await Promise.all(listeners.map((fn) => fn()));
    const onLine = scope ? Array.from(scope.querySelectorAll('.status-control')).filter((c) => sameLine(c, ctrl)) : [];
    const again = onLine.find((c) => controlKind(c) === controlKind(ctrl)) || onLine[0];
    const button = again && again.querySelector('button:not([disabled])');
    if (button) button.focus();
  }

  async function sendEdit(ctrl, url, fields) {
    if (busy) return;
    busy = true;
    const scope = ctrl.closest('.sidebar, #content');
    try {
      const result = await post(url, ctrl, Object.assign({ line: Number(ctrl.dataset.line) }, fields));
      if (!result.ok) toast(result.error || 'Could not save that change.');
      // Reload even after a failure, so the page matches what's really in the file.
      await reloadAndRefocus(ctrl, scope);
    } catch (_) {
      toast(UNREACHABLE);
    } finally {
      busy = false;
    }
  }

  // On a rejected date the form stays open, showing why.
  async function submitForm(form, ctrl, url, fields) {
    if (busy) return;
    busy = true;
    const scope = ctrl.closest('.sidebar, #content');
    const error = form.querySelector('.timeframe-error');
    try {
      const result = await post(url, ctrl, fields);
      if (result.ok) {
        closeMenu(false);
        await reloadAndRefocus(ctrl, scope);
      } else {
        showFormError(error, result.error || 'Could not save that.');
      }
    } catch (_) {
      showFormError(error, UNREACHABLE);
    } finally {
      busy = false;
    }
  }

  // The status is part of the folder's name, so the project's address changes with it.
  async function moveProject(ctrl, status) {
    if (busy) return;
    busy = true;
    try {
      const result = await postJson('api/project-status', { folder: ctrl.dataset.folder, status });
      if (result.ok) {
        const query = new URLSearchParams(location.search);
        query.set('folder', result.body.folder);
        location.replace('?' + query.toString());
      } else {
        toast(result.error || 'Could not change the status.');
      }
    } catch (_) {
      toast(UNREACHABLE);
    } finally {
      busy = false;
    }
  }

  function sendCommitmentField(ctrl, field, value) {
    sendEdit(ctrl, 'api/commitment-field', { title: ctrl.dataset.status, field, value });
  }

  function change(ctrl, to) {
    if (!to || to === ctrl.dataset.status) return;
    sendEdit(ctrl, 'api/status', { from: ctrl.dataset.status || null, to });
  }

  function changePriority(ctrl, value) {
    sendEdit(ctrl, 'api/priority', { status: ctrl.dataset.status, priority: value === NO_PRIORITY ? null : value });
  }

  function closeMenu(refocus) {
    if (!menu) return;
    const { el, caret } = menu;
    menu = null;
    caret.setAttribute('aria-expanded', 'false');
    el.remove();
    if (refocus) caret.focus();
  }

  function positionMenu(el, caret) {
    const gap = 4;
    const edge = 8;
    const anchor = caret.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    const below = window.innerHeight - anchor.bottom;
    const fitsBelow = box.height + gap + edge <= below || anchor.top < below;
    const top = fitsBelow ? anchor.bottom + gap : anchor.top - box.height - gap;
    // The menu is placed against the button that opened it, which only the browser can measure.
    el.style.setProperty('--menu-top', Math.max(edge, Math.min(top, window.innerHeight - box.height - edge)) + 'px');
    el.style.setProperty('--menu-left', Math.max(edge, Math.min(anchor.left, window.innerWidth - box.width - edge)) + 'px');
  }

  // There's no undo in the dashboard, so deleting a row asks first.
  function confirmDelete(text, heading = 'Delete this row?') {
    return new Promise((resolve) => {
      const dialog = element('confirm-dialog', { heading, text: text || '(no text)' });
      let confirmed = false;
      dialog.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        confirmed = true;
        dialog.close();
      });
      dialog.addEventListener('close', () => resolve(confirmed));
      openDialog(dialog);
    });
  }

  async function rowAction(ctrl, action) {
    if (action === 'delete' && !(await confirmDelete(ctrl.dataset.text))) return;
    sendEdit(ctrl, 'api/row', { status: ctrl.dataset.status || null, text: ctrl.dataset.text, action });
  }

  async function removeTimeframe(ctrl) {
    if (!(await confirmDelete(displayDates(ctrl.dataset.status), 'Delete this timeframe?'))) return;
    sendEdit(ctrl, 'api/timeframe-change', { index: Number(ctrl.dataset.index), from: ctrl.dataset.status, remove: true });
  }

  function statusMenu(current, cancelled) {
    return statusOptions(current) + component('status-menu-actions', { cancelled });
  }

  function statusOptions(current) {
    return types
      .map(
        (type) =>
          component('status-menu-type', { type }) +
          statuses
            .filter((s) => s.type === type)
            .map((s) => component('status-menu-item', { attr: 'to', value: s.name, current: s.name === current, label: s.name }))
            .join('')
      )
      .join('');
  }

  function priorityMenu(current) {
    return PRIORITY_OPTIONS.map((p) => component('status-menu-item', { attr: 'priority', value: p, current: p === current, label: p })).join('');
  }

  // A menu of { id, name } options; picking one reports its id through data-<attr>.
  function labelMenu(list, attr, current) {
    return list.map((o) => component('status-menu-item', { attr, value: o.id, current: o.id === current, label: o.name })).join('');
  }

  function buildForm(heading, fields, button, onSubmit) {
    const form = element('status-menu-form', { heading, fields, button });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      onSubmit(form);
    });
    return form;
  }

  // A date typed in the DATEFORMAT, with a calendar button. `stored` is its YYYY-MM-DD value.
  function dateInput(name, label, required, value, stored) {
    return component('date-input', { name, label, placeholder: dateFormat, required, hasValue: value !== undefined, value, stored });
  }

  function planningForm(ctrl, kind) {
    const label = kind === 'SCHEDULED' ? 'Schedule' : 'Deadline';
    const stored = ctrl.dataset[kind.toLowerCase()] || '';
    // Left empty, the date is removed.
    return buildForm(label, dateInput('value', label, false, stored ? displayDate(stored) : '', stored), 'Save', (form) =>
      submitForm(form, ctrl, 'api/planning', { line: Number(ctrl.dataset.line), status: ctrl.dataset.status || null, text: ctrl.dataset.text, kind, date: readField(form, 'value') })
    );
  }

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Month and year dropdowns, starting at a stored YYYY-MM-DD date or else this month.
  function monthInput(name, label, stored) {
    const now = new Date();
    const known = String(stored || '').match(/^(\d{4})-(0[1-9]|1[0-2])/);
    const year = known ? Number(known[1]) : now.getFullYear();
    const month = known ? Number(known[2]) : now.getMonth() + 1;
    const option = (value, text, selected) => component('option', { value, selected, label: text });
    const months = MONTH_NAMES.map((text, i) => option(i + 1, text, i + 1 === month)).join('');
    let years = '';
    for (let y = Math.min(year, now.getFullYear() - 2); y <= Math.max(year, now.getFullYear() + 8); y++) years += option(y, y, y === year);
    return component('month-input', { name, label, months, years });
  }

  const monthFields = (start, end) => monthInput('start', 'Start', start) + monthInput('end', 'End', end);

  // The first or last day of the chosen month, written in the DATEFORMAT.
  function chosenDate(form, name, lastDay) {
    const year = Number(readField(form, name + 'Year'));
    const month = Number(readField(form, name + 'Month'));
    const day = lastDay ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
    return displayDate(year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0'));
  }

  const timeframeDates = (form) => ({ start: chosenDate(form, 'start', false), end: chosenDate(form, 'end', true) });

  function dependencyMenu(current) {
    if (!dependencyOptions.length && !current) return component('status-menu-none');
    return labelMenu((current ? [{ id: '', name: 'None' }] : []).concat(dependencyOptions), 'dependency', current);
  }

  const menuPanel = (items, className = 'status-menu') => element('status-menu-panel', { className, items });

  const readField = (form, name) => form.querySelector('[name="' + name + '"]').value.trim();

  function commitmentForm(ctrl) {
    const [start = '', end = ''] = ctrl.dataset.value.split(/\s+to\s+/i);
    return buildForm('Timeframe', monthFields(start, end), 'Save', (form) =>
      submitForm(form, ctrl, 'api/commitment-timeframe', Object.assign({ line: Number(ctrl.dataset.line), title: ctrl.dataset.status }, timeframeDates(form)))
    );
  }

  function commitmentDependencyMenu(ctrl) {
    const { status: title, value } = ctrl.dataset;
    const self = commitmentOptions.dependencies.filter((o) => o.name !== 'Commitment: ' + title);
    return menuPanel(labelMenu((value ? [{ id: '', name: 'None' }] : []).concat(self), 'commitment-dependency', value));
  }

  function buildMenu(caret, ctrl) {
    if (caret.matches('.commitment-priority-button')) {
      return menuPanel(labelMenu(commitmentOptions.priorities.map((p) => ({ id: p, name: p })), 'commitment-priority', ctrl.dataset.priority), 'status-menu priority-menu');
    }
    if (caret.matches('.commitment-timeframe')) return commitmentForm(ctrl);
    if (caret.matches('.commitment-dependency')) return commitmentDependencyMenu(ctrl);
    if (caret.matches('.dependency-edit')) return menuPanel(dependencyMenu(ctrl.dataset.status));
    if (caret.matches('.date-edit')) {
      const label = ctrl.dataset.label;
      // Left empty, the field is cleared.
      return buildForm(label, dateInput('value', label, false, ctrl.dataset.value, ctrl.dataset.stored), 'Save', (form) =>
        submitForm(form, ctrl, 'api/date', { field: ctrl.dataset.field, value: readField(form, 'value') })
      );
    }
    if (caret.matches('.timeframe-edit')) {
      const [start, end = ''] = ctrl.dataset.status.split(/\s+to\s+/i);
      return buildForm('Change this timeframe', monthFields(start, end), 'Save', (form) =>
        submitForm(form, ctrl, 'api/timeframe-change', Object.assign({ index: Number(ctrl.dataset.index), from: ctrl.dataset.status }, timeframeDates(form)))
      );
    }
    if (caret.matches('.timeframe-add')) {
      return buildForm('Add a timeframe', monthFields(), 'Add', (form) => submitForm(form, ctrl, 'api/timeframe', timeframeDates(form)));
    }
    if (caret.matches('.priority-button')) return menuPanel(priorityMenu(ctrl.dataset.priority), 'status-menu priority-menu');
    if (caret.matches('.project-status-button')) {
      const to = SWITCHABLE[ctrl.dataset.status];
      return menuPanel(labelMenu([{ id: to, name: STATUS_LABELS[to] }], 'project-status', null));
    }
    if (caret.matches('.type-button')) return menuPanel(labelMenu(projectTypes.map((t) => ({ id: t, name: t })), 'project-type', ctrl.dataset.status));
    if (caret.matches('.leader-button')) return menuPanel(labelMenu(leaders, 'leader', ctrl.dataset.status));
    if (caret.matches('.owner-button')) return menuPanel(labelMenu(owners, 'owner', ctrl.dataset.status));
    return menuPanel(statusMenu(ctrl.dataset.status, ctrl.dataset.cancelled === 'true'));
  }

  function openMenu(caret, built) {
    const ctrl = caret.closest('.status-control');
    const el = built || buildMenu(caret, ctrl);
    document.body.appendChild(el);
    menu = { el, caret, control: ctrl };
    caret.setAttribute('aria-expanded', 'true');
    positionMenu(el, caret);
    const first = el.querySelector('input, select, button:not([disabled])');
    if (first) first.focus();
  }

  // The calendar fills in the typed field, so dates stay in the DATEFORMAT.
  function openCalendar(button) {
    const picker = button.parentElement.querySelector('.date-native');
    try {
      picker.showPicker();
    } catch (_) {
      picker.focus();
    }
  }

  document.addEventListener('change', (e) => {
    if (!e.target.matches || !e.target.matches('.date-native')) return;
    e.target.parentElement.querySelector('input[name]').value = displayDate(e.target.value);
  });

  document.addEventListener('click', (e) => {
    const target = e.target;
    const calendar = target.closest('[data-date-pick]');
    if (calendar) {
      openCalendar(calendar);
      return;
    }
    const choice = target.closest('.status-menu[role="menu"] button');
    if (choice && menu) {
      const ctrl = menu.control;
      const opener = menu.caret;
      closeMenu(false);
      if (choice.dataset.plan) {
        openMenu(opener, planningForm(ctrl, choice.dataset.plan));
        return;
      }
      if (choice.dataset.priority) changePriority(ctrl, choice.dataset.priority);
      else if (choice.dataset.commitmentPriority) sendCommitmentField(ctrl, 'priority', choice.dataset.commitmentPriority);
      else if (choice.dataset.commitmentDependency !== undefined) sendCommitmentField(ctrl, 'dependency', choice.dataset.commitmentDependency);
      else if (choice.dataset.projectStatus) moveProject(ctrl, choice.dataset.projectStatus);
      else if (choice.dataset.projectType) sendEdit(ctrl, 'api/project-type', { type: choice.dataset.projectType });
      else if (choice.dataset.owner) sendEdit(ctrl, 'api/owner', { from: ctrl.dataset.status || null, to: choice.dataset.owner });
      else if (choice.dataset.leader) sendEdit(ctrl, 'api/leader', { from: ctrl.dataset.status, to: choice.dataset.leader });
      else if (choice.dataset.row) rowAction(ctrl, choice.dataset.row);
      else if (choice.dataset.dependency !== undefined) sendEdit(ctrl, 'api/dependency', { name: choice.dataset.dependency });
      else change(ctrl, choice.dataset.to);
      return;
    }
    const removeButton = target.closest('.timeframe-remove');
    if (removeButton) {
      closeMenu(false);
      removeTimeframe(removeButton.closest('.status-control'));
      return;
    }
    const caret = target.closest('.status-caret, .priority-button, .owner-button, .timeframe-add') || target.closest('.project-status-button');
    if (caret) {
      const wasOpen = menu && menu.caret === caret;
      closeMenu(false);
      if (!wasOpen) openMenu(caret);
      return;
    }
    if (menu && !target.closest('.status-menu')) closeMenu(false);
    const box = target.closest('.check-box');
    if (box) {
      const ctrl = box.closest('.status-control');
      change(ctrl, checkboxTarget(ctrl.dataset.status));
      return;
    }
    const name = target.closest('.status-name');
    if (name) {
      const ctrl = name.closest('.status-control');
      const def = definition(ctrl.dataset.status);
      if (def) change(ctrl, def.advance);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!menu) return;
    if (e.key === 'Escape') {
      closeMenu(true);
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menu.el.getAttribute('role') === 'menu') {
      e.preventDefault();
      const items = Array.from(menu.el.querySelectorAll('button:not([disabled])'));
      if (!items.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
    }
  });

  window.addEventListener('resize', () => closeMenu(false));
  window.addEventListener(
    'scroll',
    (e) => {
      if (menu && e.target !== menu.el) closeMenu(false);
    },
    true
  );

  global.PMS.status = { itemLink, setStatuses, setHeaderOptions, onChange, refresh, toast, confirmDelete, control, checkbox, setCommitmentOptions, commitmentPriorityControl, commitmentTimeframeControl, commitmentDependencyControl, ownerControl, leaderControl, projectStatusControl, projectTypeControl, timeframeControl, timeframeEntryControl, dateControl, dependencyControl };
})(window);
