// One catalog as a table: double-click a cell to edit it, the minus button deletes a record,
// and the plus button opens a blank record to type into. Return saves it and opens another;
// Esc stops.
(function () {
  'use strict';
  const { markdown: md, status, component, element, getJson, postJson, loadError, clearSelection, inlineEditor, displayDate, setDateFormat, UNREACHABLE, showFormError } = window.PMS;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const file = new URLSearchParams(location.search).get('file') || '';

  let catalog = null;
  let open = false; // an editor is showing, so the table mustn't redraw underneath it

  const isDate = (heading) => catalog.dateColumns.includes(heading);
  const isStoredDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  // How a value shows: dates in DATEFORMAT, the catalog number in bold, and everything else
  // as inline markdown, so [[IMAGE#...]] shows the picture and links work.
  function cellHtml(heading, value, i) {
    if (i === 0) return component('catalog-number', { number: value });
    if (isDate(heading) && isStoredDate(value)) return md.inline(displayDate(value));
    return md.inline(value);
  }

  // The text in an edit box: a date in DATEFORMAT, anything else as stored.
  const editText = (heading, value) => (isDate(heading) && isStoredDate(value) ? displayDate(value) : value);

  function render() {
    const { columns, rows } = catalog;
    contentEl.innerHTML =
      component('catalog-heading', { title: catalog.tag + ' records', count: rows.length, action: 'data-add-record', label: 'Add a record' }) +
      component('catalog-table', {
        head: columns.map((label) => component('label-head', { label })).join(''),
        rows: rows.length
          ? rows
              .map((row, index) =>
                component('label-row', {
                  index,
                  cells: row.map((value, i) => component('label-cell', { key: String(i), content: cellHtml(columns[i], value, i) })).join(''),
                  actions: component('label-actions', { noun: 'record', name: row[0] }),
                })
              )
              .join('')
          : component('label-no-rows', { span: columns.length + 1 }),
      });
  }

  function load() {
    return getJson('api/catalog?file=' + encodeURIComponent(file))
      .then((data) => {
        catalog = data;
        setDateFormat(data.dateFormat);
        titleEl.textContent = data.name;
        document.title = data.name + ' · Octapu System';
        if (!open) render();
      })
      .catch((err) => {
        titleEl.textContent = 'Catalog not found';
        contentEl.innerHTML = loadError('this catalog', err);
      });
  }

  const post = (fields) => postJson('api/catalog-row', Object.assign({ file }, fields));

  // ---------- editing a cell ----------

  function startEditing(cell) {
    const index = Number(cell.closest('tr').dataset.index);
    const at = Number(cell.dataset.cell);
    const row = catalog.rows[index];
    const heading = catalog.columns[at];
    const from = editText(heading, row[at]);
    open = true;
    inlineEditor({
      host: cell,
      field: component('inline-input'),
      value: from,
      unchanged: (f) => f.value.trim() === from,
      send: (f) => post({ action: 'update', index, number: row[0], column: heading, to: f.value }),
      onSaved: () => {
        open = false;
        return load();
      },
      onCancel: () => {
        open = false;
        render();
      },
      submitsOn: () => true,
    });
  }

  // ---------- adding records ----------

  // A blank record at the bottom of the table, with the next catalog number filled in.
  function startAdding() {
    const { columns } = catalog;
    const body = contentEl.querySelector('tbody');
    body.querySelectorAll('td.empty').forEach((el) => el.closest('tr').remove()); // "No rows yet."
    const row = element('catalog-new-row', {
      cells: columns.map((label, index) => component('catalog-new-cell', { index, label, placeholder: isDate(label) ? catalog.dateFormat : label })).join(''),
    });
    const hint = element('catalog-new-hint', { span: columns.length + 1 });
    body.append(row, hint);
    const fields = Array.from(row.querySelectorAll('[data-new]'));
    fields[0].value = catalog.next;
    open = true;
    let finished = false;

    const stop = () => {
      if (finished) return;
      finished = true;
      open = false;
      render();
    };
    // Nothing typed but the catalog number it was given.
    const blank = () => fields.every((f, i) => !f.value.trim() || (i === 0 && f.value.trim() === catalog.next));

    async function save() {
      if (blank()) return stop();
      const error = hint.querySelector('.form-error');
      error.hidden = true;
      try {
        const result = await post({ action: 'add', values: fields.map((f) => f.value) });
        if (!result.ok) return showFormError(error, result.error || 'Could not save that.');
        finished = true;
        open = false;
        await load();
        startAdding();
      } catch (_) {
        showFormError(error, UNREACHABLE);
      }
    }

    row.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') stop();
      else if (e.key === 'Enter') {
        e.preventDefault();
        save();
      }
    });
    // Leaving the record, by clicking elsewhere, removes it if nothing was typed.
    row.addEventListener('focusout', (e) => {
      if (!row.contains(e.relatedTarget) && blank()) stop();
    });
    (fields[1] || fields[0]).focus();
    row.scrollIntoView({ block: 'nearest' });
  }

  async function removeRecord(index) {
    const row = catalog.rows[index];
    const title = row[catalog.columns.indexOf('Title')];
    if (!(await status.confirmDelete(row[0] + (title ? ' · ' + title : ''), 'Delete this record?'))) return;
    try {
      const result = await post({ action: 'delete', index, number: row[0] });
      if (!result.ok) status.toast(result.error || 'Could not delete that.');
      await load();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  contentEl.addEventListener('dblclick', (e) => {
    const cell = e.target.closest('[data-cell]');
    if (open || !cell || e.target.closest('input, button')) return;
    clearSelection();
    startEditing(cell);
  });

  contentEl.addEventListener('click', (e) => {
    if (open) return;
    if (e.target.closest('[data-add-record]')) return startAdding();
    const remove = e.target.closest('[data-remove]');
    if (remove) removeRecord(Number(remove.closest('tr').dataset.index));
  });

  status.onChange(load);
  load();
})();
