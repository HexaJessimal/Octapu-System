// Project page: Overview (summary + milestones), Scratchpad (blocks) and Raw (the whole file).
(function () {
  'use strict';
  const { parseFolder, STATE_LABELS, progressLegend, escapeHtml, markdown: md, status, editing, milestoneControls, documentView, component, readJson, setViewInAddress, UNREACHABLE } = window.PMS;
  const { addButton, progressMeter, fact, titleSpan } = documentView;

  const DEFAULT_VIEW = 'overview';
  const params = new URLSearchParams(location.search);
  const folder = params.get('folder') || '';
  let view = ['scratchpad', 'raw'].includes(params.get('view')) ? params.get('view') : DEFAULT_VIEW;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const typeEl = document.getElementById('project-type');
  const toggles = Array.from(document.querySelectorAll('[data-view]'));

  let project = null;

  function setView(next) {
    editing.close();
    view = next;
    setViewInAddress(view, DEFAULT_VIEW);
    draw();
  }

  toggles.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  // Keep the menu's filter when going back if we came from it.
  const backEl = document.getElementById('back');
  let backHash = '';
  if (document.referrer) {
    try {
      const ref = new URL(document.referrer);
      if (ref.origin === location.origin && /\/(projects\.html)?$/.test(ref.pathname)) {
        backHash = ref.hash;
      }
    } catch (_) {
      /* ignore */
    }
  }

  function draw() {
    toggles.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (!project || editing.isOpen()) return;
    contentEl.innerHTML = view === 'overview' ? renderOverview() : view === 'scratchpad' ? renderScratchpad() : renderRaw();
  }

  editing.init({ project: () => project, redraw: draw });

  const renderOptions = (lineNumbers) => documentView.renderOptions(project, lineNumbers);
  const renderScratchpad = () => documentView.renderScratchpad(project);

  // In the Raw view a double-click always edits the whole file, so the title isn't editable.
  function titleHtml(editable = true) {
    return status.ownerControl(project) + titleSpan(project, editable);
  }

  const renderRaw = () => documentView.fileTabs(project) + documentView.renderRaw(project, documentView.headerOptions(project, () => titleHtml(false), true));

  // A subheading with its add button, then one editable row per timeframe.
  function timeframeFact() {
    const rows = project.timeframe.entries.map((entry, i) =>
      component('timeframe-row', { dates: window.PMS.displayDates(entry), control: status.timeframeEntryControl(project, entry, i) })
    );
    return component('fact-timeframe', {
      control: status.timeframeControl(project),
      body: rows.length ? component('timeframe-list', { rows: rows.join('') }) : component('no-tasks', { message: 'No timeframes yet.' }),
    });
  }

  function factValue(v, kind) {
    if (kind === 'owner' && project.leader) return status.leaderControl(project);
    if (kind === 'reviewed' && !v) return 'Not yet';
    const value = v ? md.inline(v) : '';
    if (kind === 'closed') return value + status.dateControl(project, 'closed', 'Date Closed');
    if (kind === 'dependency') {
      const href = project.dependencyFolder && window.PMS.dependencyHref(project.dependencyFolder);
      return (href ? component('link', { href, label: v }) : escapeHtml(v || '')) + status.dependencyControl(project);
    }
    return value;
  }

  // On an ongoing project Owner has the row to itself. A milestone project's boxes sit in a
  // three by three grid instead, laid out by the facts-grid style.
  const factWidth = (kind) => (project.ongoing && kind === 'owner' ? 'fact-full' : '');

  // The title with its status tag, and key details, at the top of the Overview. In the grid,
  // every box is kept, even when empty, so that each one stays in its place.
  function summaryCard(facts, info, meta, footer) {
    const grid = !project.ongoing;
    const rows = facts
      .filter(([, v, kind]) => v || (kind === 'owner' && (project.leader || grid)) || ['timeframe', 'created', 'reviewed', 'closed', 'dependency'].includes(kind))
      .map(([k, v, kind]) => {
        if (kind === 'timeframe') return timeframeFact();
        return fact(k, factValue(v, kind), factWidth(kind));
      });
    return component('summary-card', { title: (project.title ? titleHtml() : md.inline(meta.title || info.title)) + status.projectStatusControl(project), facts: rows.join(''), grid, footer });
  }

  function renderOverview() {
    const info = parseFolder(project.folder);
    const meta = md.parseMeta(project.content);
    const ms = md.parseMilestones(project.content);

    // ----- key details -----
    const owner = meta.fields.owner || info.owner;
    const milestonesDone = ms.milestones.filter((m) => m.state === 'done').length;
    // In grid order: Owner and Project Dependency, Created and Reviewed, Milestones and
    // Closed, with Active Timeframe down the right of all three rows.
    const facts = [
      ['Owner', owner, 'owner'],
      ['Project Dependency', project.dependency.value, 'dependency'],
      ['Created', meta.fields['date created'] || meta.fields.created, 'created'],
      ['Reviewed', project.dates.reviewed.value, 'reviewed'],
      ['Milestones', milestonesDone + ' / ' + ms.milestones.length + ' complete', 'milestones'],
      ['Closed', project.dates.closed.value, 'closed'],
      ['Active Timeframe', '', 'timeframe'],
    ];
    // Any other **Key**: value fields in the file also appear here.
    meta.order.forEach((key) => {
      const k = key.toLowerCase();
      if (!['owner', 'date created', 'created', 'date reviewed', 'date closed', 'active timeframe', 'project dependency', 'project type'].includes(k)) facts.push([key, meta.fields[k]]);
    });

    if (project.ongoing) {
      const shown = ['owner', 'created', 'reviewed', 'closed'];
      return summaryCard(facts.filter(([, , kind]) => shown.includes(kind)), info, meta, '') + documentView.renderTaskLists(project);
    }

    let total = 0;
    let done = 0;
    ms.milestones.forEach((m) => {
      total += m.total;
      done += m.done;
    });

    let html = summaryCard(facts, info, meta, progressMeter(done, total));

    // ----- milestone bar + cards -----
    html += component('section-heading', { title: 'Milestones', after: addButton('milestone', 'Add a milestone') });
    if (ms.milestones.length) {
      const segments = ms.milestones.map((m, i) => {
        const count = m.total ? m.done + ' / ' + m.total : 'Unplanned';
        return component('progress-nav-segment', { state: m.state, index: i, title: m.title + ': ' + STATE_LABELS[m.state] + ' (' + count + ')', name: m.title, count });
      });
      html += component('progress-nav', { segments: segments.join('') }) + progressLegend();
      html += component('milestone-stack', { cards: ms.milestones.map(milestoneCard).join('') });
    } else {
      html += component('empty-text', { message: 'No milestones yet.' });
    }

    return html;
  }

  function milestoneCard(m, i) {
    const options = Object.assign(renderOptions(m.body.split('\n').map((_, k) => m.firstLine + k)), {
      editAttrs: (item) => editing.attrs('todo', item.line, item.editText),
    });
    const body = md.render(m.body, options);
    const headingLine = m.firstLine - 1;
    const collapsed = milestoneControls.isCollapsed(m.title);
    return component('milestone-card', {
      state: m.state,
      collapsed,
      index: i,
      title: m.title,
      expanded: !collapsed,
      attrs: editing.attrs('milestone', headingLine, m.title),
      heading: md.inline(m.title),
      counts: STATE_LABELS[m.state] + (m.total ? ' · ' + m.done + ' / ' + m.total : '') + (m.cancelled ? ' · ' + m.cancelled + ' cancelled' : ''),
      add: addButton('item', 'Add a checkbox', { line: headingLine, title: m.title }),
      body: body.trim() ? component('doc-body', { body }) : component('no-tasks', { message: m.total ? 'Milestone complete' : 'No tasks yet.' }),
    });
  }

  // The minus button on a milestone deletes it, and everything under it, after asking.
  async function removeMilestone(card) {
    const title = card.dataset.title;
    if (!(await status.confirmDelete(title, 'Delete this milestone and everything in it?'))) return;
    try {
      const result = await editing.post('api/milestone-remove', { line: Number(card.querySelector('h3').dataset.line), title });
      if (!result.ok) status.toast(result.error || 'Could not delete that.');
      await status.refresh();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  document.addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove-milestone]');
    if (remove) removeMilestone(remove.closest('.milestone'));
  });

  function showError(msg) {
    titleEl.textContent = 'Project not found';
    contentEl.innerHTML = component('error-card', { message: msg });
  }

  if (!folder) {
    showError('No project was selected.');
  } else {
    const info = parseFolder(folder);
    titleEl.textContent = info.title;
    document.title = info.title + ' · Octapu System';

    const file = params.get('file');
    const load = () =>
      readJson('api/project?folder=' + encodeURIComponent(folder) + (file ? '&file=' + encodeURIComponent(file) : ''))
        .then(({ ok, data }) => {
          if (!ok) throw new Error(data.error || 'Could not load project.');
          backEl.href = 'projects.html?dir=' + encodeURIComponent(data.directory) + backHash;
          backEl.innerHTML = component('back-link', { label: data.directory });
          window.PMS.setDateFormat(data.dateFormat);
          status.setStatuses(data.statuses);
          status.setHeaderOptions(data.owners, data.leaders, data.dateFormat, data.dependencyOptions, data.projectTypes);
          // Only on the first load, so finishing a milestone doesn't close it while you work.
          if (!project) milestoneControls.closeFinished(md.parseMilestones(data.content).milestones);
          project = data;
          typeEl.innerHTML = status.projectTypeControl(project);
          draw();
        })
        .catch((err) => showError(err.message));
    status.onChange(load);
    load();
  }

  draw();
})();
