// Records every GET /api/* answer for each entity, or compares them with a recording, so a
// refactor can be shown not to change what the pages receive. Run it against a scratch copy.
// Usage: node dev/api-snapshot.js <port> record|compare <file.json>
'use strict';

const fs = require('fs');
const http = require('http');

const [port, mode, file] = process.argv.slice(2);
if (!port || !['record', 'compare'].includes(mode) || !file) {
  console.error('Usage: node dev/api-snapshot.js <port> record|compare <file.json>');
  process.exit(2);
}

function get(pathname, entity) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, headers: { Cookie: `pms_entity=${encodeURIComponent(entity)}` } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

// The answer as JSON where it is JSON, so a difference can be pointed at by its key.
function parse(answer) {
  try {
    return { status: answer.status, json: JSON.parse(answer.body) };
  } catch {
    return { status: answer.status, text: answer.body };
  }
}

const FIXED = [
  '/api/nav', '/api/home', '/api/todos', '/api/options', '/api/reports', '/api/catalogs', '/api/timeline',
  '/api/history?page=review', '/api/history?page=focus', '/api/tags.js', '/api/components.js',
  '/api/compatibility?type=projects', '/api/compatibility?type=tentacles', '/api/compatibility?type=events', '/api/compatibility?type=core',
  '/api/networking?page=contacts', '/api/networking?page=events', '/api/setup', '/api/status-table', '/api/leader-table',
  '/api/entity-table', '/api/task-archive', '/api/agenda-table', '/api/colour-table', '/api/colours.css', '/api/help',
  '/api/archive', '/api/incubator', '/api/weekly-plan', '/api/weekly-review', '/api/project-options', '/api/projects', '/api/login-info',
];

async function snapshot() {
  const out = {};
  const entities = JSON.parse((await get('/api/entity-table', '')).body).rows.map((r) => r.directory || r.Directory || r.dir);
  for (const entity of entities) {
    const take = async (p) => (out[`${entity} ${p}`] = parse(await get(p, entity)));
    for (const p of FIXED) await take(p);
    // Every project, tentacle and catalog, and each project's change log.
    const projects = out[`${entity} /api/projects`].json.projects || [];
    for (const project of projects) {
      const one = await take('/api/project?folder=' + encodeURIComponent(project.folder));
      for (const f of (one.json && one.json.files) || []) {
        await take(`/api/changelog?folder=${encodeURIComponent(project.folder)}&file=${encodeURIComponent(f.name || f)}`);
      }
    }
    const nav = out[`${entity} /api/nav`].json;
    for (const t of nav.tentacles || []) {
      await take('/api/tentacle?id=' + encodeURIComponent(t.id));
      await take('/api/timeline?tentacle=' + encodeURIComponent(t.id));
    }
    for (const c of out[`${entity} /api/catalogs`].json.catalogs || out[`${entity} /api/catalogs`].json || []) {
      if (c && c.file) await take('/api/catalog?file=' + encodeURIComponent(c.file));
    }
  }
  return out;
}

// The first few places two answers differ, by key path.
function differences(a, b, where, found) {
  if (found.length > 12) return found;
  if (JSON.stringify(a) === JSON.stringify(b)) return found;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) differences(a[key], b[key], `${where}.${key}`, found);
    return found;
  }
  found.push(`${where}: ${JSON.stringify(a)?.slice(0, 120)} -> ${JSON.stringify(b)?.slice(0, 120)}`);
  return found;
}

(async () => {
  const now = await snapshot();
  if (mode === 'record') {
    fs.writeFileSync(file, JSON.stringify(now, null, 1));
    console.log(`Recorded ${Object.keys(now).length} answers to ${file}`);
    return;
  }
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  for (const key of new Set([...Object.keys(before), ...Object.keys(now)])) {
    const found = differences(before[key], now[key], '', []);
    if (!found.length) continue;
    changed++;
    console.log(`DIFF ${key}\n  ${found.join('\n  ')}`);
  }
  console.log(changed ? `${changed} of ${Object.keys(now).length} answers differ` : `All ${Object.keys(now).length} answers match`);
  process.exitCode = changed ? 1 : 0;
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
