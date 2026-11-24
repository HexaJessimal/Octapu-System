// Each request's context: which entity it works on, that entity's data paths, the entities in
// entities.csv, and what the request has already read from the disk.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { parseCsv } = require('../todos');
const { currentName } = require('./renames');
const { cleanDevice } = require('../changes');

// Change logs name the machine that made the change. It's this computer's name, never
// something typed in, so each machine keeps writing to the same log.
const DEVICE = cleanDevice(os.hostname());
// Who sent the edit being handled, so the change log can name them without every
// function passing it along.
const requestContext = new AsyncLocalStorage();
const USER_COOKIE = 'pms_user';

// The _Dashboard folder, which holds the app.
const DASHBOARD_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.resolve(DASHBOARD_DIR, 'public');
const ROOT_DIR = path.resolve(DASHBOARD_DIR, '..');
// Shared by every entity: the guide and the pictures stay in the main folder.
const HELP_FILE = path.join(ROOT_DIR, '_Help_Guide.md');
const IMAGES_DIR = path.join(ROOT_DIR, '_Images');

// The entities (Name,Directory), each keeping its data in its own folder of the main folder.
const ENTITIES_FILE = path.join(DASHBOARD_DIR, 'entities.csv');
const ENTITY_COOKIE = 'pms_entity';
// Without entities.csv, the main folder itself holds the data, as before entities existed.
const FALLBACK_ENTITY = { name: 'Octapu System', dir: '' };

// An entity's data folders and files, each named with a leading underscore. The tentacles'
// and settings folders were renamed (lib/renames.js), and an old name is used while it's the
// only one there.
function dataPaths(root) {
  const tentacleDir = path.join(root, currentName(root, 'tentacles', existsNow));
  const timeDir = path.join(root, '_Time_Management');
  const optionsDir = path.join(root, currentName(root, 'options', existsNow));
  return {
    TENTACLE_DIR: tentacleDir,
    TIME_MANAGEMENT_DIR: timeDir,
    REVIEW_FILE: path.join(timeDir, 'Review.md'),
    AGENDA_FILE: path.join(timeDir, 'AgendaItems.csv'),
    FOCUS_FILE: path.join(timeDir, 'Plan.md'),
    REPORTS_FILE: path.join(tentacleDir, 'Reports.md'), // a report is added with each review
    // Archived projects' headers (ARCHIVEMODE HEADERS) and ideas not yet made into projects.
    ARCHIVE_FILE: path.join(root, '_Archive.md'),
    INCUBATOR_FILE: path.join(root, '_Incubator.md'),
    // Tasks a review has taken out of their files once they were ARCHIVED. Nothing else reads it.
    TASK_ARCHIVE_FILE: path.join(root, '_Task_Archive.md'),
    NETWORKING_DIR: path.join(root, '_Networking'),
    CATALOGS_DIR: path.join(root, '_Catalogs'), // a CSV per catalog
    OPTIONS_DIR: optionsDir,
    STATUS_FILE: path.join(optionsDir, 'Status.csv'),
    TENTACLES_FILE: path.join(optionsDir, 'Tentacles.csv'),
    LEADERS_FILE: path.join(optionsDir, 'Leaders.csv'),
    COLOURS_FILE: path.join(optionsDir, 'Colours.csv'),
    OPTIONS_FILE: path.join(optionsDir, 'Options.csv'),
  };
}
// ----- one request's reads -----

// A page load can ask for the same file many times (the menu's counts read every project
// several times), so a request keeps what it has read. Anything that changes the disk clears
// it, so a request never reads back an old copy of its own change. Without a request (at
// start-up) nothing is kept.
function remembered(key, make) {
  const store = requestContext.getStore();
  if (!store) return make();
  if (!store.cache) store.cache = new Map();
  if (!store.cache.has(key)) store.cache.set(key, make());
  return store.cache.get(key);
}
function forgetReads() {
  const store = requestContext.getStore();
  if (store && store.cache) store.cache.clear();
}
const readText = (full) => remembered('file:' + full, () => fs.promises.readFile(full, 'utf8'));
// A copy each time, as callers sort and filter what they get.
const readDir = async (dir) => (await remembered('dir:' + dir, () => fs.promises.readdir(dir, { withFileTypes: true }))).slice();
const existsNow = (full) => remembered('exists:' + full, () => fs.existsSync(full));
// Every change to the disk goes through these, which forget the request's reads before and after.
const disk = Object.fromEntries(
  ['writeFile', 'rename', 'rm', 'rmdir', 'unlink', 'mkdir', 'copyFile'].map((name) => [
    name,
    (...args) => {
      forgetReads();
      return fs.promises[name](...args).finally(forgetReads);
    },
  ])
);

// The selected tentacle's folder, set for each request (see tentacleRoot), or the main folder.
const currentRoot = () => (requestContext.getStore() || {}).root || ROOT_DIR;
// The data paths of the entity this request is working on.
const at = () => dataPaths(currentRoot());

// An error message if an entities.csv Directory can't hold an entity's data. Like a projects
// directory, it has to be a single folder directly inside the main folder.
function entityDirError(dir) {
  if (!dir || /[\\/:*?"<>|]/.test(dir) || dir.startsWith('.')) return `"${dir}" needs to be the name of a single folder directly inside the main folder.`;
  if (['_dashboard', '_images'].includes(dir.toLowerCase())) return `"${dir}" is already used by the dashboard.`;
  return null;
}

// The entities in entities.csv, in its order, as { name, dir }. Rows with an unusable or
// repeated Directory are skipped. With no usable rows, the main folder is the only tentacle.
// Every row of entities.csv as written, { name, dir }, or null if it has no Name and
// Directory columns.
function parseEntityRows(text) {
  const rows = text === null ? [] : parseCsv(text);
  const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
  const [nameAt, dirAt] = [header.indexOf('name'), header.indexOf('directory')];
  if (nameAt === -1 || dirAt === -1) return null;
  return rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => ({ name: (row[nameAt] || '').trim(), dir: (row[dirAt] || '').trim() }));
}

async function readEntities() {
  const rows = parseEntityRows(await readIfExists(ENTITIES_FILE));
  if (!rows) return [FALLBACK_ENTITY];
  const seen = new Set();
  const entities = [];
  for (const { name, dir } of rows) {
    if (entityDirError(dir) || seen.has(dir.toLowerCase())) continue;
    seen.add(dir.toLowerCase());
    entities.push({ name: name || dir, dir });
  }
  return entities.length ? entities : [FALLBACK_ENTITY];
}

const entityRootOf = (entity) => (entity.dir ? path.join(ROOT_DIR, entity.dir) : ROOT_DIR);

// A cookie's value, or null if the request doesn't have it.
function readCookie(req, name) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!cookie) return null;
  try {
    return decodeURIComponent(cookie.slice(name.length + 1));
  } catch {
    return null;
  }
}

// The entity this browser has chosen, or the first one. Each browser keeps its own choice.
async function selectedEntity(req) {
  const entities = await readEntities();
  const chosen = readCookie(req, ENTITY_COOKIE);
  return entities.find((e) => e.dir === chosen) || entities[0];
}

// True if `target` is `root` itself or sits inside it.
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

async function readIfExists(file) {
  try {
    return await readText(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

module.exports = {
  DEVICE,
  requestContext,
  USER_COOKIE,
  DASHBOARD_DIR,
  PUBLIC_DIR,
  ROOT_DIR,
  HELP_FILE,
  IMAGES_DIR,
  ENTITIES_FILE,
  ENTITY_COOKIE,
  dataPaths,
  readText,
  readDir,
  existsNow,
  disk,
  currentRoot,
  at,
  entityDirError,
  parseEntityRows,
  readEntities,
  entityRootOf,
  readCookie,
  selectedEntity,
  isInside,
  readIfExists,
};
