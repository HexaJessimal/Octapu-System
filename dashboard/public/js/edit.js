// Project page editing: double-click to edit in place, and the plus buttons' popups.
(function (global) {
  'use strict';
  const { status, component, postJson, clearSelection, formDialog, inlineEditor } = global.PMS;

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
    if (kind === 'commitment') return post('api/commitment-rename', { line: Number(line), title: from, to });
    if (kind === 'field') return post('api/entry-field', { line: Number(line), from, to, label: target.dataset.label || null });
    return post('api/text', { kind, line: Number(line), from, to });
  }

  function startEditing(target) {
    const multiline = ['body', 'field', 'raw'].includes(target.dataset.edit);
    const from = target.dataset.from;
    open = true;
    inlineEditor({
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
    task: (el) => ({ heading: 'New task in ' + el.dataset.list, label: 'Text', submitText: 'Add task', url: 'api/task', field: 'text', extra: { list: el.dataset.list } }),
  };

  document.addEventListener('dblclick', (e) => {
    if (open) return;
    const target = e.target.closest('[data-edit]');
    if (!target || e.target.closest('button, a, input, textarea, select')) return;
    clearSelection();
    startEditing(target);
  });

  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add]');
    if (add) askFor(ADDERS[add.dataset.add](add));
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
