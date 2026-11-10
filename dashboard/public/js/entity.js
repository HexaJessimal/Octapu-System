// Entity page: a tab for the entity and each one under it, laid out like a
// project page but with a single Tasks list in place of the milestones.
(function () {
  'use strict';
  const { markdown: md, status, editing, documentView, component, readJson, normalText, hashReference, setViewInAddress, suggestIdFrom, postJson, formDialog } = window.PMS;
  const { progressMeter, fact, titleSpan } = documentView;

  const DEFAULT_VIEW = 'overview';
  const params = new URLSearchParams(location.search);
  let view = ['scratchpad', 'raw'].includes(params.get('view')) ? params.get('view') : DEFAULT_VIEW;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const tabsEl = document.getElementById('org-tabs');
  const toggles = Array.from(document.querySelectorAll('[data-view]'));

  let org = null;

  function tabHref(id) {
    const query = new URLSearchParams({ id: org.root });
    if (id !== org.root) query.set('tab', id);
    if (view !== DEFAULT_VIEW) query.set('view', view);
    return 'entity.html?' + query.toString();
  }

  function drawTabs() {
    tabsEl.innerHTML =
      org.tabs.map((t) => component('org-tab', { href: tabHref(t.id), current: t.id === org.id, name: t.name })).join('') + component('org-tab-add');
  }

  function setView(next) {
    editing.close();
    view = next;
    setViewInAddress(view, DEFAULT_VIEW);
    drawTabs();
    draw();
  }

  toggles.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  function renderSummary() {
    const meta = md.parseMeta(org.content);
    const tasks = documentView.taskRows(org);
    const done = tasks.filter((t) => t.mark === 'x').length;
    const reviewed = org.dates.reviewed.value;
    const created = meta.fields['date created'] || meta.fields.created;
    const known = ['owner', 'date created', 'created', 'date reviewed', 'date closed'];
    return component('summary-card', {
      title: org.title ? titleSpan(org, true) : window.PMS.escapeHtml(org.name),
      facts:
        (org.leader ? fact('Owner', status.leaderControl(org), 'fact-full') : '') +
        fact('Created', created ? md.inline(created) : '') +
        fact('Reviewed', reviewed ? md.inline(reviewed) : 'Not yet') +
        fact('Incomplete tasks', String(tasks.length - done)) +
        meta.order.filter((key) => !known.includes(key.toLowerCase())).map((key) => fact(key, md.inline(meta.fields[key.toLowerCase()]))).join(''),
      grid: false,
      footer: progressMeter(done, tasks.length),
    });
  }

  function renderRaw() {
    return documentView.renderRaw(org, documentView.headerOptions(org, () => titleSpan(org, false)));
  }

  function draw() {
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (!org || editing.isOpen()) return;
    if (!org.file) {
      contentEl.innerHTML = component('error-card', { message: 'This entity has no markdown file yet. It belongs at ' + org.location });
      return;
    }
    contentEl.innerHTML =
      documentView.fileTabs(org, true) +
      (view === 'overview' ? renderSummary() + documentView.renderTaskLists(org) : view === 'scratchpad' ? documentView.renderScratchpad(org) : renderRaw());
  }

  editing.init({ project: () => org, redraw: draw });

  function askForTentacle() {
    const form = formDialog({
      heading: 'New tentacle of ' + org.tabs[0].name,
      fields: component('text-field', { label: 'Name', name: 'name' }) + component('text-field', { label: 'ID', name: 'id' }),
      submit: 'Create',
      failure: 'Could not create the tentacle.',
      send: ({ elements }) => postJson('api/entities', { parent: org.root, name: elements.name.value, id: elements.id.value }),
      done: (result) => {
        location.href = tabHref(result.body.id);
      },
    });
    suggestIdFrom(form.elements.name, form.elements.id);
  }

  tabsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-entity]')) askForTentacle();
  });

  function showError(title, message) {
    titleEl.textContent = title;
    contentEl.innerHTML = component('error-card', { message });
  }

  // True if this Scratchpad block is titled `wanted`, or has it as a heading inside.
  function blockHasHeading(block, wanted) {
    if (block.title !== null && normalText(block.title) === wanted) return true;
    return block.body.split('\n').some((line) => {
      const heading = line.match(/^#{3,6}\s+(.*?)\s*#*\s*$/);
      return heading && normalText(heading[1]) === wanted;
    });
  }

  // Opens the section named after the # in the address: task lists are on the Overview, and
  // any other heading is on the Scratchpad.
  function goToTarget() {
    if (!org || !org.file || !location.hash) return;
    const reference = hashReference();
    editing.close();
    const wanted = normalText(reference);
    const list = org.taskLists.findIndex((l) => normalText(l.name) === wanted);
    const index = list !== -1 ? -1 : org.blocks.findIndex((b) => blockHasHeading(b, wanted));
    if (list === -1 && index === -1) {
      status.toast('No heading called "' + reference + '" in ' + org.name + '.');
      return;
    }
    view = list !== -1 ? 'overview' : 'scratchpad';
    drawTabs();
    draw();
    const target = list !== -1 ? contentEl.querySelector('#task-list-' + list) : contentEl.querySelectorAll('.scratch-block')[index];
    if (target) {
      target.classList.add('is-target');
      target.scrollIntoView({ block: 'start' });
    }
  }

  window.addEventListener('hashchange', goToTarget);

  let firstLoad = true;

  function load() {
    const query = new URLSearchParams({ id: params.get('id') || '' });
    ['tab', 'file'].forEach((key) => {
      if (params.get(key)) query.set(key, params.get(key));
    });
    return readJson('api/entity?' + query.toString())
      .then(({ ok, data }) => {
        if (!ok) return showError('Entity not found', data.error || 'Could not load this entity.');
        window.PMS.setDateFormat(data.dateFormat);
        if (data.file) {
          status.setStatuses(data.statuses);
          status.setHeaderOptions(data.owners, data.leaders, data.dateFormat, []);
        }
        org = data;
        titleEl.textContent = data.name;
        document.title = data.name + ' · Octapu System';
        drawTabs();
        draw();
        if (firstLoad) goToTarget();
        firstLoad = false;
      })
      .catch((err) => showError('Entity not found', err.message));
  }

  status.onChange(load);
  load();
})();
