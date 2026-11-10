// Left-hand menu, shared by every page.
(function () {
  'use strict';
  const { parseFolder, status, component, storedList } = window.PMS;

  const root = document.getElementById('main-nav');
  if (!root) return;

  const STORAGE_KEY = 'pms.nav';
  const DUE_SOON_DAYS = 2; // how long before its due date a roundup page turns yellow

  const closed = new Set(storedList(STORAGE_KEY));

  function saveClosed() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...closed]));
    } catch (_) {
      /* storage unavailable: groups just won't stay collapsed */
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

  function link(item) {
    return component('nav-link', {
      extra: item.className,
      href: item.href,
      current: isCurrent(item.href),
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
      open: items.some((item) => isCurrent(item.href)) || !closed.has(key),
      label,
      links: items.map((item) => link(item)).join(''),
      empty: emptyText,
    });
  }

  const projectLink = (project) => ({
    href: 'project.html?folder=' + encodeURIComponent(project.folder),
    label: project.title,
  });

  const entityLink = (owner) => ({
    href: 'entity.html?id=' + encodeURIComponent(owner.id),
    label: owner.name,
  });

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
            { value: roundup.projectsToReview, className: 'nav-count-projects', label: 'Projects to review' },
            { value: roundup.entitiesToReview, className: 'nav-count-entities', label: 'Entities to review' },
          ];

    root.innerHTML =
      link({ href: './', label: 'Home' }) +
      group('entity', 'Entities', data.entities.map(entityLink), 'No entities found.') +
      group('roundup', 'Time Management', [
        Object.assign(roundupLink('weekly-review.html', 'Review', roundup.review, roundup.interval), { counts: reviewCounts }),
        roundupLink('weekly-plan.html', 'Plan', roundup.plan, roundup.interval),
        { href: 'commitments.html', label: 'Commitments' },
      ], '') +
      (data.directories || []).map(directoryGroup).join('') +
      group('networking', 'Networking', [
        { href: 'networking.html?page=leads', label: 'Leads' },
        { href: 'networking.html?page=events', label: 'Events' },
      ], '') +
      group('compatibility', 'Compatibility', [
        { href: 'compatibility.html?type=entities', label: 'Entities' },
        { href: 'compatibility.html?type=projects', label: 'Projects' },
      ], '') +
      link({ href: 'options.html', label: 'Options' }) +
      link({ href: 'help.html', label: 'Help Guide', className: data.helpUnread ? 'nav-unread' : '' }) +
      (data.logo ? component('nav-logo', { src: 'images/' + encodeURIComponent(data.logo) }) : '');
  }

  // <details> toggle events don't bubble, so listen during capture.
  root.addEventListener(
    'toggle',
    (e) => {
      const key = e.target.dataset && e.target.dataset.group;
      if (!key) return;
      if (e.target.open) closed.delete(key);
      else closed.add(key);
      saveClosed();
    },
    true
  );

  function load() {
    return fetch('api/nav')
      .then((r) => (r.ok ? r.json() : { entities: [], directories: [] }))
      .catch(() => ({ entities: [], directories: [] }))
      .then(render);
  }

  status.onChange(load); // marking something as reviewed changes the counts beside Review
  render({ entities: [], directories: [] });
  load();
})();
