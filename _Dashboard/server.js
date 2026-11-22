// Octapu System Dashboard server: zero dependencies, Node built-ins only.
// Run from anywhere:  node _Dashboard/server.js   (then open the printed URL)
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');
const { spawn } = require('child_process');
const {
  parseCsv,
  PRIORITIES,
  parseStatuses,
  withDefaultStatuses,
  moveToStatus,
  parseTentacles,
  parseLeaders,
  parseColours,
  coloursStylesheet,
  timeframeEntries,
  parseComponents,
  editColourCsv,
  parseOptions,
  parseHeader,
  withAdvance,
  createMatcher,
  scanLines,
  findTodos,
  replaceStatus,
  setPriority,
  RECUR_VALUE,
  addPeriod,
  setPlanningDate,
  setTentacle,
  setLeader,
  setDateField,
  setReviewFlag,
  setDependency,
  dateError,
  formatDate,
  toStoredDate,
  STORAGE_FORMAT,
  projectTitleError,
  newProjectFiles,
  newOptionsCsv,
  newStatusCsv,
  leaderTag,
  newTentacleFile,
  appendTentacleCsv,
  PROJECT_TYPES,
  STATUS_TYPES,
  editStatusCsv,
  editLeaderCsv,
  editEntityCsv,
  timeframeError,
  addTimeframe,
  editTimeframe,
  isUsableDateFormat,
  parseTimeframes,
  tentacleChain,
  updateOptionsCsv,
  cleanName,
  stripComments,
  LEADER_FIELD,
  OLD_LEADER_FIELD,
  setHeaderField,
  AGENDA_GROUPS,
  parseAgenda,
  parseAgendaRule,
  editAgendaCsv,
} = require('./todos');

const {
  isReservedTitle,
  parseBlocks,
  setBlockBody,
  addBlock,
  addMilestone,
  addMilestoneItem,
  removeMilestone,
  moveRow,
  promoteRow,
  linkRowToBlock,
  finishMilestone,
  milestoneBody,
  moveMilestone,
  milestoneRows,
  lastReviewDate,
  parseFocus,
  tentacleProblems,
  projectProblems,
  unknownMarkdown,
  hasDashboardStructure,
  applyFixes,
  setProjectType,
  setRowDate,
  advanceRecurring,
  takeArchivedRows,
  addTaskArchive,
  ARCHIVE_FIELDS,
  INCUBATOR_FIELDS,
  parseNamedEntries,
  renameOldLeader,
  addNamedEntry,
  addEntryMark,
  removeNamedEntry,
  parseEntries,
  setEntryField,
  addEntryField,
  addEntry,
  removeEntry,
  eventTiming,
  parseEventDate,
  eventDateValue,
  readOldEventDate,
  setInlineField,
  addTask,
  isTaskList,
  addReview,
  REPORT_FIELDS,
  addReport,
  parseReports,
  cancelRow,
  deleteRow,
  editText,
} = require('./document-edits');

const { isDateColumn, catalogFileName, parseCatalogFileName, catalogError, newCatalogCsv, parseCatalog, nextCatalogNumber, editCatalogCsv } = require('./catalogs');
const { diffLines, logName, isLogOf, cleanDevice, appendToLog, parseLog, isConflictCopy, conflictOf } = require('./changes');

// Change logs name the machine that made the change. It's this computer's name, never
// something typed in, so each machine keeps writing to the same log.
const DEVICE = cleanDevice(os.hostname());
// Who sent the edit being handled, so the change log can name them without every
// function passing it along.
const requestContext = new AsyncLocalStorage();
const USER_COOKIE = 'pms_user';

const VERSION = '0.7';
const HOST = process.env.PMS_HOST || '127.0.0.1';
const PORT = Number(process.env.PMS_PORT) || 4173;

const PUBLIC_DIR = path.resolve(__dirname, 'public');
const ROOT_DIR = path.resolve(__dirname, '..');
// Shared by every entity: the guide and the pictures stay in the main folder.
const HELP_FILE = path.join(ROOT_DIR, '_Help_Guide.md');
const IMAGES_DIR = path.join(ROOT_DIR, '_Images');
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
// The tentacles (Name,Directory), each keeping its data in its own folder of the main folder.
const ENTITIES_FILE = path.join(__dirname, 'entities.csv');
const ENTITY_COOKIE = 'pms_entity';
// Without entities.csv, the main folder itself holds the data, as before entities existed.
const FALLBACK_ENTITY = { name: 'Octapu System', dir: '' };

// An entity's data folders and files, each named with a leading underscore.
// The tentacles' folder was called _Entities. That name is still used while it's the only one
// there, until Compatibility's Core files page renames it.
const TENTACLES_FOLDER = '_Tentacles';
const OLD_TENTACLES_FOLDER = '_Entities';
const tentaclesFolder = (root) =>
  !fs.existsSync(path.join(root, TENTACLES_FOLDER)) && fs.existsSync(path.join(root, OLD_TENTACLES_FOLDER)) ? OLD_TENTACLES_FOLDER : TENTACLES_FOLDER;

// The settings folder was called _Labels. That name is still used while it's the only one there,
// until Compatibility's Core files page renames it.
const OPTIONS_FOLDER = '_Options';
const OLD_OPTIONS_FOLDER = '_Labels';
const optionsFolder = (root) =>
  !fs.existsSync(path.join(root, OPTIONS_FOLDER)) && fs.existsSync(path.join(root, OLD_OPTIONS_FOLDER)) ? OLD_OPTIONS_FOLDER : OPTIONS_FOLDER;

function dataPaths(root) {
  const tentacleDir = path.join(root, tentaclesFolder(root));
  const timeDir = path.join(root, '_Time_Management');
  const optionsDir = path.join(root, optionsFolder(root));
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

// The Options page's Entities tab: entities.csv as written, and which folders don't exist yet.
async function readEntityTable() {
  const text = await readIfExists(ENTITIES_FILE);
  const rows = parseEntityRows(text) || [];
  return { exists: text !== null, rows: rows.map((row) => Object.assign(row, { missing: !row.dir || !fs.existsSync(path.join(ROOT_DIR, row.dir)) })) };
}

// Adds, changes or removes a row of entities.csv. Removing one leaves its folder alone. A new
// entity's folder is made if it isn't there, and the page then chooses it, which opens setup.
async function saveEntityRow(body) {
  const result = await editLabelFile(ENTITIES_FILE, 'Name,Directory', (text, b) => editEntityCsv(text, b, entityDirError), body);
  if (result.code !== 200 || body.action !== 'add') return result;
  const dir = body.dir.trim();
  const full = path.join(ROOT_DIR, dir);
  const created = !fs.existsSync(full);
  if (created) await fs.promises.mkdir(full);
  return { code: 200, body: { ok: true, created, dir } };
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

const AGENDA_HEADER = 'Type,Item,Checked';
const ARCHIVE_PREFIX = 'archive:'; // a Timeline row for an entry in _Archive.md
const ARCHIVE_FOLDER = 'archive'; // how edits name _Archive.md
const INCUBATOR_FOLDER = 'incubator'; // and _Incubator.md
// Edits name their document by folder. A tentacle's is this prefix plus its id.
const TENTACLE_PREFIX = 'tentacle:';
const NETWORKING_PREFIX = 'networking:';
const field = (label, match) => ({ label, match: match || new RegExp(`^${label.replace(/[/&]/g, '\\$&')}$`, 'i') });
// Which file each Networking page reads, how deep its entries' headings are, which of its
// `##` sections it lists (all of them if there's no `section`), and each entry's fields.
const NETWORKING = {
  contacts: {
    title: 'Contacts',
    tab: 'Contacts',
    noun: 'contact',
    // Leads.md until the page was renamed. That name is still read until Compatibility's Core
    // files page renames it, so nothing goes missing in the meantime.
    get file() {
      return contactsFile(at().NETWORKING_DIR);
    },
    level: 3,
    section: /^contacts$/i,
    fields: [
      field('Contact Details'),
      field('Links'),
      field('Events & Associations', /^events( & associations)?$/i),
      field('Notes', /^(.+ )?notes$/i), // also Octapu Notes, Pixelgrinder Notes and Label Notes
    ],
  },
  events: {
    title: 'Events',
    tab: 'Events',
    noun: 'event',
    file: 'Events.md',
    level: 4,
    // Event Date also finds the plain **Date** written before it was renamed.
    fields: [
      field('Artist/s'),
      eventField('Application Deadline', 'date'),
      eventField('Event Date', 'range', /^(event )?date$/i),
      eventField('Application Submitted', 'yesno'),
      eventField('Booking Confirmed', 'yesno'),
      ...['Venue', 'Main Contact', 'Details', 'Payment', 'Tasks'].map((label) => field(label)),
    ],
  },
};
const CONTACTS_FILE = 'Contacts.md';
const OLD_CONTACTS_FILE = 'Leads.md';
const contactsFile = (dir) => (!fs.existsSync(path.join(dir, CONTACTS_FILE)) && fs.existsSync(path.join(dir, OLD_CONTACTS_FILE)) ? OLD_CONTACTS_FILE : CONTACTS_FILE);

// The events fields written on one line and edited with their own controls, by `kind`: a
// single date, a date or range of dates, or Yes or No.
function eventField(label, kind, match) {
  return Object.assign(field(label, match), { kind });
}
const YES_NO = ['Yes', 'No'];
const isValidEventValue = (kind, value) => (kind === 'yesno' ? !value.trim() || YES_NO.includes(value.trim()) : parseEventDate(value, kind === 'range') !== null);
// The value of an event's field, found by its label in the page's list of fields.
function eventValue(entry, label) {
  const spec = NETWORKING.events.fields.find((f) => f.label === label);
  const found = entry.fields.find((f) => f.label !== null && spec.match.test(f.label));
  return found ? found.value.trim() : '';
}
const eventDateOf = (entry) => eventValue(entry, 'Event Date');
// How far an event has got: booked once Booking Confirmed is Yes, else applied once
// Application Submitted is Yes, else open.
function eventProgress(entry) {
  if (eventValue(entry, 'Booking Confirmed') === 'Yes') return 'booked';
  return eventValue(entry, 'Application Submitted') === 'Yes' ? 'applied' : 'open';
}
const isNetworkingField = (page) => (label) => page.fields.some((f) => f.match.test(label));
const DEFAULT_ROUNDUP_DAYS = 7; // only used if Options.csv doesn't set a usable ROUNDUP
const DEFAULT_COLOURS_FILE = path.resolve(__dirname, 'defaults', 'Colours.csv');
const SETUP_DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const setupFiles = () => ['STATUS_FILE', 'TENTACLES_FILE', 'LEADERS_FILE', 'OPTIONS_FILE', 'COLOURS_FILE'].map((name) => at()[name]);
const FALLBACK_DATE_FORMAT = 'YYYY-MM-DD'; // only used if Options.csv doesn't set DATEFORMAT
const FALLBACK_PROJECT_DIRS = 'Projects'; // only used if Options.csv has no PROJECTS row
const FALLBACK_TASK_LISTS = 'Tasks'; // only used if Options.csv has no TASKLISTS row
// Folders the dashboard uses for something else, so they can't also hold projects.
const RESERVED_DIRS = new Set(
  [__dirname, ...['NETWORKING_DIR', 'CATALOGS_DIR', 'TIME_MANAGEMENT_DIR'].map((name) => dataPaths(ROOT_DIR)[name]), TENTACLES_FOLDER, OLD_TENTACLES_FOLDER, OPTIONS_FOLDER, OLD_OPTIONS_FOLDER].map((dir) => path.basename(dir).toLowerCase())
);
const ARCHIVED_FOLDER = /^\d{4}[.\-_]\d{2}[.\-_]\d{2}/;
// A project is archived once its folder starts with a date or it has a Date Closed. Either
// way it's hidden from the dashboard, even when SHOWARCHIVED is on.
const isArchived = (project) => ARCHIVED_FOLDER.test(project.name) || project.closed;
const STATUS_PREFIX = /^(\+|-|\d{4}[.\-_]\d{2}[.\-_]\d{2}_?)/;
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

// True if `target` is `root` itself or sits inside it.
function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

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

async function listMarkdown(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md') && !isConflictCopy(e.name))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

// An error message if a name from Options.csv can't be a project directory. It has to be a
// single folder directly inside the main folder, and a name every operating system allows.
function projectDirError(name) {
  if (/[\\/:*?"<>|]/.test(name) || name.startsWith('.')) return `"${name}" needs to be the name of a single folder directly inside the Octapu-System folder.`;
  if (RESERVED_DIRS.has(name.toLowerCase())) return `"${name}" is already used by the dashboard, so it can't hold projects.`;
  if (AGENDA_GROUPS.some((g) => g.toLowerCase() === name.toLowerCase())) return `"${name}" is a review agenda group, so it can't be a project directory.`;
  return null;
}

// Every directory named by PROJECTS. A project is named by its folder, or by
// "directory/folder" outside the first directory, so that folders in different directories
// can't be mistaken for each other.
function parseProjectDirs(options) {
  const seen = new Set();
  const dirs = [];
  const value = options.PROJECTS === undefined ? FALLBACK_PROJECT_DIRS : options.PROJECTS;
  for (const name of splitList(value)) {
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    dirs.push({ name, fullPath: path.resolve(currentRoot(), name), error: projectDirError(name) });
  }
  const first = dirs.find((d) => !d.error);
  return dirs.map((d) => Object.assign(d, { prefix: d === first ? '' : `${d.name}/` }));
}

const readOptions = () => readLabelFile(at().OPTIONS_FILE, parseOptions, {});
const splitList = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);

// The headings that get a task list on tentacle and Ongoing project pages. Milestones
// and Notes are kept for their own sections, so they can't be task lists.
async function readTaskLists() {
  const { TASKLISTS } = await readOptions();
  const names = [];
  for (const name of splitList(TASKLISTS === undefined ? FALLBACK_TASK_LISTS : TASKLISTS)) {
    if (!isReservedTitle(name) && !isTaskList(names, name)) names.push(name);
  }
  return names;
}
const readProjectDirs = async () => parseProjectDirs(await readOptions()).filter((d) => !d.error);

// The projects in one directory. A folder with no markdown in it holds something else, such
// as images, so it isn't a project. A project with no usable Project Type shows as Milestone.
async function listDirectory(directory) {
  let entries;
  try {
    entries = await fs.promises.readdir(directory.fullPath, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw err;
  }
  const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
  const listed = await Promise.all(
    folders.map(async (e) => ({
      folder: directory.prefix + e.name,
      name: e.name,
      directory: directory.name,
      fullPath: path.join(directory.fullPath, e.name),
      files: await listMarkdown(path.join(directory.fullPath, e.name)),
    }))
  );
  const projects = listed.filter((p) => p.files.length);
  for (const project of projects) {
    project.files = mainFirst(project.files, pickPrimary(project.name, project.files));
    const { projectType, dates } = parseHeader(await readProjectFile(project, primaryFile(project)), []);
    project.ongoing = Boolean(projectType) && projectType.known === 'Ongoing';
    project.closed = Boolean(dates.closed.value);
  }
  return projects;
}

// Every project, or only those of one Project Type ('milestone' or 'ongoing').
async function listProjects(type) {
  const all = (await Promise.all((await readProjectDirs()).map(listDirectory))).flat();
  return type ? all.filter((p) => p.ongoing === (type === 'ongoing')) : all;
}

const primaryFile = (project) => pickPrimary(project.name, project.files);
const readProjectFile = (project, file) => fs.promises.readFile(path.join(project.fullPath, file), 'utf8');

// One entry per task list, in the order of TASKLISTS, sent separately from the file's other
// blocks. A list the file doesn't have yet comes back empty.
function splitTaskLists(blocks, names) {
  const found = names.map((name) => blocks.find((b) => b.title !== null && isTaskList([name], b.title)));
  return {
    blocks: blocks.filter((b) => !found.includes(b)),
    taskLists: names.map((name, i) => Object.assign({ body: '', bodyLine: null }, found[i], { name })),
  };
}

// The folder must match an actual directory entry exactly, which blocks any path tricks.
async function readProject(folder, requestedFile) {
  const projects = await listProjects();
  const project = projects.find((p) => p.folder === folder);
  if (!project) return null;
  const { directory, ongoing } = project;

  const file = requestedFile && project.files.includes(requestedFile) ? requestedFile : primaryFile(project);
  const content = await readProjectFile(project, file);
  const [statuses, tentacles, leaders, dateFormat] = await Promise.all([readStatuses(), readTentacles(), readLeaders(), readDateFormat()]);
  const todos = scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder, file }));
  const { title, timeframe, leader, dates, dependency, flagged } = parseHeader(content, tentacles);
  const blocks = parseBlocks(content);
  const details = { folder, directory, ongoing, archived: isArchived(project), projectTypes: PROJECT_TYPES, file, files: project.files, content, statuses, todos, tentacles, leaders, dateFormat, title, timeframe, leader, dates, dependency, flagged };
  if (ongoing) return Object.assign(details, splitTaskLists(blocks, await readTaskLists()), { dependencyOptions: [] });
  const planned = projects.filter((p) => !p.ongoing);
  const archive = await dependableArchive();
  return Object.assign(details, {
    blocks,
    dependencyFolder: resolveDependency(dependency.value, planned, archive),
    dependencyOptions: await dependencyChoices(folder, planned, archive),
  });
}

// One directory's projects with their main file's text, which the list uses to show progress.
async function listProjectsWithContent(directory) {
  const projects = await listDirectory(directory);
  return Promise.all(
    projects.map(async (project) => {
      const { folder, files, ongoing } = project;
      const content = await readProjectFile(project, primaryFile(project));
      // A Date Closed archives a project even if its folder hasn't been renamed.
      return { folder, files, ongoing, content, closed: parseHeader(content, []).dates.closed.value || null };
    })
  );
}

// A project's title: its folder without the status prefix or tentacle.
function projectTitle(folder) {
  return folder.replace(STATUS_PREFIX, '').split('_').slice(1).join(' ').trim();
}

// A project's name in the markdown: its folder without the status prefix, so it stays
// valid when the project moves between active, inactive and archived.
function projectName(folder) {
  return folder.replace(STATUS_PREFIX, '').replace(/_/g, ' ');
}

// The entries in _Archive.md, one per project archived in HEADERS mode.
async function readArchive() {
  const text = await readIfExists(at().ARCHIVE_FILE);
  return text === null ? [] : parseNamedEntries(text, ARCHIVE_FIELDS);
}

// The archive entries a project can depend on: those in _Archive.md, in HEADERS mode only.
const dependableArchive = async () => ((await readArchiveMode()) === 'FULL' ? [] : readArchive());

const dependencyKey = (text) => text.trim().replace(/\s+/g, ' ').toLowerCase();

// What a Project Dependency value names: a project's folder, or else an entry in
// `archive` as "archive:Title", or null. An entry's title, "TENTACLEID Title", is written the
// same way as a project's name, so the file doesn't need to say which it is.
function resolveDependency(value, projects, archive = []) {
  const key = dependencyKey(value);
  if (!key) return null;
  const match = projects.find((p) => dependencyKey(projectName(p.name)) === key);
  if (match) return match.folder;
  const entry = archive.find((e) => dependencyKey(e.title) === key);
  return entry ? ARCHIVE_PREFIX + entry.title : null;
}

// Each project's dependency, as a Map of folder -> the folder it depends on.
async function dependencyParents(projects) {
  const parents = new Map();
  for (const project of projects) {
    const content = await readProjectFile(project, primaryFile(project));
    const parent = resolveDependency(parseHeader(content, []).dependency.value, projects);
    if (parent) parents.set(project.folder, parent);
  }
  return parents;
}

// The projects `folder` may depend on: not archived, not itself, and not any project
// that already depends on it, which would make a loop. Then the entries in `archive`, apart
// from `folder` itself when it's one of them.
async function dependencyChoices(folder, projects, archive = []) {
  const parents = await dependencyParents(projects);
  const dependsOnFolder = (candidate) => {
    const seen = new Set();
    for (let at = candidate; at && !seen.has(at); at = parents.get(at)) {
      if (at === folder) return true;
      seen.add(at);
    }
    return false;
  };
  const names = projects.filter((p) => !isArchived(p) && !dependsOnFolder(p.folder)).map((p) => projectName(p.name));
  const taken = new Set(names.map(dependencyKey));
  const archived = archive.map((e) => e.title).filter((title) => ARCHIVE_PREFIX + title !== folder && !taken.has(dependencyKey(title)));
  return names
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ id: name, name }))
    .concat(archived.sort((a, b) => a.localeCompare(b)).map((title) => ({ id: title, name: `${title} (archived)` })));
}

// A project's main file is named after the title in its folder name. Case, spaces and
// underscores don't matter, so "First_album.md" counts for "+MUSART_First_album".
const sameFileName = (a, b) => a.replace(/[\s_]+/g, ' ').trim().toLowerCase() === b.replace(/[\s_]+/g, ' ').trim().toLowerCase();
const namedFile = (folder, files) => files.find((f) => sameFileName(fileTitle(f), projectTitle(folder))) || null;

// The named file, or else the first alphabetically, which Compatibility then points out.
const pickPrimary = (folder, files) => namedFile(folder, files) || files[0];

// A folder's files with the main one first, as its file tabs show them.
const mainFirst = (files, main) => (main ? [main, ...files.filter((f) => f !== main)] : files);

// Label files are re-read on every use, so edits apply without a restart.
async function readLabelFile(file, parse, fallback) {
  try {
    return parse(await fs.promises.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

const readStatuses = async () => withAdvance(withDefaultStatuses(await readLabelFile(at().STATUS_FILE, parseStatuses, [])));
const readTentacles = () => readLabelFile(at().TENTACLES_FILE, parseTentacles, []);
const readLeaders = () => readLabelFile(at().LEADERS_FILE, parseLeaders, []);

// On/off options and their values when Options.csv doesn't have them. The Options page always
// lists them, and saving one adds it to the file.
const SWITCH_OPTIONS = { SHOWARCHIVED: 'FALSE', SYNCCONFLICTS: 'FALSE', MULTIUSER: 'FALSE' };
const SWITCH_VALUES = ['TRUE', 'FALSE'];

// Options with a fixed set of values, shown as a dropdown, and the value used when the file
// doesn't have them. ARCHIVEMODE: HEADERS keeps an archived project's header in _Archive.md
// and leaves its folder alone, for Syncthing to move off; FULL renames the folder instead.
const CHOICE_OPTIONS = { ARCHIVEMODE: { values: ['HEADERS', 'FULL'], fallback: 'HEADERS' } };

// The file's options in its order, then any switch or choice it doesn't have yet, where
// saving adds it.
async function readOptionsWithSwitches() {
  const options = await readOptions();
  const defaults = Object.assign({}, SWITCH_OPTIONS, ...Object.entries(CHOICE_OPTIONS).map(([key, c]) => ({ [key]: c.fallback })));
  return Object.assign({}, options, ...Object.entries(defaults).filter(([key]) => !(key in options)).map(([key, value]) => ({ [key]: value })));
}

// A choice option's value, or its fallback if the file's value isn't one of its choices.
async function readChoice(key) {
  const value = ((await readOptions())[key] || '').toUpperCase();
  return CHOICE_OPTIONS[key].values.includes(value) ? value : CHOICE_OPTIONS[key].fallback;
}
const readArchiveMode = () => readChoice('ARCHIVEMODE');

// SHOWARCHIVED: archived rows stay visible on project, tentacle, Contacts and Events pages.
const readSwitch = async (key) => ((await readOptions())[key] || '').toUpperCase() === 'TRUE';
const readShowArchived = () => readSwitch('SHOWARCHIVED');

async function readRoundupDays() {
  const options = await readOptions();
  return /^[1-9]\d*$/.test(options.ROUNDUP || '') ? Number(options.ROUNDUP) : DEFAULT_ROUNDUP_DAYS;
}

async function readDateFormat() {
  const options = await readOptions();
  return options.DATEFORMAT || FALLBACK_DATE_FORMAT;
}

// Status-prefixed items from every markdown file of every project that isn't archived.
// `find` can be swapped for scanLines to also get checkboxes with no status.
async function collectTodos(find = findTodos) {
  const statuses = await readStatuses();
  const match = createMatcher(statuses);
  const tentacles = await readTentacles();
  const focus = await readLatestFocus();
  const items = [];
  for (const project of await listProjects()) {
    if (isArchived(project)) continue;
    const active = project.name.startsWith('+');
    // The focus only ever lists projects with milestones.
    const focused = active && !project.ongoing ? await focusNames(project, focus, tentacles) : null;
    const tentacleName = topTentacleName(tentacles, await projectTentacleId(project, tentacles));
    for (const file of project.files) {
      const content = await readProjectFile(project, file);
      const milestones = new Map(milestoneRows(content, statuses).map((row) => [row.line, row.milestone]));
      for (const item of find(content, match)) {
        const named = focused && [item.editText, milestones.get(item.line)].some((name) => name && focused.has(focusKey(name)));
        const highlight = !active ? 'inactive' : named ? 'milestone' : focused ? 'project' : null;
        items.push(Object.assign(item, { folder: project.folder, file, highlight, tentacleName }));
      }
    }
  }
  for (const row of tentacles) {
    const place = tentaclePlace(tentacles, row.id);
    if (!place) continue;
    // Where the item's tentacle page is: its top-level tentacle and its own tab.
    const tentacle = { root: place.chain[0], id: row.id, name: row.name };
    const focused = tentacleFocusNames(row, tentacles.find((o) => o.id === place.chain[0]), focus);
    for (const file of await tentacleFiles(place.dir)) {
      const content = await fs.promises.readFile(path.join(place.dir, file), 'utf8');
      for (const item of find(content, match)) {
        const named = focused && focused.has(focusKey(item.editText || ''));
        items.push(Object.assign(item, { folder: TENTACLE_PREFIX + row.id, file, highlight: focused ? (named ? 'milestone' : 'project') : null, tentacle, tentacleName: topTentacleName(tentacles, row.id) }));
      }
    }
  }
  // Tasks on the Contacts and Events pages, as long as they're inside a contact or an event.
  for (const page of await networkingFiles()) {
    for (const item of find(page.content, match)) {
      const entry = page.entryAt(item.line);
      if (!entry) continue;
      const networking = { page: page.folder.slice(NETWORKING_PREFIX.length), name: page.name, title: entry.title };
      items.push(Object.assign(item, { folder: page.folder, file: page.file, highlight: null, networking, tentacleName: null }));
    }
  }
  // R, recurring, is offered by the Todos filter and sorted after C.
  return { statuses, items, priorities: [...PRIORITIES, 'R'], dateFormat: await readDateFormat() };
}

const focusKey = (text) => text.trim().toLowerCase();

// The outline of the newest dated entry in the focus log, or [] if there isn't one.
async function readLatestFocus() {
  const text = await readIfExists(at().FOCUS_FILE);
  const latest = text === null ? null : lastReviewDate(text);
  const entry = latest && parseBlocks(text).find((b) => b.title === latest);
  return entry ? parseFocus(entry.body) : [];
}

// The names listed under this tentacle or tentacle in the focus, or null if it isn't in it. A
// plan files them under their top-level tentacle.
function tentacleFocusNames(tentacle, top, focus) {
  const entries = focus.filter((entry) => focusKey(entry.project) === focusKey(tentacle.name) && entry.tentacle !== null && focusKey(entry.tentacle) === focusKey(top.name));
  return entries.length ? new Set(entries.flatMap((entry) => entry.items.map(focusKey))) : null;
}

// The names listed under this project in the focus, or null if the project isn't in it.
// The tentacle is compared too, as two tentacles can each have a project with the same title.
async function focusNames(project, focus, tentacles) {
  const title = focusKey(projectTitle(project.name));
  const sameTitle = focus.filter((entry) => focusKey(entry.project) === title);
  if (!sameTitle.length) return null;
  const tentacle = focusKey(await projectTentacleName(project, tentacles));
  const matching = sameTitle.filter((entry) => entry.tentacle !== null && focusKey(entry.tentacle) === tentacle);
  return matching.length ? new Set(matching.flatMap((entry) => entry.items.map(focusKey))) : null;
}

// Every project's Active Timeframe entries, each row marked active, inactive or archive.
// Archived projects are only included while SHOWARCHIVED is on. They come from _Archive.md
// in HEADERS mode, where the folders may already have gone, and from the archived folders
// themselves in FULL mode.
async function collectTimeline() {
  const rows = [];
  const projects = await listProjects('milestone');
  const fullArchive = (await readArchiveMode()) === 'FULL';
  const showArchived = await readShowArchived();
  const archive = fullArchive ? [] : await readArchive();
  for (const project of projects) {
    const archived = isArchived(project);
    if (archived && !(fullArchive && showArchived)) continue;
    const file = primaryFile(project);
    const content = await readProjectFile(project, file);
    const header = parseHeader(content, []);
    const parsed = parseTimeframes(header.timeframe.value, STORAGE_FORMAT);
    const dependency = resolveDependency(header.dependency.value, projects, archive);
    const kind = archived ? 'archive' : project.name.startsWith('+') ? 'active' : 'inactive';
    rows.push(Object.assign({ folder: project.folder, file, content, dependency, kind }, parsed));
  }
  if (!fullArchive && showArchived) {
    for (const { title, fields } of archive) {
      const dependency = resolveDependency(fields.dependency.value, projects, archive);
      rows.push(Object.assign({ folder: ARCHIVE_PREFIX + title, file: path.basename(at().ARCHIVE_FILE), content: '', dependency, kind: 'archive', archive: { title } }, parseTimeframes(fields.timeframe.value, STORAGE_FORMAT)));
    }
  }
  return rows;
}

// The Timeline rows for one tentacle's page: the projects whose tentacle ID is that tentacle's,
// and archive entries whose title starts with it. Those under it aren't included.
async function tentacleTimeline(id) {
  const tentacles = await readTentacles();
  const projects = await listProjects('milestone');
  const owned = new Set();
  for (const project of projects) if ((await projectTentacleId(project, tentacles)) === id) owned.add(project.folder);
  return (await collectTimeline()).filter((row) => (row.archive ? row.archive.title.trim().split(/\s+/)[0] === id : owned.has(row.folder)));
}

// Each event's Event Date and Application Deadline, for the Timeline's lines. Only dates the
// dashboard wrote are used, so an event shows once Compatibility has converted its dates. A
// deadline only matters until the event has been applied for or booked.
async function timelineEvents() {
  const page = NETWORKING.events;
  const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
  if (content === null) return [];
  return parseEntries(content, page.level, isNetworkingField(page))
    .flatMap((s) => s.entries)
    .map((entry) => {
      const progress = eventProgress(entry);
      const date = parseEventDate(eventValue(entry, 'Event Date')) || {};
      const deadline = progress === 'open' ? (parseEventDate(eventValue(entry, 'Application Deadline'), false) || {}).start : null;
      return { title: entry.title, start: date.start || null, end: date.end || null, deadline: deadline || null, booked: progress === 'booked' };
    })
    .filter((e) => e.start || e.deadline);
}

// Every catalog record with a Release date, for the Timeline. A cover in the Image column,
// written [[IMAGE#path]], becomes its address under images/.
async function timelineReleases() {
  const catalogs = await listCatalogs();
  const column = (columns, name) => columns.findIndex((c) => c.toLowerCase() === name);
  const lists = await Promise.all(
    catalogs.map(async (catalog) => {
      const { columns, rows } = parseCatalog(await readCatalogFile(catalog));
      const [date, title, image, number] = ['release date', 'title', 'image', 'catalog #'].map((name) => column(columns, name));
      if (date === -1) return [];
      return rows.flatMap((row) => {
        const day = (parseEventDate(row[date], false) || {}).start;
        if (!day) return [];
        const cover = image === -1 ? null : row[image].match(/^\[\[IMAGE#([^\]|]+)(?:\|[^\]]*)?\]\]$/);
        return [{
          title: (title !== -1 && row[title].trim()) || (number !== -1 && row[number].trim()) || 'Release',
          date: day,
          image: cover ? 'images/' + cover[1].trim().split('/').map(encodeURIComponent).join('/') : null,
          catalog: catalog.name,
        }];
      });
    })
  );
  return lists.flat();
}

// The name of the logo in _Images/, whatever capitals it's written with, or null.
async function findLogo() {
  try {
    return (await fs.promises.readdir(IMAGES_DIR)).find((name) => /^logo\.(png|jpe?g|gif|webp)$/i.test(name)) || null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// What the left-hand menu lists: top-level tentacles, each project directory with its
// projects, and the Time Management pages' due dates and counts.
async function collectNav() {
  const tentacles = await readTentacles();
  const toReview = await collectToReview();
  const waiting = await waitingTasks();
  const help = await readIfExists(HELP_FILE);
  return {
    logo: await findLogo(),
    helpUnread: help !== null && !splitHelp(help).read,
    tentacles: tentacleTree(tentacles),
    catalogs: await listCatalogs(),
    directories: await Promise.all(
      (await readProjectDirs()).map(async (d) => ({ name: d.name, projects: (await listDirectory(d)).filter((p) => !p.closed).map((p) => p.folder) }))
    ),
    roundup: {
      doneToReview: (await doneSinceReview(await readStatuses(), await readLastReview())).length,
      projectsToReview: toReview.projects.length,
      tentaclesToReview: toReview.tentacles.length,
      waitingTasks: waiting.length,
      review: await daysSinceLastEntry(at().REVIEW_FILE),
      plan: await daysSinceLastEntry(at().FOCUS_FILE),
      interval: await readRoundupDays(),
    },
    // How many rows each Compatibility page lists, counted the same way the pages are.
    compatibility: {
      tentacles: (await incompatibleTentacles()).rows.length,
      projects: (await incompatibleProjects()).rows.length,
      events: (await incompatibleEvents()).rows.length,
      core: (await incompatibleCoreFiles()).rows.length,
    },
  };
}

// Every tentacle, each followed by those under it, with its top-level tentacle's ID as `root`
// and its `level` (0 for a top-level tentacle). Tentacles in a loop are left out.
function tentacleTree(tentacles) {
  const placed = tentacles.map((o) => ({ o, chain: tentacleChain(tentacles, o.id) })).filter((t) => t.chain);
  const below = (parent) =>
    placed
      .filter((t) => (t.o.parent || null) === parent)
      .flatMap((t) => [{ id: t.o.id, name: t.o.name, parent: t.o.parent || null, root: t.chain[0], level: t.chain.length - 1 }, ...below(t.o.id)]);
  return below(null);
}

// Whole days since a log file's newest dated heading, or null if it has none.
async function daysSinceLastEntry(file) {
  const text = await readIfExists(file);
  const last = text === null ? null : lastReviewDate(text);
  return last ? dayNumber(formatDate(new Date(), STORAGE_FORMAT)) - dayNumber(last) : null;
}

// A YYYY-MM-DD date as a whole number of days, so two can be subtracted.
const dayNumber = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
};

// `date` moved by a number of days, as YYYY-MM-DD.
const shiftDate = (date, days) => new Date((dayNumber(date) + days) * 86400000).toISOString().slice(0, 10);

// A log file as dated entries, in file order, for the History tabs.
async function readHistory(file) {
  const text = await readIfExists(file);
  const entries = text === null ? [] : parseBlocks(text).filter((b) => b.title !== null);
  return { entries: entries.map(({ title, body }) => ({ title, body })), dateFormat: await readDateFormat() };
}

// A tentacle's markdown lives in its own folder, nested under its parents' folders.
function tentaclePlace(tentacles, id) {
  const tentacle = tentacles.find((o) => o.id === id);
  const chain = tentacle && tentacleChain(tentacles, id);
  if (!chain) return null;
  const dir = path.resolve(at().TENTACLE_DIR, ...chain);
  return isInside(at().TENTACLE_DIR, dir) ? { tentacle, chain, dir } : null;
}

// A tentacle's main file: the one named after it, or else the first in its folder.
const primaryTentacleFile = (tentacle, files) => (files.includes(`${tentacle.name}.md`) ? `${tentacle.name}.md` : files[0]);

async function tentacleFiles(dir) {
  try {
    return await listMarkdown(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// One tab of a top-level tentacle's page: `tab` picks the tentacle itself or one
// of those under it. The file is the one named after the tentacle, or else the first in its
// folder. Its Tasks section is sent separately from the other blocks.
async function readTentacle(id, tab, requestedFile) {
  const tentacles = await readTentacles();
  const selected = tentaclePlace(tentacles, id);
  if (!selected) return null;
  const root = selected.chain[0];
  const family = tentacles.filter((o) => (tentacleChain(tentacles, o.id) || [])[0] === root);
  // `level` is 0 for the top-level tentacle, 1 for its tentacles, and so on down.
  const tabs = [...family.filter((o) => o.id === root), ...family.filter((o) => o.id !== root)].map((o) => ({
    id: o.id,
    name: o.name,
    parent: o.parent || null,
    level: tentacleChain(tentacles, o.id).length - 1,
  }));

  const { tentacle, chain, dir } = tentaclePlace(tentacles, family.some((o) => o.id === tab) ? tab : id);
  const expected = `${tentacle.name}.md`;
  const parent = chain.length > 1 ? tentacles.find((o) => o.id === tentacle.parent) : null;
  const base = {
    id: tentacle.id,
    root,
    name: tentacle.name,
    parentId: parent ? parent.id : null,
    parentName: parent ? parent.name : null,
    tabs,
    folder: TENTACLE_PREFIX + tentacle.id,
    location: `${path.basename(at().TENTACLE_DIR)}/${chain.join('/')}/${expected}`,
  };

  const files = await tentacleFiles(dir);
  if (!files.length) return Object.assign(base, { file: null, files, content: '' });
  const file = files.includes(requestedFile) ? requestedFile : primaryTentacleFile(tentacle, files);
  const content = await fs.promises.readFile(path.join(dir, file), 'utf8');
  const [statuses, leaders] = await Promise.all([readStatuses(), readLeaders()]);
  const blocks = parseBlocks(content);
  return Object.assign(base, parseHeader(content, tentacles), {
    file,
    files: mainFirst(files, primaryTentacleFile(tentacle, files)),
    content,
    statuses,
    tentacles,
    leaders,
    todos: scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder: base.folder, file })),
    ...splitTaskLists(blocks, await readTaskLists()),
  });
}


// An error message if these can't be a tentacle's name and ID, or null.
function tentacleError(name, id) {
  return (
    projectTitleError(name, 'name') ||
    (/^[A-Za-z0-9-]+$/.test(id) ? projectTitleError(id, 'ID') : 'The ID can only use letters, numbers and hyphens.')
  );
}

// Creates a new tentacle's markdown file. Throws EEXIST if it's already there.
async function writeTentacleFile(dir, name) {
  const full = path.join(dir, `${name}.md`);
  const content = newTentacleFile({ name, today: formatDate(new Date(), STORAGE_FORMAT), taskLists: await readTaskLists() });
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(full, content, { encoding: 'utf8', flag: 'wx' });
  await recordCreated(full, content);
  return full;
}

// Adds a tentacle: its folder and markdown file, then its row in Tentacles.csv.
async function createTentacle(body) {
  const name = cleanName(body.name);
  const id = body.id.trim();
  const error = tentacleError(name, id);
  if (error) return { code: 400, body: { error } };

  const tentacles = await readTentacles();
  const place = tentaclePlace(tentacles, body.parent);
  if (!place) return { code: 400, body: { error: 'Invalid request' } };
  if (tentacles.some((o) => o.id.toLowerCase() === id.toLowerCase())) {
    return { code: 409, body: { error: `A tentacle with the ID "${id}" already exists.` } };
  }

  const dir = path.join(place.dir, id);
  const full = path.join(dir, `${name}.md`);
  const csv = await fs.promises.readFile(at().TENTACLES_FILE, 'utf8');
  try {
    await writeTentacleFile(dir, name);
  } catch (err) {
    if (err.code === 'EEXIST') return { code: 409, body: { error: 'That tentacle already has a file with that name.' } };
    throw err;
  }
  try {
    await writeFileSafely(at().TENTACLES_FILE, appendTentacleCsv(csv, { id, name, parent: body.parent }));
  } catch (err) {
    await fs.promises.rm(full, { force: true });
    await fs.promises.rmdir(dir).catch(() => {});
    throw err;
  }
  return { code: 200, body: { ok: true, id, root: place.chain[0] } };
}

// Writes one at a time, so two quick changes can't overwrite each other.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

// Writes to a temp file then renames, so a crash can't leave a half-written markdown file.
// A markdown file's change is added to its change log while MULTIUSER is on.
async function writeFileSafely(full, data) {
  const { mode } = await fs.promises.stat(full);
  const before = isMarkdown(full) ? await fs.promises.readFile(full, 'utf8') : null;
  const temp = `${full}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temp, data, { encoding: 'utf8', mode });
    await fs.promises.rename(temp, full);
  } catch (err) {
    await fs.promises.rm(temp, { force: true });
    throw err;
  }
  if (before !== null) await recordChange(full, before, data);
}

const isMarkdown = (full) => full.toLowerCase().endsWith('.md');

// Logs a new markdown file as every one of its lines added.
const recordCreated = (full, content) => recordChange(full, '', content);

// Adds an entry to this machine's log for the file, naming the logged-in user, and drops
// entries older than twice ROUNDUP. A failed log write is reported but never undoes the edit.
async function recordChange(full, before, after) {
  if (!isMarkdown(full) || before === after || !(await readSwitch('MULTIUSER'))) return;
  const hunks = diffLines(before, after);
  if (!hunks.length) return; // only line endings changed
  const { user } = requestContext.getStore() || {};
  const log = path.join(path.dirname(full), logName(path.basename(full), DEVICE));
  try {
    const existing = await readIfExists(log);
    const text = appendToLog(existing, { time: new Date(), user: user || 'Unknown', device: DEVICE, hunks }, await changelogCutoff());
    const temp = `${log}.${process.pid}.tmp`;
    await fs.promises.writeFile(temp, text, 'utf8');
    await fs.promises.rename(temp, log);
  } catch (err) {
    console.error(`Could not update the change log ${log}:`, err.message);
  }
}

// Change logs keep twice the ROUNDUP period, so a Review can always see the whole period.
async function changelogCutoff() {
  return new Date(Date.now() - 2 * (await readRoundupDays()) * 24 * 60 * 60 * 1000);
}

// The path of a project's or tentacle's markdown file, or null if there's no such file.
// Folder and file must match real entries exactly, which blocks any path tricks.
async function editableFile(folder, file) {
  // _Archive.md, edited from the Archive Index.
  if (folder === ARCHIVE_FOLDER) return file === path.basename(at().ARCHIVE_FILE) && (await readIfExists(at().ARCHIVE_FILE)) !== null ? at().ARCHIVE_FILE : null;
  // _Incubator.md, edited from the Incubator.
  if (folder === INCUBATOR_FOLDER) return file === path.basename(at().INCUBATOR_FILE) && (await readIfExists(at().INCUBATOR_FILE)) !== null ? at().INCUBATOR_FILE : null;
  if (folder.startsWith(NETWORKING_PREFIX)) {
    const page = networkingPage(folder.slice(NETWORKING_PREFIX.length));
    const full = page && page.file === file ? path.join(at().NETWORKING_DIR, file) : null;
    return full && (await readIfExists(full)) !== null ? full : null;
  }
  if (folder.startsWith(TENTACLE_PREFIX)) {
    const place = tentaclePlace(await readTentacles(), folder.slice(TENTACLE_PREFIX.length));
    return place && (await tentacleFiles(place.dir)).includes(file) ? path.join(place.dir, file) : null;
  }
  const project = (await listProjects()).find((p) => p.folder === folder);
  return project && project.files.includes(file) ? path.join(project.fullPath, file) : null;
}

// Runs `transform` over a project or tentacle file and saves the result. A null result
// means the line it targeted has changed.
async function updateProjectFile(folder, file, transform) {
  const full = await editableFile(folder, file);
  if (!full) return { code: 404, body: { error: 'File not found.' } };

  const content = await fs.promises.readFile(full, 'utf8');
  const updated = transform(content);
  if (updated === null) return { code: 409, body: { error: 'That line has changed in the file, so nothing was updated.' } };
  if (updated !== content) await writeFileSafely(full, updated);
  return { code: 200, body: { ok: true } };
}

async function changeStatus({ folder, file, line, from, to }) {
  const statuses = await readStatuses();
  if (!statuses.some((s) => s.name === to)) return { code: 400, body: { error: `"${to}" is not in Status.csv.` } };
  return updateProjectFile(folder, file, (content) => moveToStatus(content, line, from, to, statuses, new Date()));
}

// The "Mark as read" checkbox at the bottom of the Help Guide. The page shows it below the
// guide rather than in it, so it's taken out of the text.
const HELP_READ_LINE = /^[ \t]*- \[([ xX])\][ \t]+Mark as read[ \t]*(?=\r?$)/m;

function splitHelp(content) {
  const found = content.match(HELP_READ_LINE);
  if (!found) return { read: false, body: content };
  return { read: found[1] !== ' ', body: content.slice(0, found.index) + content.slice(found.index + found[0].length) };
}

// Ticks or unticks the checkbox, adding it to the end of the guide if it isn't there yet.
async function setHelpRead({ read }) {
  const content = await readIfExists(HELP_FILE);
  if (content === null) return { code: 404, body: { error: "_Help_Guide.md doesn't exist." } };
  const line = `- [${read ? 'x' : ' '}] Mark as read`;
  const updated = HELP_READ_LINE.test(content) ? content.replace(HELP_READ_LINE, line) : content.trimEnd() + '\n\n' + line + '\n';
  if (updated !== content) await writeFileSafely(HELP_FILE, updated);
  return { code: 200, body: { ok: true } };
}

async function readIfExists(file) {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// Every markdown file of every project that isn't archived, with its text.
async function liveProjectFiles() {
  const files = [];
  for (const project of await listProjects()) {
    if (isArchived(project)) continue;
    for (const file of project.files) {
      const full = path.join(project.fullPath, file);
      files.push({ folder: project.folder, name: project.name, ongoing: project.ongoing, file, full, content: await fs.promises.readFile(full, 'utf8') });
    }
  }
  return files;
}

// The date a task is due: its DEADLINE, or else its SCHEDULED date. Null if it has neither,
// or if the date isn't written as YYYY-MM-DD.
function taskDue(item) {
  const planned = item.dates.find((d) => d.kind === 'DEADLINE') || item.dates.find((d) => d.kind === 'SCHEDULED');
  const date = planned ? planned.value.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { kind: planned.kind, date } : null;
}

// Not finished, archived or cancelled. As on the milestone progress bars, waiting still counts.
const isIncomplete = (item) => !['DONE', 'ARCHIVED'].includes(item.type) && !item.cancelled && !['x', 'X'].includes(item.mark);
const isOpenTask = (item) => isIncomplete(item) && item.mark !== '-';

// The Active Timeframe entries of a file that include `today`.
function runningTimeframes(content, today) {
  return parseTimeframes(parseHeader(content, []).timeframe.value, STORAGE_FORMAT).ranges.filter((r) => {
    const [start, end] = r.raw.split(/\s+to\s+/i); // YYYY-MM-DD, so these compare as text
    return start <= today && today <= end;
  });
}

// The latest plan's outline, with a link to each project it names where one can be found.
async function currentPlan(projects, days, interval) {
  const text = await readIfExists(at().FOCUS_FILE);
  const date = text === null ? null : lastReviewDate(text);
  const current = days !== null && days < interval;
  if (!current) return { date, current, entries: [] };
  const tentacles = await readTentacles();
  const entries = [];
  for (const entry of await readLatestFocus()) {
    let folder = null;
    for (const project of projects.filter((p) => focusKey(projectTitle(p.name)) === focusKey(entry.project))) {
      if (focusKey(await projectTentacleName(project, tentacles)) === focusKey(entry.tentacle || '')) folder = project.folder;
    }
    entries.push(Object.assign(entry, { folder }));
  }
  return { date, current, entries };
}

// Everything the Home page shows.
async function collectHome() {
  const now = new Date();
  const today = formatDate(now, STORAGE_FORMAT);
  const nextWeek = formatDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7), STORAGE_FORMAT);
  const [projects, todos, interval, reviewDays, planDays] = await Promise.all([
    listProjects(),
    collectTodos(scanLines),
    readRoundupDays(),
    daysSinceLastEntry(at().REVIEW_FILE),
    daysSinceLastEntry(at().FOCUS_FILE),
  ]);
  const live = projects.filter((p) => !isArchived(p));
  const planned = live.filter((p) => !p.ongoing);

  const inTimeframe = [];
  for (const project of planned) {
    const content = await readProjectFile(project, primaryFile(project));
    const running = runningTimeframes(content, today);
    if (running.length) inTimeframe.push({ folder: project.folder, content, timeframes: running.map((r) => r.raw) });
  }

  const tasks = todos.items
    .filter(isOpenTask)
    .map((item) => Object.assign(item, { due: taskDue(item) }))
    .filter((item) => item.due)
    .sort((a, b) => a.due.date.localeCompare(b.due.date));

  const daysUntil = (days) => (days === null ? null : interval - days);
  return {
    today,
    statuses: todos.statuses,
    dateFormat: todos.dateFormat,
    active: live.filter((p) => p.name.startsWith('+')).length,
    inactive: live.filter((p) => p.name.startsWith('-')).length,
    inTimeframe,
    plan: await currentPlan(planned, planDays, interval),
    reviewDue: daysUntil(reviewDays),
    planDue: daysUntil(planDays),
    overdue: tasks.filter((item) => item.due.date < today),
    upcoming: tasks.filter((item) => item.due.date >= today && item.due.date <= nextWeek),
  };
}

// What the Plan page needs to know about a row. `available` marks those still to be assigned:
// an UNASSIGNED type status, or an unticked checkbox with no status. `assigned` rows are always
// in the focus.
function planRow(row, folder, file) {
  return Object.assign(row, {
    folder,
    file,
    available: row.status ? row.type === 'UNASSIGNED' : row.mark === ' ' && !row.cancelled,
    assigned: row.type === 'ASSIGNED' && !row.cancelled && row.editText.trim() !== '',
    lastInMilestone: false,
  });
}

// The nearest heading above a line, below the page title.
function headingAbove(lines, lineNo) {
  for (let i = lineNo - 2; i >= 0; i--) {
    const heading = lines[i].match(/^#{2,6}\s+(.*?)\s*#*\s*$/);
    if (heading) return heading[1];
  }
  return '';
}

// What the Plan page offers: each active project's milestone rows, then the rows of every
// tentacle and tentacle, and those under a contact or an Events entry. A project in a timeframe today is `suggested`, and so is the last incomplete
// row of a milestone, marked `lastInMilestone`.
async function collectWeeklyPlan() {
  const statuses = await readStatuses();
  const today = formatDate(new Date(), STORAGE_FORMAT);
  const projects = [];
  for (const { folder, name, ongoing, file, content } of await liveProjectFiles()) {
    if (ongoing || !name.startsWith('+')) continue;
    const found = milestoneRows(content, statuses).filter((row) => row.type !== 'ARCHIVED');
    const incomplete = new Map();
    found.filter(isIncomplete).forEach((row) => incomplete.set(row.milestone, (incomplete.get(row.milestone) || 0) + 1));
    const rows = found.map((row) => Object.assign(planRow(row, folder, file), { lastInMilestone: isIncomplete(row) && incomplete.get(row.milestone) === 1 }));
    projects.push({ folder, file, rows, suggested: runningTimeframes(content, today).length > 0 });
  }
  // A timeframe is only in one of a folder's files, but it's the whole project that's suggested.
  const running = new Set(projects.filter((p) => p.suggested).map((p) => p.folder));
  projects.forEach((p) => {
    p.suggested = running.has(p.folder);
  });

  const match = createMatcher(statuses);
  const rowsOf = (content) => scanLines(content, match).filter((row) => row.type !== 'ARCHIVED' && row.editText.trim() !== '');
  for (const { folder, file, name, content } of await allTentacleFiles()) {
    const lines = content.split(/\r\n?|\n/);
    const rows = rowsOf(content).map((row) => Object.assign(planRow(row, folder, file), { source: name, milestone: headingAbove(lines, row.line) }));
    if (rows.length) projects.push({ folder, file, name, rows, suggested: false });
  }
  for (const { folder, file, name, content, entryAt } of await networkingFiles()) {
    const rows = rowsOf(content)
      .filter((row) => entryAt(row.line))
      .map((row) => Object.assign(planRow(row, folder, file), { source: name, milestone: entryAt(row.line).title }));
    if (rows.length) projects.push({ folder, file, name, rows, suggested: false });
  }
  return { statuses, projects, dateFormat: await readDateFormat() };
}

// A project's current tentacle's ID: from its page title, or else its folder name.
async function projectTentacleId(project, tentacles) {
  const { title } = parseHeader(await readProjectFile(project, primaryFile(project)), tentacles);
  return (title && title.tentacle) || project.name.replace(STATUS_PREFIX, '').split('_')[0];
}

const nameOfTentacle = (tentacles, id) => {
  const tentacle = tentacles.find((o) => o.id === id);
  return tentacle ? tentacle.name : id;
};

// A project's current tentacle's friendly name.
const projectTentacleName = async (project, tentacles) => nameOfTentacle(tentacles, await projectTentacleId(project, tentacles));

// The name of the top-level tentacle a tentacle sits under, or is, for the Todos filter. Null
// when the tentacle isn't in Tentacles.csv, such as a folder not named TENTACLE_Title.
function topTentacleName(tentacles, id) {
  const place = tentaclePlace(tentacles, id);
  return place ? nameOfTentacle(tentacles, place.chain[0]) : null;
}

// Where an item goes in the logged focus: the name above, and the name it's listed under.
async function focusHeading(folder, projects, tentacles) {
  if (folder.startsWith(TENTACLE_PREFIX)) {
    const place = tentaclePlace(tentacles, folder.slice(TENTACLE_PREFIX.length));
    return place && { tentacle: tentacles.find((o) => o.id === place.chain[0]).name, project: place.tentacle.name };
  }
  if (folder.startsWith(NETWORKING_PREFIX)) {
    const page = networkingPage(folder.slice(NETWORKING_PREFIX.length));
    return page && { tentacle: 'Networking', project: page.title };
  }
  const project = projects.find((p) => p.folder === folder);
  return project ? { tentacle: await projectTentacleName(project, tentacles), project: projectTitle(project.name) } : null;
}

// Logs the focus under today's date as an outline: tentacle, then project, then items.
async function submitWeeklyFocus({ items }) {
  if (!items.length) return { code: 400, body: { error: 'Add at least one item first.' } };
  const projects = await listProjects('milestone');
  const tentacles = await readTentacles();
  const outline = new Map(); // tentacle name -> project -> items, in the order they were picked
  for (const { folder, text } of items) {
    const clean = text.trim();
    const heading = await focusHeading(folder, projects, tentacles);
    if (!heading || !clean || /[\r\n]/.test(clean)) return { code: 400, body: { error: 'Invalid request' } };
    if (!outline.has(heading.tentacle)) outline.set(heading.tentacle, new Map());
    const owned = outline.get(heading.tentacle);
    if (!owned.has(heading.project)) owned.set(heading.project, []);
    owned.get(heading.project).push(clean);
  }
  const lines = [];
  for (const [tentacle, owned] of outline) {
    lines.push(`- ${tentacle}`);
    for (const [project, texts] of owned) {
      lines.push(`    - ${project}:`, ...texts.map((t) => `        - ${t}`));
    }
  }

  const today = formatDate(new Date(), STORAGE_FORMAT);
  const existing = await readIfExists(at().FOCUS_FILE);
  const updated = addReview(existing === null ? `# Plan\n**Created:** ${today}\n` : existing, today, lines.join('\n'));
  if (existing === null) {
    await fs.promises.mkdir(at().TIME_MANAGEMENT_DIR, { recursive: true });
    await fs.promises.writeFile(at().FOCUS_FILE, updated, 'utf8');
    await recordCreated(at().FOCUS_FILE, updated);
  } else {
    await writeFileSafely(at().FOCUS_FILE, updated);
  }
  return { code: 200, body: { ok: true } };
}

const networkingPage = (name) => (Object.hasOwn(NETWORKING, name) ? NETWORKING[name] : null);

// A Networking page's entries by section. Events that have happened are moved out of their
// section into `past`, most recent first.
async function readNetworking(name) {
  const page = networkingPage(name);
  if (!page) return null;
  const base = { title: page.title, tab: page.tab, noun: page.noun, location: `_Networking/${page.file}`, dateFormat: await readDateFormat() };
  const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
  if (content === null) return Object.assign(base, { file: null, sections: [], past: [] });

  const statuses = await readStatuses();
  const today = formatDate(new Date(), STORAGE_FORMAT);
  const folder = NETWORKING_PREFIX + name;
  const all = parseEntries(content, page.level, isNetworkingField(page));
  const sections = page.section ? all.filter((s) => page.section.test(s.title)) : all;
  const sectionNames = sections.map((s) => s.title);
  // The Scratchpad gets everything that isn't one of the sections listed on the first tab.
  const listed = new Set(sections.filter((s) => page.section || s.entries.length).map((s) => s.title));
  const blocks = parseBlocks(content).filter((b) => b.title === null || !listed.has(b.title));
  // Each entry shows every field in the page's order, including any it doesn't have yet.
  for (const entry of sections.flatMap((s) => s.entries)) {
    const intro = entry.fields.filter((f) => f.label === null);
    entry.fields = intro.concat(
      page.fields.flatMap((spec) => {
        const found = entry.fields.filter((f) => f.label !== null && spec.match.test(f.label));
        const fields = found.length ? found : [{ label: spec.label, line: entry.line, value: '', missing: true }];
        // Fields with their own controls go by the page's label, and say if their value
        // is one the control can show.
        return spec.kind ? fields.map((f) => Object.assign(f, { label: spec.label, kind: spec.kind, valid: isValidEventValue(spec.kind, f.value) })) : fields;
      })
    );
  }
  if (name === 'events') {
    // The file's own headings don't matter here: events are listed by date.
    const events = sections.flatMap((s) => s.entries).map((entry) => Object.assign(entry, eventTiming(eventDateOf(entry), today), { progress: eventProgress(entry) }));
    const byStart = (a, b) => (a.start || a.end ? 0 : 1) - (b.start || b.end ? 0 : 1) || (a.start || a.end || '').localeCompare(b.start || b.end || '');
    const upcoming = events.filter((e) => !e.past).sort(byStart);
    const past = events.filter((e) => e.past).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
    return Object.assign(base, {
      folder,
      file: page.file,
      content,
      statuses,
      todos: scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder, file: page.file })),
      sections: upcoming.length ? [{ title: 'Upcoming Events', entries: upcoming }] : [],
      // A new event goes at the end of the file's last heading.
      sectionNames: sectionNames.slice(-1),
      past,
      blocks,
      others: await otherNetworkingTitles(name),
    });
  }
  return Object.assign(base, {
    folder,
    file: page.file,
    content,
    statuses,
    todos: scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder, file: page.file })),
    sections: sections.filter((s) => s.entries.length),
    sectionNames,
    past: [],
    blocks,
    others: await otherNetworkingTitles(name),
  });
}

// The entry names on the other Networking pages, so a [[#reference]] can find its way there.
async function otherNetworkingTitles(name) {
  const others = [];
  for (const other of Object.keys(NETWORKING).filter((key) => key !== name)) {
    const page = NETWORKING[other];
    const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
    if (content === null) continue;
    const sections = parseEntries(content, page.level).filter((s) => !page.section || page.section.test(s.title));
    others.push({ page: other, titles: sections.flatMap((s) => s.entries.map((e) => e.title)) });
  }
  return others;
}

const pageOfFolder = (folder) => (folder.startsWith(NETWORKING_PREFIX) ? networkingPage(folder.slice(NETWORKING_PREFIX.length)) : null);
const NOT_FOUND = { code: 404, body: { error: 'File not found.' } };

// Saves one field. `label` is set when the entry doesn't have that field yet.
function saveEntryField({ folder, file, line, from, to, label }) {
  const page = pageOfFolder(folder);
  if (!page) return NOT_FOUND;
  const isField = isNetworkingField(page);
  if (label !== null && !isField(label)) return { code: 400, body: { error: 'Invalid request' } };
  return updateProjectFile(folder, file, (content) =>
    label === null ? setEntryField(content, page.level, isField, line, from, to) : addEntryField(content, page.level, isField, line, label, to)
  );
}

function saveNewEntry(body) {
  const page = pageOfFolder(body.folder);
  if (!page) return NOT_FOUND;
  if (page.section && !page.section.test(body.section)) return { code: 400, body: { error: 'Invalid request' } };
  // An entry goes under a `##` heading, so a file with none can't take one yet.
  if (!body.section) return { code: 400, body: { error: `${page.file} needs a ## heading to add ${page.noun}s under.` } };
  // Fields with their own controls start on one line, with Yes/No ones set to No.
  const labels = page.fields.map((f) => (f.kind ? { line: f.kind === 'yesno' ? `**${f.label}**: No` : `**${f.label}**:` } : f.label));
  return addNamed(body, body.title, (content, text) => addEntry(content, page.level, body.section, text, labels));
}

function deleteEntry({ folder, file, line, title }) {
  const page = pageOfFolder(folder);
  if (!page) return NOT_FOUND;
  return updateProjectFile(folder, file, (content) => removeEntry(content, page.level, line, title));
}

// How setInlineField finds the events field at `at` in the page's order, and where it goes.
function eventFieldTarget(at) {
  const fields = NETWORKING.events.fields;
  const earlier = fields.slice(0, at);
  return { label: fields[at].label, matches: (label) => fields[at].match.test(label), before: (label) => earlier.some((f) => f.match.test(label)) };
}

// Saves an event's date or Yes/No field, on one line. Dates arrive in the DATEFORMAT and are
// stored as YYYY-MM-DD. Only Event Date can have an end date, for an event of several days.
async function saveEventField({ line, title, label, start = '', end = '', value = '' }) {
  const page = NETWORKING.events;
  const at = page.fields.findIndex((f) => f.kind && f.label === label);
  if (at === -1) return { code: 400, body: { error: 'Invalid request' } };
  const { kind } = page.fields[at];
  let text = value;
  if (kind === 'yesno') {
    if (!YES_NO.includes(value)) return { code: 400, body: { error: 'Choose Yes or No.' } };
  } else {
    const format = await readDateFormat();
    const first = start.trim();
    const last = kind === 'range' ? end.trim() : '';
    if (!first && last) return { code: 400, body: { error: 'Add the start date as well.' } };
    const error = [first, last].filter(Boolean).map((d) => dateError(d, format)).find(Boolean);
    if (error) return { code: 400, body: { error } };
    const from = first ? toStoredDate(first, format) : null;
    const to = last ? toStoredDate(last, format) : from;
    if (to && to < from) return { code: 400, body: { error: 'The end date is before the start date.' } };
    text = eventDateValue({ start: from, end: to });
  }
  return updateProjectFile(NETWORKING_PREFIX + 'events', page.file, (content) => setInlineField(content, page.level, isNetworkingField(page), line, title, eventFieldTarget(at), text));
}

// What Fix issues would write for each of an event's own-control fields that needs it, as
// { at, value } (at: its place in the page's fields), with the problems found. A value that
// can't be converted is left alone and shown as an error.
function eventFixes(entry) {
  const fields = NETWORKING.events.fields;
  const problems = [];
  const fixes = [];
  const fixable = (text, at, value) => {
    problems.push({ text, kind: 'fixable' });
    fixes.push({ at, value });
  };
  fields.forEach((spec, at) => {
    if (!spec.kind) return;
    const found = entry.fields.find((f) => f.label !== null && spec.match.test(f.label));
    if (!found) return fixable(`Missing ${spec.label}`, at, spec.kind === 'yesno' ? 'No' : '');
    const value = found.value.trim();
    const renamed = found.label !== spec.label;
    if (isValidEventValue(spec.kind, value)) {
      // Rewritten on one line under its new name, keeping the value.
      if (renamed || (value && !found.inline)) fixable(renamed ? `"${found.label}" should be called ${spec.label}` : `${spec.label} should be on the same line as its label`, at, value);
      return;
    }
    if (spec.kind === 'yesno') {
      const answer = /^(y|yes|true|x|done)$/i.test(value) ? 'Yes' : /^(n|no|false)$/i.test(value) ? 'No' : null;
      if (answer) return fixable(`${spec.label} "${value}" will become ${answer}`, at, answer);
      return problems.push({ text: `${spec.label} "${value}" isn't Yes or No`, kind: 'error' });
    }
    const old = readOldEventDate(value);
    if (old && (spec.kind === 'range' || old.start === old.end)) {
      const converted = eventDateValue(old);
      return fixable(`${spec.label} "${value}" will become ${converted || 'blank'}`, at, converted);
    }
    problems.push({ text: `${spec.label} "${value.replace(/\s*\n\s*/g, ' ')}" isn't a date the dashboard can read. Change it on the Events page.`, kind: 'error' });
  });
  return { problems, fixes };
}

// Every event whose date or Yes/No fields need changing, and how many were checked.
async function incompatibleEvents() {
  const page = NETWORKING.events;
  const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
  if (content === null) return { checked: 0, rows: [] };
  const entries = parseEntries(content, page.level, isNetworkingField(page)).flatMap((s) => s.entries);
  const rows = entries
    .map((entry) => ({ entry, problems: eventFixes(entry).problems }))
    .filter(({ problems }) => problems.length)
    .map(({ entry, problems }) => ({ name: entry.title, line: entry.line, problems }));
  return { checked: entries.length, rows };
}

// Fix issues for one event: writes each field eventFixes could work out.
async function fixEvent(line, title) {
  const page = NETWORKING.events;
  const isField = isNetworkingField(page);
  return updateProjectFile(NETWORKING_PREFIX + 'events', page.file, (content) => {
    const entry = parseEntries(content, page.level, isField).flatMap((s) => s.entries).find((e) => e.line === line && e.title === title);
    if (!entry) return null;
    // Each change leaves the heading's line where it was, so the entry can be found again.
    return eventFixes(entry).fixes.reduce((out, { at, value }) => out && setInlineField(out, page.level, isField, line, title, eventFieldTarget(at), value), content);
  });
}

const isFolder = (full) => fs.promises.stat(full).then((s) => s.isDirectory(), () => false);

const folderTentacle = (name) => name.replace(STATUS_PREFIX, '').split('_')[0];

// What's wrong with one of a project's files. An extra file is only held to the project
// rules if it looks like it's meant to follow them. Otherwise it's left alone, as notes and
// other documents belong in a project's folder too.
function projectFileProblems(project, file, content, { tentacles, leaders, taskLists }) {
  if (file !== primaryFile(project) && !hasDashboardStructure(content, taskLists)) return [];
  return projectProblems(content, folderTentacle(project.name), tentacles, leaders, taskLists, project.ongoing ? 'Ongoing' : 'Milestone');
}

// Every markdown file in a project folder that wouldn't work with the dashboard, any
// directory named in Options.csv that can't be used, any markdown loose in one of those
// directories, and how many of these were checked.
async function incompatibleProjects() {
  const [tentacles, leaders, projects, taskLists] = await Promise.all([readTentacles(), readLeaders(), listProjects(), readTaskLists()]);
  const rows = [];
  let checked = 0;
  for (const project of projects) {
    const { folder, directory } = project;
    const main = primaryFile(project);
    for (const file of project.files) {
      checked++;
      const problems = projectFileProblems(project, file, await readProjectFile(project, file), { tentacles, leaders, taskLists });
      // Without a file named after the project, its main file is only a guess, so the
      // main file's row offers the folder's files to choose from.
      const missing = file === main && missingMainFile(project);
      if (missing) problems.unshift(missing);
      if (problems.length) rows.push({ folder, directory, file, additional: file !== main, archived: isArchived(project), files: missing && missing.kind === 'fixable' ? project.files : undefined, problems });
    }
  }
  for (const dir of parseProjectDirs(await readOptions())) {
    const error = dir.error || ((await isFolder(dir.fullPath)) ? null : "This directory is in Options.csv but doesn't exist");
    if (error) {
      checked++;
      rows.push({ name: dir.name, problems: [{ text: error, kind: 'error' }] });
      continue;
    }
    for (const file of await listMarkdown(dir.fullPath)) {
      checked++;
      rows.push({ name: `${dir.name}/${file}`, problems: [unknownMarkdown()] });
    }
  }
  for (const entry of await oldLeaderEntries()) {
    checked++;
    rows.push({ name: entry.title, archiveLine: entry.line, file: path.basename(at().ARCHIVE_FILE), problems: [OLD_LEADER_PROBLEM] });
  }
  return { checked, rows, leaders: leaders.map(({ id, name }) => ({ id, name })) };
}

// Archive entries written before tentacles, whose leader is still called Owner.
const OLD_LEADER_PROBLEM = { text: `${OLD_LEADER_FIELD} should be ${LEADER_FIELD}`, kind: 'fixable' };
async function oldLeaderEntries() {
  const text = await readIfExists(at().ARCHIVE_FILE);
  if (text === null) return [];
  const lines = stripComments(text);
  return parseNamedEntries(text, ARCHIVE_FIELDS).filter((e) => e.fields.leader.line && !new RegExp(`\\*\\*\\s*${LEADER_FIELD}`, 'i').test(lines[e.fields.leader.line - 1]));
}

// Renames one archive entry's Owner field to Leader. `line` and `title` find the entry.
async function fixArchiveLeader(line, title) {
  const entry = (await oldLeaderEntries()).find((e) => e.line === line && e.title === title);
  if (!entry) return { code: 409, body: { error: 'That entry has changed in the file, so nothing was updated.' } };
  const content = await readIfExists(at().ARCHIVE_FILE);
  await writeFileSafely(at().ARCHIVE_FILE, renameOldLeader(content, entry.fields.leader.line));
  return { code: 200, body: { ok: true } };
}

// The name a project's main file should have, from the title in its folder name.
const mainFileName = (project) => `${projectTitle(project.name)}.md`;

// A problem if no file is named after the project. Fix issues can rename one of its files,
// unless the title can't be a file name.
function missingMainFile(project) {
  if (namedFile(project.name, project.files)) return null;
  const wanted = mainFileName(project);
  const kind = projectTitleError(fileTitle(wanted), 'name') ? 'error' : 'fixable';
  return { text: `No file called "${wanted}", so "${primaryFile(project)}" is used as the main file`, kind, choose: 'main' };
}

// Renames `file` to the project's main file name, along with its change logs so its
// history follows it.
async function renameToMain(project, file) {
  const target = mainFileName(project);
  if (project.files.some((f) => f.toLowerCase() === target.toLowerCase())) return { code: 409, body: { error: `This folder already has a file called "${target}".` } };
  const from = path.join(project.fullPath, file);
  const to = path.join(project.fullPath, target);
  try {
    await fs.promises.access(to);
    return { code: 409, body: { error: `This folder already has a file called "${target}".` } };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  await renameWithLogs(project.fullPath, file, target);
  return null;
}

// Renames a markdown file in `dir`, and every computer's change log for it, so its Changelog
// carries on under the new name.
async function renameWithLogs(dir, file, target) {
  await fs.promises.rename(path.join(dir, file), path.join(dir, target));
  const prefixLength = logName(file, '').length - '.log'.length;
  for (const name of (await fs.promises.readdir(dir)).filter(isLogOf(file))) {
    const device = name.slice(prefixLength, -'.log'.length);
    await fs.promises.rename(path.join(dir, name), path.join(dir, logName(target, device))).catch((err) => {
      console.error(`Could not rename the change log ${name}:`, err.message);
    });
  }
}

// ---------- opening a folder ----------

// The file browser for this computer: Explorer on Windows, Finder on a Mac, and on Linux
// whichever one xdg-open picks.
const FILE_BROWSER = { win32: 'explorer.exe', darwin: 'open' }[process.platform] || 'xdg-open';

// Opens a project's or tentacle's folder in the file browser of the computer running the
// server. Only folders the dashboard lists can be opened, never a path sent by the page.
async function openFolder({ folder }) {
  let dir = null;
  if (folder.startsWith(TENTACLE_PREFIX)) {
    const place = tentaclePlace(await readTentacles(), folder.slice(TENTACLE_PREFIX.length));
    dir = place && place.dir;
  } else {
    const project = (await listProjects()).find((p) => p.folder === folder);
    dir = project && project.fullPath;
  }
  if (!dir || !fs.existsSync(dir)) return NOT_FOUND;
  // Not waited for: Explorer reports failure even when it has opened the folder. A browser that
  // can't be started (no xdg-open, say) is logged rather than stopping the server.
  const child = spawn(FILE_BROWSER, [dir], { detached: true, stdio: 'ignore' });
  child.on('error', (err) => console.error(`Could not open ${dir} with ${FILE_BROWSER}:`, err.message));
  child.unref();
  return { code: 200, body: { ok: true } };
}

// ---------- core files ----------

// Files and folders the dashboard itself relies on that have been renamed. Each old name is
// listed on Compatibility's Core files page, and Fix issues renames it. A file's change logs
// are renamed with it, and the old name in its `# ` title is changed to the new one.
const CORE_RENAMES = [
  {
    key: 'options',
    folder: true,
    dir: () => currentRoot(),
    location: '',
    from: OLD_OPTIONS_FOLDER,
    to: OPTIONS_FOLDER,
    href: 'options.html',
    why: 'it holds the settings shown on the Options page',
  },
  {
    key: 'tentacles',
    folder: true,
    dir: () => currentRoot(),
    location: '',
    from: OLD_TENTACLES_FOLDER,
    to: TENTACLES_FOLDER,
    href: null,
    why: 'the organisations inside an entity are now called tentacles',
  },
  {
    key: 'contacts',
    dir: () => at().NETWORKING_DIR,
    location: '_Networking',
    from: OLD_CONTACTS_FILE,
    to: CONTACTS_FILE,
    href: 'networking.html?page=contacts',
    why: 'the Leads page is now called Contacts',
    title: ['Leads', 'Contacts'],
  },
];

async function incompatibleCoreFiles() {
  const rows = [];
  for (const rule of CORE_RENAMES) {
    const dir = rule.dir();
    if (!fs.existsSync(path.join(dir, rule.from))) continue;
    const both = fs.existsSync(path.join(dir, rule.to));
    const problem = both
      ? { text: `Both ${rule.from} and ${rule.to} exist. Move anything you still need from ${rule.from} into ${rule.to}, then delete ${rule.from}`, kind: 'error' }
      : { text: `${rule.from} should be called ${rule.to}, as ${rule.why}`, kind: 'fixable' };
    rows.push({ key: rule.key, name: rule.from, file: rule.from, directory: rule.location, href: rule.href, problems: [problem] });
  }
  return { checked: CORE_RENAMES.length, rows };
}

async function fixCoreFile(key, file) {
  const rule = CORE_RENAMES.find((r) => r.key === key && r.from === file);
  if (!rule) return { code: 400, body: { error: 'Invalid request' } };
  const dir = rule.dir();
  if (!fs.existsSync(path.join(dir, rule.from))) return NOT_FOUND;
  if (fs.existsSync(path.join(dir, rule.to))) return { code: 409, body: { error: `${rule.to} already exists, so ${rule.from} wasn't renamed.` } };
  if (rule.folder) {
    try {
      await fs.promises.rename(path.join(dir, rule.from), path.join(dir, rule.to));
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      return { code: 409, body: { error: `${rule.from} is in use by another program, so it couldn't be renamed. Close anything using it and try again.` } };
    }
    return { code: 200, body: { ok: true } };
  }
  const content = await readIfExists(path.join(dir, rule.from));
  await renameWithLogs(dir, rule.from, rule.to);
  const [before, after] = rule.title;
  // The old name is swapped wherever it appears in the file's `# ` title, so "# Leads list"
  // becomes "# Contacts list".
  const retitled = content.replace(new RegExp(`^(\\uFEFF?#[ \\t].*?)\\b${before}\\b`, 'm'), `$1${after}`);
  if (retitled !== content) await writeFileSafely(path.join(dir, rule.to), retitled);
  return { code: 200, body: { ok: true } };
}

// Folders inside the tentacles' folder that don't match a tentacle's place in Tentacles.csv.
async function unknownTentacleFolders(tentacles) {
  const known = new Set(tentacles.map((o) => tentacleChain(tentacles, o.id)).filter(Boolean).map((chain) => chain.join('/')));
  const unknown = [];
  const walk = async (dir, parents) => {
    for (const entry of await fs.promises.readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const chain = [...parents, entry.name];
      if (known.has(chain.join('/'))) await walk(path.join(dir, entry.name), chain);
      else unknown.push(chain.join('/'));
    }
  };
  try {
    await walk(at().TENTACLE_DIR, []);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return unknown;
}

// What's wrong with one of a tentacle's files, by the same rule as projectFileProblems.
function tentacleFileProblems(tentacle, files, file, content, taskLists) {
  if (file !== primaryTentacleFile(tentacle, files) && !hasDashboardStructure(content, taskLists)) return [unknownMarkdown()];
  return tentacleProblems(content, taskLists);
}

// Every tentacle file that wouldn't work with the dashboard, any markdown loose in
// the tentacles' folder, and how many of these were checked.
async function incompatibleTentacles() {
  const [tentacles, taskLists] = await Promise.all([readTentacles(), readTaskLists()]);
  const rows = [];
  let checked = tentacles.length;
  for (const tentacle of tentacles) {
    const place = tentaclePlace(tentacles, tentacle.id);
    if (!place) {
      rows.push({ name: tentacle.name, problems: [{ text: `Parent "${tentacle.parent}" isn't in Tentacles.csv`, kind: 'error' }] });
      continue;
    }
    const expected = `${tentacle.name}.md`;
    const files = await tentacleFiles(place.dir);
    if (!files.length) {
      // A name from a hand-edited Tentacles.csv might not be usable as a file name.
      const kind = projectTitleError(tentacle.name, 'name') ? 'error' : 'fixable';
      rows.push({ id: tentacle.id, name: tentacle.name, problems: [{ text: `No markdown file at ${path.basename(at().TENTACLE_DIR)}/${place.chain.join('/')}/${expected}`, kind }] });
      continue;
    }
    const file = primaryTentacleFile(tentacle, files);
    const problems = tentacleFileProblems(tentacle, files, file, await fs.promises.readFile(path.join(place.dir, file), 'utf8'), taskLists);
    if (file !== expected) problems.push({ text: `File is called "${file}", but Tentacles.csv expects "${expected}"`, kind: 'unexpected' });
    if (problems.length) rows.push({ id: tentacle.id, name: tentacle.name, file, problems });
    for (const extra of files.filter((f) => f !== file)) {
      checked++;
      const found = tentacleFileProblems(tentacle, files, extra, await fs.promises.readFile(path.join(place.dir, extra), 'utf8'), taskLists);
      if (found.length) rows.push({ id: tentacle.id, name: tentacle.name, file: extra, additional: true, problems: found });
    }
  }
  const loose = (await tentacleFiles(at().TENTACLE_DIR)).filter((file) => file !== path.basename(at().REPORTS_FILE));
  for (const file of loose) rows.push({ name: `${path.basename(at().TENTACLE_DIR)}/${file}`, problems: [unknownMarkdown()] });
  const folders = await unknownTentacleFolders(tentacles);
  for (const folder of folders) rows.push({ name: folder, problems: [{ text: "This folder isn't in Tentacles.csv", kind: 'unexpected' }] });
  return { checked: checked + loose.length + folders.length, rows };
}

// Fix issues for one of a project's files. `main` is the file chosen to become the main one
// when none is named after the project: it's renamed, then fixed in place of `requested`.
// `leader` is the leader chosen for the Leader field. Without one, a new Leader field is only
// filled in when there's just one leader it could be.
async function fixProject(folder, requested, main, leader) {
  const [tentacles, leaders, taskLists] = await Promise.all([readTentacles(), readLeaders(), readTaskLists()]);
  const findProject = async () => (await listProjects()).find((p) => p.folder === folder);
  let project = await findProject();
  if (!project) return NOT_FOUND;
  let file = requested || primaryFile(project);
  if (!project.files.includes(file)) return NOT_FOUND;
  if (leader && !leaders.some((l) => l.id === leader)) return { code: 400, body: { error: `"${leader}" isn't in Leaders.csv.` } };
  if (main && missingMainFile(project)) {
    if (!project.files.includes(main)) return NOT_FOUND;
    const refused = await renameToMain(project, main);
    if (refused) return refused;
    project = await findProject();
    file = primaryFile(project);
  }
  const tentacleId = folderTentacle(project.name);
  const folderTitle = tentacles.some((o) => o.id === tentacleId) ? `${tentacleId} ${projectTitle(project.name)}` : project.name.replace(STATUS_PREFIX, '').replace(/_/g, ' ');
  const details = {
    title: file === primaryFile(project) ? folderTitle : fileTitle(file),
    leader: leader || (leaders.length === 1 ? leaders[0].id : ''),
    projectType: project.ongoing ? 'Ongoing' : 'Milestone',
  };
  return updateProjectFile(folder, file, (content) => applyFixes(content, projectFileProblems(project, file, content, { tentacles, leaders, taskLists }), details));
}

const fileTitle = (file) => file.replace(/\.md$/i, '');

// Fix issues for a tentacle: creates its file if it has none, or fills in the one asked for.
async function fixTentacle(id, requested) {
  const [tentacles, taskLists] = await Promise.all([readTentacles(), readTaskLists()]);
  const place = tentaclePlace(tentacles, id);
  if (!place) return NOT_FOUND;
  const { tentacle, dir } = place;
  const files = await tentacleFiles(dir);
  if (files.length) {
    const main = primaryTentacleFile(tentacle, files);
    const file = requested || main;
    if (!files.includes(file)) return NOT_FOUND;
    return updateProjectFile(TENTACLE_PREFIX + id, file, (content) =>
      applyFixes(content, tentacleFileProblems(tentacle, files, file, content, taskLists), { title: file === main ? tentacle.name : fileTitle(file), tentacle: '' })
    );
  }
  const error = projectTitleError(tentacle.name, 'name');
  if (error) return { code: 400, body: { error } };
  await writeTentacleFile(dir, tentacle.name);
  return { code: 200, body: { ok: true } };
}

// Switches a project between active and inactive by changing its folder's prefix, which is
// where the status is kept. Archiving isn't done this way.
async function changeProjectStatus({ folder, status }) {
  const prefix = { active: '+', inactive: '-' }[status];
  if (!prefix || !Object.hasOwn({ active: 1, inactive: 1 }, status)) return { code: 400, body: { error: 'Choose active or inactive.' } };
  const project = (await listProjects()).find((p) => p.folder === folder);
  if (!project) return NOT_FOUND;
  if (!/^[+-]/.test(project.name)) return { code: 400, body: { error: 'Only active and inactive projects can be changed here.' } };
  if (project.name.startsWith(prefix)) return { code: 200, body: { ok: true, folder } };

  const renamed = prefix + project.name.slice(1);
  const target = path.join(path.dirname(project.fullPath), renamed);
  if (await isFolder(target)) return { code: 409, body: { error: `A folder called "${renamed}" already exists, so nothing was changed.` } };
  try {
    await fs.promises.rename(project.fullPath, target);
  } catch (err) {
    if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST'].includes(err.code)) throw err;
    return { code: 409, body: { error: 'The project folder is in use by another program, so its status couldn\'t be changed. Close anything using it and try again.' } };
  }
  return { code: 200, body: { ok: true, folder: folder.slice(0, folder.length - project.name.length) + renamed } };
}

// Each entry in _Archive.md, for the Archived filter of the first directory's projects list.
async function readArchivePage() {
  const text = await readIfExists(at().ARCHIVE_FILE);
  const entries = text === null ? [] : parseNamedEntries(text, ARCHIVE_FIELDS);
  const [tentacles, leaders, projects] = await Promise.all([readTentacles(), readLeaders(), listProjects('milestone')]);
  return {
    // Named like a document page's file, so the Raw view and double-click edits can save it.
    folder: ARCHIVE_FOLDER,
    file: path.basename(at().ARCHIVE_FILE),
    content: text || '',
    todos: [],
    location: path.basename(at().ARCHIVE_FILE),
    exists: text !== null,
    dateFormat: await readDateFormat(),
    tentacles: tentacles.map(({ id, name }) => ({ id, name })),
    leaders: leaders.map(({ id, name }) => ({ id, name })),
    dependencyChoices: await dependencyChoices(null, projects, entries),
    entries: entries.map(({ title, line, fields, notes }) => ({
      title,
      line,
      // Each field's line and value as written, for editing. A field the entry hasn't got
      // has no line.
      raw: Object.fromEntries(Object.entries(fields).map(([key, f]) => [key, { line: f.line, value: f.value }])),
      created: fields.created.value,
      closed: fields.closed.value,
      timeframes: timeframeEntries(fields.timeframe.value),
      dependency: fields.dependency.value,
      target: resolveDependency(fields.dependency.value, projects, entries),
      leader: fields.leader.value,
      notes,
    })),
  };
}

// An archive entry's lines under its heading, in the order archiveProject writes them.
const archiveLines = ({ created, closed, timeframe, dependency, leader }) => [
  `**${ARCHIVE_FIELDS.created}**: ${created}`,
  `**${ARCHIVE_FIELDS.closed}**: ${closed}`,
  `**${ARCHIVE_FIELDS.timeframe}**: ${timeframe}`,
  `**${ARCHIVE_FIELDS.dependency}**: ${dependency}`,
  `**${ARCHIVE_FIELDS.leader}** : ${leader}`,
];

// Adds an archive entry by hand, for a project that was never in the dashboard or whose
// record was lost. Dates arrive in the DATEFORMAT, and everything but the name can be empty.
async function saveArchiveEntry({ tentacle, title, created, closed, start, end, dependency, leader }) {
  const name = title.trim().replace(/\s+/g, ' ');
  const error = projectTitleError(name);
  if (error) return { code: 400, body: { error } };
  const [tentacles, leaders, entries, projects] = await Promise.all([readTentacles(), readLeaders(), readArchive(), listProjects('milestone')]);
  if (!tentacles.some((o) => o.id === tentacle)) return { code: 400, body: { error: 'Choose a tentacle.' } };
  if (leader && !leaders.some((l) => l.id === leader)) return { code: 400, body: { error: 'Choose a leader.' } };
  const full = `${tentacle} ${name}`;
  if (entries.some((e) => dependencyKey(e.title) === dependencyKey(full))) return { code: 409, body: { error: 'The archive already has an entry with that name.' } };
  if (dependency && !(await dependencyChoices(null, projects, entries)).some((c) => c.id === dependency)) return { code: 400, body: { error: "That can't be chosen as a dependency." } };

  const format = await readDateFormat();
  const dateProblem = [created, closed].map((d) => d.trim()).filter(Boolean).map((d) => dateError(d, format)).find(Boolean);
  if (dateProblem) return { code: 400, body: { error: dateProblem } };
  if (Boolean(start.trim()) !== Boolean(end.trim())) return { code: 400, body: { error: 'Give the timeframe both a start and an end, or neither.' } };
  const timeframeProblem = start.trim() && timeframeError(start, end, format);
  if (timeframeProblem) return { code: 400, body: { error: timeframeProblem } };
  const stored = (d) => (d.trim() ? toStoredDate(d.trim(), format) : '');

  await appendNamedEntry(at().ARCHIVE_FILE, 'Archive', full, archiveLines({
    created: stored(created),
    closed: stored(closed),
    timeframe: start.trim() ? `${stored(start)} to ${stored(end)}` : '',
    dependency,
    leader,
  }));
  return { code: 200, body: { ok: true } };
}

// Removes an archive entry, heading and all. Null from the edit means the entry has changed.
async function removeArchiveEntry({ line, title }) {
  const content = await readIfExists(at().ARCHIVE_FILE);
  if (content === null) return NOT_FOUND;
  const updated = removeNamedEntry(content, ARCHIVE_FIELDS, line, title);
  if (updated === null) return { code: 409, body: { error: 'That entry has changed in the file, so nothing was removed.' } };
  await writeFileSafely(at().ARCHIVE_FILE, updated);
  return { code: 200, body: { ok: true } };
}

// Adds an entry to the end of a file of `##` entries, creating the file with `heading` if
// it doesn't exist yet. An empty field is written without a space after its colon.
async function appendNamedEntry(full, heading, title, entryLines) {
  const lines = entryLines.map((line) => line.trimEnd());
  const existing = await readIfExists(full);
  if (existing !== null) return writeFileSafely(full, addNamedEntry(existing, title, lines));
  const content = addNamedEntry(`# ${heading}\n`, title, lines);
  await fs.promises.writeFile(full, content, { encoding: 'utf8', flag: 'wx' });
  await recordCreated(full, content);
}

// A header field's value as written, whichever way round its colon and bold are.
const createdValue = (content) => {
  const lines = stripComments(content);
  const line = parseHeader(content, []).createdLine;
  return line ? lines[line - 1].replace(/^[^:]*:\**/, '').trim() : '';
};

// Archives a project. Its Date Closed is set to today, which is enough to hide it everywhere.
// Then, by ARCHIVEMODE, its header is copied into _Archive.md (HEADERS), so a record stays
// once the folder is moved off this computer, or its folder is renamed to start with today's
// date (FULL).
async function archiveProject({ folder }) {
  const project = (await listProjects()).find((p) => p.folder === folder);
  if (!project) return NOT_FOUND;
  if (isArchived(project)) return { code: 409, body: { error: 'This project is already archived.' } };
  const mode = await readArchiveMode();
  const today = formatDate(new Date(), STORAGE_FORMAT);
  const renamed = `${today}_${project.name.replace(STATUS_PREFIX, '')}`;
  const target = path.join(path.dirname(project.fullPath), renamed);
  if (mode === 'FULL' && (await isFolder(target))) return { code: 409, body: { error: `A folder called "${renamed}" already exists, so nothing was changed.` } };
  // Two entries with one title would leave dependencies on it pointing at the first.
  const entryTitle = `${folderTentacle(project.name)} ${projectTitle(project.name)}`;
  if (mode === 'HEADERS' && (await readArchive()).some((e) => dependencyKey(e.title) === dependencyKey(entryTitle))) {
    return { code: 409, body: { error: `_Archive.md already has an entry called "${entryTitle}", so nothing was changed. Remove or rename it on the Archive Index first.` } };
  }

  const file = primaryFile(project);
  const result = await updateProjectFile(folder, file, (content) => setDateField(content, 'closed', today));
  if (result.code !== 200) return result;

  if (mode === 'HEADERS') {
    const content = await readProjectFile(project, file);
    const header = parseHeader(content, []);
    await appendNamedEntry(at().ARCHIVE_FILE, 'Archive', entryTitle, archiveLines({
      created: createdValue(content),
      closed: today,
      timeframe: header.timeframe.value,
      dependency: header.dependency.value,
      leader: header.leader ? header.leader.value : '',
    }));
    return { code: 200, body: { ok: true } };
  }
  try {
    await fs.promises.rename(project.fullPath, target);
  } catch (err) {
    if (!['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY', 'EEXIST'].includes(err.code)) throw err;
    // The Date Closed already archives it, so only the folder name is left to change.
    return { code: 200, body: { ok: true, warning: "The project is archived, but its folder is in use by another program so it couldn't be renamed. Close anything using it and rename it by hand." } };
  }
  return { code: 200, body: { ok: true } };
}

// ---------- the Incubator: ideas in _Incubator.md, each "## TENTACLEID Title" ----------

// An idea's title split into its tentacle's ID and the rest, or null if it doesn't start with
// an ID from Tentacles.csv.
function ideaTentacle(title, tentacles) {
  const [id, ...rest] = title.trim().split(/\s+/);
  const tentacle = tentacles.find((o) => o.id === id);
  return tentacle && rest.length ? { tentacle, name: rest.join(' ') } : null;
}

// Ideas still waiting: those without an Archived or Promoted date.
const waitingIdeas = (text) => (text === null ? [] : parseNamedEntries(text, INCUBATOR_FIELDS)).filter((e) => !e.fields.archived.value && !e.fields.promoted.value);

// The projects an idea can depend on: every project that isn't archived.
async function ideaDependencyChoices() {
  return (await dependencyChoices(null, await listProjects('milestone'), await dependableArchive())).map((c) => c.id);
}

// What the Incubator page shows, and the choices for its forms.
async function readIncubatorPage() {
  const text = await readIfExists(at().INCUBATOR_FILE);
  const [tentacles, leaders, dirs, projects, archive] = await Promise.all([readTentacles(), readLeaders(), readProjectDirs(), listProjects('milestone'), dependableArchive()]);
  // Each idea's text below its heading, as the Scratchpad edits a block's.
  const blocks = text === null ? [] : parseBlocks(text);
  return {
    // Named like a document page's file, so the Raw view and double-click edits can save it.
    folder: INCUBATOR_FOLDER,
    file: path.basename(at().INCUBATOR_FILE),
    content: text || '',
    todos: [],
    location: path.basename(at().INCUBATOR_FILE),
    exists: text !== null,
    dateFormat: await readDateFormat(),
    tentacles: tentacles.map(({ id, name }) => ({ id, name })),
    leaders: leaders.map(({ id, name }) => ({ id, name })),
    directories: dirs.map((d) => d.name),
    dependencyChoices: await ideaDependencyChoices(),
    ideas: waitingIdeas(text).map(({ title, line, fields, notes }) => {
      const split = ideaTentacle(title, tentacles);
      const block = blocks.find((b) => b.line === line);
      return {
        title,
        line,
        tentacleId: split ? split.tentacle.id : '',
        tentacleName: split ? split.tentacle.name : '',
        name: split ? split.name : title,
        dependency: fields.dependency.value,
        target: resolveDependency(fields.dependency.value, projects, archive),
        // The dependency's line and value as written, for editing. An idea without one has no line.
        raw: { line: fields.dependency.line, value: fields.dependency.value },
        body: block ? block.body : null,
        notes,
      };
    }),
  };
}

// Runs `transform` over _Incubator.md and saves the result. Null means the idea has changed.
async function updateIncubator(transform) {
  const content = await readIfExists(at().INCUBATOR_FILE);
  if (content === null) return NOT_FOUND;
  const updated = transform(content);
  if (updated === null) return { code: 409, body: { error: 'That idea has changed in the file, so nothing was updated.' } };
  if (updated !== content) await writeFileSafely(at().INCUBATOR_FILE, updated);
  return { code: 200, body: { ok: true } };
}

// Adds an idea at the end of _Incubator.md, which is created if it's missing. Its notes are
// kept as they're typed, but can't hold headings, which would start a new idea.
async function saveIdea({ title, tentacle, dependency, notes }) {
  const name = title.trim().replace(/\s+/g, ' ');
  const error = projectTitleError(name);
  if (error) return { code: 400, body: { error } };
  if (!(await readTentacles()).some((o) => o.id === tentacle)) return { code: 400, body: { error: 'Choose a tentacle.' } };
  if (dependency && !(await ideaDependencyChoices()).includes(dependency)) return { code: 400, body: { error: "That project can't be chosen as a dependency." } };
  const text = notes.replace(/\r\n?/g, '\n').trim();
  if (/^#{1,6}\s/m.test(text)) return { code: 400, body: { error: 'Notes can\'t contain headings. Take out the # at the start of the line.' } };
  await appendNamedEntry(at().INCUBATOR_FILE, 'Incubator', `${tentacle} ${name}`, [`**${INCUBATOR_FIELDS.dependency}**: ${dependency}`, ...(text ? ['', ...text.split('\n')] : [])]);
  return { code: 200, body: { ok: true } };
}

// Archive Idea: dates it as archived, which hides it, and leaves it in the file.
function archiveIdea({ line, title }) {
  const today = formatDate(new Date(), STORAGE_FORMAT);
  return updateIncubator((content) => addEntryMark(content, INCUBATOR_FIELDS, line, title, INCUBATOR_FIELDS.archived, today));
}

// Promote to Project: makes a Milestone project from the idea, with the timeframe and tentacle
// asked for, then dates the idea as promoted, which hides it. The directory only needs
// choosing when PROJECTS names more than one.
async function promoteIdea({ line, title, start, end, leader, directory }) {
  const text = await readIfExists(at().INCUBATOR_FILE);
  const idea = waitingIdeas(text).find((e) => e.line === line && e.title === title);
  if (!idea) return { code: 409, body: { error: 'That idea has changed in the file, so nothing was updated.' } };
  const split = ideaTentacle(title, await readTentacles());
  if (!split) return { code: 400, body: { error: "This idea's title doesn't start with a tentacle ID from Tentacles.csv. Correct it in _Incubator.md first." } };
  const format = await readDateFormat();
  const timeframeProblem = timeframeError(start, end, format);
  if (timeframeProblem) return { code: 400, body: { error: timeframeProblem } };
  const dirs = await readProjectDirs();
  if (dirs.length > 1 && !dirs.some((d) => d.name === directory)) return { code: 400, body: { error: 'Choose a directory.' } };

  const result = await makeProject(
    { title: split.name, tentacle: split.tentacle.id, leader, type: 'Milestone', notes: idea.notes, dir: dirs.length > 1 ? directory : undefined },
    { 'Active Timeframe': `${toStoredDate(start, format)} to ${toStoredDate(end, format)}`, 'Project Dependency': idea.fields.dependency.value }
  );
  if (result.code !== 200) return result;
  const today = formatDate(new Date(), STORAGE_FORMAT);
  await updateIncubator((content) => addEntryMark(content, INCUBATOR_FIELDS, line, title, INCUBATOR_FIELDS.promoted, today));
  return result;
}

// Adds a markdown file to a project or tentacle folder, with the fields and headings
// that folder's files need.
async function saveNewFile({ folder, name }) {
  const title = name.trim().replace(/\.md$/i, '').trim().replace(/\s+/g, ' ');
  const error = projectTitleError(title, 'name');
  if (error) return { code: 400, body: { error } };

  const today = formatDate(new Date(), STORAGE_FORMAT);
  const taskLists = await readTaskLists();
  let dir;
  let files;
  let content;
  if (folder.startsWith(TENTACLE_PREFIX)) {
    const place = tentaclePlace(await readTentacles(), folder.slice(TENTACLE_PREFIX.length));
    if (!place) return NOT_FOUND;
    dir = place.dir;
    files = await tentacleFiles(dir);
    content = newTentacleFile({ name: title, today, taskLists });
  } else {
    const project = (await listProjects()).find((p) => p.folder === folder);
    if (!project) return NOT_FOUND;
    dir = project.fullPath;
    files = project.files;
    const leader = parseHeader(await readProjectFile(project, primaryFile(project)), []).leader;
    content = newProjectFiles({
      tentacleId: folderTentacle(project.name),
      leaderTag: leader ? leader.value : '',
      title,
      notes: '',
      today,
      projectType: project.ongoing ? 'Ongoing' : 'Milestone',
      taskLists,
    }).content;
  }
  const file = `${title}.md`;
  if (files.some((f) => f.toLowerCase() === file.toLowerCase())) return { code: 409, body: { error: 'This folder already has a file with that name.' } };
  try {
    await fs.promises.writeFile(path.join(dir, file), content, { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') return { code: 409, body: { error: 'This folder already has a file with that name.' } };
    throw err;
  }
  await recordCreated(path.join(dir, file), content);
  return { code: 200, body: { ok: true, file } };
}

// Schedules a todo or gives it a deadline. An empty date removes it.
async function savePlanningDate({ folder, file, line, status, text, kind, date }) {
  const format = await readDateFormat();
  const value = date.trim();
  const error = dateError(value, format);
  if (error) return { code: 400, body: { error } };
  const statuses = await readStatuses();
  return updateProjectFile(folder, file, (content) => setRowDate(content, line, status, text, kind, value ? toStoredDate(value, format) : null, statuses));
}

// Changes a project's type. Its main file decides the type, whichever file is on screen.
async function changeProjectType({ folder, type }) {
  if (!PROJECT_TYPES.includes(type)) return { code: 400, body: { error: 'Choose a project type.' } };
  const project = (await listProjects()).find((p) => p.folder === folder);
  if (!project) return NOT_FOUND;
  if (project.ongoing === (type === 'Ongoing')) return { code: 200, body: { ok: true } };
  const [taskList] = await readTaskLists();
  let clash = false;
  const result = await updateProjectFile(folder, primaryFile(project), (content) => {
    const updated = setProjectType(content, type, taskList);
    clash = updated === null;
    return updated;
  });
  if (clash) return { code: 409, body: { error: `This project has both a Milestones and a ${taskList} heading, so nothing was changed. Rename one of them first.` } };
  return result;
}

// An event is found by its heading's line, sent as `key`, with its title as `file`.
const fixCompatibility = ({ type, key, file, main, leader }) => {
  // An archive entry is found by its heading's line, sent as archive:LINE, with its title as `file`.
  const archived = type === 'projects' && /^archive:([1-9]\d*)$/.exec(key);
  if (archived) return file ? fixArchiveLeader(Number(archived[1]), file) : { code: 400, body: { error: 'Invalid request' } };
  if (type === 'projects') return fixProject(key, file, main, leader);
  if (type === 'events') return /^[1-9]\d*$/.test(key) && file ? fixEvent(Number(key), file) : { code: 400, body: { error: 'Invalid request' } };
  if (type === 'core') return fixCoreFile(key, file);
  return fixTentacle(key, file);
};

// Projects and tentacles never reviewed, or flagged for review.
const wantsReview = (content) => {
  const { dates, flagged } = parseHeader(content, []);
  return !dates.reviewed.value || flagged;
};

// A tentacle as the Review page lists it, with its main file's content, or null if it has no file.
async function tentacleEntry(tentacles, tentacle) {
  const place = tentaclePlace(tentacles, tentacle.id);
  const files = place ? await tentacleFiles(place.dir) : [];
  if (!files.length) return null;
  const file = primaryTentacleFile(tentacle, files);
  const content = await fs.promises.readFile(path.join(place.dir, file), 'utf8');
  const parent = place.chain.length > 1 ? tentacles.find((o) => o.id === tentacle.parent).name : null;
  return { entry: { folder: TENTACLE_PREFIX + tentacle.id, file, id: tentacle.id, root: place.chain[0], name: tentacle.name, parentName: parent }, content };
}

async function collectToReview() {
  const projects = [];
  for (const project of await listProjects()) {
    if (isArchived(project)) continue;
    const file = primaryFile(project);
    if (wantsReview(await readProjectFile(project, file))) projects.push({ folder: project.folder, file });
  }
  const tentacles = await readTentacles();
  const due = [];
  for (const tentacle of tentacles) {
    const found = await tentacleEntry(tentacles, tentacle);
    if (found && wantsReview(found.content)) due.push(found.entry);
  }
  return { projects, tentacles: due };
}

// Every task with a WAITING type status, from the same places as the Todos sidebar, for the
// Review page's yellow box and the yellow number beside Review in the menu.
const waitingTasks = async () => (await collectTodos()).items.filter((item) => item.type === 'WAITING');

// ---------- review agenda ----------

const readAgenda = async () => {
  const text = await readIfExists(at().AGENDA_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseAgenda(text) };
};

// The one REVIEW target that isn't a tentacle or a project: the Dashboard's Overview.
const AGENDA_PAGE = 'Dashboard';
const isAgendaPage = (rule) => !rule.project && rule.tentacle.toLowerCase() === AGENDA_PAGE.toLowerCase();

// The Agenda tab's rows, with what each rule's dropdown can offer after the pipe.
async function readAgendaTable() {
  const [agenda, tentacles, dirs, projects] = await Promise.all([readAgenda(), readTentacles(), readProjectDirs(), listProjects()]);
  const option = (value, label) => ({ value, label: label || value });
  // A project's name is its tentacle's ID then its title, so the ID is the first word.
  const projectOptions = projects
    .filter((p) => !isArchived(p))
    .map((p) => projectName(p.name).split(' '))
    .map(([id, ...title]) => option(id + '#' + title.join(' '), id + ' ' + title.join(' ')))
    .sort((a, b) => a.label.localeCompare(b.label));
  const parents = tentacles.filter((o) => tentacles.some((child) => child.parent === o.id));
  return Object.assign(agenda, {
    choices: {
      REVIEW: [option(AGENDA_PAGE), ...tentacles.map((o) => option(o.id, o.id + ' (' + o.name + ')')), ...projectOptions],
      REVIEW_ALL: [
        option('TopTentacles', 'Top-level tentacles'),
        option('Tentacles', 'Tentacles (all with a parent)'),
        ...parents.map((o) => option('Tentacles#' + o.id, 'Tentacles of ' + o.id)),
        ...dirs.map((d) => option(d.name, d.name + ' (projects directory)')),
        ...AGENDA_GROUPS.filter((g) => !['TopTentacles', 'Tentacles'].includes(g)).map((g) => option(g)),
      ],
    },
  });
}

// The heading of a REVIEW_ALL card.
function agendaAllTitle(rule, tentacles) {
  const tentacle = rule.tentacle && tentacles.find((o) => o.id === rule.tentacle);
  if (rule.group === 'Tentacles') return tentacle ? 'Review All Tentacles of ' + tentacle.name : 'Review All Tentacles';
  const nouns = {
    TopTentacles: 'Top-level Tentacles',
    Active: 'Active Projects',
    Inactive: 'Inactive Projects',
    Scheduled: 'Scheduled Projects',
    Deadlines: 'Application Deadlines',
    Bookings: 'Upcoming Bookings',
    Incubator: 'Incubator Ideas',
    Catalogs: 'Catalogs',
  };
  return 'Review All ' + (nouns[rule.group] || rule.group);
}

// What one rule lists: { title, entries } (projects and tentacles to mark as reviewed),
// { title, links } (pages to look at, with an optional date or note) or { title, error }.
// `live` is every non-archived project with its main file's content.
async function agendaCard(rule, { tentacles, live, dirs, events, today }) {
  const eventLink = (title, date, end) => ({ label: title, href: 'networking.html?page=events#' + encodeURIComponent(title), date, end: end || null });
  if (rule.kind === 'review' && isAgendaPage(rule)) return { title: 'Review Dashboard', links: [{ label: 'Dashboard', href: 'home.html' }] };
  const projectEntry = ({ project, file, content }) => ({ entry: { folder: project.folder, file }, content });
  const tentacleEntries = async (list) => (await Promise.all(list.map((o) => tentacleEntry(tentacles, o)))).filter(Boolean);
  if (rule.kind === 'review') {
    const tentacle = tentacles.find((o) => o.id === rule.tentacle);
    if (!rule.project) {
      const found = tentacle && (await tentacleEntry(tentacles, tentacle));
      if (found) return { title: 'Review Tentacle: ' + tentacle.name, entries: [found] };
      return { title: 'Review Tentacle: ' + rule.tentacle, error: "Can't find a tentacle called " + rule.tentacle + '.' };
    }
    // Matched as a Project Dependency is: the tentacle's ID and the title, ignoring case and spacing.
    const key = dependencyKey(rule.tentacle + ' ' + rule.project);
    const match = live.find(({ project }) => dependencyKey(projectName(project.name)) === key);
    if (match) return { title: 'Review Project: ' + rule.project, entries: [projectEntry(match)] };
    return { title: 'Review Project: ' + rule.project, error: "Can't find a project called " + rule.tentacle + ' ' + rule.project + '.' };
  }
  const title = agendaAllTitle(rule, tentacles);
  switch (rule.group) {
    case 'TopTentacles':
      return { title, entries: await tentacleEntries(tentacles.filter((o) => !o.parent)) };
    case 'Tentacles': {
      if (rule.tentacle && !tentacles.some((o) => o.id === rule.tentacle)) return { title, error: "Can't find a tentacle called " + rule.tentacle + '.' };
      // Anything with a parent, or only those somewhere under the named tentacle.
      const under = (o) => o.parent && (!rule.tentacle || (tentacleChain(tentacles, o.id) || []).slice(0, -1).includes(rule.tentacle));
      return { title, entries: await tentacleEntries(tentacles.filter(under)) };
    }
    case 'Active':
    case 'Inactive': {
      const prefix = rule.group === 'Active' ? '+' : '-';
      return { title, entries: live.filter(({ project }) => project.name.startsWith(prefix)).map(projectEntry) };
    }
    case 'Scheduled':
      return { title, entries: live.filter(({ project, content }) => !project.ongoing && runningTimeframes(content, today).length).map(projectEntry) };
    case 'Deadlines':
      return { title, links: events.filter((e) => e.deadline && e.deadline >= today).map((e) => eventLink(e.title, e.deadline)) };
    case 'Bookings':
      return { title, links: events.filter((e) => e.booked && (e.end || e.start) >= today).map((e) => eventLink(e.title, e.start, e.end)) };
    case 'Incubator':
      return { title, links: waitingIdeas(await readIfExists(at().INCUBATOR_FILE)).map((idea) => ({ label: idea.title, href: 'incubator.html' })) };
    case 'Catalogs':
      return {
        title,
        links: (await collectCatalogs()).catalogs.map((c) => ({ label: c.name, href: 'catalog.html?file=' + encodeURIComponent(c.file), meta: c.count + (c.count === 1 ? ' record' : ' records') })),
      };
    default: {
      const dir = dirs.find((d) => d.name.toLowerCase() === rule.group.toLowerCase());
      if (!dir) return { title, error: `"${rule.group}" isn't a review group or a project directory. Use one of ` + AGENDA_GROUPS.concat(dirs.map((d) => d.name)).join(', ') + '.' };
      // The first directory's projects have no prefix, so they're the ones in no other directory.
      const inDir = ({ project }) => (dir.prefix ? project.folder.startsWith(dir.prefix) : !dirs.some((d) => d.prefix && project.folder.startsWith(d.prefix)));
      return { title: 'Review All ' + dir.name, entries: live.filter(inDir).map(projectEntry) };
    }
  }
}

// The agenda as the Review page shows it: text items in one list, and a card per rule. Each
// project and tentacle says when it was last reviewed, and whether that was since the last
// logged review.
async function collectAgenda(lastReview) {
  const { exists, rows } = await readAgenda();
  const indexed = rows.map((row, index) => Object.assign({ index }, row));
  const text = indexed.filter((row) => row.type !== 'rule');
  const rules = indexed.filter((row) => row.type === 'rule');
  if (!rules.length) return { exists, text, cards: [] };

  const today = formatDate(new Date(), STORAGE_FORMAT);
  const [tentacles, dirs, events, projects] = await Promise.all([readTentacles(), readProjectDirs(), timelineEvents(), listProjects()]);
  const live = [];
  for (const project of projects.filter((p) => !isArchived(p))) {
    const file = primaryFile(project);
    live.push({ project, file, content: await readProjectFile(project, file) });
  }
  const context = { tentacles, live, dirs, events, today };
  const cards = [];
  for (const row of rules) {
    const rule = parseAgendaRule(row.item);
    const card = rule ? await agendaCard(rule, context) : { title: row.item, error: "This rule can't be read." };
    const entries = (card.entries || []).map(({ entry, content }) => {
      const reviewed = parseHeader(content, []).dates.reviewed.value || '';
      return Object.assign({}, entry, { reviewed, done: Boolean(reviewed) && (!lastReview || reviewed >= lastReview) });
    });
    cards.push(Object.assign(row, { title: card.title, error: card.error || null, entries, links: card.links || [] }));
  }
  return { exists, text, cards };
}

const isAgendaRow = (body) =>
  ['add', 'update', 'delete'].includes(body.action) &&
  (body.action === 'add' || (Number.isInteger(body.index) && body.index >= 0 && typeof body.fromItem === 'string')) &&
  (body.action === 'delete' || ['type', 'item'].every((field) => typeof body[field] === 'string')) &&
  (body.checked === undefined || typeof body.checked === 'string');
const isAgendaCheck = (body) => Number.isInteger(body.index) && body.index >= 0 && typeof body.item === 'string' && typeof body.checked === 'boolean';

const saveAgendaRow = (body) => editLabelFile(at().AGENDA_FILE, AGENDA_HEADER, editAgendaCsv, body);

// Ticks or unticks an item on the Review page, leaving its type and text as they are.
async function checkAgendaItem({ index, item, checked }) {
  const row = (await readAgenda()).rows[index];
  if (!row || row.item !== item) return { code: 409, body: { error: 'That agenda item has changed in the file, so nothing was updated.' } };
  return saveAgendaRow({ action: 'update', index, fromItem: item, type: row.type, item, checked: String(checked) });
}

// Logging a review starts the next agenda with nothing ticked.
async function uncheckAgenda() {
  const text = await readIfExists(at().AGENDA_FILE);
  if (text === null) return;
  const rows = parseAgenda(text);
  let after = text;
  for (const [index, row] of rows.entries()) {
    if (!row.checked) continue;
    const result = editAgendaCsv(after, { action: 'update', index, fromItem: row.item, type: row.type, item: row.item, checked: 'false' });
    if (result.error) return;
    after = result.text;
  }
  if (after !== text) await writeFileSafely(at().AGENDA_FILE, after);
}

// Reviewing also takes away any Flagged for Review.
function markReviewed({ folder, file }) {
  const today = formatDate(new Date(), STORAGE_FORMAT);
  return updateProjectFile(folder, file, (content) => setReviewFlag(setDateField(content, 'reviewed', today), false));
}

const flagForReview = ({ folder, file, on }) => updateProjectFile(folder, file, (content) => setReviewFlag(content, on));

// Every markdown file of every tentacle.
async function allTentacleFiles() {
  const tentacles = await readTentacles();
  const files = [];
  for (const tentacle of tentacles) {
    const place = tentaclePlace(tentacles, tentacle.id);
    if (!place) continue;
    for (const file of await tentacleFiles(place.dir)) {
      const full = path.join(place.dir, file);
      files.push({ folder: TENTACLE_PREFIX + tentacle.id, file, full, name: tentacle.name, content: await fs.promises.readFile(full, 'utf8') });
    }
  }
  return files;
}

// The Contacts and Events files. `entryAt` finds the contact or event a line belongs to.
async function networkingFiles() {
  const files = [];
  for (const [name, page] of Object.entries(NETWORKING)) {
    const full = path.join(at().NETWORKING_DIR, page.file);
    const content = await readIfExists(full);
    if (content === null) continue;
    // Finds the entry a line is in. It's worked out from given text, as a review takes
    // archived tasks out of the file before it looks for done ones.
    const entriesIn = (text) => {
      const sections = parseEntries(text, page.level);
      const entries = (page.section ? sections.filter((s) => page.section.test(s.title)) : sections).flatMap((s) => s.entries);
      return (line) => entries.find((e) => line > e.line && line <= e.end) || null;
    };
    files.push({ folder: NETWORKING_PREFIX + name, file: page.file, full, name: page.title, content, entryAt: entriesIn(content), entriesIn });
  }
  return files;
}

// Every file a review covers. `sourceOf` names where a line came from, or gives null if the
// line isn't part of anything to review. Projects are named by their folder instead.
async function reviewableFiles() {
  const tentacles = (await allTentacleFiles()).map((f) => Object.assign(f, { sourceOf: () => f.name }));
  // `sourceIn` gives the same for another version of the file's text.
  const networking = (await networkingFiles()).map((f) => {
    const sourceIn = (text) => {
      const entryAt = text === f.content ? f.entryAt : f.entriesIn(text);
      return (line) => {
        const entry = entryAt(line);
        return entry ? `${f.name}: ${entry.title}` : null;
      };
    };
    return Object.assign(f, { sourceOf: sourceIn(f.content), sourceIn });
  });
  return [...(await liveProjectFiles()), ...tentacles, ...networking];
}

const doneRows = (content, match, sourceOf) => findTodos(content, match).filter((item) => item.type === 'DONE' && (!sourceOf || sourceOf(item.line) !== null));

// Every DONE type item a review would archive, with the date from its CLOSED line, if any.
async function doneItems(statuses) {
  const match = createMatcher(statuses);
  const found = [];
  for (const { folder, file, content, sourceOf } of await reviewableFiles()) {
    for (const item of doneRows(content, match, sourceOf)) {
      const stamp = item.dates.find((d) => d.kind === 'CLOSED');
      found.push({ item, folder, file, closed: stamp ? stamp.value.slice(0, 10) : null, source: sourceOf ? sourceOf(item.line) : undefined });
    }
  }
  return found;
}

// Closed since the last review. Without a review, or a CLOSED date, it can't be shown to be older.
const closedSince = (closed, lastReview) => !lastReview || !closed || closed >= lastReview;

const readLastReview = async () => {
  const review = await readIfExists(at().REVIEW_FILE);
  return review === null ? null : lastReviewDate(review);
};

// DONE type items closed since the last review, grouped by status in CSV order.
// The DONE type items the Review page lists, and the menu counts beside Review.
const doneSinceReview = async (statuses, lastReview) => (await doneItems(statuses)).filter(({ closed }) => closedSince(closed, lastReview));

async function collectWeeklyReview() {
  const statuses = await readStatuses();
  const lastReview = await readLastReview();
  const doneStatuses = statuses.filter((s) => s.type === 'DONE');

  const groups = new Map(doneStatuses.map((s) => [s.name, []]));
  const done = await doneItems(statuses);
  for (const { item, folder, file, closed, source } of done) {
    if (closedSince(closed, lastReview)) groups.get(item.status).push({ text: item.text, folder, file, closed, source });
  }
  return {
    lastReview,
    totalDone: done.length,
    archiveTo: statuses.find((s) => s.type === 'ARCHIVED').name,
    groups: doneStatuses.filter((s) => groups.get(s.name).length).map((s) => ({ status: s.name, items: groups.get(s.name) })),
    toReview: await collectToReview(),
    waiting: await waitingTasks(),
    statuses,
    agenda: await collectAgenda(lastReview),
    dateFormat: await readDateFormat(),
  };
}

// ---------- reports ----------

// True if any of a file's Active Timeframe entries overlaps `from` to `to`.
const scheduledBetween = (content, from, to) =>
  parseTimeframes(parseHeader(content, []).timeframe.value, STORAGE_FORMAT).ranges.some((r) => {
    const [start, end] = r.raw.split(/\s+to\s+/i);
    return start <= to && end >= from;
  });

const countOf = (items, test) => items.filter(test).length;

// The names of milestones with at least one row, all of them finished, archived or cancelled.
function finishedMilestones(content, statuses) {
  const rows = new Map();
  for (const row of milestoneRows(content, statuses)) {
    if (!rows.has(row.milestone)) rows.set(row.milestone, []);
    rows.get(row.milestone).push(row);
  }
  return [...rows].filter(([, list]) => !list.some(isIncomplete)).map(([name]) => name);
}

// How many of the latest Plan's focus items are done: a task finished since, or a milestone
// with nothing left in it. Both null when there's no Plan made since the last review.
async function planFollowThrough(statuses, done, lastReview, projectContents) {
  const text = await readIfExists(at().FOCUS_FILE);
  const planned = text === null ? null : lastReviewDate(text);
  if (!planned || (lastReview && planned < lastReview)) return { planItems: null, planDone: null };
  const finished = new Set(done.map((d) => focusKey(d.item.editText || '')));
  for (const content of projectContents) finishedMilestones(content, statuses).forEach((name) => finished.add(focusKey(name)));
  const items = (await readLatestFocus()).flatMap((entry) => entry.items.map(focusKey));
  return { planItems: items.length, planDone: countOf(items, (item) => finished.has(item)) };
}

// Non-empty lines in the wins text, so each bullet counts once.
const winCount = (wins) => wins.split('\n').filter((line) => line.trim()).length;

// The figures logged to Reports.md with each review. The review period runs from the last
// review to today, or covers the last ROUNDUP days for a first review.
async function measureReport(statuses, lastReview, today, wins) {
  const [projects, todos, checkboxes, interval, done] = await Promise.all([listProjects(), collectTodos(), collectTodos(scanLines), readRoundupDays(), doneItems(statuses)]);
  const from = lastReview || shiftDate(today, -interval);
  const recent = done.filter((d) => closedSince(d.closed, lastReview));
  const moved = new Set(recent.map((d) => d.folder));
  let scheduled = 0;
  const liveContents = [];
  for (const project of projects) {
    const content = await readProjectFile(project, primaryFile(project));
    // As on the Timeline: every Milestone project, whatever its status.
    if (!project.ongoing && scheduledBetween(content, from, today)) scheduled++;
    if (!isArchived(project)) liveContents.push(content);
  }
  const active = projects.filter((p) => !isArchived(p) && p.name.startsWith('+'));
  // Only rows with a status: an untagged checkbox in a note isn't a task until it's given one.
  const open = todos.items.filter(isIncomplete);
  const ofType = (type) => countOf(open, (item) => item.type === type);
  return Object.assign(
    {
      completed: recent.length,
      assigned: ofType('ASSIGNED'),
      waiting: ofType('WAITING'),
      unassigned: ofType('UNASSIGNED'),
      overdue: countOf(checkboxes.items, (item) => isOpenTask(item) && taskDue(item) && taskDue(item).date < today),
      active: active.length,
      // Active, but nothing in them finished this period.
      stalled: countOf(active, (p) => !moved.has(p.folder)),
      scheduled,
      wins: winCount(wins),
    },
    await planFollowThrough(statuses, done, lastReview, liveContents)
  );
}

async function collectReports() {
  const text = await readIfExists(at().REPORTS_FILE);
  return {
    fields: REPORT_FIELDS,
    reports: text === null ? [] : parseReports(text),
    exists: text !== null,
    interval: await readRoundupDays(), // a review within this many days of the last is on time
    dateFormat: await readDateFormat(),
  };
}

// Logs the wins and moves every DONE type item to the first ARCHIVED status, and adds the
// period's figures to Reports.md. Everything is worked out first, and if any write fails the
// files already changed are put back.
async function submitWeeklyReview({ wins }) {
  const text = wins.replace(/\r\n?/g, '\n').trim();
  if (!text) return { code: 400, body: { error: 'Add at least one win first.' } };

  const statuses = await readStatuses();
  const match = createMatcher(statuses);
  const target = statuses.find((s) => s.type === 'ARCHIVED').name;
  const today = formatDate(new Date(), STORAGE_FORMAT);
  const figures = await measureReport(statuses, await readLastReview(), today, text);

  const changes = [];
  const taken = []; // { file, rows } for each file with tasks moving to the Task Archive
  let archived = 0;
  for (const f of await reviewableFiles()) {
    // First, tasks that were already ARCHIVED leave for _Task_Archive.md...
    const keep = f.sourceOf ? (line) => f.sourceOf(line) !== null : undefined;
    const took = takeArchivedRows(f.content, statuses, keep);
    if (took.rows.length) taken.push({ file: f, rows: took.rows });
    // ...then the done ones are archived in their place, so they stay until the next review.
    let after = took.markdown;
    const sourceOf = f.sourceIn ? f.sourceIn(after) : f.sourceOf;
    for (const item of doneRows(after, match, sourceOf)) {
      after = replaceStatus(after, item.line, item.status, target, statuses);
      archived++;
    }
    if (after !== f.content) changes.push({ full: f.full, before: f.content, after });
  }
  const taskArchive = taken.length ? await readIfExists(at().TASK_ARCHIVE_FILE) : null;
  const updatedTaskArchive = taken.length ? addTaskArchive(taskArchive, today, await taskArchiveGroups(taken)) : null;

  const review = await readIfExists(at().REVIEW_FILE);
  const updatedReview = addReview(review === null ? `# Review\n**Created:** ${today}\n` : review, today, text);
  const reports = await readIfExists(at().REPORTS_FILE);
  const updatedReports = addReport(reports || '', today, figures);

  const written = [];
  try {
    // The Task Archive is written before the tasks leave their files, so they're never lost.
    if (updatedTaskArchive !== null) {
      if (taskArchive === null) {
        await fs.promises.writeFile(at().TASK_ARCHIVE_FILE, updatedTaskArchive, { encoding: 'utf8', flag: 'wx' });
        await recordCreated(at().TASK_ARCHIVE_FILE, updatedTaskArchive);
      } else {
        await writeFileSafely(at().TASK_ARCHIVE_FILE, updatedTaskArchive);
      }
      written.push({ full: at().TASK_ARCHIVE_FILE, before: taskArchive });
    }
    for (const change of changes) {
      await writeFileSafely(change.full, change.after);
      written.push(change);
    }
    if (reports === null) {
      await fs.promises.mkdir(at().TENTACLE_DIR, { recursive: true });
      await fs.promises.writeFile(at().REPORTS_FILE, updatedReports, { encoding: 'utf8', flag: 'wx' });
      await recordCreated(at().REPORTS_FILE, updatedReports);
    } else {
      await writeFileSafely(at().REPORTS_FILE, updatedReports);
    }
    written.push({ full: at().REPORTS_FILE, before: reports });
    if (review === null) {
      await fs.promises.mkdir(at().TIME_MANAGEMENT_DIR, { recursive: true });
      await fs.promises.writeFile(at().REVIEW_FILE, updatedReview, 'utf8');
      await recordCreated(at().REVIEW_FILE, updatedReview);
    } else {
      await writeFileSafely(at().REVIEW_FILE, updatedReview);
    }
  } catch (err) {
    // A Reports.md or _Task_Archive.md this review created is removed again rather than left empty.
    for (const change of written) await (change.before === null ? fs.promises.unlink(change.full) : writeFileSafely(change.full, change.before)).catch(() => {});
    throw err;
  }
  // Last, as a failure here only leaves the ticks in place.
  await uncheckAgenda().catch(() => {});
  const moved = taken.reduce((n, t) => n + t.rows.length, 0);
  return { code: 200, body: { ok: true, archived, archivedTo: target, taskArchived: moved } };
}

// The files a review took archived tasks from, grouped for _Task_Archive.md: each tentacle
// with its own files' tasks and then each of its projects', and Contacts and Events on their
// own. Tentacles keep the order of Tentacles.csv, and anything else comes after.
async function taskArchiveGroups(taken) {
  const tentacles = await readTentacles();
  const projects = await listProjects();
  const groups = new Map();
  const groupOf = (heading) => {
    if (!groups.has(heading)) groups.set(heading, { heading, files: [], projects: [] });
    return groups.get(heading);
  };
  for (const { file: f, rows } of taken) {
    const entry = { file: f.file, rows };
    if (f.folder.startsWith(TENTACLE_PREFIX) || f.folder.startsWith(NETWORKING_PREFIX)) {
      groupOf(f.name).files.push(entry);
      continue;
    }
    const project = projects.find((p) => p.folder === f.folder);
    const group = groupOf(project ? await projectTentacleName(project, tentacles) : 'Projects');
    const title = projectTitle(f.folder) || f.folder;
    let place = group.projects.find((p) => p.title === title);
    if (!place) group.projects.push((place = { title, files: [] }));
    place.files.push(entry);
  }
  const order = tentacles.map((t) => t.name);
  const rank = (heading) => (order.includes(heading) ? order.indexOf(heading) : order.length);
  return [...groups.values()].sort((a, b) => rank(a.heading) - rank(b.heading));
}

// The Options page's Task Archive tab: the file as it is, to read.
async function readTaskArchive() {
  const text = await readIfExists(at().TASK_ARCHIVE_FILE);
  return { exists: text !== null, content: text || '', location: path.basename(at().TASK_ARCHIVE_FILE) };
}

// A task that becomes recurring for the first time is scheduled one period from today.
// Changing an existing period, or removing R, leaves its date alone.
async function changePriority({ folder, file, line, status, priority }) {
  const statuses = await readStatuses();
  const today = formatDate(new Date(), STORAGE_FORMAT);
  return updateProjectFile(folder, file, (content) => {
    const before = scanLines(content, createMatcher(statuses)).find((i) => i.line === line);
    const updated = setPriority(content, line, status, priority, statuses);
    const recur = priority && priority.match(RECUR_VALUE);
    if (updated === null || !recur || (before && before.recur)) return updated;
    return setPlanningDate(updated, line, 'SCHEDULED', addPeriod(today, Number(recur[1]), recur[2]));
  });
}

// Clicking a recurring task's status or tick box: its schedule moves on a period.
async function advanceRecurringTask({ folder, file, line, status, text }) {
  const statuses = await readStatuses();
  const today = formatDate(new Date(), STORAGE_FORMAT);
  return updateProjectFile(folder, file, (content) => advanceRecurring(content, line, status, text, statuses, today));
}

async function changeTentacle({ folder, file, line, from, to }) {
  const tentacles = await readTentacles();
  if (!tentacles.some((o) => o.id === to)) return { code: 400, body: { error: `"${to}" is not in Tentacles.csv.` } };
  return updateProjectFile(folder, file, (content) => setTentacle(content, line, from, to, tentacles));
}

async function changeLeader({ folder, file, line, from, to }) {
  const leaders = await readLeaders();
  if (!leaders.some((l) => l.id === to)) return { code: 400, body: { error: `"${to}" is not in Leaders.csv.` } };
  return updateProjectFile(folder, file, (content) => setLeader(content, line, from, to));
}

async function saveTimeframe({ folder, file, start, end }) {
  const format = await readDateFormat();
  const error = timeframeError(start, end, format);
  if (error) return { code: 400, body: { error } };
  const [from, to] = [toStoredDate(start, format), toStoredDate(end, format)];
  return updateProjectFile(folder, file, (content) => addTimeframe(content, from, to));
}

// Changes or removes one of a project's existing timeframes.
async function changeTimeframe({ folder, file, index, from, start, end, remove }) {
  if (remove) return updateProjectFile(folder, file, (content) => editTimeframe(content, index, from, null));
  const format = await readDateFormat();
  const error = timeframeError(start, end, format);
  if (error) return { code: 400, body: { error } };
  const entry = `${toStoredDate(start, format)} to ${toStoredDate(end, format)}`;
  return updateProjectFile(folder, file, (content) => editTimeframe(content, index, from, entry));
}

// Returns an error message, or null if `text` works as a single line of text.
function lineError(text) {
  if (!text) return 'Enter some text.';
  return /[\r\n]/.test(text) ? 'Keep this to a single line.' : null;
}

const RESERVED_ERROR = { code: 400, body: { error: 'That name is kept for another part of this page.' } };
async function isReservedBlock(folder, title) {
  if (isReservedTitle(title)) return true;
  const page = pageOfFolder(folder);
  if (page) return Boolean(page.section && page.section.test(title.trim()));
  if (!isTaskList(await readTaskLists(), title)) return false;
  return folder.startsWith(TENTACLE_PREFIX) || (await listProjects('ongoing')).some((p) => p.folder === folder);
}

async function saveText({ folder, file, kind, line, from, to }) {
  const text = to.trim();
  // A field's value can be emptied; everything else needs some text.
  const error = kind === 'value' && !text ? null : lineError(text);
  if (error) return { code: 400, body: { error } };
  if (kind === 'block' && (await isReservedBlock(folder, text))) return RESERVED_ERROR;
  const [statuses, tentacles] = await Promise.all([readStatuses(), readTentacles()]);
  return updateProjectFile(folder, file, (content) => editText(content, kind, line, from, text, statuses, tentacles));
}

// Replaces a whole file with the text from the Raw view, as long as it hasn't changed since
// the page loaded. Browsers hand back plain newlines, so the file's own line endings and
// any byte order mark are put back.
function saveRawFile({ folder, file, from, to }) {
  const plain = (text) => text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  return updateProjectFile(folder, file, (content) => {
    if (plain(content) !== plain(from)) return null;
    const eol = (content.match(/\r\n?|\n/) || ['\n'])[0];
    return (content.startsWith('﻿') ? '﻿' : '') + plain(to).replace(/\n/g, eol);
  });
}

function saveBlockBody({ folder, file, line, from, to }) {
  return updateProjectFile(folder, file, (content) => setBlockBody(content, line, from, to));
}

// Shared by the three "add something with a name" requests.
function addNamed(body, name, insert) {
  const text = name.trim();
  const error = lineError(text);
  if (error) return { code: 400, body: { error } };
  return updateProjectFile(body.folder, body.file, (content) => insert(content, text));
}

const saveNewMilestone = (body) => addNamed(body, body.title, addMilestone);
const deleteMilestone = (body) => updateProjectFile(body.folder, body.file, (content) => removeMilestone(content, body.line, body.title));
const saveNewItem = (body) => addNamed(body, body.text, (content, text) => addMilestoneItem(content, body.line, body.title, text));
const saveNewBlock = async (body) => ((await isReservedBlock(body.folder, body.title)) ? RESERVED_ERROR : addNamed(body, body.title, addBlock));
async function saveNewTask(body) {
  const list = (await readTaskLists()).find((name) => isTaskList([name], body.list));
  if (!list) return { code: 400, body: { error: 'Invalid request' } };
  return addNamed(body, body.text, (content, text) => addTask(content, text, list));
}

async function saveDependency({ folder, file, name }) {
  const choices = await dependencyChoices(folder, await listProjects('milestone'), await dependableArchive());
  if (name && !choices.some((c) => c.id === name)) {
    return { code: 400, body: { error: "That project can't be chosen as a dependency." } };
  }
  return updateProjectFile(folder, file, (content) => setDependency(content, name));
}

function saveMilestoneOrder({ folder, file, titles, from, to }) {
  return updateProjectFile(folder, file, (content) => moveMilestone(content, titles, from, to));
}

async function changeRow({ folder, file, line, status, text, action }) {
  const statuses = await readStatuses();
  const apply = action === 'delete' ? deleteRow : cancelRow;
  return updateProjectFile(folder, file, (content) => apply(content, line, status, text, statuses));
}

// ---------- the task row menu and the milestone menu ----------

async function moveTask({ folder, file, line, status, text, toLine, toTitle }) {
  const statuses = await readStatuses();
  return updateProjectFile(folder, file, (content) => moveRow(content, line, status, text, toLine, toTitle, statuses));
}

async function promoteTask({ folder, file, line, status, text }) {
  const title = text.replace(/~~/g, '').trim();
  const error = lineError(title) || (/[#[\]|]/.test(title) ? "A milestone's name can't contain # [ ] or |." : null);
  if (error) return { code: 400, body: { error } };
  const statuses = await readStatuses();
  return updateProjectFile(folder, file, (content) => promoteRow(content, line, status, text, statuses));
}

// What a link from inside `folder` names it by: a project's name, or a tentacle's ID.
async function linkTarget(folder) {
  if (folder.startsWith(TENTACLE_PREFIX)) return folder.slice(TENTACLE_PREFIX.length);
  const project = (await listProjects()).find((p) => p.folder === folder);
  return project ? projectName(project.name) : null;
}

// Create linked Scratchpad block: a "## <task text>" block, with the task's text made into a
// link to it. Not for text that's already a link, or that couldn't be one.
async function linkTaskToBlock({ folder, file, line, status, text }) {
  const title = text.trim();
  if (/[#[\]|]/.test(title)) return { code: 400, body: { error: "A task whose text has # [ ] or | in it can't link to a block." } };
  const target = await linkTarget(folder);
  if (!target) return { code: 400, body: { error: 'Linked blocks are only for project and tentacle pages.' } };
  const full = await editableFile(folder, file);
  if (!full) return NOT_FOUND;
  const existing = parseBlocks(await fs.promises.readFile(full, 'utf8')).some((b) => b.title !== null && b.title.trim().toLowerCase() === title.toLowerCase());
  if (existing) return { code: 409, body: { error: `There's already a block called "${title}".` } };
  const statuses = await readStatuses();
  return updateProjectFile(folder, file, (content) => linkRowToBlock(content, line, status, text, target, statuses));
}

// Mark all as done: every open task in the milestone moves to the first DONE status.
async function finishWholeMilestone({ folder, file, line, title }) {
  const statuses = await readStatuses();
  const done = (statuses.find((s) => s.type === 'DONE') || {}).name;
  if (!done) return { code: 400, body: { error: 'Status.csv has no DONE status.' } };
  return updateProjectFile(folder, file, (content) => finishMilestone(content, line, title, done, statuses, new Date()));
}

// Promote to new project: a Milestone project named after the milestone, in the same
// directory, for the same tentacle and tentacle, depending on this project. Its tasks go under
// "### Milestone 1", and the milestone leaves this project.
async function promoteMilestone({ folder, file, line, title }) {
  const project = (await listProjects()).find((p) => p.folder === folder);
  if (!project || file !== primaryFile(project)) return { code: 400, body: { error: "Only a project's main file can promote a milestone." } };
  const content = await readProjectFile(project, file);
  const body = milestoneBody(content, line, title);
  if (body === null) return { code: 409, body: { error: 'That milestone has changed in the file, so nothing was updated.' } };
  const leader = parseHeader(content, []).leader;
  if (!leader || !leader.value) return { code: 400, body: { error: "Choose this project's Leader first, so the new project has one too." } };
  const made = await makeProject(
    { title, tentacle: folderTentacle(project.name), leader: leader.value, type: 'Milestone', notes: '', dir: project.directory },
    { 'Project Dependency': projectName(project.name) },
    ['### Milestone 1', ...body]
  );
  if (made.code !== 200) return made;
  const removed = await updateProjectFile(folder, file, (text) => removeMilestone(text, line, title));
  return removed.code === 200 ? made : removed;
}

async function saveDate({ folder, file, field, value }) {
  const date = value.trim();
  const format = await readDateFormat();
  const error = dateError(date, format);
  if (error) return { code: 400, body: { error } };
  const stored = date ? toStoredDate(date, format) : '';
  return updateProjectFile(folder, file, (content) => setDateField(content, field, stored));
}

const createProject = (body) => makeProject(body);

// Creates a project's folder and main file. `header` holds values for other header fields,
// such as an Active Timeframe and Project Dependency from a promoted idea, and `milestones`
// any lines to put under ## Milestones, as a promoted milestone has.
async function makeProject(body, header = {}, milestones = []) {
  const title = body.title.trim().replace(/\s+/g, ' ');
  const error = projectTitleError(title);
  if (error) return { code: 400, body: { error } };
  const [tentacles, leaders] = await Promise.all([readTentacles(), readLeaders()]);
  if (!tentacles.some((o) => o.id === body.tentacle)) return { code: 400, body: { error: 'Choose a tentacle.' } };
  if (!leaders.some((l) => l.id === body.leader)) return { code: 400, body: { error: 'Choose a leader.' } };
  if (!PROJECT_TYPES.includes(body.type)) return { code: 400, body: { error: 'Choose a project type.' } };
  const dirs = await readProjectDirs();
  const directory = body.dir === undefined ? dirs[0] : dirs.find((d) => d.name === body.dir);
  if (!directory) return { code: 400, body: { error: 'Invalid request' } };

  const spec = newProjectFiles({
    projectType: body.type,
    taskLists: await readTaskLists(),
    tentacleId: body.tentacle,
    leaderTag: body.leader,
    title,
    notes: body.notes.replace(/\r\n?/g, '\n').trim(),
    today: formatDate(new Date(), STORAGE_FORMAT),
  });
  for (const [label, value] of Object.entries(header)) if (value) spec.content = setHeaderField(spec.content, label, value);
  if (milestones.length) spec.content = spec.content.replace(/## Milestones\n?$/, '## Milestones\n' + milestones.join('\n') + '\n');

  // The same project under a different status prefix still counts as a duplicate.
  const key = (folder) => folder.replace(STATUS_PREFIX, '').toLowerCase();
  const duplicate = (await listProjects()).some((p) => key(p.name) === key(spec.folder));
  if (duplicate) return { code: 409, body: { error: 'A project with that tentacle and title already exists.' } };

  const dir = path.resolve(directory.fullPath, spec.folder);
  if (!isInside(directory.fullPath, dir)) return { code: 400, body: { error: 'Invalid request' } };
  await fs.promises.mkdir(directory.fullPath, { recursive: true });
  await fs.promises.mkdir(dir);
  try {
    await fs.promises.writeFile(path.join(dir, spec.file), spec.content, 'utf8');
  } catch (err) {
    await fs.promises.rm(dir, { recursive: true, force: true });
    throw err;
  }
  await recordCreated(path.join(dir, spec.file), spec.content);
  return { code: 200, body: { ok: true, folder: directory.prefix + spec.folder } };
}

// What the Statuses tab lists, and what its dropdowns offer. Defaults can be chosen as a
// Next status, but only the file's own rows are listed.
async function readStatusTable() {
  const text = await readIfExists(at().STATUS_FILE);
  const rows = text === null ? [] : parseStatuses(text);
  return { exists: text !== null, rows, types: STATUS_TYPES, choices: withDefaultStatuses(rows).map((s) => s.name) };
}

async function readLeaderTable() {
  const text = await readIfExists(at().LEADERS_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseLeaders(text) };
}

async function readColourTable() {
  const text = await readIfExists(at().COLOURS_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseColours(text) };
}

// Applies one row's edit to a label file, creating the file if this is its first row.
async function editLabelFile(file, header, edit, body) {
  const existing = await readIfExists(file);
  const result = edit(existing && existing.trim() ? existing : `${header}\r\n`, body);
  if (result.error) return { code: 400, body: { error: result.error } };
  if (existing === null) {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, result.text, 'utf8');
  } else {
    await writeFileSafely(file, result.text);
  }
  return { code: 200, body: { ok: true } };
}

const saveStatusRow = (body) => editLabelFile(at().STATUS_FILE, 'Type,Name,Next', editStatusCsv, body);
const saveLeaderRow = (body) => editLabelFile(at().LEADERS_FILE, 'Tag,Name', editLeaderCsv, body);
const saveColourRow = (body) => editLabelFile(at().COLOURS_FILE, 'Name,Colour,Used for', editColourCsv, body);

async function saveOptions({ values }) {
  let text;
  try {
    text = await fs.promises.readFile(at().OPTIONS_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { code: 404, body: { error: 'Options.csv not found.' } };
    throw err;
  }
  const known = [...Object.keys(parseOptions(text)), ...Object.keys(SWITCH_OPTIONS), ...Object.keys(CHOICE_OPTIONS)];
  const updates = Object.fromEntries(Object.entries(values).filter(([key]) => known.includes(key)));
  const badSwitch = Object.keys(SWITCH_OPTIONS).find((key) => key in updates && !SWITCH_VALUES.includes(updates[key]));
  if (badSwitch) return { code: 400, body: { error: `${badSwitch} needs TRUE or FALSE.` } };
  const badChoice = Object.keys(CHOICE_OPTIONS).find((key) => key in updates && !CHOICE_OPTIONS[key].values.includes(updates[key]));
  if (badChoice) return { code: 400, body: { error: `${badChoice} needs one of ${CHOICE_OPTIONS[badChoice].values.join(', ')}.` } };
  if ('DATEFORMAT' in updates && !isUsableDateFormat(updates.DATEFORMAT)) {
    return { code: 400, body: { error: 'DATEFORMAT needs a year (YYYY or YY), a month (MM) and a day (DD).' } };
  }
  if ('ROUNDUP' in updates && !/^[1-9]\d*$/.test(updates.ROUNDUP)) {
    return { code: 400, body: { error: 'ROUNDUP needs a whole number of days, 1 or more.' } };
  }
  const dirError = 'PROJECTS' in updates && splitList(updates.PROJECTS).map(projectDirError).find(Boolean);
  if (dirError) return { code: 400, body: { error: `PROJECTS: ${dirError}` } };
  const reservedList = 'TASKLISTS' in updates && splitList(updates.TASKLISTS).find(isReservedTitle);
  if (reservedList) return { code: 400, body: { error: `TASKLISTS: "${reservedList}" is already used for its own section.` } };
  await writeFileSafely(at().OPTIONS_FILE, updateOptionsCsv(text, updates));
  return { code: 200, body: { ok: true } };
}

// What the first-time setup form still needs. It's needed if any expected CSV is missing, or
// no tentacle is at the top level of Tentacles.csv.
async function setupState() {
  const expected = setupFiles();
  const files = await Promise.all(expected.map(readIfExists));
  const missing = expected.filter((_, i) => files[i] === null);
  const [tentacles, leaders] = await Promise.all([readTentacles(), readLeaders()]);
  const tentacle = !tentacles.some((o) => !o.parent);
  return {
    needed: missing.length > 0 || tentacle,
    missing: missing.map((file) => `${path.basename(at().OPTIONS_DIR)}/${path.basename(file)}`),
    fields: { tentacle, leader: leaders.length === 0, dateFormat: missing.includes(at().OPTIONS_FILE) },
    dateFormats: SETUP_DATE_FORMATS,
  };
}

const badSetup = (error, code = 400) => ({ code, body: { error } });

// Creates whatever setupState says is missing, and never replaces an existing file. Each
// file is only created once the ones before it are done, so a failed attempt can be retried.
async function saveSetup(body) {
  const state = await setupState();
  if (!state.needed) return badSetup('Setup is already complete.', 409);
  const { fields, missing } = state;
  const tentacleName = cleanName(body.tentacleName || '');
  const tentacleId = (body.tentacleId || '').trim();
  const leaderName = cleanName(body.leaderName || '');
  if (fields.tentacle) {
    const error = tentacleError(tentacleName, tentacleId);
    if (error) return badSetup(error);
    if ((await readTentacles()).some((o) => o.id.toLowerCase() === tentacleId.toLowerCase())) {
      return badSetup(`A tentacle with the ID "${tentacleId}" already exists.`, 409);
    }
  }
  if (fields.leader && !leaderTag(leaderName)) return badSetup('Enter your name.');
  if (fields.dateFormat && !SETUP_DATE_FORMATS.includes(body.dateFormat)) return badSetup('Choose a date format.');

  await fs.promises.mkdir(at().OPTIONS_DIR, { recursive: true });
  const isMissing = (file) => missing.includes(`${path.basename(at().OPTIONS_DIR)}/${path.basename(file)}`);
  if (isMissing(at().OPTIONS_FILE)) {
    const text = newOptionsCsv({ dateFormat: body.dateFormat, roundup: DEFAULT_ROUNDUP_DAYS, projects: FALLBACK_PROJECT_DIRS, taskLists: FALLBACK_TASK_LISTS });
    await fs.promises.writeFile(at().OPTIONS_FILE, text, 'utf8');
    await fs.promises.mkdir(path.resolve(currentRoot(), FALLBACK_PROJECT_DIRS), { recursive: true });
  }
  if (isMissing(at().COLOURS_FILE)) await fs.promises.copyFile(DEFAULT_COLOURS_FILE, at().COLOURS_FILE);
  if (fields.leader) {
    const result = await saveLeaderRow({ action: 'add', name: leaderName });
    if (result.code !== 200) return result;
  }
  if (isMissing(at().STATUS_FILE)) {
    const [first] = await readLeaders();
    await fs.promises.writeFile(at().STATUS_FILE, newStatusCsv(first ? first.name : ''), 'utf8');
  }
  if (fields.tentacle) {
    try {
      await writeTentacleFile(path.join(at().TENTACLE_DIR, tentacleId), tentacleName);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err; // an existing file is simply kept
    }
    const existing = await readIfExists(at().TENTACLES_FILE);
    const text = appendTentacleCsv(existing && existing.trim() ? existing : 'id,Name,Parent\r\n', { id: tentacleId, name: tentacleName, parent: '' });
    if (existing === null) await fs.promises.writeFile(at().TENTACLES_FILE, text, 'utf8');
    else await writeFileSafely(at().TENTACLES_FILE, text);
  } else if (isMissing(at().TENTACLES_FILE)) {
    await fs.promises.writeFile(at().TENTACLES_FILE, 'id,Name,Parent\r\n', 'utf8');
  }
  return { code: 200, body: { ok: true } };
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
// ---------- catalogs ----------

// Every TAG_Name.csv in the _Catalogs folder, by name. Other files there are left alone.
async function listCatalogs() {
  let names;
  try {
    names = await fs.promises.readdir(at().CATALOGS_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names.map(parseCatalogFileName).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

const readCatalogFile = (catalog) => fs.promises.readFile(path.join(at().CATALOGS_DIR, catalog.file), 'utf8');

async function collectCatalogs() {
  const catalogs = await listCatalogs();
  return { catalogs: await Promise.all(catalogs.map(async (c) => Object.assign({ count: parseCatalog(await readCatalogFile(c)).rows.length }, c))) };
}

// A catalog by its exact file name among those listed, so no other file can be reached.
const findCatalog = async (file) => (await listCatalogs()).find((c) => c.file === file) || null;

async function readCatalog(file) {
  const catalog = await findCatalog(file);
  if (!catalog) return null;
  const { columns, rows } = parseCatalog(await readCatalogFile(catalog));
  return Object.assign({ columns, rows, dateColumns: columns.filter(isDateColumn), next: nextCatalogNumber(catalog.tag, rows), dateFormat: await readDateFormat() }, catalog);
}

// A new catalog file with the default columns. The tag is written in capitals.
async function createCatalog({ tag, name }) {
  const upper = tag.trim().toUpperCase();
  const error = catalogError(upper, name);
  if (error) return { code: 400, body: { error } };
  if ((await listCatalogs()).some((c) => c.tag === upper)) return { code: 409, body: { error: `A catalog already uses the tag ${upper}.` } };
  const file = catalogFileName(upper, name);
  await fs.promises.mkdir(at().CATALOGS_DIR, { recursive: true });
  try {
    await fs.promises.writeFile(path.join(at().CATALOGS_DIR, file), newCatalogCsv(), { encoding: 'utf8', flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') return { code: 409, body: { error: 'That catalog already exists.' } };
    throw err;
  }
  return { code: 200, body: { ok: true, file } };
}

// Adds, changes or deletes a catalog row. A date column's value is typed in DATEFORMAT and
// stored as YYYY-MM-DD.
async function saveCatalogRow(body) {
  const catalog = await findCatalog(body.file);
  if (!catalog) return NOT_FOUND;
  const text = await readCatalogFile(catalog);
  const { columns } = parseCatalog(text);
  const format = await readDateFormat();
  const stored = (heading, value) => (isDateColumn(heading) && value.trim() ? toStoredDate(value.trim(), format) || null : value);
  const badDate = (heading) => ({ code: 400, body: { error: `${heading} needs a date written as ${format}.` } });
  let edit = body;
  if (body.action === 'add') {
    const values = columns.map((heading, i) => stored(heading, String(body.values[i] || '')));
    const bad = values.indexOf(null);
    if (bad !== -1) return badDate(columns[bad]);
    edit = Object.assign({}, body, { values });
  } else if (body.action === 'update') {
    const to = stored(body.column, body.to);
    if (to === null) return badDate(body.column);
    edit = Object.assign({}, body, { to });
  }
  const result = editCatalogCsv(text, catalog.tag, edit);
  if (result.error) return { code: result.code || 400, body: { error: result.error } };
  await writeFileSafely(path.join(at().CATALOGS_DIR, catalog.file), result.text);
  return { code: 200, body: { ok: true } };
}

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
  const result = await enqueueWrite(() => requestContext.run(Object.assign({}, requestContext.getStore(), { user }), () => apply(body)));
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

// ---------- change log and Syncthing conflicts ----------

// Every entry in every machine's log for one file, newest first, within the kept period.
async function readChangelog(folder, file) {
  const full = await editableFile(folder, file);
  if (!full) return null;
  const dir = path.dirname(full);
  const cutoff = await changelogCutoff();
  const logs = (await fs.promises.readdir(dir)).filter(isLogOf(path.basename(full)));
  const entries = [];
  for (const name of logs) {
    const text = await readIfExists(path.join(dir, name));
    if (text) entries.push(...parseLog(text).filter((entry) => entry.time >= cutoff));
  }
  entries.sort((a, b) => b.time - a.time);
  return { entries, days: 2 * (await readRoundupDays()) };
}

// The file's Syncthing conflict copies, each with how it differs from the file.
async function readConflicts(folder, file) {
  const full = await editableFile(folder, file);
  if (!full) return null;
  if (!(await readSwitch('SYNCCONFLICTS'))) return { conflicts: [] };
  const dir = path.dirname(full);
  const current = await fs.promises.readFile(full, 'utf8');
  const copies = (await fs.promises.readdir(dir)).map((name) => conflictOf(path.basename(full), name)).filter(Boolean);
  const conflicts = [];
  for (const copy of copies) {
    const text = await readIfExists(path.join(dir, copy.name));
    if (text !== null) conflicts.push(Object.assign(copy, { hunks: diffLines(current, text) }));
  }
  return { conflicts };
}

// Settles a conflict: 'keep' deletes the copy, 'use' saves the copy over the file first.
async function settleConflict({ folder, file, name, action }) {
  const full = await editableFile(folder, file);
  if (!full || !conflictOf(path.basename(full), name)) return { code: 404, body: { error: 'That conflict copy was not found.' } };
  const copy = path.join(path.dirname(full), name);
  const text = await readIfExists(copy);
  if (text === null) return { code: 404, body: { error: 'That conflict copy was not found.' } };
  if (action === 'use') await writeFileSafely(full, text);
  await fs.promises.rm(copy, { force: true });
  return { code: 200, body: { ok: true } };
}

const inFile = ({ folder, file }) => typeof folder === 'string' && typeof file === 'string';
const isReviewFlag = (body) => inFile(body) && typeof body.on === 'boolean';
const hasLine = (body) => inFile(body) && Number.isInteger(body.line) && body.line >= 1;
// `from` is null for an untagged checkbox, or a title with no tentacle.
const isKeywordEdit = (body) => hasLine(body) && typeof body.to === 'string' && (typeof body.from === 'string' || body.from === null);
const isPriorityEdit = (body) =>
  hasLine(body) && typeof body.status === 'string' && (body.priority === null || PRIORITIES.includes(body.priority) || (typeof body.priority === 'string' && RECUR_VALUE.test(body.priority)));
const isRecurAdvance = (body) => hasLine(body) && typeof body.status === 'string' && typeof body.text === 'string';
const isTimeframeEdit = (body) => inFile(body) && typeof body.start === 'string' && typeof body.end === 'string';
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
const isNewItem = (body) => hasLine(body) && typeof body.title === 'string' && typeof body.text === 'string';
const isNewTask = (body) => inFile(body) && typeof body.text === 'string' && typeof body.list === 'string';
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
const isArchiveEntry = (body) => ['tentacle', 'title', 'created', 'closed', 'start', 'end', 'dependency', 'leader'].every((k) => typeof body[k] === 'string');
const isNewIdea = (body) => ['title', 'tentacle', 'dependency', 'notes'].every((k) => typeof body[k] === 'string');
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
  (body.remove === true || (typeof body.start === 'string' && typeof body.end === 'string'));
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
    if (url.pathname === '/api/dependency' && req.method === 'POST') return handleEdit(req, res, isNamedInFile, saveDependency);
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
    if (url.pathname === '/api/tentacles' && req.method === 'POST') return handleEdit(req, res, isNewTentacle, createTentacle);
    if (url.pathname === '/api/file-body' && req.method === 'POST') return handleEdit(req, res, isRawEdit, saveRawFile);
    if (url.pathname === '/api/entry-field' && req.method === 'POST') return handleEdit(req, res, isFieldEdit, saveEntryField);
    if (url.pathname === '/api/entry-add' && req.method === 'POST') return handleEdit(req, res, isNewEntry, saveNewEntry);
    if (url.pathname === '/api/entry-remove' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, deleteEntry);
    if (url.pathname === '/api/mark-reviewed' && req.method === 'POST') return handleEdit(req, res, inFile, markReviewed);
    if (url.pathname === '/api/review-flag' && req.method === 'POST') return handleEdit(req, res, isReviewFlag, flagForReview);
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
      return sendJson(res, 200, { rows: await collectTimeline(), events: await timelineEvents(), releases: await timelineReleases(), dateFormat: await readDateFormat() });
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
    if (url.pathname === '/api/colours.css') return send(res, 200, coloursStylesheet((await readColourTable()).rows), MIME['.css']);
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
    [path.join(p.NETWORKING_DIR, contactsFile(p.NETWORKING_DIR)), '# Contacts\n\n## Contacts\n'],
    [path.join(p.NETWORKING_DIR, 'Events.md'), '# Events\n\n## Upcoming\n'],
    [p.REPORTS_FILE, ''], // blank until the first review adds a report
  ];
}

// Tentacles.csv was called Owners.csv. It's renamed once, and never over a Tentacles.csv.
async function renameOldTentaclesFile(root) {
  const { TENTACLES_FILE, OPTIONS_DIR } = dataPaths(root);
  const old = path.join(OPTIONS_DIR, 'Owners.csv');
  if ((await readIfExists(TENTACLES_FILE)) !== null || (await readIfExists(old)) === null) return;
  await fs.promises.rename(old, TENTACLES_FILE);
  console.log(`Renamed ${path.relative(ROOT_DIR, old)} to Tentacles.csv`);
}

// The Help Guide, its screenshots and the logo ship in _Dashboard/defaults.
const DEFAULTS_DIR = path.join(__dirname, 'defaults');

const unlessExists = (err) => {
  if (err.code !== 'EEXIST') throw err;
};
const copyIfMissing = (from, to) => fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL).catch(unlessExists);

async function copyFolderIfMissing(from, to) {
  await fs.promises.mkdir(to, { recursive: true });
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
  for (const dir of requiredDirs(root)) await fs.promises.mkdir(dir, { recursive: true });
  await renameOldTentaclesFile(root);
  for (const [file, content] of starterFiles(root)) {
    await fs.promises.writeFile(file, content, { encoding: 'utf8', flag: 'wx' }).catch(unlessExists);
  }
}

async function createMissingFolders() {
  for (const entity of await readEntities()) await prepareEntity(entityRootOf(entity));
  await fs.promises.mkdir(IMAGES_DIR, { recursive: true });
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
