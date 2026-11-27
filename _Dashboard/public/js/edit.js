// Project page editing: double-click to edit in place, and what the plus buttons open.
(function (global) {
  'use strict';
  const { status, component, element, postJson, clearSelection, formDialog, inlineEditor } = global.PMS;

  let getProject = () => null;
  let redraw = () => {};
  let open = false; // an editor is showing, so the page mustn't redraw underneath it

  function init(options) {
    getProject = options.project;
    redraw = options.redraw;
  }

  // Attributes that make an element editable by double-click.
  function attrs(kind, line, value) {
    return component('edit-attrs', { kind, line: line === null ? '' : line, value });
  }

  function post(url, fields) {
    const project = getProject();
    return postJson(url, Object.assign({ folder: project.folder, file: project.file }, fields));
  }

  function saveRequest(target, to) {
    const { edit: kind, line, from } = target.dataset;
    if (kind === 'body') return post('api/block-body', { line: line === '' ? null : Number(line), from, to });
    if (kind === 'raw') return post('api/file-body', { from, to });
    if (kind === 'field') return post('api/entry-field', { line: Number(line), from, to, label: target.dataset.label || null });
    return post('api/text', { kind, line: Number(line), from, to });
  }

  // Tab and Shift+Tab on a task being edited: any change to its text is saved, then it moves
  // one level in or out, taking its subtasks along.
  async function indentWhileEditing(target, field, direction) {
    const from = target.dataset.from;
    const text = field.value.trim();
    try {
      if (text && text !== from) {
        const saved = await saveRequest(target, text);
        if (!saved.ok) return status.toast(saved.error || 'Could not save that.');
      }
      const result = await post('api/row-indent', { line: Number(target.dataset.line), text: text || from, direction });
      if (!result.ok) status.toast(result.error || 'Could not move that task.');
    } catch (_) {
      status.toast(global.PMS.UNREACHABLE);
    }
    open = false;
    await status.refresh();
  }

  function startEditing(target) {
    const multiline = ['body', 'field', 'raw'].includes(target.dataset.edit);
    const from = target.dataset.from;
    open = true;
    const editor = inlineEditor({
      host: target,
      field: multiline ? component('inline-textarea', { rows: Math.min(30, Math.max(6, from.split('\n').length + 2)) }) : component('inline-input'),
      value: from,
      unchanged: (field) => (multiline ? field.value : field.value.trim()) === from,
      send: (field) => saveRequest(target, field.value),
      onSaved: () => {
        open = false;
        return status.refresh();
      },
      onCancel: () => {
        open = false;
        redraw();
      },
      submitsOn: (e) => !multiline || e.ctrlKey || e.metaKey,
    });
    if (target.dataset.edit === 'todo') {
      editor.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        indentWhileEditing(target, editor, e.shiftKey ? 'out' : 'in');
      });
    }
  }

  // A popup asking for one line of text, which is then sent as `field`.
  function askFor({ heading, label, submitText, url, field, extra, afterAdding }) {
    formDialog({
      heading,
      fields: component('text-field', { label, name: 'value' }),
      submit: submitText,
      failure: 'Could not save that.',
      send: (form) => post(url, Object.assign({}, extra, { [field]: form.elements.value.value })),
      done: (result, dialog) => {
        dialog.close();
        return afterAdding ? afterAdding(result) : status.refresh();
      },
    });
  }

  const ADDERS = {
    milestone: () => ({ heading: 'New milestone', label: 'Milestone name', submitText: 'Add milestone', url: 'api/milestone', field: 'title' }),
    item: (el) => ({
      heading: 'New checkbox',
      label: 'Text',
      submitText: 'Add checkbox',
      url: 'api/milestone-item',
      field: 'text',
      extra: { line: Number(el.dataset.line), title: el.dataset.title },
    }),
    file: () => ({
      heading: 'New markdown file',
      label: 'Name',
      submitText: 'Add file',
      url: 'api/file-add',
      field: 'name',
      afterAdding: (result) => {
        const query = new URLSearchParams(location.search);
        query.set('file', result.body.file);
        location.href = '?' + query.toString();
      },
    }),
    block: () => ({ heading: 'New block', label: 'Title', submitText: 'Add block', url: 'api/block', field: 'title' }),
    'entry-task': (el) => ({ url: 'api/entry-task', field: 'text', extra: { line: Number(el.dataset.line), title: el.dataset.title } }),
    task: (el) => ({ heading: 'New task in ' + el.dataset.list, label: 'Text', submitText: 'Add task', url: 'api/task', field: 'text', extra: { list: el.dataset.list } }),
  };

  // These plus buttons skip the popup: a blank row opens in place, ready to type into.
  const QUICK_ADDS = ['milestone', 'item', 'task', 'entry-task'];

  // Removes the "nothing here yet" text that sits directly inside `parent`.
  const clearEmpty = (parent, selector) => parent.querySelectorAll(':scope > ' + selector).forEach((n) => n.remove());

  // Puts a blank row where the new milestone, checkbox or task will appear, and returns it.
  function blankRow(button) {
    const kind = button.dataset.add;
    if (kind === 'milestone') {
      const heading = button.closest('.section-row');
      let stack = document.querySelector('.milestones');
      if (!stack) {
        clearEmpty(heading.parentNode, '.empty');
        stack = element('milestone-stack', { cards: '' });
        heading.after(stack);
      }
      return stack.appendChild(element('quick-add', { className: 'card milestone state-none', box: false }));
    }
    if (kind === 'item') {
      const card = button.closest('.milestone');
      card.classList.remove('is-collapsed');
      const body = card.querySelector('.ms-body');
      clearEmpty(body, '.no-tasks');
      return body.appendChild(element('quick-add', { className: '', box: true }));
    }
    // A task list, or a contact's or event's Tasks.
    const section = button.closest('.tasks-section');
    const doc = section.querySelector('.doc-card .doc, .entry-tasks-body');
    if (doc) {
      clearEmpty(doc, '.no-tasks');
      return doc.appendChild(element('quick-add', { className: '', box: true }));
    }
    clearEmpty(section, '.empty');
    return section.appendChild(element('quick-add', { className: 'card doc-card', box: true }));
  }

  // The same plus button after the page has been redrawn.
  const sameButton = (button) =>
    '[data-add="' + button.dataset.add + '"]' +
    ['line', 'list']
      .filter((k) => button.dataset[k] !== undefined)
      .map((k) => '[data-' + k + '="' + CSS.escape(button.dataset[k]) + '"]')
      .join('');

  // Return saves the row and opens another blank one. Esc, or leaving it empty, stops.
  // How deep a new task can go: one below the list's last task, which is `li.task` inside
  // `depth` others.
  function deepestNew(row) {
    const box = row.closest('.milestone, .tasks-section');
    const tasks = box ? Array.from(box.querySelectorAll('li.task')).filter((li) => !row.contains(li)) : [];
    const last = tasks[tasks.length - 1];
    if (!last) return 0;
    let depth = 0;
    for (let li = last.parentElement.closest('li.task'); li && box.contains(li); li = li.parentElement.closest('li.task')) depth++;
    return depth + 1;
  }

  // `startDepth` keeps a subtask's depth for the next row, so Return after one opens another
  // just below it (rows from a plus button go at the end, after the one just added).
  function quickAdd(button, startDepth = 0) {
    const { url, field, extra } = ADDERS[button.dataset.add](button);
    const row = blankRow(button);
    // Tasks can be nested, so Tab and Shift+Tab set the new one's depth.
    const nests = ['item', 'task', 'entry-task'].includes(button.dataset.add);
    let depth = nests ? Math.min(startDepth, deepestNew(row)) : 0;
    const hint = row.querySelector('.quick-add-hint');
    const showDepth = () => {
      row.style.marginLeft = depth * 22 + 'px';
      if (hint) hint.textContent = (depth ? 'Subtask, level ' + depth + '. ' : '') + 'Tab or Shift+Tab to nest it. Press Esc to abort';
    };
    let finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      open = false;
      redraw();
    };
    open = true;
    const input = inlineEditor({
      host: row.querySelector('.quick-add-field'),
      field: component('inline-input'),
      value: '',
      unchanged: (f) => !f.value.trim(),
      send: (f) => post(url, Object.assign({}, extra, { [field]: f.value }, nests && depth ? { depth } : {})),
      onSaved: async () => {
        finished = true;
        open = false;
        await status.refresh();
        const next = document.querySelector(sameButton(button));
        if (next) quickAdd(next, depth);
      },
      onCancel: stop,
      submitsOn: () => true,
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) stop();
    });
    if (nests) {
      showDepth();
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab') return;
        e.preventDefault();
        depth = e.shiftKey ? Math.max(0, depth - 1) : Math.min(deepestNew(row), depth + 1);
        showDepth();
      });
    }
    row.scrollIntoView({ block: 'nearest' });
  }

  // The editable text of the list row a double-click landed in, for clicks on the row's empty
  // space beside the text. A row that's only a link would otherwise have nowhere to double-click.
  const rowText = (el) => {
    const row = el.closest('li');
    return row ? row.querySelector(':scope > .item-text[data-edit]') : null;
  };

  // A blank row right under a task's row, for Add child task ('child', the new row nested
  // under it) and the rows after it ('after', at the same level). Return saves it and opens
  // the next one just below; Esc, or leaving it empty, stops.
  function insertBelow(ctrl, place) {
    const li = ctrl.closest('li');
    if (!li) return;
    const row = element('quick-add', { className: 'quick-add-below', box: true });
    const hint = row.querySelector('.quick-add-hint');
    if (hint) hint.textContent = 'Return adds another below it. Press Esc to abort';
    if (place === 'after') li.after(row);
    else {
      const nested = li.querySelector(':scope > ul, :scope > ol');
      if (nested) nested.before(row);
      else li.appendChild(row);
      row.style.marginLeft = '22px';
    }
    let finished = false;
    let saved = null;
    const stop = () => {
      if (finished) return;
      finished = true;
      open = false;
      redraw();
    };
    open = true;
    const input = inlineEditor({
      host: row.querySelector('.quick-add-field'),
      field: component('inline-input'),
      value: '',
      unchanged: (f) => !f.value.trim(),
      send: async (f) => {
        saved = await post('api/row-insert', { line: Number(ctrl.dataset.line), text: ctrl.dataset.text, place, newText: f.value });
        return saved;
      },
      onSaved: async () => {
        finished = true;
        open = false;
        await status.refresh();
        const next = document.querySelector('.row-menu-control[data-line="' + saved.body.line + '"]');
        if (next) insertBelow(next, 'after');
      },
      onCancel: stop,
      submitsOn: () => true,
    });
    input.addEventListener('blur', () => {
      if (!input.value.trim()) stop();
    });
    row.scrollIntoView({ block: 'nearest' });
  }

  document.addEventListener('pms:add-child', (e) => {
    if (!open) insertBelow(e.detail.ctrl, 'child');
  });

  document.addEventListener('dblclick', (e) => {
    if (open) return;
    const target = e.target.closest('[data-edit]') || rowText(e.target);
    if (!target || e.target.closest('button, a, input, textarea, select')) return;
    clearSelection();
    startEditing(target);
  });

  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (!add || open) return;
    if (QUICK_ADDS.includes(add.dataset.add)) quickAdd(add);
    else askFor(ADDERS[add.dataset.add](add));
  });

  global.PMS.editing = {
    init,
    attrs,
    post,
    isOpen: () => open,
    close: () => {
      open = false;
    },
  };
})(window);
