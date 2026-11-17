// Review: done items since the last review, and the form that logs the wins.
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

  // Redraws only the two boxes, so wins being typed below aren't lost.
  function refreshReviewBoxes() {
    return getJson('api/weekly-review')
      .then((data) => {
        const queue = contentEl.querySelector('#review-queue');
        if (queue) queue.innerHTML = reviewBoxes(data.toReview);
      })
      .catch(() => {});
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
    contentEl.innerHTML = component('review-page', {
      queue: reviewBoxes(data.toReview),
      since,
      done: groups.length ? component('card-stack', { items: groups.map(box).join('') }) : component('empty-card', { message: 'Nothing done since the last review.' }),
      count,
      archiveTo: data.archiveTo,
    });
  }

  contentEl.addEventListener('click', (e) => {
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
