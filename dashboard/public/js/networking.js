// Networking pages: the contacts in Leads.md or the events in Events.md, as cards of editable
// fields, and a Scratchpad of everything else in the file.
(function () {
  'use strict';
  const { markdown: md, status, editing, documentView, component, getJson, normalText, hashReference, setViewInAddress, loadError, UNREACHABLE, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const toggles = Array.from(document.querySelectorAll('[data-view]'));
  const params = new URLSearchParams(location.search);
  const page = params.get('page') === 'events' ? 'events' : 'leads';
  let view = ['scratchpad', 'raw'].includes(params.get('view')) ? params.get('view') : 'list';

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

  // Double-click a value to edit it. Statuses and checkboxes work as elsewhere.
  function fieldRow(field) {
    const body = field.value
      ? md.render(field.value, documentView.renderOptions(doc, field.value.split('\n').map((_, k) => field.bodyLine + k)))
      : component('no-tasks', { message: 'Double-click to add.' });
    return component('entry-field', { intro: field.label === null, label: field.label, attrs: editing.attrs('field', field.line, field.value), missing: field.missing, body });
  }

  function entryCard(entry) {
    shown.push(entry);
    return component('entry-card', {
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
    const sections = doc.sections.map((s) => section(s.title, s.entries));
    if (doc.past.length) sections.push(section('Past events', doc.past));
    return component('entry-new', { noun: doc.noun }) + (sections.length ? sections.join('') : component('empty-card', { message: 'Nothing found in ' + doc.location + '.' }));
  }

  function draw() {
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (!doc || editing.isOpen()) return;
    if (!doc.file) {
      contentEl.innerHTML = component('empty-card', { message: doc.location + " doesn't exist yet." });
      return;
    }
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

  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-entry]')) return askForEntry();
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
        if (data.file) status.setStatuses(data.statuses);
        doc = data;
        titleEl.textContent = data.title;
        document.title = data.title + ' · Octapu System';
        const listTab = toggles.find((b) => b.dataset.view === 'list');
        if (listTab) listTab.textContent = data.tab;
        draw();
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
