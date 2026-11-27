// The parts of a markdown document's page shared by projects and tentacles.
(function (global) {
  'use strict';
  const { markdown: md, status, editing, component } = global.PMS;

  // `options` can carry the list a task goes in, or the line and title of its milestone.
  function addButton(action, label, options) {
    const { list, line, title } = options || {};
    return component('add-button', { action, label, list, hasLine: line !== undefined, line, title });
  }

  // Tasks get the row menu. A linked Scratchpad block is only offered on pages with a
  // Scratchpad, other than Networking's: created, or linked when one has the task's name.
  // `where` adds a task's milestone, on a project.
  function renderOptions(doc, lineNumbers, where = {}) {
    const blockable = Array.isArray(doc.blocks) && !String(doc.folder || '').startsWith('networking:');
    const key = (text) => String(text || '').trim().toLowerCase();
    const blocks = new Set((doc.blocks || []).map((b) => key(b.title)));
    return {
      todos: new Map(doc.todos.map((t) => [t.line, t])),
      badge: status.control,
      checkbox: status.checkbox,
      rowMenu: (item) => status.rowMenu(item, Object.assign({ blockable, blockExists: blocks.has(key(item.editText)), childable: true }, where)),
      lineNumbers,
    };
  }

  // One card per block. Double-click a block's text, or its title unless it's reserved.
  function renderScratchpad(doc) {
    const blocks = doc.blocks.map((b) =>
      component('scratch-block', Object.assign(b.title === null ? {} : sectionReview(doc, b.line, b.title, b.reviewed, b.flagged), {
        flagged: b.flagged,
        title: b.title === null ? '' : component('scratch-title', { attrs: b.titleEditable ? editing.attrs('block', b.line, b.title) : '', title: md.inline(b.title) }),
        attrs: editing.attrs('body', b.line, b.body),
        body: b.body
          ? md.render(b.body, renderOptions(doc, b.body.split('\n').map((_, k) => b.bodyLine + k)))
          : component('no-tasks', { message: 'Double-click to add text.' }),
      }))
    );
    return component('section-heading', { title: 'Scratchpad', after: addButton('block', 'Add a block') }) + component('card-stack', { items: blocks.join('') });
  }

  // In the Raw view, each editable field gets its control on its own line. A file without
  // one of those lines has it shown under Date Created.
  // Only projects have editable Date Closed and Active Timeframe fields.
  function headerOptions(doc, titleHtml, isProject) {
    const appendTo = new Map();
    const insertAfter = new Map();
    const anchor = doc.timeframe.anchor;
    const place = (line, label, control) => {
      if (line) appendTo.set(line, control);
      else if (anchor) insertAfter.set(anchor, (insertAfter.has(anchor) ? insertAfter.get(anchor) + component('md-break') : '') + component('labelled-control', { label, control }));
    };
    if (isProject) {
      place(doc.dates.closed.line, 'Date Closed', status.dateControl(doc, 'closed', 'Date Closed'));
      if (!doc.ongoing) place(doc.timeframe.line, 'Active Timeframe', status.timeframeControl(doc));
    }
    return Object.assign(
      { appendTo, insertAfter },
      doc.title ? { titleLine: doc.title.line, titleHtml: titleHtml() } : {},
      doc.leader ? { lineHtml: { line: doc.leader.line, html: component('labelled-control', { label: 'Leader', control: status.leaderControl(doc) }) } } : {}
    );
  }

  // Tabs for a folder's markdown files, when it has more than one, and a button to add one.
  // The main file comes first. A tab keeps the view you're on.
  function fileTabs(doc) {
    if (!doc.files) return '';
    const tab = (file) => {
      const query = new URLSearchParams(location.search);
      query.set('file', file);
      return component('file-tab', { query: query.toString(), current: file === doc.file, file });
    };
    return component('file-tabs', { tabs: doc.files.length > 1 ? doc.files.map(tab).join('') : '', add: addButton('file', 'New markdown file') });
  }

  // The whole file, with status controls. Double-click it to edit its markdown as text.
  function renderRaw(doc, extraOptions) {
    return component('raw-document', {
      attrs: editing.attrs('raw', null, doc.content),
      body: md.render(doc.content, Object.assign(renderOptions(doc), extraOptions)),
    });
  }

  // The checkboxes in every task list, leaving out cancelled ones as the milestones do.
  function taskRows(doc) {
    return doc.taskLists.filter((list) => list.body).flatMap((list) => {
      const end = list.bodyLine + list.body.split('\n').length;
      return doc.todos.filter((t) => t.line >= list.bodyLine && t.line < end && t.mark !== null && !t.cancelled && t.type !== 'ARCHIVED');
    });
  }

  // One box per task list, on the Overview of tentacles and Ongoing projects.
  function renderTaskLists(doc) {
    return doc.taskLists
      .map((list, i) => {
        const options =
          list.body &&
          Object.assign(renderOptions(doc, list.body.split('\n').map((_, k) => list.bodyLine + k)), {
            dragRows: true,
            editAttrs: (item) => editing.attrs('todo', item.line, item.editText),
          });
        return component('task-list', {
          index: i,
          name: list.name,
          add: addButton('task', 'Add to ' + list.name, { list: list.name }),
          body: list.body ? component('doc-article', { body: md.render(list.body, options) }) : component('empty-text', { message: 'No tasks yet.' }),
        });
      })
      .join('');
  }

  function progressMeter(done, total) {
    if (!total) return '';
    return component('progress-meter', { percent: Math.round((done / total) * 100), done, total });
  }

  // One label and value in the summary box at the top of an Overview.
  const fact = (label, value, className) => component('fact', { className, label, value });

  // The title's text. It's editable by double-click unless `editable` is false.
  function titleSpan(doc, editable) {
    const { line, rest } = doc.title;
    return component('doc-title', { attrs: editable ? editing.attrs('title', line, rest) : '', text: rest ? md.inline(rest) : 'Untitled' });
  }

  // The folder button at the top right of a summary, and what it does. The server only opens
  // folders it lists itself, so the folder name is all it needs.
  const folderButton = (doc) => component('folder-button', { folder: doc.folder });

  document.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-open-folder]');
    if (!button) return;
    try {
      const result = await global.PMS.postJson('api/open-folder', { folder: button.dataset.openFolder });
      if (!result.ok) status.toast(result.error || 'Could not open the folder.');
    } catch (_) {
      status.toast(global.PMS.UNREACHABLE);
    }
  });

  // Outlines the task on `line`, from a Todos link, opening its milestone if it's closed.
  // Returns false if the page doesn't show that task.
  function goToLine(contentEl, line) {
    // A task's own controls, not a milestone header's menu, which also names its line.
    const control = contentEl.querySelector('li .status-control[data-line="' + line + '"]');
    if (!control) return false;
    const card = control.closest('.milestone.is-collapsed');
    if (card) {
      card.classList.remove('is-collapsed');
      const button = card.querySelector('[data-collapse]');
      if (button) button.setAttribute('aria-expanded', 'true');
      if (global.PMS.milestoneControls) global.PMS.milestoneControls.expand(card.dataset.title);
    }
    contentEl.querySelectorAll('.is-target').forEach((el) => el.classList.remove('is-target'));
    const row = control.closest('li') || control;
    row.classList.add('is-target', 'is-target-row');
    row.scrollIntoView({ block: 'center' });
    // Things above it, such as a tentacle's Timeline, can still be loading, so it's brought
    // back into view once they've settled.
    setTimeout(() => {
      if (row.isConnected) row.scrollIntoView({ block: 'center' });
    }, 700);
    return true;
  }

  // A section's flag button and its review date, for its heading at `line`. `reviewed` is
  // YYYY-MM-DD, or null if it's never been reviewed.
  function sectionReview(doc, line, title, reviewed, flagged) {
    return {
      flag: component('section-flag', { folder: doc.folder, file: doc.file, line, title, on: flagged, pressed: String(flagged), action: flagged ? 'Remove the flag for review' : 'Flag for review' }),
      reviewed: component('section-reviewed', { text: reviewed ? 'Reviewed ' + global.PMS.displayDate(reviewed) : 'Not reviewed yet' }),
    };
  }

  document.addEventListener('click', async (e) => {
    const button = e.target.closest('[data-section-flag]');
    if (!button) return;
    const { folder, file, line, title } = button.dataset;
    try {
      const result = await global.PMS.postJson('api/section-flag', { folder, file, line: Number(line), title, on: button.getAttribute('aria-pressed') !== 'true' });
      if (!result.ok) status.toast(result.error || 'Could not change the flag.');
    } catch (_) {
      status.toast(global.PMS.UNREACHABLE);
    }
    status.refresh();
  });

  // Dragging a task by its handle to another place in the same milestone or task list.
  let rowDrag = null; // { li, control, box, over, after } while one is being dragged
  const listOf = (li) => li.closest('.milestone, .tasks-section');
  const clearDropMarks = () => document.querySelectorAll('li.drop-before, li.drop-after').forEach((li) => li.classList.remove('drop-before', 'drop-after'));
  const rowControl = (li) => li.querySelector(':scope > .status-control[data-line]');

  document.addEventListener('dragstart', (e) => {
    const handle = e.target.closest('[data-drag-row]');
    if (!handle || editing.isOpen()) return;
    const li = handle.closest('li');
    const control = rowControl(li);
    if (!control) return;
    rowDrag = { li, control, box: listOf(li), over: null, after: false };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', control.dataset.text || ''); // Firefox needs some data to drag
    li.classList.add('is-dragging');
  });

  document.addEventListener('dragover', (e) => {
    if (!rowDrag) return;
    const li = e.target.closest('li.task');
    if (!li || li === rowDrag.li || rowDrag.li.contains(li) || listOf(li) !== rowDrag.box || !rowControl(li)) return;
    e.preventDefault();
    const box = li.getBoundingClientRect();
    rowDrag.over = li;
    rowDrag.after = e.clientY > box.top + box.height / 2;
    clearDropMarks();
    li.classList.add(rowDrag.after ? 'drop-after' : 'drop-before');
  });

  document.addEventListener('drop', async (e) => {
    if (!rowDrag || !rowDrag.over) return;
    e.preventDefault();
    const { control, over, after } = rowDrag;
    const target = rowControl(over);
    try {
      const result = await global.PMS.postJson('api/row-reorder', {
        folder: control.dataset.folder,
        file: control.dataset.file,
        line: Number(control.dataset.line),
        text: control.dataset.text || '',
        toLine: Number(target.dataset.line),
        toText: target.dataset.text || '',
        after,
      });
      if (!result.ok) status.toast(result.error || 'Could not move that task.');
    } catch (_) {
      status.toast(global.PMS.UNREACHABLE);
    }
    status.refresh();
  });

  document.addEventListener('dragend', () => {
    if (!rowDrag) return;
    rowDrag.li.classList.remove('is-dragging');
    rowDrag = null;
    clearDropMarks();
  });

  global.PMS.documentView = { sectionReview, goToLine, folderButton, addButton, renderOptions, renderScratchpad, fileTabs, renderRaw, headerOptions, progressMeter, taskRows, renderTaskLists, fact, titleSpan };
})(window);
