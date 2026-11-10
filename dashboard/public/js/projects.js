// Helpers shared by every page: folder names, dates, HTML components and server requests.
// Folder names:
//   +OWNER_Project_Title          -> active
//   -OWNER_Project_Title          -> inactive
//   YYYY-MM-DD_OWNER_Project_Title -> archived (separator may be '-', '.' or '_')
(function (global) {
  'use strict';

  const ARCHIVE_RE = /^(\d{4})[.\-_](\d{2})[.\-_](\d{2})[_\s-]*/;

  // Inside the Review page's overlay, a page shows without its menu and sidebar.
  if (global.self !== global.top) document.documentElement.classList.add('embedded');

  function parseFolder(folder) {
    let status = 'unknown';
    let archivedOn = null;
    // Outside the first project directory a folder is named "directory/folder".
    const name = folder.slice(folder.lastIndexOf('/') + 1);
    let rest = name;

    if (rest.startsWith('+')) {
      status = 'active';
      rest = rest.slice(1);
    } else if (rest.startsWith('-')) {
      status = 'inactive';
      rest = rest.slice(1);
    } else {
      const m = rest.match(ARCHIVE_RE);
      if (m) {
        status = 'archived';
        archivedOn = `${m[1]}-${m[2]}-${m[3]}`;
        rest = rest.slice(m[0].length);
      }
    }

    const parts = rest.split('_').filter(Boolean);
    const owner = parts.length > 1 ? parts[0] : '';
    const title = (parts.length > 1 ? parts.slice(1) : parts).join(' ') || name;

    return { folder, status, archivedOn, owner, title };
  }

  const STATUS_LABELS = {
    active: 'Active',
    inactive: 'Inactive',
    archived: 'Archived',
    unknown: 'Unsorted',
  };

  // A suggested ID for a new entity, in the style of the others.
  const suggestEntityId = (name) => name.toUpperCase().replace(/[^A-Z0-9]+/g, '');

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ---------- components ----------

  // All markup lives in public/components/*.html, delivered by api/components.js.
  // {{slot}} is escaped, {{{slot}}} is HTML that's already safe, and
  // {{#if slot}}...{{else}}...{{/if}} is optional markup.
  const SLOT = /(\{\{\{\w+\}\}\}|\{\{(?:#if \w+|else|\/if|\w+)\}\})/;
  const parsedComponents = new Map();

  function parseComponent(source) {
    const tokens = source.split(SLOT);
    let at = 0;
    function block() {
      const nodes = [];
      while (at < tokens.length && tokens[at] !== '{{else}}' && tokens[at] !== '{{/if}}') {
        const token = tokens[at++];
        const condition = token.match(/^\{\{#if (\w+)\}\}$/);
        if (condition) {
          const yes = block();
          let no = [];
          if (tokens[at] === '{{else}}') {
            at++;
            no = block();
          }
          at++; // the closing {{/if}}
          nodes.push({ test: condition[1], yes, no });
        } else if (/^\{\{\{\w+\}\}\}$/.test(token)) {
          nodes.push({ raw: token.slice(3, -3) });
        } else if (/^\{\{\w+\}\}$/.test(token)) {
          nodes.push({ text: token.slice(2, -2) });
        } else if (token) {
          nodes.push(token);
        }
      }
      return nodes;
    }
    return block();
  }

  function fillComponent(nodes, data) {
    return nodes
      .map((node) => {
        if (typeof node === 'string') return node;
        if (node.test) return fillComponent(data[node.test] ? node.yes : node.no, data);
        const value = data[node.raw || node.text];
        if (value === undefined || value === null) return '';
        return node.raw ? String(value) : escapeHtml(value);
      })
      .join('');
  }

  // The HTML of a named component, with its slots filled in.
  function component(name, data) {
    if (!parsedComponents.has(name)) {
      const source = (global.PMS_COMPONENTS || {})[name];
      if (source === undefined) throw new Error('No component called ' + name);
      parsedComponents.set(name, parseComponent(source));
    }
    return fillComponent(parsedComponents.get(name), data || {});
  }

  // The same, as a live element, for a component with a single root such as a dialog.
  function element(name, data) {
    const holder = document.createElement('template');
    holder.innerHTML = component(name, data);
    return holder.content.firstElementChild;
  }

  // ---------- server requests ----------

  const UNREACHABLE = 'Could not reach the dashboard server.';

  // The parsed reply, or an error if the server refused.
  function getJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  // For replies whose body explains a failure: resolves to { ok, data } either way.
  function readJson(url) {
    return fetch(url).then((r) => r.json().then((data) => ({ ok: r.ok, data })));
  }

  // Resolves to { ok, error, body }. Rejects only if the server can't be reached.
  async function postJson(url, fields) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, error: body.error, body };
  }

  // ---------- page helpers ----------

  function loadError(what, err) {
    return component('error-card', { message: 'Could not load ' + what + ' (' + err.message + ').' });
  }

  function showFormError(el, message) {
    el.textContent = message;
    el.hidden = false;
  }

  // A saved array from localStorage, or an empty one.
  function storedList(key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key));
      return Array.isArray(saved) ? saved : [];
    } catch (_) {
      return [];
    }
  }

  // For comparing headings typed by hand.
  const normalText = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase();

  // The heading named after the # in the address.
  function hashReference() {
    const reference = location.hash.slice(1);
    try {
      return decodeURIComponent(reference);
    } catch (_) {
      return reference; // not encoded: use it as it is
    }
  }

  function setViewInAddress(view, defaultView) {
    const query = new URLSearchParams(location.search);
    if (view === defaultView) query.delete('view');
    else query.set('view', view);
    history.replaceState(null, '', '?' + query.toString());
  }

  function clearSelection() {
    const selection = window.getSelection && window.getSelection();
    if (selection) selection.removeAllRanges(); // a double-click selects a word
  }

  const entityHref = (root, id) => 'entity.html?id=' + encodeURIComponent(root) + (id === root ? '' : '&tab=' + encodeURIComponent(id));

  // A YYYY-MM-DD date as a whole number of days, so two can be subtracted.
  const dayNumber = (date) => {
    const [y, m, d] = date.split('-').map(Number);
    return Date.UTC(y, m - 1, d) / 86400000;
  };

  const byFolderTitle = (a, b) => parseFolder(a.folder).title.localeCompare(parseFolder(b.folder).title);

  // Fills in an ID from the name, until the ID has been typed into by hand.
  function suggestIdFrom(nameField, idField) {
    let edited = false;
    nameField.addEventListener('input', () => {
      if (!edited) idField.value = suggestEntityId(nameField.value);
    });
    idField.addEventListener('input', () => {
      edited = true;
    });
  }

  function openDialog(dialog) {
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    document.body.appendChild(dialog);
    dialog.showModal();
  }

  // A popup with some fields. `send(form)` resolves to { ok, error }, and `done` runs on success.
  function formDialog({ heading, fields, submit, failure, send, done }) {
    const dialog = element('form-dialog', { heading, fields, submit });
    const form = dialog.querySelector('form');
    const error = dialog.querySelector('.form-error');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.hidden = true;
      try {
        const result = await send(form);
        if (result.ok) await done(result, dialog);
        else showFormError(error, result.error || failure);
      } catch (_) {
        showFormError(error, UNREACHABLE);
      }
    });
    openDialog(dialog);
    return form;
  }

  // Replaces `host` with a field and Save and Cancel buttons.
  function inlineEditor({ host, field: fieldHtml, value, unchanged, send, onSaved, onCancel, submitsOn }) {
    const editor = element('inline-editor', { field: fieldHtml });
    const field = editor.querySelector('.inline-field');
    const error = editor.querySelector('.form-error');
    field.value = value;
    host.innerHTML = '';
    host.appendChild(editor);
    field.focus();

    let saving = false;
    const submit = async () => {
      if (saving) return;
      if (unchanged(field)) return onCancel();
      saving = true;
      error.hidden = true;
      try {
        const result = await send(field);
        if (result.ok) await onSaved();
        else showFormError(error, result.error || 'Could not save that.');
      } catch (_) {
        showFormError(error, UNREACHABLE);
      } finally {
        saving = false;
      }
    };
    editor.querySelector('[data-save]').addEventListener('click', submit);
    editor.querySelector('[data-cancel]').addEventListener('click', onCancel);
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') onCancel();
      else if (e.key === 'Enter' && submitsOn(e)) {
        e.preventDefault();
        submit();
      }
    });
    return field;
  }

  // ---------- dependencies ----------

  // A dependency is a project's folder, or "commitment:Name" for an entry in the commitments file.
  const COMMITMENT_TOKEN = 'commitment:';
  const dependencyTitle = (token) => (token.startsWith(COMMITMENT_TOKEN) ? token.slice(COMMITMENT_TOKEN.length) : parseFolder(token).title);
  const dependencyHref = (token) =>
    token.startsWith(COMMITMENT_TOKEN) ? 'commitments.html#' + encodeURIComponent(token.slice(COMMITMENT_TOKEN.length)) : 'project.html?folder=' + encodeURIComponent(token);

  // ---------- milestones and project rows ----------

  // What each milestone colour means.
  const STATE_LABELS = { done: 'Complete', partial: 'In progress', todo: 'Not started', none: 'Unplanned' };

  // One coloured segment per milestone, like the bar on a project's Overview tab.
  function progressBar(milestones) {
    if (!milestones.length) return component('progress-empty');
    const done = milestones.filter((m) => m.state === 'done').length;
    const segments = milestones.map((m) => component('progress-segment', { state: m.state, title: m.title + ': ' + STATE_LABELS[m.state] }));
    return component('progress-bar', { done, total: milestones.length, segments: segments.join('') });
  }

  const legendItems = () => Object.keys(STATE_LABELS).map((state) => component('legend-state', { state, label: STATE_LABELS[state] })).join('');

  function progressLegend() {
    return component('legend', { items: legendItems() });
  }

  function statusLabel(project) {
    return STATUS_LABELS[project.status] + (project.archivedOn ? ' · ' + displayDate(project.archivedOn) : '');
  }

  // One row of a project list. `timeframes` and `ownerShown` are optional extras.
  function projectRow(project, { label, timeframes, ownerShown, progress }) {
    return component('project-row', {
      folder: encodeURIComponent(project.folder),
      pill: component('pill', { status: project.status, label }),
      title: project.title,
      owner: ownerShown ? project.owner : '',
      dates: (timeframes || []).map((t) => component('project-row-date', { date: displayDates(t) })).join(''),
      progress,
    });
  }

  // Dates are stored as YYYY-MM-DD. DATEFORMAT only changes how they're shown.
  let dateFormat = 'YYYY-MM-DD';

  function setDateFormat(format) {
    if (format) dateFormat = format;
  }

  function displayDate(stored) {
    const m = stored.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return stored;
    const real = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (real.getUTCMonth() !== Number(m[2]) - 1 || real.getUTCDate() !== Number(m[3])) return stored;
    return dateFormat.replace('YYYY', m[1]).replace('YY', m[1].slice(2)).replace('MM', m[2]).replace('DD', m[3]);
  }

  // Shows every stored date within a piece of text in the display format.
  function displayDates(text) {
    return text.replace(/(?<![0-9])(?<![0-9][-./_])\d{4}-\d{2}-\d{2}(?![0-9])(?![-./_][0-9])/g, displayDate);
  }

  // The fixed status types, in order. Status names always come from Labels/Status.csv.
  const TYPES = ['UNASSIGNED', 'ASSIGNED', 'WAITING', 'DONE', 'ARCHIVED'];

  function presentTypes(statuses) {
    return TYPES.filter((t) => statuses.some((s) => s.type === t));
  }

  function badgeClass(type) {
    return 'badge type-' + TYPES.indexOf(type);
  }

  global.PMS = Object.assign(global.PMS || {}, {
    parseFolder,
    STATUS_LABELS,
    STATE_LABELS,
    progressBar,
    progressLegend,
    legendItems,
    dependencyTitle,
    dependencyHref,
    statusLabel,
    projectRow,
    escapeHtml,
    suggestEntityId,
    presentTypes,
    badgeClass,
    setDateFormat,
    displayDate,
    displayDates,
    component,
    element,
    UNREACHABLE,
    getJson,
    readJson,
    postJson,
    loadError,
    showFormError,
    storedList,
    normalText,
    hashReference,
    setViewInAddress,
    clearSelection,
    entityHref,
    byFolderTitle,
    dayNumber,
    suggestIdFrom,
    openDialog,
    formDialog,
    inlineEditor,
  });
})(window);
