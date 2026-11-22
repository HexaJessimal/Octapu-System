// Compatibility pages: the projects, tentacles, events or core files whose markdown needs changes.
(function () {
  'use strict';
  const { parseFolder, STATUS_LABELS, escapeHtml, component, getJson, postJson, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const TITLES = { projects: 'Project compatibility', tentacles: 'Tentacle compatibility', events: 'Event compatibility', core: 'Core file compatibility' };
  // Entities were renamed tentacles, so an old ?type=entities link still works.
  const asked = new URLSearchParams(location.search).get('type');
  const requested = asked === 'entities' ? 'tentacles' : asked;
  const type = Object.hasOwn(TITLES, requested) ? requested : 'projects';
  const title = TITLES[type];

  function describe(row) {
    if (type === 'events') return { name: row.name, href: 'networking.html?page=events#' + encodeURIComponent(row.name), pill: '' };
    if (type === 'core') return { name: row.name, href: row.href, pill: '' }; // a file the dashboard relies on
    if (type === 'tentacles') {
      return { name: row.name, href: row.id ? 'tentacle.html?id=' + encodeURIComponent(row.id) : null, pill: '' };
    }
    if (row.archiveLine) return { name: row.name, href: 'archive.html', pill: '' };
    if (!row.folder) return { name: row.name, href: null, pill: '' }; // a directory named in Options.csv
    // A Date Closed archives a project whatever its folder is called.
    const project = Object.assign(parseFolder(row.folder), row.archived ? { status: 'archived' } : {});
    return {
      name: project.title,
      href: 'project.html?folder=' + encodeURIComponent(row.folder),
      pill: component('pill', { status: project.status, label: STATUS_LABELS[project.status] }),
    };
  }

  // An additional file opens on its own, on a project's Raw tab as that's where its tabs are.
  function pageOf(row, href) {
    if (!href || !row.additional) return href;
    return href + '&file=' + encodeURIComponent(row.file) + (type === 'projects' ? '&view=raw' : '');
  }

  let leaders = [];

  const option = (value, label, selected) => component('option', { value, label, selected });

  // Some problems need a choice before Fix issues can sort them out: which file becomes the
  // project's main one (it's renamed after the project), or who the project's Leader is.
  function choices(row) {
    const wants = (kind) => row.problems.some((p) => p.choose === kind && p.kind === 'fixable');
    const parts = [];
    if (wants('main') && row.files) {
      const options = row.files.map((f) => option(f, f, f === row.file)).join('');
      parts.push(component('compat-choice', { label: 'Main file (renamed after the project)', name: 'main', options }));
    }
    if (wants('leader') && leaders.length) {
      // With one leader there's nothing to decide, so it's the only option.
      const leave = leaders.length > 1 ? option('', 'Leave for now', true) : '';
      parts.push(component('compat-choice', { label: 'Leader', name: 'leader', options: leave + leaders.map((l) => option(l.id, l.name, false)).join('') }));
    }
    return parts.join('');
  }

  // What Fix issues sends to find the row's file again. An event is found by its heading's
  // line and title.
  function fixKey(row) {
    if (type === 'events') return { key: String(row.line), file: row.name };
    if (type === 'core') return { key: row.key, file: row.file }; // which rename, and the old name
    if (row.archiveLine) return { key: 'archive:' + row.archiveLine, file: row.name }; // an _Archive.md entry
    return { key: type === 'projects' ? row.folder : row.id, file: row.file };
  }

  function card(row) {
    const { name, href: page, pill } = describe(row);
    const href = pageOf(row, page);
    return component('compat-card', {
      choices: choices(row),
      heading: href ? component('link', { href: escapeHtml(href), label: name }) : escapeHtml(name),
      pill,
      count: row.problems.length,
      location: row.file ? [row.directory, row.file].filter(Boolean).join(' · ') : '',
      problems: row.problems.map(({ text, kind }) => component('compat-problem', { kind, text })).join(''),
      fix: row.problems.some((p) => p.kind === 'fixable') ? component('compat-fix', fixKey(row)) : '',
    });
  }

  function render(data) {
    leaders = data.leaders || [];
    const byName = (a, b) => describe(a).name.localeCompare(describe(b).name);
    const rows = data.rows.slice().sort(byName);
    contentEl.innerHTML = component('compat-page', {
      count: rows.length,
      checked: data.checked,
      fixable: rows.filter((row) => row.problems.some((p) => p.kind === 'fixable')).length,
      body: rows.length ? component('card-stack', { items: rows.map(card).join('') }) : component('empty-card', { message: 'Everything is compatible.' }),
    });
  }

  titleEl.textContent = title;
  document.title = title + ' · Octapu System';

  function load() {
    return getJson('api/compatibility?type=' + type)
      .then(render)
      .catch((err) => {
        contentEl.innerHTML = component('error-card', { message: 'Could not check compatibility (' + err.message + ').' });
      });
  }

  // What a box's Fix issues sends: the row's key and file, and any choices made in its dropdowns.
  function bodyOf(button) {
    const body = { type, key: button.dataset.fix, file: button.dataset.file };
    button.closest('.card').querySelectorAll('[data-choice]').forEach((select) => {
      if (select.value) body[select.dataset.choice] = select.value;
    });
    return body;
  }

  async function send(body) {
    try {
      const result = await postJson('api/compatibility-fix', body);
      return result.ok ? null : result.error || 'Could not fix that.';
    } catch (_) {
      return UNREACHABLE;
    }
  }

  async function fix(button) {
    const { status } = window.PMS;
    button.disabled = true;
    const error = await send(bodyOf(button));
    if (error) status.toast(error);
    await load();
    status.refresh(); // a new tentacle file changes what the sidebars can list
  }

  // Events and archive entries are found by their line, and fixing one can add lines above the
  // next, so those are fixed from the bottom of the file up.
  const lineOf = (body) => Number((/^(?:archive:)?(\d+)$/.exec(body.key) || [])[1]) || 0;

  async function fixAll(button) {
    const { status } = window.PMS;
    button.disabled = true;
    const bodies = Array.from(contentEl.querySelectorAll('[data-fix]'))
      .map(bodyOf)
      .sort((a, b) => lineOf(b) - lineOf(a));
    const errors = [];
    for (const body of bodies) {
      const error = await send(body);
      if (error) errors.push(error);
    }
    await load();
    status.refresh();
    const fixed = bodies.length - errors.length;
    status.toast(errors.length ? fixed + ' fixed, ' + errors.length + ' could not be: ' + errors[0] : fixed + (fixed === 1 ? ' box fixed.' : ' boxes fixed.'));
  }

  contentEl.addEventListener('click', (e) => {
    const all = e.target.closest('[data-fix-all]');
    if (all) return fixAll(all);
    const button = e.target.closest('[data-fix]');
    if (button) fix(button);
  });

  load();
})();
