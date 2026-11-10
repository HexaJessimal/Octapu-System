// The History tab on the Review and Plan pages: a log file as dated cards.
(function () {
  'use strict';
  const { displayDate, setDateFormat, markdown: md, component, getJson, loadError } = window.PMS;

  const panel = document.getElementById('history');
  if (!panel) return;
  const main = document.getElementById('content');
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));

  // Counts the bottom-level bullets, so headings in an outline aren't counted as items.
  function itemCount(body) {
    const bullets = body.split('\n').filter((line) => /^\s*[-*+]\s/.test(line));
    const indent = (line) => line.match(/^\s*/)[0].replace(/\t/g, '    ').length;
    return bullets.filter((line, i) => i === bullets.length - 1 || indent(bullets[i + 1]) <= indent(line)).length;
  }

  function entryCard(entry) {
    const bullets = itemCount(entry.body);
    return component('history-card', { date: displayDate(entry.title), count: bullets ? bullets + (bullets === 1 ? ' item' : ' items') : '', body: md.render(entry.body) });
  }

  // Fetched each time, so an entry logged a moment ago is included.
  function load() {
    return getJson('api/history?page=' + encodeURIComponent(panel.dataset.historyPage))
      .then((data) => {
        setDateFormat(data.dateFormat);
        panel.innerHTML = data.entries.length ? component('card-stack', { items: data.entries.map(entryCard).join('') }) : component('empty-card', { message: panel.dataset.empty });
      })
      .catch((err) => {
        panel.innerHTML = loadError('the history', err);
      });
  }

  // The main tab stays in the page while hidden, so typed text and picks survive switching.
  function show(tab) {
    main.hidden = tab === 'history';
    panel.hidden = tab !== 'history';
    tabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
    const params = new URLSearchParams(location.search);
    if (tab === 'history') params.set('view', 'history');
    else params.delete('view');
    const query = params.toString();
    history.replaceState(null, '', query ? '?' + query : location.pathname);
    if (tab === 'history') load();
  }

  tabs.forEach((button) => button.addEventListener('click', () => show(button.dataset.tab)));
  show(new URLSearchParams(location.search).get('view') === 'history' ? 'history' : 'main');
})();
