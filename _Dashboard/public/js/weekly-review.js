// Review: the agenda, done items since the last review, and the form that logs the wins.
(function () {
  'use strict';
  const { parseFolder, displayDate, setDateFormat, markdown: md, status, component, element, getJson, postJson, loadError, showFormError, UNREACHABLE, entityHref, openDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  let groups = [];
  let toReview = []; // the rows in the two "to review" boxes, indexed by data-review

  const pageOf = (entry) => (entry.root ? entityHref(entry.root, entry.id) : 'project.html?folder=' + encodeURIComponent(entry.folder));

  const nameOf = (entry) => (entry.root ? entry.name : parseFolder(entry.folder).title);
  const detailOf = (entry) => (entry.root ? entry.parentName || '' : parseFolder(entry.folder).owner);

  // `kind` matches the colour of this list's number beside Review in the menu.
  function reviewBox(heading, entries, kind) {
    const rows = entries.map((entry) => {
      toReview.push(entry);
      return component('review-entry', { href: pageOf(entry), index: toReview.length - 1, name: nameOf(entry), detail: detailOf(entry) });
    });
    return component('review-queue-box', {
      kind,
      heading,
      count: entries.length,
      body: rows.length ? component('review-items', { items: rows.join('') }) : component('no-tasks', { message: 'Nothing to review.' }),
    });
  }

  function reviewBoxes(data) {
    toReview = [];
    return reviewBox('Projects to review', data.projects, 'projects') + reviewBox('Entities to review', data.entities, 'entities');
  }

  // ---------- the agenda (AgendaItems.csv) ----------

  const agendaCheck = (row) => component('agenda-check', { index: row.index, item: row.item, checked: row.checked });

  // A project or entity on a rule card. Reviewed since the last logged review shows as done.
  function agendaEntry(entry) {
    toReview.push(entry);
    const reviewed = entry.reviewed ? 'Reviewed ' + displayDate(entry.reviewed) : 'Not reviewed yet';
    return component('agenda-entry', {
      href: pageOf(entry),
      index: toReview.length - 1,
      name: nameOf(entry),
      done: entry.done,
      meta: [detailOf(entry), reviewed].filter(Boolean).join(' · '),
    });
  }

  // A page to look at, such as an event, a catalog or the Dashboard, with its date or a note.
  function agendaLink(link) {
    const date = link.date ? displayDate(link.date) + (link.end && link.end !== link.date ? ' to ' + displayDate(link.end) : '') : '';
    return component('agenda-link', { href: link.href, label: link.label, meta: date || link.meta || '' });
  }

  // The number shows how many have been reviewed, or how many links there are.
  function agendaCard(card) {
    const rows = card.entries.map(agendaEntry).concat(card.links.map(agendaLink));
    let body = component('no-tasks', { message: card.error || 'Nothing to review.' });
    if (!card.error && rows.length) body = component('review-items', { items: rows.join('') });
    const done = card.entries.filter((e) => e.done).length;
    const count = card.error ? '' : card.entries.length ? done + '/' + card.entries.length : String(card.links.length);
    return component('agenda-card', { check: agendaCheck(card), checked: card.checked, title: card.title, count, body });
  }

  // Text items share one card. They're markdown, so [[LABEL]] links work as anywhere else.
  function agendaText(rows) {
    if (!rows.length) return '';
    const items = rows.map((row) => component('agenda-text-item', { check: agendaCheck(row), checked: row.checked, text: md.inline(row.item) })).join('');
    return component('agenda-card', { check: '', checked: false, title: 'Additional Agenda Items', count: '', body: component('review-items', { items }) });
  }

  // Must follow reviewBoxes, as the rule cards' rows carry on its data-review numbering.
  const agendaHtml = (agenda) => agenda.cards.map(agendaCard).join('') + agendaText(agenda.text);

  // Redraws only the boxes and the agenda, so wins being typed below aren't lost.
  function refreshReviewBoxes() {
    return getJson('api/weekly-review')
      .then((data) => {
        const queue = contentEl.querySelector('#review-queue');
        const agenda = contentEl.querySelector('#agenda');
        if (queue) queue.innerHTML = reviewBoxes(data.toReview);
        if (agenda) {
          agenda.innerHTML = agendaHtml(data.agenda);
          agenda.hidden = !agenda.innerHTML;
        }
      })
      .catch(() => {});
  }

  async function toggleAgenda(box) {
    try {
      const checked = box.getAttribute('aria-checked') !== 'true';
      const result = await postJson('api/agenda-check', { index: Number(box.dataset.agendaCheck), item: box.dataset.item, checked });
      if (!result.ok) status.toast(result.error || 'Could not tick that.');
    } catch (_) {
      status.toast(UNREACHABLE);
    }
    refreshReviewBoxes();
  }

  function openReview(entry) {
    const dialog = element('review-overlay', { href: pageOf(entry), name: nameOf(entry) });
    const error = dialog.querySelector('.form-error');
    dialog.querySelector('[data-mark]').addEventListener('click', async () => {
      error.hidden = true;
      try {
        const result = await postJson('api/mark-reviewed', { folder: entry.folder, file: entry.file });
        if (result.ok) dialog.close();
        else showFormError(error, result.error || 'Could not mark that as reviewed.');
      } catch (_) {
        showFormError(error, UNREACHABLE);
      }
    });
    // Anything may have been edited in the overlay, so the rest of the page catches up.
    dialog.addEventListener('close', () => {
      refreshReviewBoxes();
      status.refresh();
    });
    openDialog(dialog);
  }

  function itemRow(item) {
    return component('review-done-item', { text: md.inline(item.text), project: item.source || parseFolder(item.folder).title, closed: item.closed ? displayDate(item.closed) : '' });
  }

  function box(group, index) {
    return component('review-done-box', { index, status: group.status, count: group.items.length, items: group.items.map(itemRow).join('') });
  }

  function render(data) {
    setDateFormat(data.dateFormat);
    groups = data.groups;
    const since = data.lastReview ? 'Done since the last review on ' + displayDate(data.lastReview) + '.' : 'No reviews logged yet, so this is everything done so far.';
    const count = data.totalDone + (data.totalDone === 1 ? ' done item' : ' done items');
    const queue = reviewBoxes(data.toReview);
    const agenda = agendaHtml(data.agenda);
    contentEl.innerHTML = component('review-page', {
      queue,
      agenda,
      hideAgenda: !agenda,
      since,
      done: groups.length ? component('card-stack', { items: groups.map(box).join('') }) : component('empty-card', { message: 'Nothing done since the last review.' }),
      count,
      archiveTo: data.archiveTo,
    });
  }

  contentEl.addEventListener('click', (e) => {
    const check = e.target.closest('[data-agenda-check]');
    if (check) return toggleAgenda(check);
    const link = e.target.closest('[data-review]');
    if (link) {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return; // opening it in a new tab still works
      e.preventDefault();
      openReview(toReview[Number(link.dataset.review)]);
      return;
    }
    const button = e.target.closest('[data-add-wins]');
    if (!button) return;
    const index = Number(button.dataset.addWins);
    const field = contentEl.querySelector('[name="wins"]');
    const bullets = groups[index].items.map((item) => '- ' + item.text).join('\n');
    field.value = field.value.trim() ? field.value.replace(/\s+$/, '') + '\n' + bullets : bullets;
    contentEl.querySelector('[data-box="' + index + '"]').remove();
  });

  contentEl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const error = form.querySelector('.form-error');
    error.hidden = true;
    try {
      const result = await postJson('api/weekly-review', { wins: form.elements.wins.value });
      if (!result.ok) return showFormError(error, result.error || 'Could not log the review.');
      await load();
      status.toast('Review logged. ' + result.body.archived + ' items moved to ' + result.body.archivedTo + '.');
      status.refresh();
    } catch (_) {
      showFormError(error, UNREACHABLE);
    }
  });

  function load() {
    return getJson('api/weekly-review')
      .then(render)
      .catch((err) => {
        contentEl.innerHTML = loadError('the review', err);
      });
  }

  load();
})();
