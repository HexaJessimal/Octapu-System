// Loads every page in each entity in headless Chrome and reports script errors and pages with
// no heading. Run it against a scratch copy, never the live data.
// Usage: node dev/sweep.js <port> [folder-for-screenshots]
'use strict';

const path = require('path');
const { launch, sleep } = require('./cdp');

const [port, shots] = process.argv.slice(2);
if (!port) {
  console.error('Usage: node dev/sweep.js <port> [folder-for-screenshots]');
  process.exit(2);
}
const BASE = `http://127.0.0.1:${port}/`;

// The pages to visit, with the first tentacle and project the entity has.
function pagesFor(nav) {
  const tentacle = (nav.tentacles || [])[0];
  const project = ((nav.directories || [])[0] || { projects: [] }).projects[0];
  return [
    './',
    'projects.html',
    project && 'project.html?folder=' + encodeURIComponent(project),
    tentacle && 'tentacle.html?id=' + encodeURIComponent(tentacle.id),
    'incubator.html',
    'weekly-review.html',
    'weekly-plan.html',
    'archive.html',
    'catalogs.html',
    'networking.html?page=contacts',
    'networking.html?page=events',
    'compatibility.html?type=tentacles',
    'compatibility.html?type=projects',
    'compatibility.html?type=events',
    'compatibility.html?type=core',
    'options.html',
    'options.html?tab=agenda',
    'help.html',
  ].filter(Boolean);
}

(async () => {
  const p = await launch();
  // Catches errors from the first script on, before the page's own code runs.
  await p.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs = [];
      addEventListener('error', (e) => window.__errs.push('error: ' + (e.message || (e.target && (e.target.src || e.target.href)))), true);
      addEventListener('unhandledrejection', (e) => window.__errs.push('rejection: ' + ((e.reason && e.reason.message) || e.reason)));
      const ce = console.error; console.error = (...a) => { window.__errs.push('console: ' + a.join(' ')); ce(...a); };`,
  });
  await p.send('Page.navigate', { url: BASE });
  await sleep(1500);
  const entities = await p.js(`return (await (await fetch('api/entity-table')).json()).rows.map((r) => r.dir)`);
  let failures = 0;
  for (const entity of entities) {
    await p.js(`await fetch('api/entity-select', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dir: ${JSON.stringify(entity)} }) }); return 1`);
    const nav = await p.js(`return (await fetch('api/nav')).json()`);
    console.log('==', entity);
    for (const page of pagesFor(nav)) {
      await p.send('Page.navigate', { url: BASE + page });
      await sleep(1500);
      const r = await p.js(`return { errs: window.__errs, h1: (document.querySelector('h1') || {}).textContent, content: (document.getElementById('content') || document.body).innerText.slice(0, 60).replace(/\\s+/g, ' ') }`);
      if (!r.h1) r.errs.push('no heading: ' + r.content);
      if (r.errs.length) failures++;
      console.log((r.errs.length ? 'FAIL ' : 'ok   ') + page.padEnd(48) + ' h1=' + r.h1 + (r.errs.length ? '\n      ' + r.errs.join('\n      ') : ''));
      if (shots) await p.shot(path.join(shots, `${entity}-${page.replace(/[^\w.-]+/g, '_')}.png`));
    }
  }
  await p.close();
  console.log(failures ? `${failures} page(s) failed` : 'All pages loaded cleanly');
  process.exitCode = failures ? 1 : 0;
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
