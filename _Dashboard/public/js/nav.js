// Left-hand menu, shared by every page.
(function () {
  'use strict';
  const { parseFolder, status, component, storedList, entityPicker, tentacleHref } = window.PMS;

  const root = document.getElementById('main-nav');
  if (!root) return;

  const STORAGE_KEY = 'pms.nav';
  const OPEN_KEY = 'pms.nav.open'; // tentacles opened to show those under them
  const DUE_SOON_DAYS = 2; // how long before its due date a roundup page turns yellow

  // Groups are open until closed, and tentacles closed until opened.
  const closed = new Set(storedList(STORAGE_KEY));
  const opened = new Set(storedList(OPEN_KEY));

  function save(key, set) {
    try {
      localStorage.setItem(key, JSON.stringify([...set]));
    } catch (_) {
      /* storage unavailable: groups just won't stay as they were left */
    }
  }

  // A link is current if it's this page and all of its query values match.
  function isCurrent(href) {
    const target = new URL(href, location.href);
    if (target.pathname !== location.pathname) return false;
    const here = new URLSearchParams(location.search);
    return [...target.searchParams].every(([k, v]) => here.get(k) === v);
  }

  const countBadge = ({ value, className, label }) => component('nav-count', { className, label, value });

  const itemIsCurrent = (item) => (item.current !== undefined ? item.current : isCurrent(item.href));

  function link(item) {
    return component('nav-link', {
      extra: item.className,
      href: item.href,
      current: itemIsCurrent(item),
      label: item.label,
      counts: (item.counts || []).map(countBadge).join(''),
      note: item.note,
    });
  }

  // Due once `interval` days have passed. `days` is null if it has never been done.
  function roundupLink(href, label, days, interval) {
    const item = { href, label };
    const count = (n) => n + (n === 1 ? ' day' : ' days');
    if (days === undefined) return item; // the menu data hasn't loaded
    if (days === null) {
      item.className = 'nav-due';
    } else if (days > interval) {
      item.className = 'nav-due';
      item.note = 'Due ' + count(days - interval) + ' ago';
    } else if (days === interval) {
      item.className = 'nav-due';
      item.note = 'Due today';
    } else if (days > 0 && days >= interval - DUE_SOON_DAYS) {
      item.className = 'nav-soon';
      item.note = 'Due in ' + count(interval - days);
    }
    return item;
  }

  // A collapsible group, always open while it holds the current page.
  function group(key, label, items, emptyText) {
    return component('nav-group', {
      key,
      open: items.some(itemIsCurrent) || !closed.has(key),
      label,
      links: items.map((item) => link(item)).join(''),
      empty: emptyText,
    });
  }

  const projectLink = (project) => ({
    href: 'project.html?folder=' + encodeURIComponent(project.folder),
    label: project.title,
  });

  // The tentacle open on this page: its tab, or else the one named by id.
  const here = new URLSearchParams(location.search);
  const hereTentacle = /\/tentacle\.html$/.test(location.pathname) ? here.get('tab') || here.get('id') : null;

  // Coloured by level, as on the tentacle page's tabs, with every level below the third in grey.
  const tentacleLink = (tentacle) => ({
    href: tentacleHref(tentacle.root, tentacle.id),
    label: tentacle.name,
    className: 'nav-tentacle org-level-' + (tentacle.level > 2 ? 'deep' : tentacle.level),
    current: tentacle.id === hereTentacle,
  });

  // A tentacle, with those under it in a group that's closed until opened, or while it holds
  // the page that's open.
  function tentacleBranch(tentacle, all) {
    const children = all.filter((t) => t.parent === tentacle.id);
    if (!children.length) return link(tentacleLink(tentacle));
    const below = (t) => all.filter((c) => c.parent === t.id).flatMap((c) => [c, ...below(c)]);
    const key = tentacle.id;
    return component('nav-branch', {
      key,
      open: opened.has(key) || below(tentacle).some((t) => t.id === hereTentacle),
      name: tentacle.name,
      link: link(tentacleLink(tentacle)),
      links: children.map((c) => tentacleBranch(c, all)).join(''),
    });
  }

  function tentacleGroup(tentacles) {
    const key = 'tentacle';
    return component('nav-group', {
      key,
      open: tentacles.some((t) => t.id === hereTentacle) || !closed.has(key),
      label: 'Tentacles',
      links: tentacles.filter((t) => !t.parent).map((t) => tentacleBranch(t, tentacles)).join(''),
      empty: 'No tentacles found.',
    });
  }

  // A Compatibility page, with an orange count of what it lists. None is shown when it's clear.
  function compatibilityLink(type, label, counts) {
    const count = counts && counts[type];
    return {
      href: 'compatibility.html?type=' + type,
      label,
      counts: count ? [{ value: count, className: 'nav-count-issues', label: 'Compatibility issues' }] : [],
    };
  }

  function render(data) {
    const byTitle = (a, b) => a.title.localeCompare(b.title);
    // One section per project directory: its list, then a link to each active project.
    const directoryGroup = (directory) =>
      group(
        directory.name.toLowerCase(),
        directory.name,
        [{ href: 'projects.html?dir=' + encodeURIComponent(directory.name), label: 'All projects', className: 'nav-all' }].concat(
          directory.projects.map(parseFolder).filter((p) => p.status === 'active').sort(byTitle).map(projectLink)
        ),
        ''
      );
    const roundup = data.roundup || {};
    const reviewCounts =
      roundup.projectsToReview === undefined
        ? []
        : [
            { value: roundup.doneToReview, className: 'nav-count-done', label: 'Done since the last review' },
            { value: roundup.projectsToReview, className: 'nav-count-projects', label: 'Projects to review' },
            { value: roundup.tentaclesToReview, className: 'nav-count-tentacles', label: 'Tentacles to review' },
            // Tasks with a WAITING type status, only while there are any.
            ...(roundup.waitingTasks ? [{ value: roundup.waitingTasks, className: 'nav-count-waiting', label: 'Waiting tasks' }] : []),
          ];

    root.innerHTML =
      entityPicker() +
      link({ href: './', label: 'Dashboard' }) +
      link({ href: 'incubator.html', label: 'Incubator' }) +
      tentacleGroup(data.tentacles) +
      group('roundup', 'Time Management', [
        Object.assign(roundupLink('weekly-review.html', 'Review', roundup.review, roundup.interval), { counts: reviewCounts }),
        roundupLink('weekly-plan.html', 'Plan', roundup.plan, roundup.interval),
      ], '') +
      (data.directories || []).map(directoryGroup).join('') +
      // With ARCHIVEMODE HEADERS, archived projects are kept in _Archive.md, shown on its own page.
      (window.PMS_SHOW_ARCHIVED && window.PMS_ARCHIVE_MODE !== 'FULL' ? link({ href: 'archive.html', label: 'Archive Index' }) : '') +
      group(
        'catalogs',
        'Catalogs',
        [{ href: 'catalogs.html', label: 'All catalogs', className: 'nav-all' }].concat(
          (data.catalogs || []).map((c) => ({ href: 'catalog.html?file=' + encodeURIComponent(c.file), label: c.name }))
        ),
        ''
      ) +
      link({ href: 'networking.html?page=contacts', label: 'Contacts' }) +
      link({ href: 'networking.html?page=events', label: 'Events' }) +
      group('compatibility', 'Compatibility', [
        compatibilityLink('tentacles', 'Tentacles', data.compatibility),
        compatibilityLink('projects', 'Projects', data.compatibility),
        compatibilityLink('events', 'Events', data.compatibility),
        compatibilityLink('core', 'Core files', data.compatibility),
      ], '') +
      link({ href: 'options.html', label: 'Options' }) +
      link({ href: 'help.html', label: 'Help Guide', className: data.helpUnread ? 'nav-unread' : '' }) +
      (window.PMS_MULTI_USER && window.PMS_USER ? component('nav-user', { name: window.PMS_USER }) : '') +
      (data.logo ? component('nav-logo', { src: 'images/' + encodeURIComponent(data.logo) }) : '');
  }

  // Log out goes back to the login page, which says you've logged out.
  root.addEventListener('click', (e) => {
    if (!e.target.closest('[data-logout]')) return;
    window.PMS.postJson('api/logout', {})
      .catch(() => {}) // the login page is still the right place to be
      .then(() => location.assign('login.html?loggedout=1'));
  });

  // <details> toggle events don't bubble, so listen during capture.
  root.addEventListener(
    'toggle',
    (e) => {
      const data = e.target.dataset || {};
      if (data.branch) {
        if (e.target.open) opened.add(data.branch);
        else opened.delete(data.branch);
        save(OPEN_KEY, opened);
      }
      if (!data.group) return;
      if (e.target.open) closed.delete(data.group);
      else closed.add(data.group);
      save(STORAGE_KEY, closed);
    },
    true
  );

  function load() {
    return fetch('api/nav')
      .then((r) => (r.ok ? r.json() : { tentacles: [], directories: [] }))
      .catch(() => ({ tentacles: [], directories: [] }))
      .then(render);
  }

  status.onChange(load); // marking something as reviewed changes the counts beside Review
  render({ tentacles: [], directories: [] });
  load();
})();
