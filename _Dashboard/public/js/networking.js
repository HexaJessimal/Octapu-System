// Networking pages: the contacts in Leads.md or the events in Events.md, as cards of editable
// fields, and a Scratchpad of everything else in the file.
(function () {
  'use strict';
  const { markdown: md, status, editing, documentView, changes, component, escapeHtml, getJson, normalText, hashReference, setViewInAddress, loadError, UNREACHABLE, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const toggles = Array.from(document.querySelectorAll('[data-view]'));
  const params = new URLSearchParams(location.search);
  const page = params.get('page') === 'events' ? 'events' : 'leads';
  let view = changes.viewNames(['scratchpad', 'raw']).includes(params.get('view')) ? params.get('view') : 'list';

  md.setNetworkingPage(page);

  let doc = null;
  let shown = []; // the entries on screen, indexed by data-entry
  let highlighted = null; // the title of the entry a [[reference]] led to

  function setView(next) {
    editing.close();
    highlighted = null;
    view = next;
    setViewInAddress(view, 'list');
    draw();
  }

  toggles.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // An event's dates and Yes/No fields have their own controls. A value the dashboard can't
  // read is shown as it is, in the error colour, until it's changed or Compatibility fixes it.
  function ownControlRow(field) {
    if (field.kind === 'yesno' && field.valid) {
      const on = field.value.trim() === 'Yes';
      return component('entry-value', { label: field.label, body: component('entry-check', { on, checked: String(on), label: field.label }) });
    }
    const value = field.value.trim();
    const text = !field.valid ? escapeHtml(value) : value ? escapeHtml(window.PMS.displayDates(value).replace(/ to /, ' – ')) : 'Not set';
    const edit = field.kind === 'yesno' ? '' : component('entry-date-edit', { label: field.label, set: Boolean(value), action: (value ? 'Change ' : 'Add ') + field.label });
    return component('entry-value', { label: field.label, invalid: !field.valid, body: text + edit });
  }

  // Double-click a value to edit it. Statuses and checkboxes work as elsewhere.
  function fieldRow(field) {
    if (field.kind) return ownControlRow(field);
    const body = field.value
      ? md.render(field.value, documentView.renderOptions(doc, field.value.split('\n').map((_, k) => field.bodyLine + k)))
      : component('no-tasks', { message: 'Double-click to add.' });
    return component('entry-field', { intro: field.label === null, label: field.label, attrs: editing.attrs('field', field.line, field.value), missing: field.missing, body });
  }

  // ---------- events: how far each has got, and filtering by it ----------

  // `progress` comes from the server: booked, applied (but not yet booked) or open.
  const FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Not applied' },
    { key: 'applied', label: 'Applied' },
    { key: 'booked', label: 'Booked' },
  ];
  // Kept in the address's query, as the # is used for links to an entry.
  let filter = FILTERS.some((f) => f.key === params.get('filter')) ? params.get('filter') : 'all';

  function setFilter(next) {
    filter = next;
    const query = new URLSearchParams(location.search);
    if (filter === 'all') query.delete('filter');
    else query.set('filter', filter);
    history.replaceState(null, '', '?' + query.toString() + location.hash);
    draw();
  }

  const passes = (entry) => filter === 'all' || entry.progress === filter;

  function filterChips() {
    const all = doc.sections.flatMap((s) => s.entries).concat(doc.past);
    const chips = FILTERS.map(({ key, label }) =>
      component('event-filter', { key, label, pressed: String(key === filter), count: key === 'all' ? all.length : all.filter((e) => e.progress === key).length })
    );
    return component('event-filters', { chips: chips.join('') });
  }

  function entryCard(entry) {
    shown.push(entry);
    return component('entry-card', {
      progress: entry.progress && entry.progress !== 'open' ? entry.progress : '',
      target: entry.title === highlighted,
      index: shown.length - 1,
      attrs: editing.attrs('entry', entry.line, entry.title),
      title: md.inline(entry.title),
      noun: doc.noun,
      name: entry.title,
      fields: entry.fields.map(fieldRow).join(''),
    });
  }

  function section(title, entries) {
    return component('section-heading', { title, after: component('count', { count: entries.length }) }) + component('card-stack', { items: entries.map(entryCard).join('') });
  }

  function renderList() {
    shown = [];
    const events = page === 'events';
    const lists = doc.sections.map((s) => [s.title, s.entries]).concat(doc.past.length ? [['Past Events', doc.past]] : []);
    const sections = lists.map(([title, entries]) => [title, entries.filter(passes)]).filter(([, entries]) => entries.length).map(([title, entries]) => section(title, entries));
    const empty = lists.length ? 'No events match.' : 'Nothing found in ' + doc.location + '.';
    return (events ? filterChips() : '') + component('entry-new', { noun: doc.noun }) + (sections.length ? sections.join('') : component('empty-card', { message: empty }));
  }

  function draw() {
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (!doc || editing.isOpen()) return;
    if (!doc.file) {
      contentEl.innerHTML = component('empty-card', { message: doc.location + " doesn't exist yet." });
      return;
    }
    changes.cancelChangelog();
    if (view === 'changelog') return changes.drawChangelog(doc, contentEl);
    contentEl.innerHTML = view === 'list' ? renderList() : view === 'scratchpad' ? documentView.renderScratchpad(doc) : documentView.renderRaw(doc);
  }

  editing.init({ project: () => doc, redraw: draw });

  function askForEntry() {
    const choices = doc.sectionNames.map((name) => component('option', { value: name, selected: false, label: name })).join('');
    formDialog({
      heading: 'New ' + doc.noun,
      fields: component('text-field', { label: 'Name', name: 'title' }) + (doc.sectionNames.length > 1 ? component('select-field', { label: 'Heading', name: 'section', required: false, options: choices }) : ''),
      submit: 'Add',
      failure: 'Could not add that.',
      send: ({ elements }) => editing.post('api/entry-add', { title: elements.title.value, section: (elements.section ? elements.section.value : doc.sectionNames[0]) || '' }),
      done: (_, dialog) => {
        dialog.close();
        return status.refresh();
      },
    });
  }

  async function removeEntry(entry) {
    if (!(await status.confirmDelete(entry.title, 'Delete this ' + doc.noun + '?'))) return;
    try {
      const result = await editing.post('api/entry-remove', { line: entry.line, title: entry.title });
      if (!result.ok) status.toast(result.error || 'Could not delete that.');
      await status.refresh();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  async function sendEventField(entry, body) {
    const result = await editing.post('api/event-field', Object.assign({ line: entry.line, title: entry.title }, body));
    if (result.ok) await status.refresh();
    return result;
  }

  // Event Date takes an optional end date, for an event of several days. Both dates left
  // empty clear the field.
  function askForDate(entry, label) {
    const field = entry.fields.find((f) => f.label === label);
    const parts = field && field.valid ? field.value.trim().split(/\s+to\s+/) : [];
    const [start = '', end = ''] = parts;
    const range = label === 'Event Date';
    const input = (name, text, stored) => status.dateInput(name, text, false, stored ? window.PMS.displayDate(stored) : '', stored);
    formDialog({
      heading: label + ': ' + entry.title,
      fields: input('start', range ? 'Start' : 'Date', start) + (range ? input('end', 'End (for more than one day)', end) : ''),
      submit: 'Save',
      failure: 'Could not save that.',
      send: ({ elements }) => sendEventField(entry, { label, start: elements.start.value, end: range ? elements.end.value : '' }),
      done: (_, dialog) => dialog.close(),
    });
  }

  async function toggleCheck(entry, label, on) {
    try {
      const result = await sendEventField(entry, { label, value: on ? 'No' : 'Yes' });
      if (!result.ok) status.toast(result.error || 'Could not save that.');
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-entry]')) return askForEntry();
    const chip = e.target.closest('[data-event-filter]');
    if (chip) return setFilter(chip.dataset.eventFilter);
    const dateButton = e.target.closest('[data-event-date]');
    if (dateButton) return askForDate(shown[Number(dateButton.closest('[data-entry]').dataset.entry)], dateButton.dataset.eventDate);
    const check = e.target.closest('[data-event-check]');
    if (check) return toggleCheck(shown[Number(check.closest('[data-entry]').dataset.entry)], check.dataset.eventCheck, check.getAttribute('aria-checked') === 'true');
    const remove = e.target.closest('[data-remove-entry]');
    if (remove) removeEntry(shown[Number(remove.closest('[data-entry]').dataset.entry)]);
  });

  // The title `reference` points to. "Scott" also finds "Scott (SWOLE)" if nothing is exact.
  function matchTitle(titles, reference) {
    const wanted = normalText(reference);
    return titles.find((t) => normalText(t) === wanted) || titles.find((t) => normalText(t.replace(/\s*\([^)]*\)\s*$/, '')) === wanted);
  }

  // Opens the entry or Scratchpad block named after the # in the address. A reference with
  // no file name may really be on the other page, so that's tried before giving up.
  function goToTarget() {
    if (!doc || !doc.file || !location.hash) return;
    const reference = hashReference();
    editing.close();

    const entry = matchTitle(doc.sections.flatMap((s) => s.entries).concat(doc.past).map((e) => e.title), reference);
    const block = entry ? null : matchTitle(doc.blocks.map((b) => b.title).filter(Boolean), reference);
    if (entry || block) {
      view = entry ? 'list' : 'scratchpad';
      highlighted = entry || null;
      draw();
      const target = entry
        ? contentEl.querySelector('.is-target')
        : Array.from(contentEl.querySelectorAll('.scratch-title')).find((el) => el.textContent.trim() === block);
      if (target) target.scrollIntoView({ block: 'start' });
      return;
    }
    const other = doc.others.find((o) => matchTitle(o.titles, reference));
    if (other) location.replace('networking.html?page=' + other.page + location.hash);
    else status.toast('No heading called "' + reference + '" in ' + doc.location + '.');
  }

  window.addEventListener('hashchange', goToTarget);

  let firstLoad = true;

  function load() {
    return getJson('api/networking?page=' + page)
      .then((data) => {
        window.PMS.setDateFormat(data.dateFormat);
        status.setHeaderOptions([], [], data.dateFormat); // the date fields' placeholder
        if (data.file) status.setStatuses(data.statuses);
        doc = data;
        titleEl.textContent = data.title;
        document.title = data.title + ' · Octapu System';
        const listTab = toggles.find((b) => b.dataset.view === 'list');
        if (listTab) listTab.textContent = data.tab;
        draw();
        changes.showConflicts(data);
        if (firstLoad) goToTarget();
        firstLoad = false;
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('this page', err);
      });
  }

  status.onChange(load);
  load();
})();
