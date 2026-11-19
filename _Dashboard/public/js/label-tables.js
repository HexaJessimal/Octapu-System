// The Statuses, Leaders, Colours and Agenda tabs on the Options page: a CSV as an editable table.
(function (global) {
  'use strict';
  const { escapeHtml, badgeClass, status, component, getJson, postJson, loadError, clearSelection, UNREACHABLE, formDialog, inlineEditor } = global.PMS;

  const option = (value, label) => ({ value, label: label || value });

  const TABLES = {
    statuses: {
      url: 'api/status-table',
      title: 'Statuses',
      noun: 'status',
      file: '_Labels/Status.csv',
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
      file: '_Labels/Leaders.csv',
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
      file: '_Labels/Colours.csv',
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
    agenda: {
      url: 'api/agenda-table',
      title: 'Review agenda',
      noun: 'agenda item',
      file: '_Time_Management/AgendaItems.csv',
      missing: '',
      note: 'Shown as cards on the Review page. A text item is a reminder. REVIEW lists one entity or project, or the Dashboard, and REVIEW_ALL a group of them. Each card is ticked off on the Review page.',
      keyOf: (row) => row.raw,
      // Items can repeat, so a row is found by its place and checked against its item as written.
      target: (row, index) => ({ index, fromItem: row.raw }),
      // A rule, [[REVIEW|LABEL]], is shown as its two halves: REVIEW as the type, LABEL as the item.
      toRow: (row) => {
        const rule = row.type === 'rule' && row.item.match(/^\[\[\s*(REVIEW_ALL|REVIEW)\s*\|(.*)\]\]$/i);
        return { type: rule ? rule[1].toUpperCase() : row.type, item: rule ? rule[2].trim() : row.item, raw: row.item };
      },
      // ...and put back together to be saved. A new rule type starts on its first choice.
      toBody: (body, data) => {
        const choices = data.choices[body.type];
        if (!choices) return Object.assign({}, body, { raw: undefined });
        const item = choices.some((o) => o.value === body.item) ? body.item : choices[0].value;
        return Object.assign({}, body, { type: 'rule', item: '[[' + body.type + '|' + item + ']]', raw: undefined });
      },
      blank: { type: 'text' }, // what a new row's dropdowns start on
      columns: (data) => [
        { key: 'type', label: 'Type', options: [option('text'), option('REVIEW'), option('REVIEW_ALL')] },
        {
          key: 'item',
          label: 'Item',
          text: true,
          // Rules pick what follows the pipe from a list. Text items are typed.
          options: (row) => data.choices[row.type] || null,
          render: (row) => {
            if (!data.choices[row.type]) return global.PMS.markdown.inline(row.item);
            const known = data.choices[row.type].find((o) => o.value === row.item);
            return component('badge', { className: 'agenda-rule', text: escapeHtml(known ? known.label : row.item) });
          },
        },
      ],
    },
  };
  const targetOf = (table, row, index) => (table.target ? table.target(row, index) : { from: table.keyOf(row) });

  // A column's dropdown choices, which can depend on the rest of the row. None means a text box.
  const optionsOf = (column, row) => (typeof column.options === 'function' ? column.options(row || {}) : column.options);

  // The markup for a dropdown or text box for one column, with `value` among its choices.
  function fieldHtml(column, value, inline, row) {
    const choices = optionsOf(column, row);
    if (choices) {
      const options = !value || choices.some((o) => o.value === value) ? choices : choices.concat(option(value));
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

    // What's sent for a row, put back into the file's form where the table shows it differently.
    const bodyOf = (body) => (table.toBody ? table.toBody(body, data) : body);

    const cellText = (row, column) => {
      if (column.render) return column.render(row);
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
        note: table.note || '',
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
          data = table.toRow ? Object.assign({}, result, { rows: result.rows.map(table.toRow) }) : result;
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
      const index = Number(cell.closest('tr').dataset.index);
      const row = data.rows[index];
      const column = columns.find((c) => c.key === cell.dataset.cell);
      editorOpen = true;
      const field = inlineEditor({
        host: cell,
        field: fieldHtml(column, row[column.key], true, row),
        value: row[column.key],
        unchanged: (f) => f.value === row[column.key],
        send: (f) => postJson(table.url, bodyOf(Object.assign({}, row, { action: 'update', [column.key]: f.value }, targetOf(table, row, index)))),
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
      const blank = table.blank || {};
      const draftOf = (f) => Object.fromEntries(editable.map((column) => [column.key, fieldOf(f, column).value]));
      const form = formDialog({
        heading: 'New ' + table.noun,
        fields: editable.map((column) => component('label-modal-field', { label: column.label, field: fieldHtml(column, '', false, blank) })).join(''),
        submit: 'Add',
        failure: 'Could not save that.',
        send: (f) => postJson(table.url, bodyOf(Object.assign({ action: 'add' }, draftOf(f)))),
        done: (_, dialog) => {
          dialog.close();
          return reload();
        },
      });
      const prepare = (column, value) => {
        const field = fieldOf(form, column);
        field.value = value;
        keepUpperCase(field, column);
      };
      editable.forEach((column) => prepare(column, blank[column.key] || ''));
      // A column whose choices depend on the others is drawn again when one of those changes.
      form.addEventListener('change', (e) => {
        const changed = editable.find((column) => e.target === fieldOf(form, column));
        if (!changed || typeof changed.options === 'function') return;
        const draft = draftOf(form);
        editable
          .filter((column) => typeof column.options === 'function')
          .forEach((column) => {
            fieldOf(form, column).outerHTML = fieldHtml(column, '', false, draft);
            prepare(column, optionsOf(column, draft) ? fieldOf(form, column).value : '');
          });
      });
      const first = form.querySelector('input, select');
      if (first) first.focus();
    }

    async function removeRow(index) {
      const row = data.rows[index];
      if (!(await status.confirmDelete(table.keyOf(row), 'Delete this ' + table.noun + '?'))) return;
      try {
        const result = await postJson(table.url, Object.assign({ action: 'delete' }, targetOf(table, row, index)));
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
      if (e.target.closest('[data-remove]')) removeRow(Number(e.target.closest('tr').dataset.index));
    });

    return { load };
  }

  global.PMS.labelTables = { create };
})(window);
