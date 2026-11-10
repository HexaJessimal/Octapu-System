// Compatibility pages: the projects or entities whose markdown needs changes.
(function () {
  'use strict';
  const { parseFolder, STATUS_LABELS, escapeHtml, component, getJson, postJson, UNREACHABLE } = window.PMS;

  const contentEl = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const type = new URLSearchParams(location.search).get('type') === 'entities' ? 'entities' : 'projects';
  const title = type === 'projects' ? 'Project compatibility' : 'Entity compatibility';

  function describe(row) {
    if (type === 'entities') {
      return { name: row.name, href: row.id ? 'entity.html?id=' + encodeURIComponent(row.id) : null, pill: '' };
    }
    if (!row.folder) return { name: row.name, href: null, pill: '' }; // a directory named in Options.csv
    const project = parseFolder(row.folder);
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

  function card(row) {
    const { name, href: page, pill } = describe(row);
    const href = pageOf(row, page);
    return component('compat-card', {
      heading: href ? component('link', { href: escapeHtml(href), label: name }) : escapeHtml(name),
      pill,
      count: row.problems.length,
      location: row.file ? [row.directory, row.file].filter(Boolean).join(' · ') : '',
      problems: row.problems.map(({ text, kind }) => component('compat-problem', { kind, text })).join(''),
      fix: row.problems.some((p) => p.kind === 'fixable') ? component('compat-fix', { key: type === 'projects' ? row.folder : row.id, file: row.file }) : '',
    });
  }

  function render(data) {
    const byName = (a, b) => describe(a).name.localeCompare(describe(b).name);
    const rows = data.rows.slice().sort(byName);
    contentEl.innerHTML = component('compat-page', {
      count: rows.length,
      checked: data.checked,
      body: rows.length ? component('card-stack', { items: rows.map(card).join('') }) : component('empty-card', { message: 'Everything is compatible.' }),
    });
  }

  titleEl.textContent = title;
  document.title = title + ' · PMS';

  function load() {
    return getJson('api/compatibility?type=' + type)
      .then(render)
      .catch((err) => {
        contentEl.innerHTML = component('error-card', { message: 'Could not check compatibility (' + err.message + ').' });
      });
  }

  async function fix(button) {
    const { status } = window.PMS;
    button.disabled = true;
    try {
      const result = await postJson('api/compatibility-fix', { type, key: button.dataset.fix, file: button.dataset.file });
      if (!result.ok) status.toast(result.error || 'Could not fix that.');
    } catch (_) {
      status.toast(UNREACHABLE);
    }
    await load();
    status.refresh(); // a new entity file changes what the sidebars can list
  }

  contentEl.addEventListener('click', (e) => {
    const button = e.target.closest('[data-fix]');
    if (button) fix(button);
  });

  load();
})();
