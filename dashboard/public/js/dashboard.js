// Dashboard: the Overview and Report tabs, and Generate report, which saves both tabs as one
// standalone HTML file that opens anywhere, with no dashboard running.
(function () {
  'use strict';
  const { component, displayDate } = window.PMS;

  const panels = { overview: document.getElementById('overview-panel'), report: document.getElementById('report-panel') };
  if (!panels.overview || !panels.report) return;
  const tabs = Array.from(document.querySelectorAll('[data-tab]'));
  const TITLES = { overview: 'Overview', report: 'Report' };

  // Both tabs stay in the page, so switching never reloads anything.
  function show(tab) {
    Object.keys(panels).forEach((key) => {
      panels[key].hidden = key !== tab;
    });
    tabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.tab === tab)));
    document.title = TITLES[tab] + ' · Octapu System';
    const params = new URLSearchParams(location.search);
    if (tab === 'report') params.set('tab', 'report');
    else params.delete('tab');
    const query = params.toString();
    history.replaceState(null, '', query ? '?' + query : location.pathname);
  }

  tabs.forEach((button) => button.addEventListener('click', () => show(button.dataset.tab)));
  show(new URLSearchParams(location.search).get('tab') === 'report' ? 'report' : 'overview');

  // ---------- Generate report ----------

  const fetchText = (url) =>
    fetch(url).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });

  // The stylesheet's SVG icons, such as the status ticks, written into it as data, so the
  // file needs nothing beside it.
  async function withIcons(css, base) {
    const urls = [...new Set([...css.matchAll(/url\('([^']+\.svg)'\)/g)].map((m) => m[1]))];
    const data = await Promise.all(urls.map(async (url) => 'data:image/svg+xml,' + encodeURIComponent(await fetchText(new URL(url, base))).replace(/'/g, '%27')));
    return urls.reduce((text, url, i) => text.split("url('" + url + "')").join("url('" + data[i] + "')"), css);
  }

  // Left out of the saved file: what only works inside the dashboard (hover layers, menus, and
  // add, drag and collapse buttons), and the table of every report, which stays on the tab.
  const LEFT_OUT = '.chart-tip, .chart-crosshair, .chart-hit, .report-actions, .add-button, .status-caret, .check-caret, [data-drag], .collapse-button, .report-table';

  // A tab as it looks now, made static: links lose their address, as the pages they point to
  // aren't in the file.
  function staticCopy(panel) {
    const copy = panel.cloneNode(true);
    copy.querySelectorAll(LEFT_OUT).forEach((el) => el.remove());
    copy.querySelectorAll('[href]').forEach((el) => el.removeAttribute('href'));
    copy.querySelectorAll('[tabindex]').forEach((el) => el.removeAttribute('tabindex'));
    return copy.innerHTML;
  }

  async function generate(button) {
    const message = panels.report.querySelector('[data-report-message]');
    const link = panels.report.querySelector('[data-report-download]');
    button.disabled = true;
    message.textContent = 'Putting the report together…';
    try {
      const sheet = new URL('css/style.css', location.href);
      const [css, colours] = await Promise.all([fetchText(sheet), fetchText('api/colours.css')]);
      const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time, in any browser
      const html = component('report-document', {
        title: 'Octapu System report',
        generated: displayDate(today),
        stylesheet: 'data:text/css;charset=utf-8,' + encodeURIComponent((await withIcons(css, sheet)) + '\n' + colours),
        overview: staticCopy(panels.overview),
        report: staticCopy(panels.report),
      });
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      link.href = url;
      link.download = 'Octapu System report ' + today + '.html';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      message.textContent = 'Saved as “' + link.download + '”. Open it in any browser, or print it to PDF.';
    } catch (_) {
      message.textContent = 'Could not put the report together. Check the dashboard is still running and try again.';
    } finally {
      button.disabled = false;
    }
  }

  panels.report.addEventListener('click', (e) => {
    const button = e.target.closest('[data-generate-report]');
    if (button) generate(button);
  });
})();
