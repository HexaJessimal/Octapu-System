// Home: the numbers and lists that matter today.
(function () {
  'use strict';
  const { parseFolder, STATUS_LABELS, progressBar, projectRow, byFolderTitle, escapeHtml, displayDate, setDateFormat, markdown, status, component, getJson, loadError } = window.PMS;

  const statsEl = document.getElementById('home-stats');
  const contentEl = document.getElementById('content');
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  function stat(label, value, note, options) {
    const { href, alert } = options || {};
    return component('home-stat', { tag: href ? 'a' : 'div', alert, href, label, value, note });
  }

  // A Review or Plan tile. `days` is how many days until it's due, or null if never done.
  function dueStat(label, days, href) {
    if (days === null) return stat(label, 'Due now', 'Not done yet', { href, alert: true });
    if (days < 0) return stat(label, plural(-days, 'day') + ' late', '', { href, alert: true });
    if (days === 0) return stat(label, 'Today', '', { href, alert: true });
    return stat(label, plural(days, 'day'), 'until it is due', { href });
  }

  const dayNumber = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };

  function whenText(date, today) {
    const days = dayNumber(date) - dayNumber(today);
    if (days === 0) return 'today';
    if (days === 1) return 'tomorrow';
    return days > 0 ? 'in ' + days + ' days' : plural(-days, 'day') + ' ago';
  }

  function taskRow(item, today) {
    const { label, href } = status.itemLink(item);
    return component('home-task', {
      checkbox: item.mark === null ? '' : status.checkbox(item),
      control: item.status ? status.control(item) : '',
      href,
      label,
      text: item.editText ? markdown.inline(item.editText) : '',
      late: item.due.date < today ? 'is-late' : '',
      kind: item.due.kind,
      date: displayDate(item.due.date),
      when: whenText(item.due.date, today),
    });
  }

  function section(title, count, body) {
    return component('home-section', {
      heading: component('section-heading', { title, after: count === null ? '' : component('count', { count }) }),
      body,
    });
  }

  function taskSection(heading, items, today, emptyText) {
    const rows = items.map((item) => taskRow(item, today)).join('');
    return section(heading, items.length, component('card-section', { body: items.length ? component('home-tasks', { items: rows }) : component('empty-text', { message: emptyText }) }));
  }

  function planProject(entry) {
    const name = entry.folder ? component('link', { href: 'project.html?folder=' + encodeURIComponent(entry.folder), label: entry.project }) : escapeHtml(entry.project);
    return component('home-plan-project', { name, items: entry.items.map((text) => component('home-plan-item', { text: markdown.inline(text) })).join('') });
  }

  function planBody(plan) {
    if (!plan.current) return component('home-plan-link', { last: plan.date ? 'The last plan was made on ' + displayDate(plan.date) + '. ' : '' });
    if (!plan.entries.length) return component('empty-text', { message: 'The latest plan has nothing in it.' });
    const owners = new Map();
    plan.entries.forEach((entry) => {
      if (!owners.has(entry.owner)) owners.set(entry.owner, []);
      owners.get(entry.owner).push(entry);
    });
    return component('home-plan', {
      owners: [...owners].map(([owner, entries]) => component('home-plan-owner', { owner: owner || '', projects: entries.map(planProject).join('') })).join(''),
    });
  }

  function timeframeRow(entry) {
    const p = parseFolder(entry.folder);
    return projectRow(p, { label: STATUS_LABELS[p.status], timeframes: entry.timeframes, progress: progressBar(markdown.parseMilestones(entry.content).milestones) });
  }

  function render(data) {
    const inTimeframe = data.inTimeframe.slice().sort(byFolderTitle);
    statsEl.innerHTML =
      stat('Active projects', String(data.active)) +
      stat('Inactive projects', String(data.inactive)) +
      stat('In a timeframe', String(data.inTimeframe.length), 'running today') +
      dueStat('Next review', data.reviewDue, 'weekly-review.html') +
      dueStat('Next plan', data.planDue, 'weekly-plan.html') +
      stat('Overdue tasks', String(data.overdue.length), '', { alert: data.overdue.length > 0 });
    contentEl.innerHTML = component('home-board', {
      // Written row by row so that the boxes side by side line up.
      sections:
        section('Current plan', null, component('card-section', { body: planBody(data.plan) })) +
        taskSection('Due in the next 7 days', data.upcoming, data.today, 'Nothing due in the next 7 days.') +
        section(
          'Priorities this month',
          data.inTimeframe.length,
          component('card-section', {
            body: component('project-list', { items: inTimeframe.length ? inTimeframe.map(timeframeRow).join('') : component('empty-item', { message: 'No projects are in a timeframe today.' }) }),
          })
        ) +
        taskSection('Overdue tasks', data.overdue, data.today, 'Nothing overdue.'),
    });
  }

  function load() {
    return getJson('api/home')
      .then((data) => {
        setDateFormat(data.dateFormat);
        status.setStatuses(data.statuses);
        render(data);
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('Home', err);
      });
  }

  status.onChange(load); // ticking a task off moves it out of these lists
  load();
})();
