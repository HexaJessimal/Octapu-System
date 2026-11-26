// Options page: an edit form for _Options/Options.csv, plus the Task Management, Leaders, Colours,
// Agenda and Entities tabs, and the Task Archive to read.
(function () {
  'use strict';
  const { labelTables, markdown, component, getJson, postJson, loadError, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const panels = {
    general: contentEl,
    statuses: document.getElementById('statuses-panel'),
    leaders: document.getElementById('leaders-panel'),
    colours: document.getElementById('colours-panel'),
    agenda: document.getElementById('agenda-panel'),
    entities: document.getElementById('entities-panel'),
    archive: document.getElementById('archive-panel'),
  };
  const tables = {
    statuses: labelTables.create('statuses', panels.statuses),
    leaders: labelTables.create('leaders', panels.leaders),
    colours: labelTables.create('colours', panels.colours),
    agenda: labelTables.create('agenda', panels.agenda),
    entities: labelTables.create('entities', panels.entities),
    archive: { load: loadTaskArchive },
  };

  // _Task_Archive.md, shown as it's written. Only a review adds to it, so there's nothing to edit.
  function loadTaskArchive() {
    return getJson('api/task-archive')
      .then((data) => {
        panels.archive.innerHTML = data.exists
          ? component('doc-article', { body: markdown.render(data.content) })
          : component('empty-card', { message: data.location + " doesn't exist yet. Each Review moves the tasks already in an ARCHIVED status into it." });
      })
      .catch((err) => {
        panels.archive.innerHTML = loadError('the Task Archive', err);
      });
  }

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
  const TOGGLE_NOTES = {
    SHOWARCHIVED: 'Show archived tasks on project, tentacle, Contacts and Events pages',
    SYNCCONFLICTS: 'Warn at the top of a page when Syncthing has left a conflicting copy of its file, and show how they differ',
    MULTIUSER: 'Ask people to log in by choosing their name from Leaders, and log who changed each file in a Changelog tab',
  };

  // What each dropdown option does, and what each of its values means.
  const CHOICE_NOTES = {
    ARCHIVEMODE: 'What the Archive button on a project does. HEADERS sets Date Closed and copies its header into _Archive.md, leaving the folder for you to move off (to a NAS, say). FULL sets Date Closed and renames the folder with today\'s date.',
    THEME: 'The colours of every page. DARK is the usual purple theme on a dark page, LITE is the same on a pale page, MONO is black on white with a few highlight colours, and CYAN is cyan on black. CUSTOM uses your own colours from the Colours tab (_Options/Colours.csv).',
    CORNERS: 'ROUND gives boxes, buttons and labels rounded corners. SQUARE makes them all square, leaving only true circles round.',
  };

  function field(o) {
    if (o.choices) {
      const options = o.choices.map((value) => component('option', { value, label: value, selected: value === o.value.toUpperCase() })).join('');
      return component('options-choice', { key: o.key, options, note: CHOICE_NOTES[o.key] || '' });
    }
    if (!o.toggle) return component('options-field', { key: o.key, value: o.value });
    const on = o.value.toUpperCase() === 'TRUE';
    return component('options-toggle', { on, checked: String(on), key: o.key, value: on ? 'TRUE' : 'FALSE', note: TOGGLE_NOTES[o.key] || '' });
  }

  function render(options) {
    if (!options.length) {
      contentEl.innerHTML = component('empty-card', { message: 'No options found in _Options/Options.csv.' });
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
        if (result.ok && values.MULTIUSER === 'TRUE' && !window.PMS_USER) location.assign('login.html'); // turning it on asks who you are
        else if (result.ok) {
          window.PMS.status.refresh(); // the sidebars show dates in the new format
          // THEME and CORNERS change the colours stylesheet, so it's fetched again.
          const link = document.querySelector('link[href^="api/colours.css"]');
          if (link) link.href = 'api/colours.css?' + Date.now();
        }
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
