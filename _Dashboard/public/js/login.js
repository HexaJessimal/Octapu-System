// Multi-user login: pick your name from Leaders.csv. There are no passwords; it only says who
// made each change.
(function () {
  'use strict';
  const { component, getJson, postJson, showFormError, entityPicker, UNREACHABLE } = window.PMS;

  // Each entity has its own leaders, so the entity is chosen first.
  document.getElementById('entity-picker').innerHTML = entityPicker();

  const form = document.getElementById('login-form');
  const fieldsEl = document.getElementById('login-fields');
  const error = form.querySelector('.form-error');
  document.getElementById('login-message').hidden = new URLSearchParams(location.search).get('loggedout') !== '1';

  function render(info) {
    if (!info.multiUser) {
      location.replace('./');
      return;
    }
    if (!info.leaders.length) {
      showFormError(error, 'There are no leaders to choose from yet. Add one to _Labels/Leaders.csv.');
      return;
    }
    const options = info.leaders.map((name) => component('option', { value: name, selected: name === info.user, label: name }));
    fieldsEl.innerHTML = component('select-field', { label: 'Your name', name: 'name', required: true, options: options.join('') });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    if (!form.elements.name) return;
    try {
      const result = await postJson('api/login', { name: form.elements.name.value });
      if (result.ok) location.replace('./');
      else showFormError(error, result.error || 'Could not log in.');
    } catch (_) {
      showFormError(error, UNREACHABLE);
    }
  });

  getJson('api/login-info')
    .then(render)
    .catch((err) => showFormError(error, 'Could not load the list of names (' + err.message + ').'));
})();
