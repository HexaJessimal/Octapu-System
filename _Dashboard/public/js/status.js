// The interactive status controls: a status name with a caret, and the checkbox.
(function (global) {
  'use strict';
  const { parseFolder, STATUS_LABELS, statusLabel, presentTypes, badgeClass, displayDate, displayDates, component, element, UNREACHABLE, postJson, showFormError, tentacleHref, openDialog } = global.PMS;

  // What an untagged checkbox's mark looks like.
  const MARK_TYPES = { ' ': 'UNASSIGNED', x: 'DONE', '/': 'ASSIGNED', '-': 'WAITING' };
  const NO_PRIORITY = '-';
  const PRIORITY_OPTIONS = [NO_PRIORITY, 'A', 'B', 'C', 'R'];
  // R is a recurring task. Its period is a count and one of these units, as in R|5D.
  const RECUR_UNITS = { D: ['day', 'days'], W: ['week', 'weeks'], M: ['month', 'months'], Y: ['year', 'years'] };
  const recurValue = (item) => (item.recur ? item.recur.count + item.recur.unit : '');
  // "5D" as "5 days", or "1W" as "1 week".
  const describePeriod = (value) => {
    const [, count, unit] = String(value).match(/^(\d+)([DWMY])$/) || [];
    return count ? count + ' ' + RECUR_UNITS[unit][count === '1' ? 0 : 1] : '';
  };
  // Each project status that can be switched, and what it switches to.
  const SWITCHABLE = { active: 'inactive', inactive: 'active' };

  let statuses = [];
  let types = [];
  let tentacles = [];
  let leaders = [];
  let dependencyOptions = [];
  let projectTypes = [];
  let dateFormat = '';
  let menu = null; // { el, caret, control } while the dropdown is open
  let busy = false;
  const listeners = [];

  function setStatuses(list) {
    statuses = list;
    types = presentTypes(list);
  }

  function setHeaderOptions(tentacleList, leaderList, format, dependencyList = [], typeList = []) {
    tentacles = tentacleList;
    leaders = leaderList;
    dateFormat = format;
    dependencyOptions = dependencyList;
    projectTypes = typeList;
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
      recur: recurValue(item),
      // A box with no status is ticked or unticked through api/check, which needs its mark.
      mark: item.status || item.mark === null || item.mark === undefined ? '' : item.mark,
    });
  }

  // Where clicking this item's checkbox moves it: the next status or, if it has no status
  // yet, the status named DONE (or the first of that type if the CSV no longer has one).
  function checkboxTarget(status) {
    if (status) return (definition(status) || {}).advance || null;
    const done = statuses.filter((s) => s.type === 'DONE');
    return (done.find((s) => s.name === 'DONE') || done[0] || {}).name || null;
  }

  // A recurring task's box moves its schedule on rather than ticking it. A box with no status
  // ticks and unticks. In a task list ticking it gives it the DONE status; elsewhere (`outside`)
  // it stays a plain tick box, with no status menu.
  function checkbox(item) {
    const iconType = item.type || MARK_TYPES[item.mark];
    const target = checkboxTarget(item.status);
    const ticked = item.mark === 'x';
    const clickable = item.recur || !item.status || (!ticked && target);
    let title = clickable ? 'Move to ' + target : ticked ? 'Ticked' : 'No next status';
    if (!item.status) title = ticked ? 'Untick' : item.outside || !target ? 'Tick' : 'Move to ' + target;
    if (item.recur) title = 'Move the schedule on ' + describePeriod(recurValue(item));
    return component('control-checkbox', {
      attrs: dataAttrs(item),
      icon: iconType ? iconType.toLowerCase() : '',
      title,
      disabled: !clickable,
      caret: !item.status && !item.outside,
    });
  }

  // The attributes of a control belonging to the page's document rather than a todo.
  const documentAttrs = (project, line, status) => dataAttrs({ folder: project.folder, file: project.file, line, status });

  function personControl(project, line, value, label, leader) {
    return component('control-person', { attrs: documentAttrs(project, line, value), leader, describe: label || 'none', label });
  }

  // The tentacle keyword in the page title, shown by its friendly name.
  function tentacleControl(project) {
    const id = project.title.tentacle;
    const tentacle = tentacles.find((o) => o.id === id);
    return personControl(project, project.title.line, id, tentacle ? tentacle.name : '', false);
  }

  // The value of the Leader field, shown by its friendly name if Leaders.csv knows it.
  function leaderControl(project) {
    const value = project.leader.value;
    const leader = leaders.find((l) => l.id === value);
    return personControl(project, project.leader.line, value, leader ? leader.name : value || 'Choose…', true);
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
    return component('control-timeframe-entry', { attrs: documentAttrs(project, 'timeframe-' + index, entry), index, label: displayDates(global.PMS.splitTimeframe(entry).dates) });
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
  // The Reviewed box's value: the date (or "Not yet"), a note while it's flagged, and the flag.
  // The flag is coloured like the Review page box the page is listed in: projects or tentacles.
  function reviewedValue(doc) {
    const value = doc.dates.reviewed.value;
    const on = Boolean(doc.flagged);
    const kind = String(doc.folder).startsWith('tentacle:') ? 'tentacles' : 'projects';
    return (
      (value ? global.PMS.markdown.inline(value) : 'Not yet') +
      component('control-review-flag', { attrs: documentAttrs(doc, 'flag', ''), kind, on, pressed: String(on), action: on ? 'Remove the flag for review' : 'Flag for review' }) +
      (on ? component('review-flagged', { kind }) : '')
    );
  }

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
    const every = item.recur ? 'recurring every ' + describePeriod(recurValue(item)) : '';
    return component('control-priority', {
      attrs: dataAttrs(item),
      value: item.priority || NO_PRIORITY,
      className: item.priority ? 'prio-' + item.priority.toLowerCase() : 'prio-none',
      describe: every || item.priority || 'none',
      title: every ? 'Priority: ' + every : 'Priority',
    });
  }

  // The status name and caret, followed by its priority selector.
  // Selecting the name moves the status on, or a recurring task's schedule.
  function control(item) {
    const def = definition(item.status);
    const advance = def && def.advance;
    let title = advance ? 'Move to ' + advance : 'No next status';
    if (item.recur) title = 'Move the schedule on ' + describePeriod(recurValue(item));
    return component('control-status', {
      attrs: dataAttrs(item),
      className: badgeClass(item.type),
      title,
      disabled: !advance && !item.recur,
      name: item.status,
      priority: priorityControl(item),
    });
  }

  // The grey menu at the end of a task row: Cancel and Delete everywhere, plus, where they
  // make sense, moving the task to another milestone, making it a milestone, and giving it a
  // linked Scratchpad block. `where` says which: { milestone: { line, title } } for a task in
  // a Milestone project's milestone, and { blockable: true } on project and tentacle pages.
  function rowMenu(item, where = {}) {
    if (item.mark === null && !item.status) return '';
    return component('control-row-menu', {
      attrs: dataAttrs(item),
      inMilestone: Boolean(where.milestone),
      milestoneLine: where.milestone ? where.milestone.line : '',
      blockable: Boolean(where.blockable) && !/\[\[/.test(item.editText || ''),
    });
  }

  // The milestones on the page, for Move to another milestone.
  let milestones = [];
  function setMilestones(list) {
    milestones = list;
  }

  function rowMenuItems(ctrl) {
    let items = '';
    if (ctrl.dataset.inMilestone === 'true') {
      const others = milestones.filter((m) => String(m.line) !== ctrl.dataset.milestoneLine);
      if (others.length) {
        items += component('status-menu-type', { type: 'Move to' });
        items += others.map((m) => component('status-menu-item', { attr: 'row-move', value: m.line, current: false, label: m.title })).join('');
        items += component('status-menu-divider');
      }
      items += component('status-menu-item', { attr: 'row-promote', value: 'yes', current: false, label: 'Promote to new milestone' });
    }
    if (ctrl.dataset.blockable === 'true') items += component('status-menu-item', { attr: 'row-block', value: 'yes', current: false, label: 'Create linked Scratchpad block' });
    if (items) items += component('status-menu-divider');
    return items + component('row-menu-actions', { cancelled: ctrl.dataset.cancelled === 'true' });
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
  // A task from Contacts or Events links to its contact or event, named after it. Every link
  // carries the task's line, so the page can open at the task itself.
  function itemLink(item) {
    const { tentacle, networking } = item;
    const line = '&line=' + item.line;
    if (networking) return { label: networking.title, href: 'networking.html?page=' + networking.page + line + '#' + encodeURIComponent(networking.title) };
    const page = tentacle ? tentacleHref(tentacle.root, tentacle.id) : 'project.html?folder=' + encodeURIComponent(item.folder);
    return { label: tentacle ? tentacle.name : global.PMS.parseFolder(item.folder).title, href: page + '&file=' + encodeURIComponent(item.file) + line };
  }

  function controlKind(el) {
    return ['check', 'priority', 'leader', 'header', 'date', 'dependency', 'timeframe', 'milestone-menu', 'row-menu', 'review-flag'].find((k) => el.matches('.' + k + '-control')) || 'status';
  }

  const post = (url, ctrl, fields) => postJson(url, Object.assign({ folder: ctrl.dataset.folder, file: ctrl.dataset.file }, fields));

  // Reloads every view, then puts keyboard focus back on the same control. The view stays
  // where it was, even if the item has moved to another place in its list, such as when a
  // new status re-sorts the Todos sidebar.
  async function reloadAndRefocus(ctrl, scope) {
    await Promise.all(listeners.map((fn) => fn()));
    const onLine = scope ? Array.from(scope.querySelectorAll('.status-control')).filter((c) => sameLine(c, ctrl)) : [];
    const again = onLine.find((c) => controlKind(c) === controlKind(ctrl)) || onLine[0];
    const button = again && again.querySelector('button:not([disabled])');
    if (button) button.focus({ preventScroll: true });
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

  function change(ctrl, to) {
    if (!to || to === ctrl.dataset.status) return;
    sendEdit(ctrl, 'api/status', { from: ctrl.dataset.status || null, to });
  }

  // A box with no status: ticked, or unticked if it already is.
  function toggleBox(ctrl) {
    sendEdit(ctrl, 'api/check', { text: ctrl.dataset.text || '', checked: ctrl.dataset.mark !== 'x' });
  }

  function changePriority(ctrl, value) {
    sendEdit(ctrl, 'api/priority', { status: ctrl.dataset.status, priority: value === NO_PRIORITY ? null : value });
  }

  // A recurring task's status or box: its SCHEDULED date moves on by its period.
  function advanceRecurring(ctrl) {
    sendEdit(ctrl, 'api/recur', { status: ctrl.dataset.status, text: ctrl.dataset.text || '' });
  }

  // Choosing R asks how often the task comes round, starting on its current period.
  function recurForm(ctrl) {
    const [, count = '1', unit = 'W'] = (ctrl.dataset.recur || '').match(/^(\d+)([DWMY])$/) || [];
    const option = (value, label, selected) => component('option', { value, label, selected });
    const counts = Array.from({ length: 10 }, (_, i) => option(String(i + 1), String(i + 1), String(i + 1) === count)).join('');
    const units = Object.entries(RECUR_UNITS).map(([key, names]) => option(key, names[1][0].toUpperCase() + names[1].slice(1), key === unit)).join('');
    return buildForm('Recurring', component('recur-fields', { counts, units }), 'Save', (form) =>
      submitForm(form, ctrl, 'api/priority', { line: Number(ctrl.dataset.line), status: ctrl.dataset.status, priority: 'R|' + form.elements.recurCount.value + form.elements.recurUnit.value })
    );
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
  // `action` names the button that goes ahead, for confirmations that aren't deletions.
  function confirmDelete(text, heading = 'Delete this row?', action = 'Delete') {
    return new Promise((resolve) => {
      const dialog = element('confirm-dialog', { heading, text: text || '(no text)', action });
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

  // Each status shows its type's icon and colour rather than a heading per type, with a thin
  // line between the types.
  function statusOptions(current) {
    return types
      .map((type) =>
        statuses
          .filter((s) => s.type === type)
          .map((s) => component('status-menu-status', { icon: type.toLowerCase(), value: s.name, current: s.name === current, label: s.name }))
          .join('')
      )
      .join(component('status-menu-divider'));
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

  // A tick box per milestone, for limiting a timeframe to some of them. `chosen` is the
  // timeframe's current list, or null for all.
  function milestoneFields(chosen) {
    if (!milestones.length) return '';
    const key = (name) => name.trim().toLowerCase();
    const boxes = milestones.map((m) => component('timeframe-milestone', { title: m.title, checked: !chosen || chosen.some((name) => key(name) === key(m.title)) }));
    return component('timeframe-milestones', { boxes: boxes.join('') });
  }

  // The ticked milestones, or none when they're all ticked, which means every milestone.
  function chosenMilestones(form) {
    const boxes = Array.from(form.querySelectorAll('input[name="milestone"]'));
    const ticked = boxes.filter((box) => box.checked).map((box) => box.value);
    return ticked.length && ticked.length < boxes.length ? ticked : undefined;
  }

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

  // The project page handles its milestone menu's choices.
  let milestoneAction = () => {};
  const onMilestoneAction = (fn) => (milestoneAction = fn);

  function buildMenu(caret, ctrl) {
    if (caret.matches('.milestone-menu-button')) return menuPanel(component('milestone-menu-actions'));
    if (caret.matches('.row-menu-button')) return menuPanel(rowMenuItems(ctrl));
    if (caret.matches('.dependency-edit')) return menuPanel(dependencyMenu(ctrl.dataset.status));
    if (caret.matches('.date-edit')) {
      const label = ctrl.dataset.label;
      // Left empty, the field is cleared.
      return buildForm(label, dateInput('value', label, false, ctrl.dataset.value, ctrl.dataset.stored), 'Save', (form) =>
        submitForm(form, ctrl, 'api/date', { field: ctrl.dataset.field, value: readField(form, 'value') })
      );
    }
    if (caret.matches('.timeframe-edit')) {
      const entry = global.PMS.splitTimeframe(ctrl.dataset.status);
      const [start, end = ''] = entry.dates.split(/\s+to\s+/i);
      return buildForm('Change this timeframe', monthFields(start, end) + milestoneFields(entry.milestones), 'Save', (form) =>
        submitForm(form, ctrl, 'api/timeframe-change', Object.assign({ index: Number(ctrl.dataset.index), from: ctrl.dataset.status, milestones: chosenMilestones(form) }, timeframeDates(form)))
      );
    }
    if (caret.matches('.timeframe-add')) {
      return buildForm('Add a timeframe', monthFields() + milestoneFields(null), 'Add', (form) =>
        submitForm(form, ctrl, 'api/timeframe', Object.assign({ milestones: chosenMilestones(form) }, timeframeDates(form)))
      );
    }
    if (caret.matches('.priority-button')) return menuPanel(priorityMenu(ctrl.dataset.priority), 'status-menu priority-menu');
    if (caret.matches('.project-status-button')) {
      const to = SWITCHABLE[ctrl.dataset.status];
      return menuPanel(labelMenu([{ id: to, name: STATUS_LABELS[to] }], 'project-status', null));
    }
    if (caret.matches('.type-button')) return menuPanel(labelMenu(projectTypes.map((t) => ({ id: t, name: t })), 'project-type', ctrl.dataset.status));
    if (caret.matches('.leader-button')) return menuPanel(labelMenu(leaders, 'leader', ctrl.dataset.status));
    if (caret.matches('.header-button')) return menuPanel(labelMenu(tentacles, 'tentacle', ctrl.dataset.status));
    return menuPanel(statusOptions(ctrl.dataset.status));
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
      if (choice.dataset.priority === 'R') {
        openMenu(opener, recurForm(ctrl));
        return;
      }
      if (choice.dataset.priority) changePriority(ctrl, choice.dataset.priority);
      else if (choice.dataset.projectStatus) moveProject(ctrl, choice.dataset.projectStatus);
      else if (choice.dataset.projectType) sendEdit(ctrl, 'api/project-type', { type: choice.dataset.projectType });
      else if (choice.dataset.tentacle) sendEdit(ctrl, 'api/tentacle-tag', { from: ctrl.dataset.status || null, to: choice.dataset.tentacle });
      else if (choice.dataset.leader) sendEdit(ctrl, 'api/leader', { from: ctrl.dataset.status, to: choice.dataset.leader });
      else if (choice.dataset.milestone) milestoneAction(ctrl, choice.dataset.milestone);
      else if (choice.dataset.row) rowAction(ctrl, choice.dataset.row);
      else if (choice.dataset.rowMove) {
        const to = milestones.find((m) => String(m.line) === choice.dataset.rowMove);
        if (to) sendEdit(ctrl, 'api/row-move', { status: ctrl.dataset.status || null, text: ctrl.dataset.text, toLine: to.line, toTitle: to.title });
      } else if (choice.dataset.rowPromote) sendEdit(ctrl, 'api/row-promote', { status: ctrl.dataset.status || null, text: ctrl.dataset.text });
      else if (choice.dataset.rowBlock) sendEdit(ctrl, 'api/row-block', { status: ctrl.dataset.status || null, text: ctrl.dataset.text });
      else if (choice.dataset.dependency !== undefined) sendEdit(ctrl, 'api/dependency', { name: choice.dataset.dependency });
      else change(ctrl, choice.dataset.to);
      return;
    }
    const flag = target.closest('.review-flag-button');
    if (flag) {
      closeMenu(false);
      sendEdit(flag.closest('.status-control'), 'api/review-flag', { on: flag.getAttribute('aria-pressed') !== 'true' });
      return;
    }
    const removeButton = target.closest('.timeframe-remove');
    if (removeButton) {
      closeMenu(false);
      removeTimeframe(removeButton.closest('.status-control'));
      return;
    }
    const caret = target.closest('.status-caret, .priority-button, .header-button, .timeframe-add, .row-menu-button') || target.closest('.project-status-button');
    if (caret) {
      const wasOpen = menu && menu.caret === caret;
      closeMenu(false);
      if (!wasOpen) openMenu(caret);
      return;
    }
    if (menu && !target.closest('.status-menu')) closeMenu(false);
    // Only a task's own box. Tick boxes elsewhere, such as the Todos filter's, share the look.
    const box = target.closest('.check-box');
    const boxCtrl = box && box.closest('.status-control');
    if (boxCtrl) {
      if (boxCtrl.dataset.recur) advanceRecurring(boxCtrl);
      else if (!boxCtrl.dataset.status) toggleBox(boxCtrl);
      else change(boxCtrl, checkboxTarget(boxCtrl.dataset.status));
      return;
    }
    const name = target.closest('.status-name');
    if (name) {
      const ctrl = name.closest('.status-control');
      const def = definition(ctrl.dataset.status);
      if (ctrl.dataset.recur) advanceRecurring(ctrl);
      else if (def) change(ctrl, def.advance);
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

  global.PMS.status = { itemLink, setStatuses, setHeaderOptions, onChange, refresh, toast, confirmDelete, control, checkbox, rowMenu, setMilestones, onMilestoneAction, reviewedValue, dateInput, tentacleControl, leaderControl, projectStatusControl, projectTypeControl, timeframeControl, timeframeEntryControl, dateControl, dependencyControl };
})(window);
