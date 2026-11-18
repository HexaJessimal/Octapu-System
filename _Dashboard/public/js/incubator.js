// Incubator: ideas for projects, kept in _Incubator.md. The plus button adds one. Each can be
// promoted to a Milestone project, after asking for its timeframe and owner, or archived.
(function () {
  'use strict';
  const { status, markdown: md, component, getJson, postJson, setDateFormat, loadError, UNREACHABLE, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  let page = null;

  const option = (value, label) => component('option', { value, label, selected: false });
  const choose = (items) => option('', 'Choose…') + items.map((i) => option(i.id, i.name)).join('');

  function card(idea, index) {
    return component('idea-card', {
      index,
      name: idea.name,
      owner: idea.ownerName || idea.ownerId,
      dependency: idea.dependency || 'None',
      // Inline formatting line by line, with the line breaks kept by the idea-notes style.
      notes: idea.notes ? idea.notes.split('\n').map(md.inline).join('\n') : '',
    });
  }

  function draw() {
    const list = page.ideas.length
      ? component('card-stack', { items: page.ideas.map(card).join('') })
      : component('empty-card', { message: page.exists ? 'No ideas waiting.' : page.location + " doesn't exist yet. Adding an idea creates it." });
    contentEl.innerHTML = component('entry-new', { noun: 'idea' }) + list;
  }

  async function reload(dialog) {
    if (dialog) dialog.close();
    await load();
    status.refresh(); // the menu and sidebar can change too
  }

  function askForIdea() {
    const dependencies = [{ id: '', name: 'None' }].concat(page.dependencyChoices.map((name) => ({ id: name, name })));
    formDialog({
      heading: 'New idea',
      fields:
        component('text-field', { label: 'Title', name: 'title' }) +
        component('select-field', { label: 'Entity', name: 'owner', required: true, options: choose(page.owners) }) +
        component('select-field', { label: 'Project Dependency', name: 'dependency', required: false, options: dependencies.map((d) => option(d.id, d.name)).join('') }) +
        component('notes-field', { label: 'Notes', name: 'notes' }),
      submit: 'Add',
      failure: 'Could not add the idea.',
      send: ({ elements }) =>
        postJson('api/incubator', { title: elements.title.value, owner: elements.owner.value, dependency: elements.dependency.value, notes: elements.notes.value }),
      done: (_, dialog) => reload(dialog),
    });
  }

  // The directory is only asked for when there's more than one to choose from.
  function askToPromote(idea) {
    const dirs = page.directories;
    formDialog({
      heading: 'Promote "' + idea.name + '"',
      fields:
        status.dateInput('start', 'Timeframe start', true) +
        status.dateInput('end', 'Timeframe end', true) +
        component('select-field', { label: 'Owner', name: 'leader', required: true, options: choose(page.leaders) }) +
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
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the Incubator', err);
      });
  }

  load();
})();
