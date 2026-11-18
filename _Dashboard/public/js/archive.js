// Archive Index: the entries in _Archive.md, one per project archived with ARCHIVEMODE
// HEADERS. The Archive button on a project page adds to it, and so does the plus button
// here, for a project archived by hand. The minus button removes an entry after asking.
(function () {
  'use strict';
  const { status, escapeHtml, displayDate, displayDates, setDateFormat, normalText, hashReference, dependencyHref, markdown: md, component, getJson, postJson, loadError, UNREACHABLE, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  let page = null;

  const option = (value, label, selected) => component('option', { value, label, selected: Boolean(selected) });
  const field = (label, value) => component('archive-field', { label, value: value || 'Not set' });

  function card(entry, index) {
    const dependency = entry.target ? component('link', { href: dependencyHref(entry.target), label: entry.dependency }) : escapeHtml(entry.dependency);
    const leader = page.leaders.find((l) => l.id === entry.owner);
    return component('archive-card', {
      index,
      target: normalText(entry.title) === normalText(hashReference()),
      title: md.inline(entry.title),
      name: entry.title,
      fields: [
        field('Date Created', escapeHtml(displayDate(entry.created))),
        field('Date Closed', escapeHtml(displayDate(entry.closed))),
        field('Active Timeframe', escapeHtml(entry.timeframes.map(displayDates).join(', '))),
        field('Project Dependency', dependency),
        field('Owner', escapeHtml(leader ? leader.name : entry.owner)),
      ].join(''),
      notes: entry.notes ? md.inline(entry.notes) : '',
    });
  }

  function draw() {
    // Newest first, as each one is added at the end of the file.
    const entries = page.entries.map((entry, index) => ({ entry, index })).reverse();
    const list = entries.length
      ? component('card-stack', { items: entries.map(({ entry, index }) => card(entry, index)).join('') })
      : component('empty-card', { message: page.exists ? 'Nothing has been archived yet.' : page.location + " doesn't exist yet. Archiving a project creates it." });
    contentEl.innerHTML = component('entry-new', { noun: 'archive entry' }) + list;
    const target = contentEl.querySelector('.is-target');
    if (target) target.scrollIntoView({ block: 'start' });
  }

  // Everything but the entity and title can be left empty.
  function askForEntry() {
    const choose = (items, blank) => option('', blank) + items.map((i) => option(i.id, i.name)).join('');
    formDialog({
      heading: 'New archive entry',
      fields:
        component('select-field', { label: 'Entity', name: 'owner', required: true, options: choose(page.owners, 'Choose…') }) +
        component('text-field', { label: 'Title', name: 'title' }) +
        status.dateInput('created', 'Date Created', false) +
        status.dateInput('closed', 'Date Closed', false) +
        status.dateInput('start', 'Timeframe start', false) +
        status.dateInput('end', 'Timeframe end', false) +
        component('select-field', { label: 'Project Dependency', name: 'dependency', required: false, options: choose(page.dependencyChoices, 'None') }) +
        component('select-field', { label: 'Owner', name: 'leader', required: false, options: choose(page.leaders, 'None') }),
      submit: 'Add',
      failure: 'Could not add the entry.',
      send: ({ elements }) =>
        postJson('api/archive-entry', {
          owner: elements.owner.value,
          title: elements.title.value,
          created: elements.created.value,
          closed: elements.closed.value,
          start: elements.start.value,
          end: elements.end.value,
          dependency: elements.dependency.value,
          leader: elements.leader.value,
        }),
      done: async (_, dialog) => {
        dialog.close();
        await load();
      },
    });
  }

  async function removeEntry(entry) {
    if (!(await status.confirmDelete(entry.title, 'Remove this archive entry?', 'Remove'))) return;
    try {
      const result = await postJson('api/archive-remove', { line: entry.line, title: entry.title });
      if (!result.ok) status.toast(result.error || 'Could not remove the entry.');
      await load();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-entry]')) return askForEntry();
    const remove = e.target.closest('[data-remove-archive]');
    if (remove) removeEntry(page.entries[Number(remove.closest('[data-archive]').dataset.archive)]);
  });

  function load() {
    return getJson('api/archive')
      .then((data) => {
        setDateFormat(data.dateFormat);
        status.setHeaderOptions([], [], data.dateFormat); // the date fields' placeholder
        page = data;
        draw();
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the archive', err);
      });
  }

  load();
})();
