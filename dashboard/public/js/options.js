// Options page: an edit form for Labels/Options.csv, plus the Statuses, Leaders and Colours tabs.
(function () {
  'use strict';
  const { labelTables, component, getJson, postJson, loadError, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const panels = {
    general: contentEl,
    statuses: document.getElementById('statuses-panel'),
    leaders: document.getElementById('leaders-panel'),
    colours: document.getElementById('colours-panel'),
  };
  const tables = {
    statuses: labelTables.create('statuses', panels.statuses),
    leaders: labelTables.create('leaders', panels.leaders),
    colours: labelTables.create('colours', panels.colours),
  };

  function show(tab) {
    Object.keys(panels).forEach((key) => {
      panels[key].hidden = key !== tab;
    });
    tabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
    const params = new URLSearchParams(location.search);
    if (tab === 'general') params.delete('tab');
    else params.set('tab', tab);
    const query = params.toString();
    history.replaceState(null, '', query ? '?' + query : location.pathname);
    if (tables[tab]) tables[tab].load(); // the CSV files can change at any time
  }

  tabs.forEach((button) => button.addEventListener('click', () => show(button.dataset.tab)));
  const requested = new URLSearchParams(location.search).get('tab');
  show(tables[requested] ? requested : 'general');

  // What each on/off option does, shown under its name.
  const TOGGLE_NOTES = { SHOWARCHIVED: 'Show archived tasks on project, entity, Leads and Events pages' };

  function field(o) {
    if (!o.toggle) return component('options-field', { key: o.key, value: o.value });
    const on = o.value.toUpperCase() === 'TRUE';
    return component('options-toggle', { on, checked: String(on), key: o.key, value: on ? 'TRUE' : 'FALSE', note: TOGGLE_NOTES[o.key] || '' });
  }

  function render(options) {
    if (!options.length) {
      contentEl.innerHTML = component('empty-card', { message: 'No options found in Labels/Options.csv.' });
      return;
    }
    contentEl.innerHTML = component('options-form', { fields: options.map(field).join('') });

    const form = document.getElementById('options-form');
    const message = document.getElementById('options-message');
    form.addEventListener('click', (e) => {
      const box = e.target.closest('[role="checkbox"][data-key]');
      if (!box) return;
      e.preventDefault(); // a click on the label would otherwise click the box a second time
      const on = box.dataset.value !== 'TRUE';
      box.dataset.value = on ? 'TRUE' : 'FALSE';
      box.setAttribute('aria-checked', String(on));
      box.classList.toggle('has-icon', on);
      box.classList.toggle('icon-done', on);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const values = {};
      form.querySelectorAll('[data-key]').forEach((input) => {
        values[input.dataset.key] = input.dataset.value !== undefined ? input.dataset.value : input.value.trim();
      });
      message.className = 'options-message';
      message.textContent = 'Saving…';
      try {
        const result = await postJson('api/options', { values });
        message.className = 'options-message' + (result.ok ? '' : ' is-error');
        message.textContent = result.ok ? 'Saved.' : result.error || 'Could not save the options.';
        if (result.ok) window.PMS.status.refresh(); // the sidebars show dates in the new format
      } catch (_) {
        message.className = 'options-message is-error';
        message.textContent = UNREACHABLE;
      }
    });
  }

  getJson('api/options')
    .then(render)
    .catch((err) => {
      contentEl.innerHTML = loadError('the options', err);
    });
})();
