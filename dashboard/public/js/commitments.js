// Commitments: the entries in Time_Management/Commitments.md, as cards to view, edit, add and remove.
(function () {
  'use strict';
  const { status, editing, escapeHtml, displayDates, setDateFormat, dependencyHref, normalText, hashReference, component, getJson, loadError, UNREACHABLE, formDialog } = window.PMS;

  const contentEl = document.getElementById('content');
  let doc = null;

  function dependencyText(commitment) {
    if (!commitment.dependency) return 'None';
    return commitment.target ? component('link', { href: dependencyHref(commitment.target), label: commitment.dependency }) : escapeHtml(commitment.dependency);
  }

  function card(commitment, index) {
    return component('commitment-card', {
      index,
      target: normalText(commitment.title) === normalText(hashReference()),
      attrs: editing.attrs('commitment', commitment.line, commitment.title),
      title: commitment.title,
      priority: status.commitmentPriorityControl(doc, commitment),
      timeframe: commitment.timeframes.length ? commitment.timeframes.map(displayDates).join(', ') : 'Not set',
      timeframeControl: status.commitmentTimeframeControl(doc, commitment),
      dependency: dependencyText(commitment),
      dependencyControl: status.commitmentDependencyControl(doc, commitment),
    });
  }

  function draw() {
    if (!doc || editing.isOpen()) return;
    const list = doc.commitments.length
      ? component('card-stack', { items: doc.commitments.map(card).join('') })
      : component('empty-card', { message: doc.exists ? 'No commitments yet.' : doc.location + " doesn't exist yet. Adding a commitment creates it." });
    contentEl.innerHTML = component('entry-new', { noun: 'commitment' }) + list;
    const target = contentEl.querySelector('.is-target');
    if (target) target.scrollIntoView({ block: 'start' });
  }

  editing.init({ project: () => doc, redraw: draw });

  function askForCommitment() {
    formDialog({
      heading: 'New commitment',
      fields: component('text-field', { label: 'Name', name: 'title' }),
      submit: 'Add',
      failure: 'Could not add that.',
      send: ({ elements }) => editing.post('api/commitment-add', { title: elements.title.value }),
      done: (_, dialog) => {
        dialog.close();
        return status.refresh();
      },
    });
  }

  async function removeCommitment(commitment) {
    if (!(await status.confirmDelete(commitment.title, 'Delete this commitment?'))) return;
    try {
      const result = await editing.post('api/commitment-remove', { line: commitment.line, title: commitment.title });
      if (!result.ok) status.toast(result.error || 'Could not delete that.');
      await status.refresh();
    } catch (_) {
      status.toast(UNREACHABLE);
    }
  }

  contentEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-entry]')) return askForCommitment();
    const remove = e.target.closest('[data-remove-commitment]');
    if (remove) removeCommitment(doc.commitments[Number(remove.dataset.removeCommitment)]);
  });

  function load() {
    return getJson('api/commitments')
      .then((data) => {
        setDateFormat(data.dateFormat);
        status.setCommitmentOptions(data.priorities, data.dependencyChoices);
        doc = data;
        draw();
      })
      .catch((err) => {
        contentEl.innerHTML = loadError('the commitments', err);
      });
  }

  status.onChange(load);
  load();
})();
