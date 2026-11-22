// Tentacle page: a tab for the tentacle and each one under it, laid out like a
// project page but with a single Tasks list in place of the milestones.
(function () {
  'use strict';
  const { markdown: md, status, editing, documentView, changes, component, readJson, normalText, hashReference, setViewInAddress, suggestIdFrom, postJson, formDialog } = window.PMS;
  const { progressMeter, fact, titleSpan } = documentView;

  const DEFAULT_VIEW = 'overview';
  const params = new URLSearchParams(location.search);
  let view = changes.viewNames(['scratchpad', 'raw']).includes(params.get('view')) ? params.get('view') : DEFAULT_VIEW;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const tabsEl = document.getElementById('org-tabs');
  const toggles = Array.from(document.querySelectorAll('[data-view]'));
  // The Timeline shows the open tab's own projects. timeline.js reads this when it loads.
  const timelineEl = document.getElementById('timeline');
  const timelineHolder = document.getElementById('timeline-holder');
  timelineEl.dataset.tentacle = params.get('tab') || params.get('id') || '';

  let org = null;

  function tabHref(id) {
    const query = new URLSearchParams({ id: org.root });
    if (id !== org.root) query.set('tab', id);
    if (view !== DEFAULT_VIEW) query.set('view', view);
    return 'tentacle.html?' + query.toString();
  }

  // Levels below this share one colour.
  const DEEPEST_LEVEL = 2;
  const levelName = (level) => (level > DEEPEST_LEVEL ? 'deep' : String(level));

  // The open tab's tentacle and those above it, top-level first.
  function openPath() {
    const byId = new Map(org.tabs.map((t) => [t.id, t]));
    const chain = [];
    for (let t = byId.get(org.id); t && !chain.includes(t.id); t = byId.get(t.parent)) chain.unshift(t.id);
    return chain;
  }

  // A row for the top-level tentacle, then a row below each tentacle on the open path for
  // those under it. Tabs on the path are underlined faintly, and the open one fully. The
  // plus button ends the last row.
  function drawTabs() {
    const path = openPath();
    const tab = (t) => component('org-tab', { href: tabHref(t.id), current: t.id === org.id, onPath: t.id !== org.id && path.includes(t.id), name: t.name, level: levelName(t.level) });
    const rows = [org.tabs.filter((t) => t.level === 0)].concat(path.map((id) => org.tabs.filter((t) => t.parent === id)).filter((row) => row.length));
    tabsEl.innerHTML = rows.map((row, i) => component('org-tab-row', { tabs: row.map(tab).join(''), add: i === rows.length - 1 ? component('org-tab-add') : '' })).join('');
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
    const created = meta.fields['date created'] || meta.fields.created;
    const known = ['leader', 'owner', 'date created', 'created', 'date reviewed', 'date closed', 'flagged for review'];
    return component('summary-card', {
      corner: documentView.folderButton(org),
      title: org.title ? titleSpan(org, true) : window.PMS.escapeHtml(org.name),
      facts:
        (org.leader ? fact('Leader', status.leaderControl(org), 'fact-full') : '') +
        fact('Created', created ? md.inline(created) : '') +
        fact('Reviewed', status.reviewedValue(org)) +
        fact('Incomplete tasks', String(tasks.length - done)) +
        fact('Parent', org.parentId ? component('link', { href: tabHref(org.parentId), label: org.parentName }) : 'None (top level)') +
        meta.order.filter((key) => !known.includes(key.toLowerCase())).map((key) => fact(key, md.inline(meta.fields[key.toLowerCase()]))).join(''),
      grid: false,
      quarters: true,
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
      contentEl.innerHTML = component('error-card', { message: 'This tentacle has no markdown file yet. It belongs at ' + org.location });
      return;
    }
    changes.cancelChangelog();
    if (view === 'changelog') return changes.drawChangelog(org, contentEl, documentView.fileTabs(org));
    // The Timeline is put back in its hidden holder first, so the redraw doesn't remove it.
    timelineHolder.append(timelineEl);
    contentEl.innerHTML =
      documentView.fileTabs(org) +
      (view === 'overview' ? renderSummary() + component('tentacle-timeline') + documentView.renderTaskLists(org) : view === 'scratchpad' ? documentView.renderScratchpad(org) : renderRaw());
    const slot = contentEl.querySelector('[data-timeline-slot]');
    if (slot) {
      slot.replaceWith(timelineEl);
      window.dispatchEvent(new Event('resize')); // it sizes its months to the room it now has
    }
  }

  editing.init({ project: () => org, redraw: draw });

  // A new tentacle goes under the open tab's tentacle, unless another is chosen.
  function askForTentacle() {
    const parents = org.tabs.map((t) => component('option', { value: t.id, label: t.name, selected: t.id === org.id })).join('');
    const form = formDialog({
      heading: 'New tentacle',
      fields:
        component('text-field', { label: 'Name', name: 'name' }) +
        component('text-field', { label: 'ID', name: 'id' }) +
        component('select-field', { label: 'Under', name: 'parent', required: true, options: parents }),
      submit: 'Create',
      failure: 'Could not create the tentacle.',
      send: ({ elements }) => postJson('api/tentacles', { parent: elements.parent.value, name: elements.name.value, id: elements.id.value }),
      done: (result) => {
        location.href = tabHref(result.body.id);
      },
    });
    suggestIdFrom(form.elements.name, form.elements.id);
  }

  tabsEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-new-tentacle]')) askForTentacle();
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
    return readJson('api/tentacle?' + query.toString())
      .then(({ ok, data }) => {
        if (!ok) return showError('Tentacle not found', data.error || 'Could not load this tentacle.');
        window.PMS.setDateFormat(data.dateFormat);
        if (data.file) {
          status.setStatuses(data.statuses);
          status.setHeaderOptions(data.tentacles, data.leaders, data.dateFormat, []);
        }
        org = data;
        titleEl.textContent = data.name;
        document.title = data.name + ' · Octapu System';
        drawTabs();
        draw();
        changes.showConflicts(data);
        if (firstLoad) goToTarget();
        firstLoad = false;
      })
      .catch((err) => showError('Tentacle not found', err.message));
  }

  status.onChange(load);
  load();
})();
