// First-time setup form. It only asks for what the server says is still missing.
(function () {
  'use strict';
  const { component, getJson, postJson, showFormError, suggestIdFrom, UNREACHABLE } = window.PMS;

  const form = document.getElementById('setup-form');
  const fieldsEl = document.getElementById('setup-fields');
  const filesEl = document.getElementById('setup-files');
  const error = form.querySelector('.form-error');

  const textField = (label, name) => component('text-field', { label, name });

  function render(state) {
    if (!state.needed) {
      location.replace('./');
      return;
    }
    const { entity, leader, dateFormat } = state.fields;
    const parts = [];
    if (entity) parts.push(textField('Entity name', 'entityName'), textField('Entity ID', 'entityId'));
    if (leader) parts.push(textField('Your name', 'leaderName'));
    if (dateFormat) {
      parts.push(
        component('select-field', {
          label: 'Date format',
          name: 'dateFormat',
          required: true,
          options: state.dateFormats.map((value) => component('option', { value, selected: false, label: value })).join(''),
        })
      );
    }
    if (parts.length) {
      fieldsEl.innerHTML = parts.join('');
      fieldsEl.hidden = false;
    }
    if (state.missing.length) {
      filesEl.textContent = 'This will create: ' + state.missing.join(', ');
      filesEl.hidden = false;
    }
    if (entity) suggestIdFrom(form.elements.entityName, form.elements.entityId);
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const values = {};
    ['entityName', 'entityId', 'leaderName', 'dateFormat'].forEach((key) => {
      if (form.elements[key]) values[key] = form.elements[key].value;
    });
    try {
      const result = await postJson('api/setup', values);
      if (result.ok) location.replace('./');
      else showFormError(error, result.error || 'Could not finish setup.');
    } catch (_) {
      showFormError(error, UNREACHABLE);
    }
  });

  getJson('api/setup')
    .then(render)
    .catch((err) => showFormError(error, 'Could not load setup (' + err.message + ').'));
})();
