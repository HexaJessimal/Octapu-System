// The "New project" button and form on the projects list.
(function () {
  'use strict';
  const { component, postJson, showFormError, getJson, UNREACHABLE } = window.PMS;

  const openButton = document.getElementById('new-project-button');
  const dialog = document.getElementById('new-project-dialog');
  if (!openButton || !dialog) return;

  const form = dialog.querySelector('form');
  const error = dialog.querySelector('.form-error');
  const entity = form.elements.entity;
  const owner = form.elements.owner;
  const type = form.elements.type;

  function fillSelect(select, items) {
    select.innerHTML =
      component('option', { value: '', selected: false, label: 'Choose…' }) +
      items.map((i) => component('option', { value: i.id, selected: false, label: i.name })).join('');
  }

  // The lists are fetched each time, as the CSV files can change at any time.
  openButton.addEventListener('click', async () => {
    form.reset();
    error.hidden = true;
    try {
      const data = await getJson('api/project-options');
      fillSelect(entity, data.owners);
      fillSelect(owner, data.leaders);
      fillSelect(type, data.types.map((t) => ({ id: t, name: t })));
    } catch (err) {
      showFormError(error, 'Could not load the entity and owner lists (' + err.message + ').');
    }
    dialog.showModal();
  });

  dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      const result = await postJson('api/projects', {
        entity: entity.value,
        title: form.elements.title.value,
        owner: owner.value,
        type: type.value,
        notes: form.elements.notes.value,
        dir: new URLSearchParams(location.search).get('dir') || undefined,
      });
      if (!result.ok) return showFormError(error, result.error || 'Could not create the project.');
      location.href = 'project.html?folder=' + encodeURIComponent(result.body.folder);
    } catch (_) {
      showFormError(error, UNREACHABLE);
    }
  });
})();
