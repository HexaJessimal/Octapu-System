// Project page: Overview (summary + milestones), Scratchpad (blocks), Raw (the whole file) and,
// in multi-user mode, Changelog.
(function () {
  'use strict';
  const { parseFolder, STATE_LABELS, progressLegend, markdown: md, status, editing, milestoneControls, documentView, changes, component, readJson, setViewInAddress, normalText, hashReference, UNREACHABLE } = window.PMS;
  const { addButton, progressMeter, fact, titleSpan } = documentView;

  const DEFAULT_VIEW = 'overview';
  const params = new URLSearchParams(location.search);
  const folder = params.get('folder') || '';
  let view = changes.viewNames(['scratchpad', 'raw']).includes(params.get('view')) ? params.get('view') : DEFAULT_VIEW;

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
    changes.cancelChangelog();
    if (view === 'changelog') return changes.drawChangelog(project, contentEl, documentView.fileTabs(project));
    contentEl.innerHTML =
      documentView.fileTabs(project) + (view === 'overview' ? renderOverview() : view === 'scratchpad' ? renderScratchpad() : renderRaw());
  }

  editing.init({ project: () => project, redraw: draw });

  const renderOptions = (lineNumbers, where) => documentView.renderOptions(project, lineNumbers, where);
  const renderScratchpad = () => documentView.renderScratchpad(project);

  // In the Raw view a double-click always edits the whole file, so the title isn't editable.
  function titleHtml(editable = true) {
    return status.tentacleControl(project) + titleSpan(project, editable);
  }

  const renderRaw = () => documentView.renderRaw(project, documentView.headerOptions(project, () => titleHtml(false), true));

  // A subheading with its add button, then one editable row per timeframe.
  function timeframeFact() {
    const rows = project.timeframe.entries.map((entry, i) => {
      const { dates, milestones } = window.PMS.splitTimeframe(entry);
      return component('timeframe-row', { dates: window.PMS.displayDates(dates), milestones: milestones ? milestones.join(', ') : '', control: status.timeframeEntryControl(project, entry, i) });
    });
    return component('fact-timeframe', {
      control: status.timeframeControl(project),
      body: rows.length ? component('timeframe-list', { rows: rows.join('') }) : component('no-tasks', { message: 'No timeframes yet.' }),
    });
  }

  function factValue(v, kind) {
    if (kind === 'leader' && project.leader) return status.leaderControl(project);
    if (kind === 'reviewed') return status.reviewedValue(project);
    const value = v ? md.inline(v) : '';
    if (kind === 'closed') return value + status.dateControl(project, 'closed', 'Date Closed');
    if (kind === 'dependency') {
      return window.PMS.dependencyLinks(project.dependencies || []) + status.dependencyControl(project);
    }
    return value;
  }

  // On an ongoing project Leader has the row to itself. A milestone project's boxes sit in a
  // three by three grid instead, laid out by the facts-grid style.
  const factWidth = (kind) => (project.ongoing && kind === 'leader' ? 'fact-full' : '');

  // The title with its status tag, and key details, at the top of the Overview. In the grid,
  // every box is kept, even when empty, so that each one stays in its place.
  function summaryCard(facts, info, meta, footer) {
    const grid = !project.ongoing;
    const rows = facts
      .filter(([, v, kind]) => v || (kind === 'leader' && (project.leader || grid)) || ['timeframe', 'created', 'reviewed', 'closed', 'dependency'].includes(kind))
      .map(([k, v, kind]) => {
        if (kind === 'timeframe') return timeframeFact();
        return fact(k, factValue(v, kind), factWidth(kind));
      });
    return component('summary-card', { corner: documentView.folderButton(project), title: (project.title ? titleHtml() : md.inline(meta.title || info.title)) + status.projectStatusControl(project), facts: rows.join(''), grid, footer });
  }

  function renderOverview() {
    const info = parseFolder(project.folder);
    const meta = md.parseMeta(project.content);
    const ms = md.parseMilestones(project.content);
    status.setMilestones(ms.milestones.map((m) => ({ line: m.headingLine, title: m.title })));

    // ----- key details -----
    // Projects written before tentacles call their leader Owner.
    const leader = meta.fields.leader || meta.fields.owner;
    const milestonesDone = ms.milestones.filter((m) => m.state === 'done').length;
    // In grid order: Leader and Project Dependency, Created and Reviewed, Milestones and
    // Closed, with Active Timeframe down the right of all three rows.
    const facts = [
      ['Leader', leader, 'leader'],
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
      if (!['leader', 'owner', 'date created', 'created', 'date reviewed', 'date closed', 'active timeframe', 'project dependency', 'project type', 'flagged for review'].includes(k)) facts.push([key, meta.fields[k]]);
    });

    if (project.ongoing) {
      const shown = ['leader', 'created', 'reviewed', 'closed'];
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
    // Tasks in a milestone can be moved to another or promoted to their own.
    const where = { milestone: { line: m.headingLine, title: m.title } };
    const options = Object.assign(renderOptions(m.body.split('\n').map((_, k) => m.firstLine + k), where), {
      dragRows: true,
      editAttrs: (item) => editing.attrs('todo', item.line, item.editText),
    });
    const body = md.render(m.body, options);
    const headingLine = m.headingLine;
    const collapsed = milestoneControls.isCollapsed(m.title);
    return component('milestone-card', Object.assign(documentView.sectionReview(project, m.headingLine, m.title, m.reviewed, m.flagged), {
      flagged: m.flagged,
      state: m.state,
      collapsed,
      index: i,
      title: m.title,
      expanded: !collapsed,
      attrs: editing.attrs('milestone', headingLine, m.title),
      heading: md.inline(m.title),
      counts: STATE_LABELS[m.state] + (m.total ? ' · ' + m.done + ' / ' + m.total : '') + (m.cancelled ? ' · ' + m.cancelled + ' cancelled' : ''),
      add: addButton('item', 'Add a checkbox', { line: headingLine, title: m.title }),
      line: headingLine,
      body: body.trim() ? component('doc-body', { body }) : component('no-tasks', { message: m.total ? 'Milestone complete' : 'No tasks yet.' }),
    }));
  }

  // The grey menu on a milestone. Promoting makes a new project from it, depending on this
  // one, then opens it. Deleting removes the milestone and everything under it, after asking.
  const MILESTONE_ACTIONS = {
    promote: { url: 'api/milestone-promote', ask: 'Its tasks move to a new project, named after it, which depends on this one.', heading: 'Promote this milestone?', button: 'Promote' },
    done: { url: 'api/milestone-done' },
    delete: { url: 'api/milestone-remove', ask: null, heading: 'Delete this milestone and everything in it?', button: 'Delete' },
  };

  async function milestoneAction(ctrl, action) {
    const { url, ask, heading, button } = MILESTONE_ACTIONS[action];
    const title = ctrl.dataset.title;
    if (heading && !(await status.confirmDelete(ask || title, heading, button))) return;
    try {
      const result = await editing.post(url, { line: Number(ctrl.dataset.line), title });
      if (!result.ok) status.toast(result.error || 'Could not save that change.');
      else if (action === 'promote') return location.assign('project.html?folder=' + encodeURIComponent(result.body.folder));
      await status.refresh();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  status.onMilestoneAction(milestoneAction);

  // Archiving sets Date Closed, which hides the project everywhere, then either copies its
  // header into _Archive.md or renames its folder, depending on ARCHIVEMODE.
  const archiveEl = document.getElementById('archive-project');
  const ARCHIVE_NOTES = {
    HEADERS: 'Its Date Closed is set to today and its details are copied into _Archive.md. The folder is left where it is for you to move.',
    FULL: "Its Date Closed is set to today and its folder is renamed with today's date.",
  };

  async function archiveProject() {
    const note = ARCHIVE_NOTES[window.PMS_ARCHIVE_MODE] || ARCHIVE_NOTES.HEADERS;
    if (!(await status.confirmDelete(note + ' It will be hidden from the dashboard and Timeline.', 'Archive this project?', 'Archive'))) return;
    try {
      const result = await editing.post('api/project-archive', { folder: project.folder });
      if (!result.ok) return status.toast(result.error || 'Could not archive the project.');
      // Stay on the page so the warning can be read; it's archived either way.
      if (result.warning) {
        status.toast(result.warning);
        return status.refresh();
      }
      location.assign(backEl.href);
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  archiveEl.addEventListener('click', archiveProject);

  // Opens the heading named after the # in the address, as a [[TENTACLEID Title#Heading]] link
  // asks: a milestone or task list on the Overview, or a block on the Scratchpad.
  function goToTarget() {
    if (!project || !location.hash) return;
    const reference = hashReference();
    const wanted = normalText(reference);
    editing.close();
    const milestone = project.ongoing ? null : md.parseMilestones(project.content).milestones.find((m) => normalText(m.title) === wanted);
    const list = project.ongoing ? project.taskLists.findIndex((l) => normalText(l.name) === wanted) : -1;
    const block = (project.blocks || []).findIndex((b) => b.title !== null && normalText(b.title) === wanted);
    if (!milestone && list === -1 && block === -1) return status.toast('No heading called "' + reference + '" in ' + project.title.rest + '.');
    if (milestone) milestoneControls.expand(milestone.title);
    setView(block !== -1 && !milestone && list === -1 ? 'scratchpad' : 'overview');
    const target = milestone
      ? Array.from(contentEl.querySelectorAll('.milestone')).find((card) => card.dataset.title === milestone.title)
      : list !== -1
        ? contentEl.querySelector('#task-list-' + list)
        : contentEl.querySelectorAll('.scratch-block')[block];
    if (target) {
      target.classList.add('is-target');
      target.scrollIntoView({ block: 'start' });
    }
  }

  window.addEventListener('hashchange', goToTarget);
  let firstLoad = true;

  // A Todos link names the task's line, which is shown on the Overview.
  function goToTask() {
    const line = Number(params.get('line'));
    if (!line) return;
    if (view !== 'overview') setView('overview');
    documentView.goToLine(contentEl, line);
  }

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
          status.setHeaderOptions(data.tentacles, data.leaders, data.dateFormat, data.dependencyOptions, data.projectTypes);
          // Only on the first load, so finishing a milestone doesn't close it while you work.
          if (!project) milestoneControls.closeFinished(md.parseMilestones(data.content).milestones);
          project = data;
          typeEl.innerHTML = status.projectTypeControl(project);
          archiveEl.hidden = Boolean(project.archived);
          draw();
          if (firstLoad) {
            goToTarget();
            goToTask();
          }
          firstLoad = false;
          changes.showConflicts(project);
        })
        .catch((err) => showError(err.message));
    status.onChange(load);
    load();
  }

  draw();
})();
