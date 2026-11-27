// Incubator: ideas for projects, kept in _Incubator.md. The plus button adds one. Each can be
// promoted to a Milestone project, after asking for its timeframe and leader, or archived.
// Double-click an idea's name, dependency or notes to edit them. Raw shows and edits the whole
// file, and Changelog appears in multi-user mode, as on the Archive Index.
(function () {
  'use strict';
  const { status, editing, documentView, changes, setViewInAddress, normalText, hashReference, markdown: md, component, getJson, postJson, setDateFormat, loadError, UNREACHABLE, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  const toggles = Array.from(document.querySelectorAll('[data-view]'));
  const DEFAULT_VIEW = 'ideas';
  const requested = new URLSearchParams(location.search).get('view');
  let view = changes.viewNames(['raw']).includes(requested) ? requested : DEFAULT_VIEW;
  let page = null;

  function setView(next) {
    editing.close();
    view = next;
    setViewInAddress(view, DEFAULT_VIEW);
    draw();
  }

  toggles.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  const option = (value, label) => component('option', { value, label, selected: false });
  const choose = (items) => option('', 'Choose…') + items.map((i) => option(i.id, i.name)).join('');

  // The name edits the whole heading, tentacle ID and all, and the notes edit everything
  // below it, as written in the file. A dependency the idea hasn't got can only be added in Raw.
  function card(idea, index) {
    const dependency = idea.dependencies.length ? window.PMS.dependencyLinks(idea.dependencies) : 'None';
    return component('idea-card', Object.assign(documentView.sectionReview(page, idea.line, idea.title, idea.reviewed, idea.flagged), {
      flagged: idea.flagged,
      index,
      target: normalText(idea.title) === normalText(hashReference()),
      name: idea.name,
      titleAttrs: editing.attrs('block', idea.line, idea.title),
      tentacle: idea.tentacleName || idea.tentacleId,
      dependency,
      dependencyAttrs: idea.raw.line ? editing.attrs('value', idea.raw.line, idea.raw.value) : '',
      // Inline formatting line by line, with the line breaks kept by the idea-notes style.
      notes: idea.notes ? idea.notes.split('\n').map(md.inline).join('\n') : 'None',
      notesAttrs: idea.body === null ? '' : editing.attrs('body', idea.line, idea.body),
    }));
  }

  function draw() {
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (!page || editing.isOpen()) return;
    changes.cancelChangelog();
    const missing = page.location + " doesn't exist yet. Adding an idea creates it.";
    if (view === 'changelog') return changes.drawChangelog(page, contentEl);
    if (view === 'raw') {
      contentEl.innerHTML = page.exists ? documentView.renderRaw(page) : component('empty-card', { message: missing });
      return;
    }
    const list = page.ideas.length
      ? component('card-stack', { items: page.ideas.map(card).join('') })
      : component('empty-card', { message: page.exists ? 'No ideas waiting.' : missing });
    contentEl.innerHTML = component('entry-new', { noun: 'idea' }) + list;
    const target = contentEl.querySelector('.is-target');
    if (target) target.scrollIntoView({ block: 'start' });
  }

  async function reload(dialog) {
    if (dialog) dialog.close();
    await status.refresh(); // reloads this page, and the menu and sidebar, which can change too
  }

  function askForIdea() {
    const form = formDialog({
      heading: 'New idea',
      fields:
        component('text-field', { label: 'Title', name: 'title' }) +
        component('select-field', { label: 'Tentacle', name: 'tentacle', required: true, options: choose(page.tentacles) }) +
        component('dependency-picker') +
        component('notes-field', { label: 'Notes', name: 'notes' }),
      submit: 'Add',
      failure: 'Could not add the idea.',
      send: (f) =>
        postJson('api/incubator', { title: f.elements.title.value, tentacle: f.elements.tentacle.value, dependencies: window.PMS.readDependencyPicker(f), notes: f.elements.notes.value }),
      done: (_, dialog) => reload(dialog),
    });
    window.PMS.dependencyPicker(form, page.dependencyChoices, []);
  }

  // The directory is only asked for when there's more than one to choose from.
  function askToPromote(idea) {
    const dirs = page.directories;
    formDialog({
      heading: 'Promote "' + idea.name + '"',
      fields:
        status.dateInput('start', 'Timeframe start', true) +
        status.dateInput('end', 'Timeframe end', true) +
        component('select-field', { label: 'Leader', name: 'leader', required: true, options: choose(page.leaders) }) +
        (dirs.length > 1 ? component('select-field', { label: 'Directory', name: 'directory', required: true, options: choose(dirs.map((d) => ({ id: d, name: d }))) }) : ''),
      submit: 'Create project',
      failure: 'Could not create the project.',
      send: ({ elements }) =>
        postJson('api/incubator-promote', {
          line: idea.line,
          title: idea.title,
          start: elements.start.value,
          end: elements.end.value,
          leader: elements.leader.value,
          directory: elements.directory ? elements.directory.value : undefined,
        }),
      done: (result) => location.assign('project.html?folder=' + encodeURIComponent(result.body.folder)),
    });
  }

  async function archiveIdea(idea) {
    if (!(await status.confirmDelete(idea.name, 'Archive this idea?', 'Archive'))) return;
    try {
      const result = await postJson('api/incubator-archive', { line: idea.line, title: idea.title });
      if (!result.ok) status.toast(result.error || 'Could not archive the idea.');
      await reload();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-entry]')) return askForIdea();
    const cardEl = e.target.closest('[data-idea]');
    if (!cardEl) return;
    const idea = page.ideas[Number(cardEl.dataset.idea)];
    if (e.target.closest('[data-promote-idea]')) askToPromote(idea);
    else if (e.target.closest('[data-archive-idea]')) archiveIdea(idea);
  });

  function load() {
    return getJson('api/incubator')
      .then((data) => {
        setDateFormat(data.dateFormat);
        status.setHeaderOptions([], [], data.dateFormat); // the date fields' placeholder
        page = data;
        draw();
        changes.showConflicts(page);
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the Incubator', err);
      });
  }

  editing.init({ project: () => page, redraw: draw });
  // Saving an edit reloads every view.
  status.onChange(load);
  load();
})();
