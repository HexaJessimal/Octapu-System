// Syncthing conflict warnings and the Changelog view, shared by the project, entity and
// Networking pages. Each page calls showConflicts after loading its file, and
// drawChangelog when its Changelog view is open.
(function (global) {
  'use strict';
  const { component, getJson, postJson, displayDate, loadError, status, UNREACHABLE } = global.PMS;

  const MARKS = { add: '+', remove: '−', from: '~', to: '~' };
  const LABELS = { add: 'Added', remove: 'Removed', from: 'Changed from', to: 'Changed to' };
  const MULTI_USER = Boolean(global.PMS_MULTI_USER);
  const query = (doc) => '?folder=' + encodeURIComponent(doc.folder) + '&file=' + encodeURIComponent(doc.file);

  const diffLine = ({ kind, line, text }) => component('diff-line', { kind, line, text, mark: MARKS[kind], label: LABELS[kind] });

  function diffLines(lines, more) {
    if (!lines.length && !more) return '';
    const extra = more ? component('diff-more', { text: '… and ' + more + ' more lines' }) : '';
    return component('diff-lines', { lines: lines.map(diffLine).join('') + extra });
  }

  // A conflict's hunks as lines: removed lines are only in this file, added ones only in the copy.
  function hunkLines(hunks) {
    const lines = [];
    hunks.forEach((h) => {
      const changed = h.type === 'change';
      h.removed.forEach((text, k) => lines.push({ kind: changed ? 'from' : 'remove', line: h.oldLine + k, text }));
      h.added.forEach((text, k) => lines.push({ kind: changed ? 'to' : 'add', line: h.newLine + k, text }));
    });
    return lines;
  }

  // ---------- Syncthing conflicts ----------

  const conflictsEl = document.getElementById('conflicts');
  let conflictDoc = null;

  function showConflicts(doc) {
    if (!conflictsEl || !global.PMS_SYNC_CONFLICTS) return;
    conflictDoc = doc && doc.file ? doc : null;
    if (!conflictDoc) {
      conflictsEl.innerHTML = '';
      return;
    }
    getJson('api/conflicts' + query(conflictDoc))
      .then((data) => {
        conflictsEl.innerHTML = data.conflicts
          .map((c) => component('conflict-warning', { name: c.name, when: displayDate(c.when.slice(0, 10)) + c.when.slice(10, 16), device: c.device, diff: diffLines(hunkLines(c.hunks)) }))
          .join('');
      })
      .catch(() => {
        conflictsEl.innerHTML = ''; // the page still works without the warning
      });
  }

  if (conflictsEl) {
    conflictsEl.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-conflict-action]');
      if (!button || !conflictDoc) return;
      const name = button.closest('[data-conflict]').dataset.conflict;
      const action = button.dataset.conflictAction;
      const question =
        action === 'keep' ? 'Keep this file as it is, and delete the conflict copy?' : 'Replace this file with the conflict copy? The current version will be lost.';
      if (!(await status.confirmDelete(name, question))) return;
      try {
        const result = await postJson('api/conflict', { folder: conflictDoc.folder, file: conflictDoc.file, name, action });
        if (!result.ok) status.toast(result.error || 'Could not settle that conflict.');
        await status.refresh(); // the page reloads its file, then asks again for conflicts
      } catch (_) {
        status.toast(UNREACHABLE);
      }
    });
  }

  // ---------- Changelog ----------

  // The page's toggle only shows its Changelog button in multi-user mode.
  document.querySelectorAll('[data-view="changelog"]').forEach((b) => {
    b.hidden = !MULTI_USER;
  });

  // The page's own views that can be named in the address, plus Changelog if it's shown.
  const viewNames = (names) => (MULTI_USER ? names.concat('changelog') : names);

  function when(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return displayDate(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  let drawn = 0; // so a slow reply can't fill a view that has since changed

  // Fetched each time, so changes made a moment ago are included.
  function drawChangelog(doc, el, before) {
    const ticket = ++drawn;
    el.innerHTML = (before || '') + component('empty-card', { message: 'Loading the changelog…' });
    getJson('api/changelog' + query(doc))
      .then((data) => {
        if (ticket !== drawn) return;
        const entries = data.entries.map((entry) =>
          component('changelog-entry', { user: entry.user, device: entry.device, when: when(entry.time), diff: diffLines(entry.lines, entry.more) })
        );
        el.innerHTML =
          (before || '') +
          component('changelog-intro', { file: doc.file, days: data.days }) +
          (entries.length ? component('card-stack', { items: entries.join('') }) : component('empty-card', { message: 'No changes logged in this period.' }));
      })
      .catch((err) => {
        if (ticket === drawn) el.innerHTML = (before || '') + loadError('the changelog', err);
      });
  }

  // Any other drawing of the page cancels a changelog still loading.
  const cancelChangelog = () => drawn++;

  global.PMS.changes = { showConflicts, viewNames, drawChangelog, cancelChangelog };
})(window);
