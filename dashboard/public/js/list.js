// Project menu: loads one directory's folders from /api/projects and filters them live.
(function () {
  'use strict';
  const { parseFolder, statusLabel, projectRow, progressBar, progressLegend, markdown, component, getJson } = window.PMS;

  const listEl = document.getElementById('list');
  const searchEl = document.getElementById('search');
  const chips = Array.from(document.querySelectorAll('[data-filter]'));

  const STATUS_ORDER = { active: 0, inactive: 1, unknown: 2, archived: 3 };
  const dir = new URLSearchParams(location.search).get('dir');
  let projects = [];
  let directory = null;
  let state = readHash();

  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const filter = params.get('filter');
    return {
      filter: ['all', 'active', 'inactive', 'archived'].includes(filter) ? filter : 'all',
      q: params.get('q') || '',
    };
  }

  function writeHash() {
    const params = new URLSearchParams();
    if (state.filter !== 'all') params.set('filter', state.filter);
    if (state.q) params.set('q', state.q);
    const hash = params.toString();
    history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
  }

  function matchesSearch(p, q) {
    if (!q) return true;
    const hay = (p.title + ' ' + p.owner + ' ' + p.folder).toLowerCase();
    return q
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .every((word) => hay.includes(word));
  }

  function render() {
    const searched = projects.filter((p) => matchesSearch(p, state.q));

    // Counts reflect the current search so the chips stay honest.
    const counts = { all: searched.length, active: 0, inactive: 0, archived: 0 };
    searched.forEach((p) => {
      if (p.status in counts) counts[p.status]++;
    });
    Object.entries(counts).forEach(([k, n]) => {
      const el = document.querySelector('[data-count="' + k + '"]');
      if (el) el.textContent = n;
    });
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.filter === state.filter)));

    const visible = searched.filter((p) => state.filter === 'all' || p.status === state.filter);

    if (!visible.length) {
      listEl.innerHTML = component('empty-item', { message: projects.length ? 'No projects match.' : 'No project folders found in ' + directory.name + '/.' });
      return;
    }

    listEl.innerHTML = visible
      .map((p) => projectRow(p, { label: statusLabel(p), ownerShown: true, progress: p.ongoing ? component('project-row-spacer') : progressBar(p.milestones) }))
      .join('');
  }

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      state.filter = chip.dataset.filter;
      writeHash();
      render();
    })
  );

  searchEl.value = state.q;
  searchEl.addEventListener('input', () => {
    state.q = searchEl.value.trim();
    writeHash();
    render();
  });

  window.addEventListener('hashchange', () => {
    state = readHash();
    searchEl.value = state.q;
    render();
  });

  getJson('api/projects' + (dir ? '?dir=' + encodeURIComponent(dir) : ''))
    .then((data) => {
      window.PMS.setDateFormat(data.dateFormat);
      directory = data.directory;
      document.getElementById('list-title').textContent = directory.name;
      document.title = directory.name + ' · Octapu System';
      projects = data.projects
        .map((d) =>
          Object.assign(parseFolder(d.folder), { files: d.files, ongoing: d.ongoing, milestones: markdown.parseMilestones(d.content).milestones })
        )
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            (b.archivedOn || '').localeCompare(a.archivedOn || '') ||
            a.title.localeCompare(b.title)
        );
      if (projects.some((p) => !p.ongoing)) listEl.parentElement.insertAdjacentHTML('afterend', progressLegend());
      render();
    })
    .catch((err) => {
      listEl.innerHTML = component('empty-item', { message: 'Could not load projects (' + err.message + '). Is the server running?' });
    });
})();
