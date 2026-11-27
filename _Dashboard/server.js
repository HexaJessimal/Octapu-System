// Octapu System Dashboard server: zero dependencies, Node built-ins only.
// Run from anywhere:  node _Dashboard/server.js   (then open the printed URL)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { PRIORITIES, parseComponents, RECUR_VALUE, PROJECT_TYPES } = require('./todos');
const { currentName } = require('./lib/renames');
const {
  requestContext, USER_COOKIE, DASHBOARD_DIR, PUBLIC_DIR, ROOT_DIR, HELP_FILE, IMAGES_DIR,
  ENTITY_COOKIE, dataPaths, disk, at, readEntities, entityRootOf, readCookie, selectedEntity,
  isInside, readIfExists, ENTITIES_FILE, OLD_ENTITIES_FILE,
} = require('./lib/context');
const {
  field, isArchived, readProjectDirs, listProjects, projectName, dependencyKey, readStatuses,
  readTentacles, readLeaders, SWITCH_OPTIONS, CHOICE_OPTIONS, readOptionsWithSwitches,
  readArchiveMode, readSwitch, readShowArchived, readDateFormat, enqueueWrite, collectCatalogs,
  readCatalog,
} = require('./lib/store');
const { collectTodos, changeStatus, checkBox } = require('./lib/tasks');
const { readNetworking, saveEntryField, saveEntryTask, saveNewEntry, deleteEntry, saveEventField } = require('./lib/networking');
const {
  readProject, listProjectsWithContent, readTentacle, createTentacle, openFolder,
  changeProjectStatus, readArchivePage, saveArchiveEntry, removeArchiveEntry, archiveProject,
  readIncubatorPage, saveIdea, archiveIdea, promoteIdea, saveNewFile, savePlanningDate,
  changeProjectType, changePriority, advanceRecurringTask, changeTentacle, changeLeader,
  saveTimeframe, changeTimeframe, saveText, saveRawFile, saveBlockBody, saveNewMilestone,
  deleteMilestone, saveNewItem, indentTask, insertTask, reorderTask, saveNewBlock, saveNewTask, saveDependency,
  saveMilestoneOrder, changeRow, moveTask, promoteTask, linkTaskToBlock, finishWholeMilestone,
  promoteMilestone, saveDate, createProject, createCatalog, saveCatalogRow, readChangelog,
  readConflicts, settleConflict,
} = require('./lib/documents');
const {
  incompatibleEvents, incompatibleProjects, incompatibleCoreFiles, incompatibleTentacles,
  fixCompatibility,
} = require('./lib/compatibility');
const { collectTimeline, tentacleTimeline, timelineGroups, timelineEvents, timelineReleases } = require('./lib/timeline');
const {
  readAgendaTable, isAgendaRow, isAgendaCheck, saveAgendaRow, checkAgendaItem, markReviewed,
  flagForReview, flagSection, markSectionDone, collectWeeklyReview, collectReports,
  submitWeeklyReview, readTaskArchive,
} = require('./lib/review');
const {
  readEntityTable, saveEntityRow, readStatusTable, readLeaderTable, readColourTable, coloursCss, saveStatusRow,
  saveLeaderRow, saveColourRow, saveOptions, setupState, saveSetup,
} = require('./lib/settings');
const {
  findLogo, collectNav, readHistory, splitHelp, setHelpRead, collectHome, collectWeeklyPlan,
  submitWeeklyFocus,
} = require('./lib/nav');

const VERSION = '0.8';
const HOST = process.env.PMS_HOST || '127.0.0.1';
const PORT = Number(process.env.PMS_PORT) || 4173;

const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

const MAX_BODY_BYTES = 256 * 1024;
const LOOPBACK_NAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function sendJson(res, status, data) {
  send(res, status, JSON.stringify(data), MIME['.json']);
}

// Stops other websites open in the browser from editing files through this local server.
function isTrustedRequest(req) {
  const host = req.headers.host || '';
  let hostname;
  try {
    hostname = new URL(`http://${host}`).hostname;
  } catch {
    return false;
  }
  if (LOOPBACK_NAMES.has(HOST) && !LOOPBACK_NAMES.has(hostname)) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) reject(new Error('Body too large'));
      else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Shared handling for edit requests. `isValid` checks the fields specific to each edit.
// Each edit runs in turn, with nothing remembered from earlier reads.
async function handleEdit(req, res, isValid, apply) {
  if (!isTrustedRequest(req)) return sendJson(res, 403, { error: 'Forbidden' });
  if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
    return sendJson(res, 415, { error: 'Expected JSON' });
  }
  let body;
  try {
    body = JSON.parse(await readBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: 'Invalid request' });
  }
  if (!isValid(body)) return sendJson(res, 400, { error: 'Invalid request' });
  const user = await loggedInUser(req);
  if (!user && (await readSwitch('MULTIUSER'))) return sendJson(res, 401, { error: 'Please log in again before making changes.' });
  const result = await enqueueWrite(() => requestContext.run(Object.assign({}, requestContext.getStore(), { user, cache: new Map() }), () => apply(body)));
  return sendJson(res, result.code, result.body);
}

// ---------- multi-user login ----------

// The logged-in leader's name from the request's cookie, or null if it doesn't name a
// leader in Leaders.csv. There are no passwords: logging in says who you are, for the change log.
async function loggedInUser(req) {
  const name = readCookie(req, USER_COOKIE);
  return name !== null && (await readLeaders()).some((leader) => leader.name === name) ? name : null;
}

const userCookie = (value, maxAge) => `${USER_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax; HttpOnly`;

// Login and logout skip handleEdit's check for a logged-in user, as they're how you get one.
async function handleLogin(req, res) {
  if (!isTrustedRequest(req)) return sendJson(res, 403, { error: 'Forbidden' });
  let body;
  try {
    body = JSON.parse(await readBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: 'Invalid request' });
  }
  const name = typeof body.name === 'string' ? body.name : '';
  if (!(await readLeaders()).some((leader) => leader.name === name)) return sendJson(res, 400, { error: 'Choose your name from the list.' });
  res.setHeader('Set-Cookie', userCookie(name, 60 * 60 * 24 * 365));
  return sendJson(res, 200, { ok: true });
}

function handleLogout(req, res) {
  if (!isTrustedRequest(req)) return sendJson(res, 403, { error: 'Forbidden' });
  res.setHeader('Set-Cookie', userCookie('', 0));
  return sendJson(res, 200, { ok: true });
}

// Switches this browser to another entity. Nothing is written, so it skips handleEdit.
async function handleEntitySelect(req, res) {
  if (!isTrustedRequest(req)) return sendJson(res, 403, { error: 'Forbidden' });
  let body;
  try {
    body = JSON.parse(await readBody(req)) || {};
  } catch {
    return sendJson(res, 400, { error: 'Invalid request' });
  }
  const entity = (await readEntities()).find((e) => e.dir === body.dir);
  if (!entity) return sendJson(res, 400, { error: 'Choose an entity from the list.' });
  await prepareEntity(entityRootOf(entity));
  res.setHeader('Set-Cookie', `${ENTITY_COOKIE}=${encodeURIComponent(entity.dir)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax; HttpOnly`);
  return sendJson(res, 200, { ok: true });
}

const inFile = ({ folder, file }) => typeof folder === 'string' && typeof file === 'string';
const isReviewFlag = (body) => inFile(body) && typeof body.on === 'boolean';
const isSection = (body) => hasLine(body) && typeof body.title === 'string';
const isSectionFlag = (body) => isSection(body) && typeof body.on === 'boolean';
const hasLine = (body) => inFile(body) && Number.isInteger(body.line) && body.line >= 1;
// `from` is null for an untagged checkbox, or a title with no tentacle.
const isCheckEdit = (body) => hasLine(body) && typeof body.text === 'string' && typeof body.checked === 'boolean';
const isKeywordEdit = (body) => hasLine(body) && typeof body.to === 'string' && (typeof body.from === 'string' || body.from === null);
const isPriorityEdit = (body) =>
  hasLine(body) && typeof body.status === 'string' && (body.priority === null || PRIORITIES.includes(body.priority) || (typeof body.priority === 'string' && RECUR_VALUE.test(body.priority)));
const isRecurAdvance = (body) => hasLine(body) && typeof body.status === 'string' && typeof body.text === 'string';
const isMilestoneList = (list) => list === undefined || (Array.isArray(list) && list.every((name) => typeof name === 'string'));
const isTimeframeEdit = (body) => inFile(body) && typeof body.start === 'string' && typeof body.end === 'string' && isMilestoneList(body.milestones);
const EDITABLE_TEXT = ['title', 'milestone', 'block', 'todo', 'entry', 'value'];
const isRawEdit = (body) => inFile(body) && typeof body.from === 'string' && typeof body.to === 'string';
const isFieldEdit = (body) =>
  hasLine(body) && typeof body.from === 'string' && typeof body.to === 'string' && (body.label === null || typeof body.label === 'string');
const isNewEntry = (body) => inFile(body) && typeof body.title === 'string' && typeof body.section === 'string';
const isNewCatalog = (body) => typeof body.tag === 'string' && typeof body.name === 'string';
// A catalog row: `values` to add one, or the row's position and catalog number to change or delete it.
const isCatalogRow = (body) =>
  typeof body.file === 'string' &&
  ((body.action === 'add' && Array.isArray(body.values) && body.values.every((v) => typeof v === 'string')) ||
    (['update', 'delete'].includes(body.action) &&
      Number.isInteger(body.index) &&
      body.index >= 0 &&
      typeof body.number === 'string' &&
      (body.action === 'delete' || (typeof body.column === 'string' && typeof body.to === 'string'))));
// Deleting an entry or a milestone: the line its heading is on, and the heading's text.
const isHeadingRemoval = (body) => hasLine(body) && typeof body.title === 'string';
const isTaskRow = (body) => hasLine(body) && (typeof body.status === 'string' || body.status === null) && typeof body.text === 'string';
const isTaskMove = (body) => isTaskRow(body) && Number.isInteger(body.toLine) && body.toLine >= 1 && typeof body.toTitle === 'string';
const isTextEdit = (body) => hasLine(body) && EDITABLE_TEXT.includes(body.kind) && typeof body.from === 'string' && typeof body.to === 'string';
// `line` is null for the untitled text before a file's first heading.
const isBodyEdit = (body) =>
  inFile(body) && (body.line === null || (Number.isInteger(body.line) && body.line >= 1)) && typeof body.from === 'string' && typeof body.to === 'string';
const isNewTitled = (body) => inFile(body) && typeof body.title === 'string';
const isDepth = (depth) => depth === undefined || (Number.isInteger(depth) && depth >= 0 && depth <= 10);
const isNewItem = (body) => hasLine(body) && typeof body.title === 'string' && typeof body.text === 'string' && isDepth(body.depth);
const isEntryTask = (body) => hasLine(body) && typeof body.title === 'string' && typeof body.text === 'string' && isDepth(body.depth);
const isNewTask = (body) => inFile(body) && typeof body.text === 'string' && typeof body.list === 'string' && isDepth(body.depth);
const isRowInsert = (body) => hasLine(body) && typeof body.text === 'string' && typeof body.newText === 'string' && ['child', 'after'].includes(body.place);
const isRowIndent = (body) => hasLine(body) && typeof body.text === 'string' && ['in', 'out'].includes(body.direction);
const isRowReorder = (body) => hasLine(body) && typeof body.text === 'string' && Number.isInteger(body.toLine) && body.toLine >= 1 && typeof body.toText === 'string' && typeof body.after === 'boolean';
const isSetup = (body) => ['tentacleName', 'tentacleId', 'leaderName', 'dateFormat'].every((key) => body[key] === undefined || typeof body[key] === 'string');
const isNewTentacle = ({ parent, name, id }) => [parent, name, id].every((v) => typeof v === 'string');
const isRowEdit = (fields) => (body) =>
  ['add', 'update', 'delete'].includes(body.action) &&
  (body.action === 'add' || typeof body.from === 'string') &&
  (body.action === 'delete' || fields.every((field) => typeof body[field] === 'string'));
const isStatusRow = isRowEdit(['type', 'name', 'next']);
const isLeaderRow = isRowEdit(['name']);
const isEntityRow = isRowEdit(['name', 'dir']);
const isColourRow = (body) => typeof body.from === 'string' && typeof body.colour === 'string';
const isReviewSubmit = (body) => typeof body.wins === 'string';
const isStatusSwitch = ({ folder, status }) => typeof folder === 'string' && typeof status === 'string';
const isPlanningEdit = (body) =>
  hasLine(body) && (typeof body.status === 'string' || body.status === null) && typeof body.text === 'string' && ['SCHEDULED', 'DEADLINE'].includes(body.kind) && typeof body.date === 'string';
const isTypeChange = (body) => inFile(body) && typeof body.type === 'string';
const isFolderRequest = ({ folder }) => typeof folder === 'string';
// An entry in _Incubator.md or _Archive.md, found by its heading's line and title.
const isNamedEntryRow = ({ line, title }) => Number.isInteger(line) && line >= 1 && typeof title === 'string';
// Project Dependency lists: each entry a name, and the milestones it's limited to or null.
const isDependencyList = (list) =>
  Array.isArray(list) &&
  list.every((d) => d && typeof d.name === 'string' && (d.milestones === null || (Array.isArray(d.milestones) && d.milestones.every((m) => typeof m === 'string'))));
const isDependencyEdit = (body) => inFile(body) && isDependencyList(body.dependencies);
const isArchiveEntry = (body) => ['tentacle', 'title', 'created', 'closed', 'start', 'end', 'leader'].every((k) => typeof body[k] === 'string') && isDependencyList(body.dependencies);
const isNewIdea = (body) => ['title', 'tentacle', 'notes'].every((k) => typeof body[k] === 'string') && isDependencyList(body.dependencies);
const isPromotion = (body) => isNamedEntryRow(body) && ['start', 'end', 'leader'].every((k) => typeof body[k] === 'string') && (body.directory === undefined || typeof body.directory === 'string');
const isEventField = (body) =>
  Number.isInteger(body.line) && typeof body.title === 'string' && typeof body.label === 'string' && ['start', 'end', 'value'].every((k) => body[k] === undefined || typeof body[k] === 'string');
const isCompatibilityFix = ({ type, key, file, main, leader }) =>
  ['projects', 'tentacles', 'events', 'core'].includes(type) && typeof key === 'string' && [file, main, leader].every((v) => v === undefined || typeof v === 'string');
const isHelpRead = ({ read }) => typeof read === 'boolean';
const isFocusSubmit = ({ items }) =>
  Array.isArray(items) && items.every((i) => i && typeof i.folder === 'string' && typeof i.text === 'string');
const isNamedInFile = (body) => inFile(body) && typeof body.name === 'string';
const isIndex = (n) => Number.isInteger(n) && n >= 0;
const isTimeframeChange = (body) =>
  inFile(body) && isIndex(body.index) && typeof body.from === 'string' &&
  (body.remove === true || (typeof body.start === 'string' && typeof body.end === 'string' && isMilestoneList(body.milestones)));
const isMilestoneMove = (body) =>
  inFile(body) && Array.isArray(body.titles) && body.titles.every((t) => typeof t === 'string') && isIndex(body.from) && isIndex(body.to);
// `status` is null for a checkbox with no status.
const isRowAction = (body) =>
  hasLine(body) && (typeof body.status === 'string' || body.status === null) && typeof body.text === 'string' && ['cancel', 'delete'].includes(body.action);
// Date Reviewed is only ever set by marking something as reviewed on the Review page.
const isDateEdit = (body) => inFile(body) && typeof body.value === 'string' && body.field === 'closed';
const isNewProject = ({ tentacle, title, leader, notes, type, dir }) =>
  [tentacle, title, leader, notes, type].every((v) => typeof v === 'string') && (dir === undefined || typeof dir === 'string');
const isConflictAction = (body) => inFile(body) && typeof body.name === 'string' && ['keep', 'use'].includes(body.action);
const isOptionsEdit = ({ values }) =>
  typeof values === 'object' && values !== null && Object.values(values).every((v) => typeof v === 'string');

// Every template in public/components, by name, for the pages to fill in.
async function readComponents() {
  const dir = path.join(PUBLIC_DIR, 'components');
  const names = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.html')).sort();
  const files = await Promise.all(names.map((name) => fs.promises.readFile(path.join(dir, name), 'utf8')));
  return Object.assign({}, ...files.map(parseComponents));
}

// Pages wait for first-time setup, then, while MULTIUSER is on, for someone to log in.
async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/home.html';
  if (rel.endsWith('.html')) {
    const redirect = (location) => {
      res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
      res.end();
    };
    const { needed } = await setupState();
    if (needed !== (rel === '/setup.html')) return redirect(needed ? '/setup.html' : '/');
    if (!needed && rel !== '/login.html' && (await readSwitch('MULTIUSER')) && !(await loggedInUser(req))) return redirect('/login.html');
    if (rel === '/login.html' && !(await readSwitch('MULTIUSER'))) return redirect('/');
  }
  return sendFileFrom(res, PUBLIC_DIR, rel);
}

// An image for an [[IMAGE#...]] link. Only pictures inside _Images/ can be fetched.
function serveImage(res, urlPath) {
  const rel = decodeURIComponent(urlPath.slice('/images'.length));
  if (!IMAGE_TYPES.has(path.extname(rel).toLowerCase())) return send(res, 404, 'Not found');
  return sendFileFrom(res, IMAGES_DIR, rel);
}

async function sendFileFrom(res, root, rel) {
  const full = path.resolve(root, '.' + rel);
  if (!isInside(root, full)) return send(res, 403, 'Forbidden');
  try {
    const stat = await fs.promises.stat(full);
    if (!stat.isFile()) return send(res, 404, 'Not found');
    const body = await fs.promises.readFile(full);
    send(res, 200, body, MIME[path.extname(full).toLowerCase()] || 'application/octet-stream');
  } catch {
    send(res, 404, 'Not found');
  }
}

// Every request works on one entity's data, chosen by the browser's cookie.
const server = http.createServer(async (req, res) => {
  try {
    const entity = await selectedEntity(req);
    return await requestContext.run({ root: entityRootOf(entity), entity }, () => route(req, res));
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal server error');
  }
});

async function route(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/entity-select' && req.method === 'POST') return handleEntitySelect(req, res);
    if (url.pathname === '/api/status' && req.method === 'POST') return handleEdit(req, res, isKeywordEdit, changeStatus);
    if (url.pathname === '/api/check' && req.method === 'POST') return handleEdit(req, res, isCheckEdit, checkBox);
    if (url.pathname === '/api/tentacle-tag' && req.method === 'POST') return handleEdit(req, res, isKeywordEdit, changeTentacle);
    if (url.pathname === '/api/leader' && req.method === 'POST') return handleEdit(req, res, isKeywordEdit, changeLeader);
    if (url.pathname === '/api/timeframe' && req.method === 'POST') return handleEdit(req, res, isTimeframeEdit, saveTimeframe);
    if (url.pathname === '/api/timeframe-change' && req.method === 'POST') return handleEdit(req, res, isTimeframeChange, changeTimeframe);
    if (url.pathname === '/api/priority' && req.method === 'POST') return handleEdit(req, res, isPriorityEdit, changePriority);
    if (url.pathname === '/api/recur' && req.method === 'POST') return handleEdit(req, res, isRecurAdvance, advanceRecurringTask);
    if (url.pathname === '/api/project-status' && req.method === 'POST') return handleEdit(req, res, isStatusSwitch, changeProjectStatus);
    if (url.pathname === '/api/file-add' && req.method === 'POST') return handleEdit(req, res, isNamedInFile, saveNewFile);
    if (url.pathname === '/api/planning' && req.method === 'POST') return handleEdit(req, res, isPlanningEdit, savePlanningDate);
    if (url.pathname === '/api/project-type' && req.method === 'POST') return handleEdit(req, res, isTypeChange, changeProjectType);
    if (url.pathname === '/api/compatibility-fix' && req.method === 'POST') return handleEdit(req, res, isCompatibilityFix, fixCompatibility);
    if (url.pathname === '/api/project-archive' && req.method === 'POST') return handleEdit(req, res, isFolderRequest, archiveProject);
    if (url.pathname === '/api/open-folder' && req.method === 'POST') return handleEdit(req, res, isFolderRequest, openFolder);
    if (url.pathname === '/api/event-field' && req.method === 'POST') return handleEdit(req, res, isEventField, saveEventField);
    if (url.pathname === '/api/incubator' && req.method === 'POST') return handleEdit(req, res, isNewIdea, saveIdea);
    if (url.pathname === '/api/incubator-archive' && req.method === 'POST') return handleEdit(req, res, isNamedEntryRow, archiveIdea);
    if (url.pathname === '/api/archive-entry' && req.method === 'POST') return handleEdit(req, res, isArchiveEntry, saveArchiveEntry);
    if (url.pathname === '/api/archive-remove' && req.method === 'POST') return handleEdit(req, res, isNamedEntryRow, removeArchiveEntry);
    if (url.pathname === '/api/incubator-promote' && req.method === 'POST') return handleEdit(req, res, isPromotion, promoteIdea);
    if (url.pathname === '/api/help-read' && req.method === 'POST') return handleEdit(req, res, isHelpRead, setHelpRead);
    if (url.pathname === '/api/weekly-focus' && req.method === 'POST') return handleEdit(req, res, isFocusSubmit, submitWeeklyFocus);
    if (url.pathname === '/api/weekly-review' && req.method === 'POST') return handleEdit(req, res, isReviewSubmit, submitWeeklyReview);
    if (url.pathname === '/api/dependency' && req.method === 'POST') return handleEdit(req, res, isDependencyEdit, saveDependency);
    if (url.pathname === '/api/row' && req.method === 'POST') return handleEdit(req, res, isRowAction, changeRow);
    if (url.pathname === '/api/milestone-move' && req.method === 'POST') return handleEdit(req, res, isMilestoneMove, saveMilestoneOrder);
    if (url.pathname === '/api/text' && req.method === 'POST') return handleEdit(req, res, isTextEdit, saveText);
    if (url.pathname === '/api/block-body' && req.method === 'POST') return handleEdit(req, res, isBodyEdit, saveBlockBody);
    if (url.pathname === '/api/block' && req.method === 'POST') return handleEdit(req, res, isNewTitled, saveNewBlock);
    if (url.pathname === '/api/milestone' && req.method === 'POST') return handleEdit(req, res, isNewTitled, saveNewMilestone);
    if (url.pathname === '/api/catalogs' && req.method === 'POST') return handleEdit(req, res, isNewCatalog, createCatalog);
    if (url.pathname === '/api/catalog-row' && req.method === 'POST') return handleEdit(req, res, isCatalogRow, saveCatalogRow);
    if (url.pathname === '/api/milestone-remove' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, deleteMilestone);
    if (url.pathname === '/api/milestone-done' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, finishWholeMilestone);
    if (url.pathname === '/api/milestone-promote' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, promoteMilestone);
    if (url.pathname === '/api/row-move' && req.method === 'POST') return handleEdit(req, res, isTaskMove, moveTask);
    if (url.pathname === '/api/row-promote' && req.method === 'POST') return handleEdit(req, res, isTaskRow, promoteTask);
    if (url.pathname === '/api/row-block' && req.method === 'POST') return handleEdit(req, res, isTaskRow, linkTaskToBlock);
    if (url.pathname === '/api/milestone-item' && req.method === 'POST') return handleEdit(req, res, isNewItem, saveNewItem);
    if (url.pathname === '/api/status-table' && req.method === 'POST') return handleEdit(req, res, isStatusRow, saveStatusRow);
    if (url.pathname === '/api/leader-table' && req.method === 'POST') return handleEdit(req, res, isLeaderRow, saveLeaderRow);
    if (url.pathname === '/api/entity-table' && req.method === 'POST') return handleEdit(req, res, isEntityRow, saveEntityRow);
    if (url.pathname === '/api/agenda-table' && req.method === 'POST') return handleEdit(req, res, isAgendaRow, saveAgendaRow);
    if (url.pathname === '/api/agenda-check' && req.method === 'POST') return handleEdit(req, res, isAgendaCheck, checkAgendaItem);
    if (url.pathname === '/api/colour-table' && req.method === 'POST') return handleEdit(req, res, isColourRow, saveColourRow);
    if (url.pathname === '/api/task' && req.method === 'POST') return handleEdit(req, res, isNewTask, saveNewTask);
    if (url.pathname === '/api/row-indent' && req.method === 'POST') return handleEdit(req, res, isRowIndent, indentTask);
    if (url.pathname === '/api/row-insert' && req.method === 'POST') return handleEdit(req, res, isRowInsert, insertTask);
    if (url.pathname === '/api/row-reorder' && req.method === 'POST') return handleEdit(req, res, isRowReorder, reorderTask);
    if (url.pathname === '/api/tentacles' && req.method === 'POST') return handleEdit(req, res, isNewTentacle, createTentacle);
    if (url.pathname === '/api/file-body' && req.method === 'POST') return handleEdit(req, res, isRawEdit, saveRawFile);
    if (url.pathname === '/api/entry-field' && req.method === 'POST') return handleEdit(req, res, isFieldEdit, saveEntryField);
    if (url.pathname === '/api/entry-task' && req.method === 'POST') return handleEdit(req, res, isEntryTask, saveEntryTask);
    if (url.pathname === '/api/entry-add' && req.method === 'POST') return handleEdit(req, res, isNewEntry, saveNewEntry);
    if (url.pathname === '/api/entry-remove' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, deleteEntry);
    if (url.pathname === '/api/mark-reviewed' && req.method === 'POST') return handleEdit(req, res, inFile, markReviewed);
    if (url.pathname === '/api/review-flag' && req.method === 'POST') return handleEdit(req, res, isReviewFlag, flagForReview);
    if (url.pathname === '/api/section-flag' && req.method === 'POST') return handleEdit(req, res, isSectionFlag, flagSection);
    if (url.pathname === '/api/section-reviewed' && req.method === 'POST') return handleEdit(req, res, isSection, markSectionDone);
    if (url.pathname === '/api/date' && req.method === 'POST') return handleEdit(req, res, isDateEdit, saveDate);
    if (url.pathname === '/api/projects' && req.method === 'POST') return handleEdit(req, res, isNewProject, createProject);
    if (url.pathname === '/api/options' && req.method === 'POST') return handleEdit(req, res, isOptionsEdit, saveOptions);
    if (url.pathname === '/api/setup' && req.method === 'POST') return handleEdit(req, res, isSetup, saveSetup);
    if (url.pathname === '/api/conflict' && req.method === 'POST') return handleEdit(req, res, isConflictAction, settleConflict);
    if (url.pathname === '/api/login' && req.method === 'POST') return handleLogin(req, res);
    if (url.pathname === '/api/logout' && req.method === 'POST') return handleLogout(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    if (url.pathname === '/api/login-info') {
      return sendJson(res, 200, { multiUser: await readSwitch('MULTIUSER'), user: await loggedInUser(req), leaders: (await readLeaders()).map((l) => l.name) });
    }
    if (url.pathname === '/api/changelog' || url.pathname === '/api/conflicts') {
      const read = url.pathname === '/api/changelog' ? readChangelog : readConflicts;
      const result = await read(url.searchParams.get('folder') || '', url.searchParams.get('file') || '');
      return result ? sendJson(res, 200, result) : sendJson(res, 404, { error: 'File not found.' });
    }

    if (url.pathname === '/api/options') {
      const options = await readOptionsWithSwitches();
      return sendJson(res, 200, Object.entries(options).map(([key, value]) => ({ key, value, toggle: key in SWITCH_OPTIONS, choices: Object.hasOwn(CHOICE_OPTIONS, key) ? CHOICE_OPTIONS[key].values : undefined })));
    }
    if (url.pathname === '/api/reports') return sendJson(res, 200, await collectReports());
    if (url.pathname === '/api/catalogs') return sendJson(res, 200, await collectCatalogs());
    if (url.pathname === '/api/catalog') {
      const catalog = await readCatalog(url.searchParams.get('file') || '');
      return catalog ? sendJson(res, 200, catalog) : sendJson(res, 404, { error: 'Catalog not found.' });
    }
    if (url.pathname === '/api/timeline') {
      // A tentacle page's Timeline has only its own projects, and no event or release lines.
      const tentacle = url.searchParams.get('tentacle');
      if (tentacle) return sendJson(res, 200, { rows: await tentacleTimeline(tentacle), events: [], releases: [], dateFormat: await readDateFormat() });
      return sendJson(res, 200, { rows: await collectTimeline(), groups: await timelineGroups(), events: await timelineEvents(), releases: await timelineReleases(), dateFormat: await readDateFormat() });
    }
    if (url.pathname === '/api/history') {
      const file = { review: at().REVIEW_FILE, focus: at().FOCUS_FILE }[url.searchParams.get('page')];
      if (!file) return sendJson(res, 404, { error: 'Not found' });
      return sendJson(res, 200, await readHistory(file));
    }
    if (url.pathname === '/api/tags.js') {
      const ids = (await readTentacles()).map((o) => o.id);
      const archived = (await readStatuses()).filter((s) => s.type === 'ARCHIVED').map((s) => s.name);
      const showArchived = await readShowArchived();
      const flags = {
        PMS_TENTACLE_IDS: ids,
        // [[TENTACLEID Title]] links go to that project. Keyed as dependencyKey does.
        PMS_PROJECTS: Object.fromEntries((await listProjects()).filter((p) => !isArchived(p)).map((p) => [dependencyKey(projectName(p.name)), p.folder])),
        PMS_ARCHIVED_STATUSES: archived,
        PMS_SHOW_ARCHIVED: showArchived,
        PMS_MULTI_USER: await readSwitch('MULTIUSER'),
        PMS_SYNC_CONFLICTS: await readSwitch('SYNCCONFLICTS'),
        PMS_ARCHIVE_MODE: await readArchiveMode(),
        PMS_USER: await loggedInUser(req),
        // The dropdown at the top of the menu, and which entity this browser has chosen.
        PMS_ENTITIES: (await readEntities()).filter((e) => e.dir),
        PMS_ENTITY: requestContext.getStore().entity.dir,
      };
      // JSON can hold "</script>"-like text in a name, so "<" is escaped as well.
      const script = Object.entries(flags).map(([key, value]) => `window.${key} = ${JSON.stringify(value).replace(/</g, '\\u003c')};\n`).join('');
      return send(res, 200, script, MIME['.js']);
    }
    if (url.pathname === '/api/components.js') {
      return send(res, 200, `window.PMS_COMPONENTS = ${JSON.stringify(await readComponents())};\n`, MIME['.js']);
    }
    if (url.pathname === '/api/compatibility') {
      const type = url.searchParams.get('type');
      if (type === 'projects') return sendJson(res, 200, await incompatibleProjects());
      if (type === 'tentacles') return sendJson(res, 200, await incompatibleTentacles());
      if (type === 'events') return sendJson(res, 200, await incompatibleEvents());
      if (type === 'core') return sendJson(res, 200, await incompatibleCoreFiles());
      return sendJson(res, 404, { error: 'Page not found' });
    }
    if (url.pathname === '/api/networking') {
      const networking = await readNetworking(url.searchParams.get('page') || '');
      return networking ? sendJson(res, 200, networking) : sendJson(res, 404, { error: 'Page not found' });
    }
    if (url.pathname === '/api/setup') return sendJson(res, 200, await setupState());
    if (url.pathname === '/api/status-table') return sendJson(res, 200, await readStatusTable());
    if (url.pathname === '/api/leader-table') return sendJson(res, 200, await readLeaderTable());
    if (url.pathname === '/api/entity-table') return sendJson(res, 200, await readEntityTable());
    if (url.pathname === '/api/task-archive') return sendJson(res, 200, await readTaskArchive());
    if (url.pathname === '/api/agenda-table') return sendJson(res, 200, await readAgendaTable());
    if (url.pathname === '/api/colour-table') return sendJson(res, 200, await readColourTable());
    if (url.pathname === '/api/colours.css') return send(res, 200, await coloursCss(), MIME['.css']);
    if (url.pathname === '/api/home') return sendJson(res, 200, await collectHome());
    if (url.pathname === '/api/help') {
      const content = await readIfExists(HELP_FILE);
      const { read, body } = splitHelp(content || '');
      return sendJson(res, 200, { exists: content !== null, content: body, read, dateFormat: await readDateFormat() });
    }
    if (url.pathname === '/api/archive') return sendJson(res, 200, await readArchivePage());
    if (url.pathname === '/api/incubator') return sendJson(res, 200, await readIncubatorPage());
    if (url.pathname === '/api/weekly-plan') return sendJson(res, 200, await collectWeeklyPlan());
    if (url.pathname === '/api/weekly-review') return sendJson(res, 200, await collectWeeklyReview());
    if (url.pathname === '/api/nav') return sendJson(res, 200, await collectNav());
    if (url.pathname === '/api/project-options') {
      const [tentacles, leaders] = await Promise.all([readTentacles(), readLeaders()]);
      return sendJson(res, 200, { tentacles, leaders, types: PROJECT_TYPES });
    }
    if (url.pathname === '/api/tentacle') {
      const tentacle = await readTentacle(url.searchParams.get('id') || '', url.searchParams.get('tab'), url.searchParams.get('file'));
      if (!tentacle) return sendJson(res, 404, { error: 'Tentacle not found' });
      return sendJson(res, 200, Object.assign(tentacle, { dateFormat: await readDateFormat() }));
    }

    if (url.pathname === '/api/projects') {
      const dirs = await readProjectDirs();
      const wanted = url.searchParams.get('dir');
      const directory = wanted ? dirs.find((d) => d.name === wanted) : dirs[0];
      if (!directory) return sendJson(res, 404, { error: 'Directory not found' });
      return sendJson(res, 200, {
        projects: await listProjectsWithContent(directory),
        directory: { name: directory.name },
        dateFormat: await readDateFormat(),
      });
    }
    if (url.pathname === '/api/todos') {
      return sendJson(res, 200, await collectTodos());
    }
    if (url.pathname === '/api/project') {
      const folder = url.searchParams.get('folder') || '';
      const project = await readProject(folder, url.searchParams.get('file'));
      if (!project) return sendJson(res, 404, { error: 'Project not found' });
      return sendJson(res, 200, project);
    }
    if (url.pathname.startsWith('/images/')) return serveImage(res, url.pathname);
    // Tentacle pages were entity pages, so old links and bookmarks still arrive here.
    if (url.pathname === '/entity.html') {
      res.writeHead(302, { Location: 'tentacle.html' + url.search, 'Cache-Control': 'no-store' });
      return res.end();
    }
    return serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal server error');
  }
}

// Every folder the dashboard expects, and the Networking files its pages open. Anything
// already there is left alone.
function requiredDirs(root) {
  const p = dataPaths(root);
  return [p.NETWORKING_DIR, p.OPTIONS_DIR, p.TENTACLE_DIR, path.join(root, 'Projects'), p.TIME_MANAGEMENT_DIR, p.CATALOGS_DIR];
}
function starterFiles(root) {
  const p = dataPaths(root);
  return [
    [path.join(p.NETWORKING_DIR, currentName(p.NETWORKING_DIR, 'contacts', fs.existsSync)), '# Contacts\n\n## Contacts\n'],
    [path.join(p.NETWORKING_DIR, 'Events.md'), '# Events\n\n## Upcoming\n'],
    [p.REPORTS_FILE, ''], // blank until the first review adds a report
  ];
}

// Tentacles.csv was called Owners.csv. It's renamed once, and never over a Tentacles.csv.
async function renameOldTentaclesFile(root) {
  const { TENTACLES_FILE, OPTIONS_DIR } = dataPaths(root);
  const old = path.join(OPTIONS_DIR, 'Owners.csv');
  if ((await readIfExists(TENTACLES_FILE)) !== null || (await readIfExists(old)) === null) return;
  await disk.rename(old, TENTACLES_FILE);
  console.log(`Renamed ${path.relative(ROOT_DIR, old)} to Tentacles.csv`);
}

// entities.csv used to be in _Dashboard. It's moved up to the main folder once, before the
// entities are read, and never over one that's already there.
async function moveOldEntitiesFile() {
  if ((await readIfExists(ENTITIES_FILE)) !== null || (await readIfExists(OLD_ENTITIES_FILE)) === null) return;
  await disk.rename(OLD_ENTITIES_FILE, ENTITIES_FILE);
  console.log('Moved _Dashboard/entities.csv to the main folder');
}

// The Help Guide, its screenshots and the logo ship in _Dashboard/defaults.
const DEFAULTS_DIR = path.join(DASHBOARD_DIR, 'defaults');

const unlessExists = (err) => {
  if (err.code !== 'EEXIST') throw err;
};
const copyIfMissing = (from, to) => disk.copyFile(from, to, fs.constants.COPYFILE_EXCL).catch(unlessExists);

async function copyFolderIfMissing(from, to) {
  await disk.mkdir(to, { recursive: true });
  for (const entry of await fs.promises.readdir(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) await copyFolderIfMissing(source, target);
    else await copyIfMissing(source, target);
  }
}

// Adds anything missing and never replaces a file that's there, so edits and the guide's
// "Mark as read" tick are kept. Any logo of the user's own counts as the logo.
// An entity's folders and starter files, for an entity added to entities.csv since start-up
// as well as the ones there already.
async function prepareEntity(root) {
  for (const dir of requiredDirs(root)) await disk.mkdir(dir, { recursive: true });
  await renameOldTentaclesFile(root);
  for (const [file, content] of starterFiles(root)) {
    await disk.writeFile(file, content, { encoding: 'utf8', flag: 'wx' }).catch(unlessExists);
  }
}

async function createMissingFolders() {
  await moveOldEntitiesFile();
  for (const entity of await readEntities()) await prepareEntity(entityRootOf(entity));
  await disk.mkdir(IMAGES_DIR, { recursive: true });
  await copyIfMissing(path.join(DEFAULTS_DIR, '_Help_Guide.md'), HELP_FILE);
  await copyFolderIfMissing(path.join(DEFAULTS_DIR, 'Screenshots'), path.join(IMAGES_DIR, 'Screenshots'));
  if (!(await findLogo())) await copyIfMissing(path.join(DEFAULTS_DIR, 'Logo.png'), path.join(IMAGES_DIR, 'Logo.png'));
}

createMissingFolders()
  .catch((err) => console.error('Could not create the starting folders:', err.message))
  .finally(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Octapu System ${VERSION} running at http://${HOST}:${PORT}`);
      readEntities().then((entities) => console.log('Entities: ' + entities.map((e) => `${e.name} (${e.dir || 'main folder'})`).join(', ')));
    });
  });
