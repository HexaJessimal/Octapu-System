// The parts of a markdown document's page shared by projects and entities.
(function (global) {
  'use strict';
  const { markdown: md, status, editing, component } = global.PMS;

  // `options` can carry the list a task goes in, or the line and title of its milestone.
  function addButton(action, label, options) {
    const { list, line, title } = options || {};
    return component('add-button', { action, label, list, hasLine: line !== undefined, line, title });
  }

  function renderOptions(doc, lineNumbers) {
    return { todos: new Map(doc.todos.map((t) => [t.line, t])), badge: status.control, checkbox: status.checkbox, lineNumbers };
  }

  // One card per block. Double-click a block's text, or its title unless it's reserved.
  function renderScratchpad(doc) {
    const blocks = doc.blocks.map((b) =>
      component('scratch-block', {
        title: b.title === null ? '' : component('scratch-title', { attrs: b.titleEditable ? editing.attrs('block', b.line, b.title) : '', title: md.inline(b.title) }),
        attrs: editing.attrs('body', b.line, b.body),
        body: b.body
          ? md.render(b.body, renderOptions(doc, b.body.split('\n').map((_, k) => b.bodyLine + k)))
          : component('no-tasks', { message: 'Double-click to add text.' }),
      })
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
      doc.leader ? { lineHtml: { line: doc.leader.line, html: component('labelled-control', { label: 'Owner', control: status.leaderControl(doc) }) } } : {}
    );
  }

  // Tabs for a folder's markdown files, when it has more than one, and a button to add one.
  // Tabs open the Raw view, unless `keepView` says to stay on the current one.
  function fileTabs(doc, keepView) {
    if (!doc.files) return '';
    const tab = (file) => {
      const query = new URLSearchParams(location.search);
      query.set('file', file);
      if (!keepView) query.set('view', 'raw');
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

  // One box per task list, on the Overview of entities and Ongoing projects.
  function renderTaskLists(doc) {
    return doc.taskLists
      .map((list, i) => {
        const options =
          list.body &&
          Object.assign(renderOptions(doc, list.body.split('\n').map((_, k) => list.bodyLine + k)), {
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

  global.PMS.documentView = { addButton, renderOptions, renderScratchpad, fileTabs, renderRaw, headerOptions, progressMeter, taskRows, renderTaskLists, fact, titleSpan };
})(window);
