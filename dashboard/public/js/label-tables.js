// The Statuses, Leaders and Colours tabs on the Options page: a CSV in Labels as an editable table.
(function (global) {
  'use strict';
  const { escapeHtml, badgeClass, status, component, getJson, postJson, loadError, clearSelection, UNREACHABLE, formDialog, inlineEditor } = global.PMS;

  const option = (value, label) => ({ value, label: label || value });

  const TABLES = {
    statuses: {
      url: 'api/status-table',
      title: 'Statuses',
      noun: 'status',
      file: 'Labels/Status.csv',
      missing: 'Until then, the built-in default statuses are in use.',
      keyOf: (row) => row.name,
      columns: (data) => {
        // A default status isn't in the file, and is named after its type.
        const typeOf = (name) => (data.rows.find((r) => r.name === name) || { type: name }).type;
        return [
          { key: 'type', label: 'Type', options: data.types.map((t) => option(t)) },
          { key: 'name', label: 'Name', upper: true, text: true, badge: (row) => row.type },
          { key: 'next', label: 'Next status', options: [option('', 'Automatic')].concat(data.choices.map((c) => option(c))), badge: (row) => typeOf(row.next) },
        ];
      },
    },
    leaders: {
      url: 'api/leader-table',
      title: 'Leaders',
      noun: 'leader',
      file: 'Labels/Leaders.csv',
      missing: '',
      keyOf: (row) => row.id,
      columns: () => [
        { key: 'id', label: 'Tag', fixed: true },
        { key: 'name', label: 'Name', text: true },
      ],
    },
    colours: {
      url: 'api/colour-table',
      title: 'Colours',
      noun: 'colour',
      file: 'Labels/Colours.csv',
      fixedRows: true, // the stylesheet uses each row by name
      keyOf: (row) => row.name,
      columns: () => [
        { key: 'name', label: 'Name', fixed: true },
        { key: 'usedFor', label: 'Used for', fixed: true },
        { key: 'colour', label: 'Colour', hex: true },
      ],
      // Fetches the stylesheet again, so a new colour shows without a refresh.
      afterSave: () => {
        const link = document.querySelector('link[href^="api/colours.css"]');
        if (link) link.href = 'api/colours.css?' + Date.now();
      },
    },
  };

  // The markup for a dropdown or text box for one column, with `value` among its choices.
  function fieldHtml(column, value, inline) {
    if (column.options) {
      const options = column.options.some((o) => o.value === value) ? column.options : column.options.concat(option(value));
      return component('label-select', { inline, column: column.key, options: options.map((o) => component('option', { value: o.value, selected: false, label: o.label })).join('') });
    }
    return component('label-input', { inline, column: column.key, hex: column.hex, required: column.text && !inline });
  }

  function keepUpperCase(field, column) {
    if (!column.upper) return;
    field.addEventListener('input', () => {
      const [start, end] = [field.selectionStart, field.selectionEnd];
      field.value = field.value.toUpperCase();
      field.setSelectionRange(start, end);
    });
  }

  function create(name, panel) {
    const table = TABLES[name];
    let data = null;
    let columns = [];
    let editorOpen = false;

    const cellText = (row, column) => {
      if (column.key === 'next' && !row.next) return component('label-automatic');
      const text = escapeHtml(row[column.key]);
      if (column.hex && /^#?[0-9a-f]{6}$/i.test(row[column.key])) return component('label-swatch', { hex: text.replace('#', ''), text });
      return column.badge ? component('badge', { className: badgeClass(column.badge(row)), text }) : text;
    };

    function render() {
      const head = columns.map((c) => component('label-head', { label: c.label })).join('');
      const rows = data.rows
        .map((row, i) =>
          component('label-row', {
            index: i,
            cells: columns.map((c) => component('label-cell', { key: c.fixed ? '' : c.key, content: cellText(row, c) })).join(''),
            actions: table.fixedRows ? '' : component('label-actions', { noun: table.noun, name: table.keyOf(row) }),
          })
        )
        .join('');
      const missing = table.file + (table.fixedRows ? " doesn't exist, so the built-in colours are in use." : " doesn't exist yet. Add a row with the plus button to create it. " + table.missing);
      panel.innerHTML = component('label-panel', {
        title: table.title,
        canAdd: !table.fixedRows,
        noun: table.noun,
        body:
          data.exists || data.rows.length
            ? component('label-table', { head, hasActions: !table.fixedRows, rows: rows || component('label-no-rows', { span: columns.length + 1 }) })
            : component('empty-card', { message: missing }),
      });
    }

    function load() {
      return getJson(table.url)
        .then((result) => {
          data = result;
          columns = table.columns(data);
          if (!editorOpen) render();
        })
        .catch((err) => {
          panel.innerHTML = loadError(table.file, err);
        });
    }

    // After any change the sidebars need redrawing too, as they use these lists.
    const reload = () => {
      if (table.afterSave) table.afterSave();
      return Promise.all([load(), status.refresh()]);
    };

    function startEdit(cell) {
      if (editorOpen) return;
      const row = data.rows[Number(cell.closest('tr').dataset.index)];
      const column = columns.find((c) => c.key === cell.dataset.cell);
      editorOpen = true;
      const field = inlineEditor({
        host: cell,
        field: fieldHtml(column, row[column.key], true),
        value: row[column.key],
        unchanged: (f) => f.value === row[column.key],
        send: (f) => postJson(table.url, Object.assign({}, row, { action: 'update', from: table.keyOf(row), [column.key]: f.value })),
        onSaved: () => {
          editorOpen = false;
          return reload();
        },
        onCancel: () => {
          editorOpen = false;
          render();
        },
        submitsOn: () => true,
      });
      keepUpperCase(field, column);
    }

    function askForRow() {
      const editable = columns.filter((c) => !c.fixed);
      const fieldOf = (form, column) => form.querySelector('[data-column="' + column.key + '"]');
      const form = formDialog({
        heading: 'New ' + table.noun,
        fields: editable.map((column) => component('label-modal-field', { label: column.label, field: fieldHtml(column, '', false) })).join(''),
        submit: 'Add',
        failure: 'Could not save that.',
        send: (f) => {
          const row = { action: 'add' };
          editable.forEach((column) => {
            row[column.key] = fieldOf(f, column).value;
          });
          return postJson(table.url, row);
        },
        done: (_, dialog) => {
          dialog.close();
          return reload();
        },
      });
      editable.forEach((column) => {
        const field = fieldOf(form, column);
        field.value = '';
        keepUpperCase(field, column);
      });
      const first = form.querySelector('input, select');
      if (first) first.focus();
    }

    async function removeRow(row) {
      if (!(await status.confirmDelete(table.keyOf(row), 'Delete this ' + table.noun + '?'))) return;
      try {
        const result = await postJson(table.url, { action: 'delete', from: table.keyOf(row) });
        if (!result.ok) status.toast(result.error || 'Could not delete that.');
        await reload();
      } catch (_) {
        status.toast(UNREACHABLE);
      }
    }

    panel.addEventListener('dblclick', (e) => {
      const cell = e.target.closest('[data-cell]');
      if (!cell || e.target.closest('input, select, button')) return;
      clearSelection();
      startEdit(cell);
    });

    panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-add-row]')) return askForRow();
      if (e.target.closest('[data-remove]')) removeRow(data.rows[Number(e.target.closest('tr').dataset.index)]);
    });

    return { load };
  }

  global.PMS.labelTables = { create };
})(window);
