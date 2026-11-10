// Octapu System Dashboard server: zero dependencies, Node built-ins only.
// Run from anywhere:  node dashboard/server.js   (then open the printed URL)
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  PRIORITIES,
  parseStatuses,
  withDefaultStatuses,
  moveToStatus,
  parseOwners,
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
  setOwner,
  setLeader,
  setDateField,
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
  newEntityFile,
  appendOwnerCsv,
  PROJECT_TYPES,
  STATUS_TYPES,
  editStatusCsv,
  editLeaderCsv,
  timeframeError,
  addTimeframe,
  editTimeframe,
  isUsableDateFormat,
  parseTimeframes,
  ownerChain,
  updateOptionsCsv,
} = require('./todos');

const {
  isReservedTitle,
  parseBlocks,
  setBlockBody,
  addBlock,
  addMilestone,
  addMilestoneItem,
  removeMilestone,
  moveMilestone,
  milestoneRows,
  lastReviewDate,
  parseFocus,
  entityProblems,
  projectProblems,
  unknownMarkdown,
  hasDashboardStructure,
  applyFixes,
  setProjectType,
  setRowDate,
  COMMITMENT_OWNER,
  parseCommitments,
  commitmentNamed,
  setCommitmentField,
  addCommitment,
  removeCommitment,
  renameCommitment,
  parseEntries,
  setEntryField,
  addEntryField,
  addEntry,
  removeEntry,
  eventTiming,
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

const HOST = process.env.PMS_HOST || '127.0.0.1';
const PORT = Number(process.env.PMS_PORT) || 4173;

const PUBLIC_DIR = path.resolve(__dirname, 'public');
const ROOT_DIR = path.resolve(__dirname, '..');
const ENTITY_DIR = path.resolve(__dirname, '..', 'Entities');
const TIME_MANAGEMENT_DIR = path.resolve(__dirname, '..', 'Time_Management');
const REVIEW_FILE = path.join(TIME_MANAGEMENT_DIR, 'Review.md');
const REPORTS_FILE = path.join(ENTITY_DIR, 'Reports.md'); // a report is added with each review
const FOCUS_FILE = path.join(TIME_MANAGEMENT_DIR, 'Plan.md');
const COMMITMENTS_FILE = path.join(TIME_MANAGEMENT_DIR, 'Commitments.md');
const COMMITMENT_PREFIX = 'commitment:';
const HELP_FILE = path.resolve(__dirname, '..', 'Help Guide.md');
const IMAGES_DIR = path.resolve(__dirname, '..', 'Images');
const IMAGE_TYPES = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);
// Edits name their document by folder. An entity's is this prefix plus its id.
const ENTITY_PREFIX = 'entity:';
const NETWORKING_DIR = path.resolve(__dirname, '..', 'Networking');
const NETWORKING_PREFIX = 'networking:';
const field = (label, match) => ({ label, match: match || new RegExp(`^${label.replace(/[/&]/g, '\\$&')}$`, 'i') });
// Which file each Networking page reads, how deep its entries' headings are, which of its
// `##` sections it lists (all of them if there's no `section`), and each entry's fields.
const NETWORKING = {
  leads: {
    title: 'Leads',
    tab: 'Contacts',
    noun: 'contact',
    file: 'Leads.md',
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
    fields: ['Artist/s', 'Date', 'Venue', 'Main Contact', 'Details', 'Payment', 'Tasks'].map((label) => field(label)),
  },
};
const isNetworkingField = (page) => (label) => page.fields.some((f) => f.match.test(label));
const DEFAULT_ROUNDUP_DAYS = 7; // only used if Options.csv doesn't set a usable ROUNDUP
const LABELS_DIR = path.resolve(__dirname, '..', 'Labels');
const STATUS_FILE = path.join(LABELS_DIR, 'Status.csv');
const OWNERS_FILE = path.join(LABELS_DIR, 'Owners.csv');
const LEADERS_FILE = path.join(LABELS_DIR, 'Leaders.csv');
const COLOURS_FILE = path.join(LABELS_DIR, 'Colours.csv');
const DEFAULT_COLOURS_FILE = path.resolve(__dirname, 'defaults', 'Colours.csv');
const SETUP_DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const OPTIONS_FILE = path.join(LABELS_DIR, 'Options.csv');
const SETUP_FILES = [STATUS_FILE, OWNERS_FILE, LEADERS_FILE, OPTIONS_FILE, COLOURS_FILE];
const FALLBACK_DATE_FORMAT = 'YYYY-MM-DD'; // only used if Options.csv doesn't set DATEFORMAT
const FALLBACK_PROJECT_DIRS = 'Projects'; // only used if Options.csv has no PROJECTS row
const FALLBACK_TASK_LISTS = 'Tasks'; // only used if Options.csv has no TASKLISTS row
// Folders the dashboard uses for something else, so they can't also hold projects.
const RESERVED_DIRS = new Set([__dirname, ENTITY_DIR, NETWORKING_DIR, LABELS_DIR].map((dir) => path.basename(dir).toLowerCase()));
const ARCHIVED_FOLDER = /^\d{4}[.\-_]\d{2}[.\-_]\d{2}/;
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
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));
}

// An error message if a name from Options.csv can't be a project directory. It has to be a
// single folder directly inside the main folder, and a name every operating system allows.
function projectDirError(name) {
  if (/[\\/:*?"<>|]/.test(name) || name.startsWith('.')) return `"${name}" needs to be the name of a single folder directly inside the Octapu-System folder.`;
  if (RESERVED_DIRS.has(name.toLowerCase())) return `"${name}" is already used by the dashboard, so it can't hold projects.`;
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
    dirs.push({ name, fullPath: path.resolve(ROOT_DIR, name), error: projectDirError(name) });
  }
  const first = dirs.find((d) => !d.error);
  return dirs.map((d) => Object.assign(d, { prefix: d === first ? '' : `${d.name}/` }));
}

const readOptions = () => readLabelFile(OPTIONS_FILE, parseOptions, {});
const splitList = (value) => value.split(',').map((part) => part.trim()).filter(Boolean);

// The headings that get a task list on entity and Ongoing project pages. Milestones
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
    const { projectType } = parseHeader(await readProjectFile(project, primaryFile(project)), []);
    project.ongoing = Boolean(projectType) && projectType.known === 'Ongoing';
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
  const [statuses, owners, leaders, dateFormat] = await Promise.all([readStatuses(), readOwners(), readLeaders(), readDateFormat()]);
  const todos = scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder, file }));
  const { title, timeframe, leader, dates, dependency } = parseHeader(content, owners);
  const blocks = parseBlocks(content);
  const details = { folder, directory, ongoing, projectTypes: PROJECT_TYPES, file, files: project.files, content, statuses, todos, owners, leaders, dateFormat, title, timeframe, leader, dates, dependency };
  if (ongoing) return Object.assign(details, splitTaskLists(blocks, await readTaskLists()), { dependencyOptions: [] });
  const planned = projects.filter((p) => !p.ongoing);
  return Object.assign(details, {
    blocks,
    dependencyFolder: resolveDependency(dependency.value, planned, await readCommitments()),
    dependencyOptions: await dependencyChoices(folder, planned, await readCommitments()),
  });
}

// One directory's projects with their main file's text, which the list uses to show progress.
async function listProjectsWithContent(directory) {
  const projects = await listDirectory(directory);
  return Promise.all(
    projects.map(async (project) => {
      const { folder, files, ongoing } = project;
      return { folder, files, ongoing, content: await readProjectFile(project, primaryFile(project)) };
    })
  );
}

// A project's title: its folder without the status prefix or owner.
function projectTitle(folder) {
  return folder.replace(STATUS_PREFIX, '').split('_').slice(1).join(' ').trim();
}

// A project's name in the markdown: its folder without the status prefix, so it stays
// valid when the project moves between active, inactive and archived.
function projectName(folder) {
  return folder.replace(STATUS_PREFIX, '').replace(/_/g, ' ');
}

async function readCommitments() {
  const text = await readIfExists(COMMITMENTS_FILE);
  return text === null ? [] : parseCommitments(text);
}

// What a Project Dependency value refers to, or null: a project's folder or, when the value
// starts with COMMITMENT, a token for that entry in the commitments file.
function resolveDependency(value, projects, commitments = []) {
  const named = commitmentNamed(value);
  if (named !== null) {
    const found = commitments.find((c) => c.title.replace(/\s+/g, ' ').toLowerCase() === named);
    return found ? COMMITMENT_PREFIX + found.title : null;
  }
  const key = value.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!key) return null;
  const match = projects.find((p) => projectName(p.name).toLowerCase() === key);
  return match ? match.folder : null;
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
// that already depends on it, which would make a loop.
async function dependencyChoices(folder, projects, commitments = []) {
  const parents = await dependencyParents(projects);
  const dependsOnFolder = (candidate) => {
    const seen = new Set();
    for (let at = candidate; at && !seen.has(at); at = parents.get(at)) {
      if (at === folder) return true;
      seen.add(at);
    }
    return false;
  };
  return projects
    .filter((p) => !ARCHIVED_FOLDER.test(p.name) && !dependsOnFolder(p.folder))
    .map((p) => projectName(p.name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ id: name, name }))
    .concat(commitmentChoices(commitments));
}

const commitmentChoices = (commitments) => commitments.map((c) => ({ id: `${COMMITMENT_OWNER} ${c.title}`, name: `Commitment: ${c.title}` }));

// Prefer the .md whose name matches the title in the folder name; else the first alphabetically.
function pickPrimary(folder, files) {
  const title = projectTitle(folder).toLowerCase();
  const match = files.find((f) => f.slice(0, -3).trim().toLowerCase() === title);
  return match || files[0];
}

// Label files are re-read on every use, so edits apply without a restart.
async function readLabelFile(file, parse, fallback) {
  try {
    return parse(await fs.promises.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

const readStatuses = async () => withAdvance(withDefaultStatuses(await readLabelFile(STATUS_FILE, parseStatuses, [])));
const readOwners = () => readLabelFile(OWNERS_FILE, parseOwners, []);
const readLeaders = () => readLabelFile(LEADERS_FILE, parseLeaders, []);

// On/off options and their values when Options.csv doesn't have them. The Options page always
// lists them, and saving one adds it to the file.
const SWITCH_OPTIONS = { SHOWARCHIVED: 'FALSE' };
const SWITCH_VALUES = ['TRUE', 'FALSE'];

// The file's options in its order, then any switch it doesn't have yet, where saving adds it.
async function readOptionsWithSwitches() {
  const options = await readOptions();
  return Object.assign({}, options, ...Object.entries(SWITCH_OPTIONS).filter(([key]) => !(key in options)).map(([key, value]) => ({ [key]: value })));
}

// SHOWARCHIVED: archived rows stay visible on project, entity, Leads and Events pages.
const readShowArchived = async () => ((await readOptions()).SHOWARCHIVED || '').toUpperCase() === 'TRUE';

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
  const owners = await readOwners();
  const focus = await readLatestFocus();
  const items = [];
  for (const project of await listProjects()) {
    if (ARCHIVED_FOLDER.test(project.name)) continue;
    const active = project.name.startsWith('+');
    // The focus only ever lists projects with milestones.
    const focused = active && !project.ongoing ? await focusNames(project, focus, owners) : null;
    const entityName = topEntityName(owners, await projectOwnerId(project, owners));
    for (const file of project.files) {
      const content = await readProjectFile(project, file);
      const milestones = new Map(milestoneRows(content, statuses).map((row) => [row.line, row.milestone]));
      for (const item of find(content, match)) {
        const named = focused && [item.editText, milestones.get(item.line)].some((name) => name && focused.has(focusKey(name)));
        const highlight = !active ? 'inactive' : named ? 'milestone' : focused ? 'project' : null;
        items.push(Object.assign(item, { folder: project.folder, file, highlight, entityName }));
      }
    }
  }
  for (const owner of owners) {
    const place = entityPlace(owners, owner.id);
    if (!place) continue;
    const entity = { root: place.chain[0], id: owner.id, name: owner.name };
    const focused = entityFocusNames(owner, owners.find((o) => o.id === place.chain[0]), focus);
    for (const file of await entityFiles(place.dir)) {
      const content = await fs.promises.readFile(path.join(place.dir, file), 'utf8');
      for (const item of find(content, match)) {
        const named = focused && focused.has(focusKey(item.editText || ''));
        items.push(Object.assign(item, { folder: ENTITY_PREFIX + owner.id, file, highlight: focused ? (named ? 'milestone' : 'project') : null, entity, entityName: topEntityName(owners, owner.id) }));
      }
    }
  }
  return { statuses, items, priorities: PRIORITIES, dateFormat: await readDateFormat() };
}

const focusKey = (text) => text.trim().toLowerCase();

// The outline of the newest dated entry in the focus log, or [] if there isn't one.
async function readLatestFocus() {
  const text = await readIfExists(FOCUS_FILE);
  const latest = text === null ? null : lastReviewDate(text);
  const entry = latest && parseBlocks(text).find((b) => b.title === latest);
  return entry ? parseFocus(entry.body) : [];
}

// The names listed under this entity or tentacle in the focus, or null if it isn't in it. A
// plan files them under their top-level entity.
function entityFocusNames(owner, top, focus) {
  const entries = focus.filter((entry) => focusKey(entry.project) === focusKey(owner.name) && entry.owner !== null && focusKey(entry.owner) === focusKey(top.name));
  return entries.length ? new Set(entries.flatMap((entry) => entry.items.map(focusKey))) : null;
}

// The names listed under this project in the focus, or null if the project isn't in it.
// The owner is compared too, as two owners can each have a project with the same title.
async function focusNames(project, focus, owners) {
  const title = focusKey(projectTitle(project.name));
  const sameTitle = focus.filter((entry) => focusKey(entry.project) === title);
  if (!sameTitle.length) return null;
  const owner = focusKey(await projectOwnerName(project, owners));
  const matching = sameTitle.filter((entry) => entry.owner !== null && focusKey(entry.owner) === owner);
  return matching.length ? new Set(matching.flatMap((entry) => entry.items.map(focusKey))) : null;
}

// Every project's Active Timeframe entries, whatever the project's status.
async function collectTimeline() {
  const rows = [];
  const projects = await listProjects('milestone');
  const commitments = await readCommitments();
  for (const project of projects) {
    const file = primaryFile(project);
    const content = await readProjectFile(project, file);
    const header = parseHeader(content, []);
    const parsed = parseTimeframes(header.timeframe.value, STORAGE_FORMAT);
    const dependency = resolveDependency(header.dependency.value, projects, commitments);
    rows.push(Object.assign({ folder: project.folder, file, content, dependency }, parsed));
  }
  for (const { title, priority, fields } of commitments) {
    const dependency = resolveDependency(fields.dependency.value, projects, commitments);
    rows.push(Object.assign({ folder: COMMITMENT_PREFIX + title, file: path.basename(COMMITMENTS_FILE), content: '', dependency, commitment: { title, priority } }, parseTimeframes(fields.timeframe.value, STORAGE_FORMAT)));
  }
  return rows;
}

// The name of the logo in Images/, whatever capitals it's written with, or null.
async function findLogo() {
  try {
    return (await fs.promises.readdir(IMAGES_DIR)).find((name) => /^logo\.(png|jpe?g|gif|webp)$/i.test(name)) || null;
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

// What the left-hand menu lists: top-level owners, each project directory with its
// projects, and the Time Management pages' due dates and counts.
async function collectNav() {
  const owners = await readOwners();
  const toReview = await collectToReview();
  const help = await readIfExists(HELP_FILE);
  return {
    logo: await findLogo(),
    helpUnread: help !== null && !splitHelp(help).read,
    entities: owners.filter((o) => !o.parent).map(({ id, name }) => ({ id, name })),
    directories: await Promise.all(
      (await readProjectDirs()).map(async (d) => ({ name: d.name, projects: (await listDirectory(d)).map((p) => p.folder) }))
    ),
    roundup: {
      projectsToReview: toReview.projects.length,
      entitiesToReview: toReview.entities.length,
      review: await daysSinceLastEntry(REVIEW_FILE),
      plan: await daysSinceLastEntry(FOCUS_FILE),
      interval: await readRoundupDays(),
    },
  };
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

// An owner's markdown lives in its own folder, nested under its parents' folders.
function entityPlace(owners, id) {
  const owner = owners.find((o) => o.id === id);
  const chain = owner && ownerChain(owners, id);
  if (!chain) return null;
  const dir = path.resolve(ENTITY_DIR, ...chain);
  return isInside(ENTITY_DIR, dir) ? { owner, chain, dir } : null;
}

// An owner's main file: the one named after it, or else the first in its folder.
const primaryEntityFile = (owner, files) => (files.includes(`${owner.name}.md`) ? `${owner.name}.md` : files[0]);

async function entityFiles(dir) {
  try {
    return await listMarkdown(dir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// One tab of a top-level entity's page: `tab` picks the entity itself or one
// of those under it. The file is the one named after the owner, or else the first in its
// folder. Its Tasks section is sent separately from the other blocks.
async function readEntity(id, tab, requestedFile) {
  const owners = await readOwners();
  const selected = entityPlace(owners, id);
  if (!selected) return null;
  const root = selected.chain[0];
  const family = owners.filter((o) => (ownerChain(owners, o.id) || [])[0] === root);
  const tabs = [...family.filter((o) => o.id === root), ...family.filter((o) => o.id !== root)].map((o) => ({ id: o.id, name: o.name }));

  const { owner, chain, dir } = entityPlace(owners, family.some((o) => o.id === tab) ? tab : id);
  const expected = `${owner.name}.md`;
  const parent = chain.length > 1 ? owners.find((o) => o.id === owner.parent) : null;
  const base = {
    id: owner.id,
    root,
    name: owner.name,
    parentName: parent ? parent.name : null,
    tabs,
    folder: ENTITY_PREFIX + owner.id,
    location: `Entities/${chain.join('/')}/${expected}`,
  };

  const files = await entityFiles(dir);
  if (!files.length) return Object.assign(base, { file: null, files, content: '' });
  const file = files.includes(requestedFile) ? requestedFile : primaryEntityFile(owner, files);
  const content = await fs.promises.readFile(path.join(dir, file), 'utf8');
  const [statuses, leaders] = await Promise.all([readStatuses(), readLeaders()]);
  const blocks = parseBlocks(content);
  return Object.assign(base, parseHeader(content, owners), {
    file,
    files,
    content,
    statuses,
    owners,
    leaders,
    todos: scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder: base.folder, file })),
    ...splitTaskLists(blocks, await readTaskLists()),
  });
}

const cleanName = (text) => text.trim().replace(/\s+/g, ' ');

// An error message if these can't be an entity's name and ID, or null.
function entityError(name, id) {
  return (
    projectTitleError(name, 'name') ||
    (/^[A-Za-z0-9-]+$/.test(id) ? projectTitleError(id, 'ID') : 'The ID can only use letters, numbers and hyphens.')
  );
}

// Creates a new entity's markdown file. Throws EEXIST if it's already there.
async function writeEntityFile(dir, name) {
  const full = path.join(dir, `${name}.md`);
  const content = newEntityFile({ name, today: formatDate(new Date(), STORAGE_FORMAT), taskLists: await readTaskLists() });
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(full, content, { encoding: 'utf8', flag: 'wx' });
  return full;
}

// Adds a tentacle: its folder and markdown file, then its row in Owners.csv.
async function createEntity(body) {
  const name = cleanName(body.name);
  const id = body.id.trim();
  const error = entityError(name, id);
  if (error) return { code: 400, body: { error } };

  const owners = await readOwners();
  const place = entityPlace(owners, body.parent);
  if (!place) return { code: 400, body: { error: 'Invalid request' } };
  if (owners.some((o) => o.id.toLowerCase() === id.toLowerCase())) {
    return { code: 409, body: { error: `An entity with the ID "${id}" already exists.` } };
  }

  const dir = path.join(place.dir, id);
  const full = path.join(dir, `${name}.md`);
  const csv = await fs.promises.readFile(OWNERS_FILE, 'utf8');
  try {
    await writeEntityFile(dir, name);
  } catch (err) {
    if (err.code === 'EEXIST') return { code: 409, body: { error: 'That entity already has a file with that name.' } };
    throw err;
  }
  try {
    await writeFileSafely(OWNERS_FILE, appendOwnerCsv(csv, { id, name, parent: body.parent }));
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
async function writeFileSafely(full, data) {
  const { mode } = await fs.promises.stat(full);
  const temp = `${full}.${process.pid}.tmp`;
  try {
    await fs.promises.writeFile(temp, data, { encoding: 'utf8', mode });
    await fs.promises.rename(temp, full);
  } catch (err) {
    await fs.promises.rm(temp, { force: true });
    throw err;
  }
}

// The path of a project's or entity's markdown file, or null if there's no such file.
// Folder and file must match real entries exactly, which blocks any path tricks.
async function editableFile(folder, file) {
  if (folder.startsWith(NETWORKING_PREFIX)) {
    const page = networkingPage(folder.slice(NETWORKING_PREFIX.length));
    const full = page && page.file === file ? path.join(NETWORKING_DIR, file) : null;
    return full && (await readIfExists(full)) !== null ? full : null;
  }
  if (folder.startsWith(ENTITY_PREFIX)) {
    const place = entityPlace(await readOwners(), folder.slice(ENTITY_PREFIX.length));
    return place && (await entityFiles(place.dir)).includes(file) ? path.join(place.dir, file) : null;
  }
  const project = (await listProjects()).find((p) => p.folder === folder);
  return project && project.files.includes(file) ? path.join(project.fullPath, file) : null;
}

// Runs `transform` over a project or entity file and saves the result. A null result
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
  if (content === null) return { code: 404, body: { error: "Help Guide.md doesn't exist." } };
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
    if (ARCHIVED_FOLDER.test(project.name)) continue;
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
  const text = await readIfExists(FOCUS_FILE);
  const date = text === null ? null : lastReviewDate(text);
  const current = days !== null && days < interval;
  if (!current) return { date, current, entries: [] };
  const owners = await readOwners();
  const entries = [];
  for (const entry of await readLatestFocus()) {
    let folder = null;
    for (const project of projects.filter((p) => focusKey(projectTitle(p.name)) === focusKey(entry.project))) {
      if (focusKey(await projectOwnerName(project, owners)) === focusKey(entry.owner || '')) folder = project.folder;
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
    daysSinceLastEntry(REVIEW_FILE),
    daysSinceLastEntry(FOCUS_FILE),
  ]);
  const live = projects.filter((p) => !ARCHIVED_FOLDER.test(p.name));
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
// entity and tentacle, and those under a Leads contact or an Events entry. A project in a timeframe today is `suggested`, and so is the last incomplete
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
  for (const { folder, file, name, content } of await allEntityFiles()) {
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

// A project's current owner's ID: from its page title, or else its folder name.
async function projectOwnerId(project, owners) {
  const { title } = parseHeader(await readProjectFile(project, primaryFile(project)), owners);
  return (title && title.owner) || project.name.replace(STATUS_PREFIX, '').split('_')[0];
}

const ownerName = (owners, id) => {
  const owner = owners.find((o) => o.id === id);
  return owner ? owner.name : id;
};

// A project's current owner's friendly name.
const projectOwnerName = async (project, owners) => ownerName(owners, await projectOwnerId(project, owners));

// The name of the top-level entity an owner sits under, or is, for the Todos filter. Null
// when the owner isn't in Owners.csv, such as a folder not named OWNER_Title.
function topEntityName(owners, id) {
  const place = entityPlace(owners, id);
  return place ? ownerName(owners, place.chain[0]) : null;
}

// Where an item goes in the logged focus: the name above, and the name it's listed under.
async function focusHeading(folder, projects, owners) {
  if (folder.startsWith(ENTITY_PREFIX)) {
    const place = entityPlace(owners, folder.slice(ENTITY_PREFIX.length));
    return place && { owner: owners.find((o) => o.id === place.chain[0]).name, project: place.owner.name };
  }
  if (folder.startsWith(NETWORKING_PREFIX)) {
    const page = networkingPage(folder.slice(NETWORKING_PREFIX.length));
    return page && { owner: 'Networking', project: page.title };
  }
  const project = projects.find((p) => p.folder === folder);
  return project ? { owner: await projectOwnerName(project, owners), project: projectTitle(project.name) } : null;
}

// Logs the focus under today's date as an outline: owner, then project, then items.
async function submitWeeklyFocus({ items }) {
  if (!items.length) return { code: 400, body: { error: 'Add at least one item first.' } };
  const projects = await listProjects('milestone');
  const owners = await readOwners();
  const outline = new Map(); // owner name -> project -> items, in the order they were picked
  for (const { folder, text } of items) {
    const clean = text.trim();
    const heading = await focusHeading(folder, projects, owners);
    if (!heading || !clean || /[\r\n]/.test(clean)) return { code: 400, body: { error: 'Invalid request' } };
    if (!outline.has(heading.owner)) outline.set(heading.owner, new Map());
    const owned = outline.get(heading.owner);
    if (!owned.has(heading.project)) owned.set(heading.project, []);
    owned.get(heading.project).push(clean);
  }
  const lines = [];
  for (const [owner, owned] of outline) {
    lines.push(`- ${owner}`);
    for (const [project, texts] of owned) {
      lines.push(`    - ${project}:`, ...texts.map((t) => `        - ${t}`));
    }
  }

  const today = formatDate(new Date(), STORAGE_FORMAT);
  const existing = await readIfExists(FOCUS_FILE);
  const updated = addReview(existing === null ? `# Plan\n**Created:** ${today}\n` : existing, today, lines.join('\n'));
  if (existing === null) {
    await fs.promises.mkdir(TIME_MANAGEMENT_DIR, { recursive: true });
    await fs.promises.writeFile(FOCUS_FILE, updated, 'utf8');
  } else {
    await writeFileSafely(FOCUS_FILE, updated);
  }
  return { code: 200, body: { ok: true } };
}

const networkingPage = (name) => (Object.hasOwn(NETWORKING, name) ? NETWORKING[name] : null);

// A Networking page's entries by section. Events that have happened are moved out of their
// section into `past`, most recent first.
async function readNetworking(name) {
  const page = networkingPage(name);
  if (!page) return null;
  const base = { title: page.title, tab: page.tab, noun: page.noun, location: `Networking/${page.file}`, dateFormat: await readDateFormat() };
  const content = await readIfExists(path.join(NETWORKING_DIR, page.file));
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
        return found.length ? found : [{ label: spec.label, line: entry.line, value: '', missing: true }];
      })
    );
  }
  const past = [];
  if (name === 'events') {
    for (const section of sections) {
      section.entries = section.entries.filter((entry) => {
        const timing = eventTiming(entry.body, today);
        if (timing.past) past.push(Object.assign(entry, { end: timing.end }));
        return !timing.past;
      });
    }
    past.sort((a, b) => (b.end || '').localeCompare(a.end || ''));
  }
  return Object.assign(base, {
    folder,
    file: page.file,
    content,
    statuses,
    todos: scanLines(content, createMatcher(statuses)).map((t) => Object.assign(t, { folder, file: page.file })),
    sections: sections.filter((s) => s.entries.length),
    sectionNames,
    past,
    blocks,
    others: await otherNetworkingTitles(name),
  });
}

// The entry names on the other Networking pages, so a [[#reference]] can find its way there.
async function otherNetworkingTitles(name) {
  const others = [];
  for (const other of Object.keys(NETWORKING).filter((key) => key !== name)) {
    const page = NETWORKING[other];
    const content = await readIfExists(path.join(NETWORKING_DIR, page.file));
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
  return addNamed(body, body.title, (content, text) => addEntry(content, page.level, body.section, text, page.fields.map((f) => f.label)));
}

function deleteEntry({ folder, file, line, title }) {
  const page = pageOfFolder(folder);
  if (!page) return NOT_FOUND;
  return updateProjectFile(folder, file, (content) => removeEntry(content, page.level, line, title));
}

const isFolder = (full) => fs.promises.stat(full).then((s) => s.isDirectory(), () => false);

const folderOwner = (name) => name.replace(STATUS_PREFIX, '').split('_')[0];

// What's wrong with one of a project's files. An extra file is only held to the project
// rules if it looks like it's meant to follow them.
function projectFileProblems(project, file, content, { owners, leaders, taskLists }) {
  if (file !== primaryFile(project) && !hasDashboardStructure(content, taskLists)) return [unknownMarkdown()];
  return projectProblems(content, folderOwner(project.name), owners, leaders, taskLists, project.ongoing ? 'Ongoing' : 'Milestone');
}

// Every markdown file in a project folder that wouldn't work with the dashboard, any
// directory named in Options.csv that can't be used, any markdown loose in one of those
// directories, and how many of these were checked.
async function incompatibleProjects() {
  const [owners, leaders, projects, taskLists] = await Promise.all([readOwners(), readLeaders(), listProjects(), readTaskLists()]);
  const rows = [];
  let checked = 0;
  for (const project of projects) {
    const { folder, directory } = project;
    for (const file of project.files) {
      checked++;
      const problems = projectFileProblems(project, file, await readProjectFile(project, file), { owners, leaders, taskLists });
      if (problems.length) rows.push({ folder, directory, file, additional: file !== primaryFile(project), problems });
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
  return { checked, rows };
}

// Folders inside Entities/ that don't match an owner's place in Owners.csv.
async function unknownEntityFolders(owners) {
  const known = new Set(owners.map((o) => ownerChain(owners, o.id)).filter(Boolean).map((chain) => chain.join('/')));
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
    await walk(ENTITY_DIR, []);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return unknown;
}

// What's wrong with one of an entity's files, by the same rule as projectFileProblems.
function entityFileProblems(owner, files, file, content, taskLists) {
  if (file !== primaryEntityFile(owner, files) && !hasDashboardStructure(content, taskLists)) return [unknownMarkdown()];
  return entityProblems(content, taskLists);
}

// Every entity file that wouldn't work with the dashboard, any markdown loose in
// Entities/, and how many of these were checked.
async function incompatibleEntities() {
  const [owners, taskLists] = await Promise.all([readOwners(), readTaskLists()]);
  const rows = [];
  let checked = owners.length;
  for (const owner of owners) {
    const place = entityPlace(owners, owner.id);
    if (!place) {
      rows.push({ name: owner.name, problems: [{ text: `Parent "${owner.parent}" isn't in Owners.csv`, kind: 'error' }] });
      continue;
    }
    const expected = `${owner.name}.md`;
    const files = await entityFiles(place.dir);
    if (!files.length) {
      // A name from a hand-edited Owners.csv might not be usable as a file name.
      const kind = projectTitleError(owner.name, 'name') ? 'error' : 'fixable';
      rows.push({ id: owner.id, name: owner.name, problems: [{ text: `No markdown file at Entities/${place.chain.join('/')}/${expected}`, kind }] });
      continue;
    }
    const file = primaryEntityFile(owner, files);
    const problems = entityFileProblems(owner, files, file, await fs.promises.readFile(path.join(place.dir, file), 'utf8'), taskLists);
    if (file !== expected) problems.push({ text: `File is called "${file}", but Owners.csv expects "${expected}"`, kind: 'unexpected' });
    if (problems.length) rows.push({ id: owner.id, name: owner.name, file, problems });
    for (const extra of files.filter((f) => f !== file)) {
      checked++;
      const found = entityFileProblems(owner, files, extra, await fs.promises.readFile(path.join(place.dir, extra), 'utf8'), taskLists);
      if (found.length) rows.push({ id: owner.id, name: owner.name, file: extra, additional: true, problems: found });
    }
  }
  const loose = (await entityFiles(ENTITY_DIR)).filter((file) => file !== path.basename(REPORTS_FILE));
  for (const file of loose) rows.push({ name: `Entities/${file}`, problems: [unknownMarkdown()] });
  const folders = await unknownEntityFolders(owners);
  for (const folder of folders) rows.push({ name: folder, problems: [{ text: "This folder isn't in Owners.csv", kind: 'unexpected' }] });
  return { checked: checked + loose.length + folders.length, rows };
}

// Fix issues for one of a project's files. A new Owner field is only filled in when
// there's just one leader it could be.
async function fixProject(folder, requested) {
  const [owners, leaders, projects, taskLists] = await Promise.all([readOwners(), readLeaders(), listProjects(), readTaskLists()]);
  const project = projects.find((p) => p.folder === folder);
  if (!project) return NOT_FOUND;
  const file = requested || primaryFile(project);
  if (!project.files.includes(file)) return NOT_FOUND;
  const ownerId = folderOwner(project.name);
  const folderTitle = owners.some((o) => o.id === ownerId) ? `${ownerId} ${projectTitle(project.name)}` : project.name.replace(STATUS_PREFIX, '').replace(/_/g, ' ');
  const details = {
    title: file === primaryFile(project) ? folderTitle : fileTitle(file),
    owner: leaders.length === 1 ? leaders[0].id : '',
    projectType: project.ongoing ? 'Ongoing' : 'Milestone',
  };
  return updateProjectFile(folder, file, (content) => applyFixes(content, projectFileProblems(project, file, content, { owners, leaders, taskLists }), details));
}

const fileTitle = (file) => file.replace(/\.md$/i, '');

// Fix issues for an entity: creates its file if it has none, or fills in the one asked for.
async function fixEntity(id, requested) {
  const [owners, taskLists] = await Promise.all([readOwners(), readTaskLists()]);
  const place = entityPlace(owners, id);
  if (!place) return NOT_FOUND;
  const { owner, dir } = place;
  const files = await entityFiles(dir);
  if (files.length) {
    const main = primaryEntityFile(owner, files);
    const file = requested || main;
    if (!files.includes(file)) return NOT_FOUND;
    return updateProjectFile(ENTITY_PREFIX + id, file, (content) =>
      applyFixes(content, entityFileProblems(owner, files, file, content, taskLists), { title: file === main ? owner.name : fileTitle(file), owner: '' })
    );
  }
  const error = projectTitleError(owner.name, 'name');
  if (error) return { code: 400, body: { error } };
  await writeEntityFile(dir, owner.name);
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

// What the Commitments page shows, and the choices for its dropdowns.
async function readCommitmentList() {
  const text = await readIfExists(COMMITMENTS_FILE);
  const commitments = text === null ? [] : parseCommitments(text);
  const projects = await listProjects('milestone');
  const names = projects.filter((p) => !ARCHIVED_FOLDER.test(p.name)).map((p) => projectName(p.name)).sort((a, b) => a.localeCompare(b));
  return {
    folder: 'commitments',
    file: path.basename(COMMITMENTS_FILE),
    location: 'Time_Management/Commitments.md',
    exists: text !== null,
    dateFormat: await readDateFormat(),
    priorities: PRIORITIES,
    dependencyChoices: names.map((name) => ({ id: name, name })).concat(commitmentChoices(commitments)),
    commitments: commitments.map(({ title, line, priority, fields }) => ({
      title,
      line,
      priority,
      timeframes: timeframeEntries(fields.timeframe.value),
      dependency: fields.dependency.value,
      target: resolveDependency(fields.dependency.value, projects, commitments),
    })),
  };
}

async function updateCommitments(transform) {
  const content = await readIfExists(COMMITMENTS_FILE);
  if (content === null) return NOT_FOUND;
  const updated = transform(content);
  if (updated === null) return { code: 409, body: { error: 'That commitment has changed in the file, so nothing was updated.' } };
  if (updated !== content) await writeFileSafely(COMMITMENTS_FILE, updated);
  return { code: 200, body: { ok: true } };
}

const sameCommitment = (a, b) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
const DUPLICATE_COMMITMENT = { code: 409, body: { error: 'There is already a commitment with that name.' } };

async function saveNewCommitment({ title }) {
  const name = title.trim();
  const error = lineError(name);
  if (error) return { code: 400, body: { error } };
  if ((await readCommitments()).some((c) => sameCommitment(c.title, name))) return DUPLICATE_COMMITMENT;
  const existing = await readIfExists(COMMITMENTS_FILE);
  if (existing !== null) return updateCommitments((content) => addCommitment(content, name));
  await fs.promises.mkdir(TIME_MANAGEMENT_DIR, { recursive: true });
  await fs.promises.writeFile(COMMITMENTS_FILE, addCommitment('# Timeline Commitments\n', name), 'utf8');
  return { code: 200, body: { ok: true } };
}

const deleteCommitment = ({ line, title }) => updateCommitments((content) => removeCommitment(content, line, title));

async function saveCommitmentField({ line, title, field, value }) {
  if (field === 'priority' && !PRIORITIES.includes(value)) return { code: 400, body: { error: 'Choose A, B or C.' } };
  if (field === 'dependency' && value) {
    const { dependencyChoices: choices } = await readCommitmentList();
    if (sameCommitment(value, `${COMMITMENT_OWNER} ${title}`) || !choices.some((c) => c.id === value)) return { code: 400, body: { error: "That can't be chosen as a dependency." } };
  }
  return updateCommitments((content) => setCommitmentField(content, line, title, field, value));
}

// Sets the first timeframe, keeping any others written after it by hand.
async function saveCommitmentTimeframe({ line, title, start, end }) {
  const format = await readDateFormat();
  const error = timeframeError(start, end, format);
  if (error) return { code: 400, body: { error } };
  const entry = `${toStoredDate(start, format)} to ${toStoredDate(end, format)}`;
  return updateCommitments((content) => {
    const commitment = parseCommitments(content).find((c) => c.line === line && c.title === title);
    if (!commitment) return null;
    const entries = timeframeEntries(commitment.fields.timeframe.value);
    entries[0] = entry;
    return setCommitmentField(content, line, title, 'timeframe', entries.join(', '));
  });
}

// Renames a commitment and keeps every dependency on it pointing at it.
async function saveCommitmentName({ line, title, to }) {
  const name = to.trim();
  const error = lineError(name);
  if (error) return { code: 400, body: { error } };
  if ((await readCommitments()).some((c) => !sameCommitment(c.title, title) && sameCommitment(c.title, name))) return DUPLICATE_COMMITMENT;
  const result = await updateCommitments((content) => renameCommitment(content, line, title, name));
  if (result.code !== 200) return result;
  const old = title.replace(/\s+/g, ' ').toLowerCase();
  for (const project of await listProjects('milestone')) {
    const file = primaryFile(project);
    if (commitmentNamed(parseHeader(await readProjectFile(project, file), []).dependency.value) === old) {
      await updateProjectFile(project.folder, file, (content) => setDependency(content, `${COMMITMENT_OWNER} ${name}`));
    }
  }
  return result;
}

// Adds a markdown file to a project or entity folder, with the fields and headings
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
  if (folder.startsWith(ENTITY_PREFIX)) {
    const place = entityPlace(await readOwners(), folder.slice(ENTITY_PREFIX.length));
    if (!place) return NOT_FOUND;
    dir = place.dir;
    files = await entityFiles(dir);
    content = newEntityFile({ name: title, today, taskLists });
  } else {
    const project = (await listProjects()).find((p) => p.folder === folder);
    if (!project) return NOT_FOUND;
    dir = project.fullPath;
    files = project.files;
    const leader = parseHeader(await readProjectFile(project, primaryFile(project)), []).leader;
    content = newProjectFiles({
      ownerId: folderOwner(project.name),
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

const fixCompatibility = ({ type, key, file }) => (type === 'projects' ? fixProject(key, file) : fixEntity(key, file));

// Non-archived projects and every entity with no Date Reviewed yet.
async function collectToReview() {
  const projects = [];
  for (const project of await listProjects()) {
    if (ARCHIVED_FOLDER.test(project.name)) continue;
    const file = primaryFile(project);
    if (!parseHeader(await readProjectFile(project, file), []).dates.reviewed.value) projects.push({ folder: project.folder, file });
  }
  const owners = await readOwners();
  const entities = [];
  for (const owner of owners) {
    const place = entityPlace(owners, owner.id);
    const files = place ? await entityFiles(place.dir) : [];
    if (!files.length) continue;
    const file = primaryEntityFile(owner, files);
    const content = await fs.promises.readFile(path.join(place.dir, file), 'utf8');
    if (parseHeader(content, []).dates.reviewed.value) continue;
    const parent = place.chain.length > 1 ? owners.find((o) => o.id === owner.parent).name : null;
    entities.push({ folder: ENTITY_PREFIX + owner.id, file, id: owner.id, root: place.chain[0], name: owner.name, parentName: parent });
  }
  return { projects, entities };
}

function markReviewed({ folder, file }) {
  const today = formatDate(new Date(), STORAGE_FORMAT);
  return updateProjectFile(folder, file, (content) => setDateField(content, 'reviewed', today));
}

// Every markdown file of every entity and tentacle.
async function allEntityFiles() {
  const owners = await readOwners();
  const files = [];
  for (const owner of owners) {
    const place = entityPlace(owners, owner.id);
    if (!place) continue;
    for (const file of await entityFiles(place.dir)) {
      const full = path.join(place.dir, file);
      files.push({ folder: ENTITY_PREFIX + owner.id, file, full, name: owner.name, content: await fs.promises.readFile(full, 'utf8') });
    }
  }
  return files;
}

// The Leads and Events files. `entryAt` finds the contact or event a line belongs to.
async function networkingFiles() {
  const files = [];
  for (const [name, page] of Object.entries(NETWORKING)) {
    const full = path.join(NETWORKING_DIR, page.file);
    const content = await readIfExists(full);
    if (content === null) continue;
    const sections = parseEntries(content, page.level);
    const entries = (page.section ? sections.filter((s) => page.section.test(s.title)) : sections).flatMap((s) => s.entries);
    files.push({ folder: NETWORKING_PREFIX + name, file: page.file, full, name: page.title, content, entryAt: (line) => entries.find((e) => line > e.line && line <= e.end) || null });
  }
  return files;
}

// Every file a review covers. `sourceOf` names where a line came from, or gives null if the
// line isn't part of anything to review. Projects are named by their folder instead.
async function reviewableFiles() {
  const entities = (await allEntityFiles()).map((f) => Object.assign(f, { sourceOf: () => f.name }));
  const networking = (await networkingFiles()).map((f) =>
    Object.assign(f, {
      sourceOf: (line) => {
        const entry = f.entryAt(line);
        return entry ? `${f.name}: ${entry.title}` : null;
      },
    })
  );
  return [...(await liveProjectFiles()), ...entities, ...networking];
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
  const review = await readIfExists(REVIEW_FILE);
  return review === null ? null : lastReviewDate(review);
};

// DONE type items closed since the last review, grouped by status in CSV order.
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
  const text = await readIfExists(FOCUS_FILE);
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
    if (!ARCHIVED_FOLDER.test(project.name)) liveContents.push(content);
  }
  const active = projects.filter((p) => !ARCHIVED_FOLDER.test(p.name) && p.name.startsWith('+'));
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
  const text = await readIfExists(REPORTS_FILE);
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
  let archived = 0;
  for (const { full, content, sourceOf } of await reviewableFiles()) {
    let after = content;
    for (const item of doneRows(content, match, sourceOf)) {
      after = replaceStatus(after, item.line, item.status, target, statuses);
      archived++;
    }
    if (after !== content) changes.push({ full, before: content, after });
  }

  const review = await readIfExists(REVIEW_FILE);
  const updatedReview = addReview(review === null ? `# Review\n**Created:** ${today}\n` : review, today, text);
  const reports = await readIfExists(REPORTS_FILE);
  const updatedReports = addReport(reports || '', today, figures);

  const written = [];
  try {
    for (const change of changes) {
      await writeFileSafely(change.full, change.after);
      written.push(change);
    }
    if (reports === null) {
      await fs.promises.mkdir(ENTITY_DIR, { recursive: true });
      await fs.promises.writeFile(REPORTS_FILE, updatedReports, { encoding: 'utf8', flag: 'wx' });
    } else {
      await writeFileSafely(REPORTS_FILE, updatedReports);
    }
    written.push({ full: REPORTS_FILE, before: reports });
    if (review === null) {
      await fs.promises.mkdir(TIME_MANAGEMENT_DIR, { recursive: true });
      await fs.promises.writeFile(REVIEW_FILE, updatedReview, 'utf8');
    } else {
      await writeFileSafely(REVIEW_FILE, updatedReview);
    }
  } catch (err) {
    // A Reports.md this review created is removed again rather than left empty.
    for (const change of written) await (change.before === null ? fs.promises.unlink(change.full) : writeFileSafely(change.full, change.before)).catch(() => {});
    throw err;
  }
  return { code: 200, body: { ok: true, archived, archivedTo: target } };
}

async function changePriority({ folder, file, line, status, priority }) {
  const statuses = await readStatuses();
  return updateProjectFile(folder, file, (content) => setPriority(content, line, status, priority, statuses));
}

async function changeOwner({ folder, file, line, from, to }) {
  const owners = await readOwners();
  if (!owners.some((o) => o.id === to)) return { code: 400, body: { error: `"${to}" is not in Owners.csv.` } };
  return updateProjectFile(folder, file, (content) => setOwner(content, line, from, to, owners));
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
  return folder.startsWith(ENTITY_PREFIX) || (await listProjects('ongoing')).some((p) => p.folder === folder);
}

async function saveText({ folder, file, kind, line, from, to }) {
  const text = to.trim();
  const error = lineError(text);
  if (error) return { code: 400, body: { error } };
  if (kind === 'block' && (await isReservedBlock(folder, text))) return RESERVED_ERROR;
  const [statuses, owners] = await Promise.all([readStatuses(), readOwners()]);
  return updateProjectFile(folder, file, (content) => editText(content, kind, line, from, text, statuses, owners));
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
  const choices = await dependencyChoices(folder, await listProjects('milestone'), await readCommitments());
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

async function saveDate({ folder, file, field, value }) {
  const date = value.trim();
  const format = await readDateFormat();
  const error = dateError(date, format);
  if (error) return { code: 400, body: { error } };
  const stored = date ? toStoredDate(date, format) : '';
  return updateProjectFile(folder, file, (content) => setDateField(content, field, stored));
}

async function createProject(body) {
  const title = body.title.trim().replace(/\s+/g, ' ');
  const error = projectTitleError(title);
  if (error) return { code: 400, body: { error } };
  const [owners, leaders] = await Promise.all([readOwners(), readLeaders()]);
  if (!owners.some((o) => o.id === body.entity)) return { code: 400, body: { error: 'Choose an entity.' } };
  if (!leaders.some((l) => l.id === body.owner)) return { code: 400, body: { error: 'Choose an owner.' } };
  if (!PROJECT_TYPES.includes(body.type)) return { code: 400, body: { error: 'Choose a project type.' } };
  const dirs = await readProjectDirs();
  const directory = body.dir === undefined ? dirs[0] : dirs.find((d) => d.name === body.dir);
  if (!directory) return { code: 400, body: { error: 'Invalid request' } };

  const spec = newProjectFiles({
    projectType: body.type,
    taskLists: await readTaskLists(),
    ownerId: body.entity,
    leaderTag: body.owner,
    title,
    notes: body.notes.replace(/\r\n?/g, '\n').trim(),
    today: formatDate(new Date(), STORAGE_FORMAT),
  });

  // The same project under a different status prefix still counts as a duplicate.
  const key = (folder) => folder.replace(STATUS_PREFIX, '').toLowerCase();
  const duplicate = (await listProjects()).some((p) => key(p.name) === key(spec.folder));
  if (duplicate) return { code: 409, body: { error: 'A project with that entity and title already exists.' } };

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
  return { code: 200, body: { ok: true, folder: directory.prefix + spec.folder } };
}

// What the Statuses tab lists, and what its dropdowns offer. Defaults can be chosen as a
// Next status, but only the file's own rows are listed.
async function readStatusTable() {
  const text = await readIfExists(STATUS_FILE);
  const rows = text === null ? [] : parseStatuses(text);
  return { exists: text !== null, rows, types: STATUS_TYPES, choices: withDefaultStatuses(rows).map((s) => s.name) };
}

async function readLeaderTable() {
  const text = await readIfExists(LEADERS_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseLeaders(text) };
}

async function readColourTable() {
  const text = await readIfExists(COLOURS_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseColours(text) };
}

// Applies one row's edit to a label file, creating the file if this is its first row.
async function editLabelFile(file, header, edit, body) {
  const existing = await readIfExists(file);
  const result = edit(existing && existing.trim() ? existing : `${header}\r\n`, body);
  if (result.error) return { code: 400, body: { error: result.error } };
  if (existing === null) {
    await fs.promises.mkdir(LABELS_DIR, { recursive: true });
    await fs.promises.writeFile(file, result.text, 'utf8');
  } else {
    await writeFileSafely(file, result.text);
  }
  return { code: 200, body: { ok: true } };
}

const saveStatusRow = (body) => editLabelFile(STATUS_FILE, 'Type,Name,Next', editStatusCsv, body);
const saveLeaderRow = (body) => editLabelFile(LEADERS_FILE, 'Tag,Name', editLeaderCsv, body);
const saveColourRow = (body) => editLabelFile(COLOURS_FILE, 'Name,Colour,Used for', editColourCsv, body);

async function saveOptions({ values }) {
  let text;
  try {
    text = await fs.promises.readFile(OPTIONS_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { code: 404, body: { error: 'Options.csv not found.' } };
    throw err;
  }
  const known = [...Object.keys(parseOptions(text)), ...Object.keys(SWITCH_OPTIONS)];
  const updates = Object.fromEntries(Object.entries(values).filter(([key]) => known.includes(key)));
  const badSwitch = Object.keys(SWITCH_OPTIONS).find((key) => key in updates && !SWITCH_VALUES.includes(updates[key]));
  if (badSwitch) return { code: 400, body: { error: `${badSwitch} needs TRUE or FALSE.` } };
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
  await writeFileSafely(OPTIONS_FILE, updateOptionsCsv(text, updates));
  return { code: 200, body: { ok: true } };
}

// What the first-time setup form still needs. It's needed if any expected CSV is missing, or
// no owner is at the top level of Owners.csv.
async function setupState() {
  const files = await Promise.all(SETUP_FILES.map(readIfExists));
  const missing = SETUP_FILES.filter((_, i) => files[i] === null);
  const [owners, leaders] = await Promise.all([readOwners(), readLeaders()]);
  const entity = !owners.some((o) => !o.parent);
  return {
    needed: missing.length > 0 || entity,
    missing: missing.map((file) => `Labels/${path.basename(file)}`),
    fields: { entity, leader: leaders.length === 0, dateFormat: missing.includes(OPTIONS_FILE) },
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
  const entityName = cleanName(body.entityName || '');
  const entityId = (body.entityId || '').trim();
  const leaderName = cleanName(body.leaderName || '');
  if (fields.entity) {
    const error = entityError(entityName, entityId);
    if (error) return badSetup(error);
    if ((await readOwners()).some((o) => o.id.toLowerCase() === entityId.toLowerCase())) {
      return badSetup(`An entity with the ID "${entityId}" already exists.`, 409);
    }
  }
  if (fields.leader && !leaderTag(leaderName)) return badSetup('Enter your name.');
  if (fields.dateFormat && !SETUP_DATE_FORMATS.includes(body.dateFormat)) return badSetup('Choose a date format.');

  await fs.promises.mkdir(LABELS_DIR, { recursive: true });
  const isMissing = (file) => missing.includes(`Labels/${path.basename(file)}`);
  if (isMissing(OPTIONS_FILE)) {
    const text = newOptionsCsv({ dateFormat: body.dateFormat, roundup: DEFAULT_ROUNDUP_DAYS, projects: FALLBACK_PROJECT_DIRS, taskLists: FALLBACK_TASK_LISTS });
    await fs.promises.writeFile(OPTIONS_FILE, text, 'utf8');
    await fs.promises.mkdir(path.resolve(ROOT_DIR, FALLBACK_PROJECT_DIRS), { recursive: true });
  }
  if (isMissing(COLOURS_FILE)) await fs.promises.copyFile(DEFAULT_COLOURS_FILE, COLOURS_FILE);
  if (fields.leader) {
    const result = await saveLeaderRow({ action: 'add', name: leaderName });
    if (result.code !== 200) return result;
  }
  if (isMissing(STATUS_FILE)) {
    const [first] = await readLeaders();
    await fs.promises.writeFile(STATUS_FILE, newStatusCsv(first ? first.name : ''), 'utf8');
  }
  if (fields.entity) {
    try {
      await writeEntityFile(path.join(ENTITY_DIR, entityId), entityName);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err; // an existing file is simply kept
    }
    const existing = await readIfExists(OWNERS_FILE);
    const text = appendOwnerCsv(existing && existing.trim() ? existing : 'id,Name,Parent\r\n', { id: entityId, name: entityName, parent: '' });
    if (existing === null) await fs.promises.writeFile(OWNERS_FILE, text, 'utf8');
    else await writeFileSafely(OWNERS_FILE, text);
  } else if (isMissing(OWNERS_FILE)) {
    await fs.promises.writeFile(OWNERS_FILE, 'id,Name,Parent\r\n', 'utf8');
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
  const result = await enqueueWrite(() => apply(body));
  return sendJson(res, result.code, result.body);
}

const inFile = ({ folder, file }) => typeof folder === 'string' && typeof file === 'string';
const hasLine = (body) => inFile(body) && Number.isInteger(body.line) && body.line >= 1;
// `from` is null for an untagged checkbox, or a title with no owner.
const isKeywordEdit = (body) => hasLine(body) && typeof body.to === 'string' && (typeof body.from === 'string' || body.from === null);
const isPriorityEdit = (body) => hasLine(body) && typeof body.status === 'string' && (body.priority === null || PRIORITIES.includes(body.priority));
const isTimeframeEdit = (body) => inFile(body) && typeof body.start === 'string' && typeof body.end === 'string';
const EDITABLE_TEXT = ['title', 'milestone', 'block', 'todo', 'entry'];
const isRawEdit = (body) => inFile(body) && typeof body.from === 'string' && typeof body.to === 'string';
const isFieldEdit = (body) =>
  hasLine(body) && typeof body.from === 'string' && typeof body.to === 'string' && (body.label === null || typeof body.label === 'string');
const isNewEntry = (body) => inFile(body) && typeof body.title === 'string' && typeof body.section === 'string';
// Deleting an entry or a milestone: the line its heading is on, and the heading's text.
const isHeadingRemoval = (body) => hasLine(body) && typeof body.title === 'string';
const isTextEdit = (body) => hasLine(body) && EDITABLE_TEXT.includes(body.kind) && typeof body.from === 'string' && typeof body.to === 'string';
// `line` is null for the untitled text before a file's first heading.
const isBodyEdit = (body) =>
  inFile(body) && (body.line === null || (Number.isInteger(body.line) && body.line >= 1)) && typeof body.from === 'string' && typeof body.to === 'string';
const isNewTitled = (body) => inFile(body) && typeof body.title === 'string';
const isNewItem = (body) => hasLine(body) && typeof body.title === 'string' && typeof body.text === 'string';
const isNewTask = (body) => inFile(body) && typeof body.text === 'string' && typeof body.list === 'string';
const isSetup = (body) => ['entityName', 'entityId', 'leaderName', 'dateFormat'].every((key) => body[key] === undefined || typeof body[key] === 'string');
const isNewEntity = ({ parent, name, id }) => [parent, name, id].every((v) => typeof v === 'string');
const isRowEdit = (fields) => (body) =>
  ['add', 'update', 'delete'].includes(body.action) &&
  (body.action === 'add' || typeof body.from === 'string') &&
  (body.action === 'delete' || fields.every((field) => typeof body[field] === 'string'));
const isStatusRow = isRowEdit(['type', 'name', 'next']);
const isLeaderRow = isRowEdit(['name']);
const isColourRow = (body) => typeof body.from === 'string' && typeof body.colour === 'string';
const isReviewSubmit = (body) => typeof body.wins === 'string';
const isStatusSwitch = ({ folder, status }) => typeof folder === 'string' && typeof status === 'string';
const isCommitmentRow = ({ line, title }) => Number.isInteger(line) && line >= 1 && typeof title === 'string';
const isNewCommitment = ({ title }) => typeof title === 'string';
const isCommitmentField = (body) => isCommitmentRow(body) && ['priority', 'dependency'].includes(body.field) && typeof body.value === 'string';
const isCommitmentTimeframe = (body) => isCommitmentRow(body) && typeof body.start === 'string' && typeof body.end === 'string';
const isCommitmentRename = (body) => isCommitmentRow(body) && typeof body.to === 'string';
const isPlanningEdit = (body) =>
  hasLine(body) && (typeof body.status === 'string' || body.status === null) && typeof body.text === 'string' && ['SCHEDULED', 'DEADLINE'].includes(body.kind) && typeof body.date === 'string';
const isTypeChange = (body) => inFile(body) && typeof body.type === 'string';
const isCompatibilityFix = ({ type, key, file }) => ['projects', 'entities'].includes(type) && typeof key === 'string' && (file === undefined || typeof file === 'string');
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
const isNewProject = ({ entity, title, owner, notes, type, dir }) =>
  [entity, title, owner, notes, type].every((v) => typeof v === 'string') && (dir === undefined || typeof dir === 'string');
const isOptionsEdit = ({ values }) =>
  typeof values === 'object' && values !== null && Object.values(values).every((v) => typeof v === 'string');

// Every template in public/components, by name, for the pages to fill in.
async function readComponents() {
  const dir = path.join(PUBLIC_DIR, 'components');
  const names = (await fs.promises.readdir(dir)).filter((name) => name.endsWith('.html')).sort();
  const files = await Promise.all(names.map((name) => fs.promises.readFile(path.join(dir, name), 'utf8')));
  return Object.assign({}, ...files.map(parseComponents));
}

async function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/home.html';
  if (rel.endsWith('.html')) {
    const { needed } = await setupState();
    if (needed !== (rel === '/setup.html')) {
      res.writeHead(302, { Location: needed ? '/setup.html' : '/', 'Cache-Control': 'no-store' });
      return res.end();
    }
  }
  return sendFileFrom(res, PUBLIC_DIR, rel);
}

// An image for an [[IMAGE#...]] link. Only pictures inside Images/ can be fetched.
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/status' && req.method === 'POST') return handleEdit(req, res, isKeywordEdit, changeStatus);
    if (url.pathname === '/api/owner' && req.method === 'POST') return handleEdit(req, res, isKeywordEdit, changeOwner);
    if (url.pathname === '/api/leader' && req.method === 'POST') return handleEdit(req, res, isKeywordEdit, changeLeader);
    if (url.pathname === '/api/timeframe' && req.method === 'POST') return handleEdit(req, res, isTimeframeEdit, saveTimeframe);
    if (url.pathname === '/api/timeframe-change' && req.method === 'POST') return handleEdit(req, res, isTimeframeChange, changeTimeframe);
    if (url.pathname === '/api/priority' && req.method === 'POST') return handleEdit(req, res, isPriorityEdit, changePriority);
    if (url.pathname === '/api/commitment-add' && req.method === 'POST') return handleEdit(req, res, isNewCommitment, saveNewCommitment);
    if (url.pathname === '/api/commitment-remove' && req.method === 'POST') return handleEdit(req, res, isCommitmentRow, deleteCommitment);
    if (url.pathname === '/api/commitment-field' && req.method === 'POST') return handleEdit(req, res, isCommitmentField, saveCommitmentField);
    if (url.pathname === '/api/commitment-timeframe' && req.method === 'POST') return handleEdit(req, res, isCommitmentTimeframe, saveCommitmentTimeframe);
    if (url.pathname === '/api/commitment-rename' && req.method === 'POST') return handleEdit(req, res, isCommitmentRename, saveCommitmentName);
    if (url.pathname === '/api/project-status' && req.method === 'POST') return handleEdit(req, res, isStatusSwitch, changeProjectStatus);
    if (url.pathname === '/api/file-add' && req.method === 'POST') return handleEdit(req, res, isNamedInFile, saveNewFile);
    if (url.pathname === '/api/planning' && req.method === 'POST') return handleEdit(req, res, isPlanningEdit, savePlanningDate);
    if (url.pathname === '/api/project-type' && req.method === 'POST') return handleEdit(req, res, isTypeChange, changeProjectType);
    if (url.pathname === '/api/compatibility-fix' && req.method === 'POST') return handleEdit(req, res, isCompatibilityFix, fixCompatibility);
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
    if (url.pathname === '/api/milestone-remove' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, deleteMilestone);
    if (url.pathname === '/api/milestone-item' && req.method === 'POST') return handleEdit(req, res, isNewItem, saveNewItem);
    if (url.pathname === '/api/status-table' && req.method === 'POST') return handleEdit(req, res, isStatusRow, saveStatusRow);
    if (url.pathname === '/api/leader-table' && req.method === 'POST') return handleEdit(req, res, isLeaderRow, saveLeaderRow);
    if (url.pathname === '/api/colour-table' && req.method === 'POST') return handleEdit(req, res, isColourRow, saveColourRow);
    if (url.pathname === '/api/task' && req.method === 'POST') return handleEdit(req, res, isNewTask, saveNewTask);
    if (url.pathname === '/api/entities' && req.method === 'POST') return handleEdit(req, res, isNewEntity, createEntity);
    if (url.pathname === '/api/file-body' && req.method === 'POST') return handleEdit(req, res, isRawEdit, saveRawFile);
    if (url.pathname === '/api/entry-field' && req.method === 'POST') return handleEdit(req, res, isFieldEdit, saveEntryField);
    if (url.pathname === '/api/entry-add' && req.method === 'POST') return handleEdit(req, res, isNewEntry, saveNewEntry);
    if (url.pathname === '/api/entry-remove' && req.method === 'POST') return handleEdit(req, res, isHeadingRemoval, deleteEntry);
    if (url.pathname === '/api/mark-reviewed' && req.method === 'POST') return handleEdit(req, res, inFile, markReviewed);
    if (url.pathname === '/api/date' && req.method === 'POST') return handleEdit(req, res, isDateEdit, saveDate);
    if (url.pathname === '/api/projects' && req.method === 'POST') return handleEdit(req, res, isNewProject, createProject);
    if (url.pathname === '/api/options' && req.method === 'POST') return handleEdit(req, res, isOptionsEdit, saveOptions);
    if (url.pathname === '/api/setup' && req.method === 'POST') return handleEdit(req, res, isSetup, saveSetup);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

    if (url.pathname === '/api/options') {
      const options = await readOptionsWithSwitches();
      return sendJson(res, 200, Object.entries(options).map(([key, value]) => ({ key, value, toggle: key in SWITCH_OPTIONS })));
    }
    if (url.pathname === '/api/reports') return sendJson(res, 200, await collectReports());
    if (url.pathname === '/api/timeline') {
      return sendJson(res, 200, { rows: await collectTimeline(), dateFormat: await readDateFormat() });
    }
    if (url.pathname === '/api/history') {
      const file = { review: REVIEW_FILE, focus: FOCUS_FILE }[url.searchParams.get('page')];
      if (!file) return sendJson(res, 404, { error: 'Not found' });
      return sendJson(res, 200, await readHistory(file));
    }
    if (url.pathname === '/api/owner-tags.js') {
      const ids = (await readOwners()).map((o) => o.id);
      const archived = (await readStatuses()).filter((s) => s.type === 'ARCHIVED').map((s) => s.name);
      const showArchived = await readShowArchived();
      return send(res, 200, `window.PMS_OWNER_IDS = ${JSON.stringify(ids)};\nwindow.PMS_ARCHIVED_STATUSES = ${JSON.stringify(archived)};\nwindow.PMS_SHOW_ARCHIVED = ${showArchived};\n`, MIME['.js']);
    }
    if (url.pathname === '/api/components.js') {
      return send(res, 200, `window.PMS_COMPONENTS = ${JSON.stringify(await readComponents())};\n`, MIME['.js']);
    }
    if (url.pathname === '/api/compatibility') {
      const type = url.searchParams.get('type');
      if (type === 'projects') return sendJson(res, 200, await incompatibleProjects());
      if (type === 'entities') return sendJson(res, 200, await incompatibleEntities());
      return sendJson(res, 404, { error: 'Page not found' });
    }
    if (url.pathname === '/api/networking') {
      const networking = await readNetworking(url.searchParams.get('page') || '');
      return networking ? sendJson(res, 200, networking) : sendJson(res, 404, { error: 'Page not found' });
    }
    if (url.pathname === '/api/setup') return sendJson(res, 200, await setupState());
    if (url.pathname === '/api/status-table') return sendJson(res, 200, await readStatusTable());
    if (url.pathname === '/api/leader-table') return sendJson(res, 200, await readLeaderTable());
    if (url.pathname === '/api/colour-table') return sendJson(res, 200, await readColourTable());
    if (url.pathname === '/api/colours.css') return send(res, 200, coloursStylesheet((await readColourTable()).rows), MIME['.css']);
    if (url.pathname === '/api/home') return sendJson(res, 200, await collectHome());
    if (url.pathname === '/api/help') {
      const content = await readIfExists(HELP_FILE);
      const { read, body } = splitHelp(content || '');
      return sendJson(res, 200, { exists: content !== null, content: body, read, dateFormat: await readDateFormat() });
    }
    if (url.pathname === '/api/commitments') return sendJson(res, 200, await readCommitmentList());
    if (url.pathname === '/api/weekly-plan') return sendJson(res, 200, await collectWeeklyPlan());
    if (url.pathname === '/api/weekly-review') return sendJson(res, 200, await collectWeeklyReview());
    if (url.pathname === '/api/nav') return sendJson(res, 200, await collectNav());
    if (url.pathname === '/api/project-options') {
      const [owners, leaders] = await Promise.all([readOwners(), readLeaders()]);
      return sendJson(res, 200, { owners, leaders, types: PROJECT_TYPES });
    }
    if (url.pathname === '/api/entity') {
      const entity = await readEntity(url.searchParams.get('id') || '', url.searchParams.get('tab'), url.searchParams.get('file'));
      if (!entity) return sendJson(res, 404, { error: 'Entity not found' });
      return sendJson(res, 200, Object.assign(entity, { dateFormat: await readDateFormat() }));
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
    return serveStatic(res, url.pathname);
  } catch (err) {
    console.error(err);
    send(res, 500, 'Internal server error');
  }
});

// Every folder the dashboard expects, and the Networking files its pages open. Anything
// already there is left alone.
const REQUIRED_DIRS = ['Networking', 'Images', 'Labels', 'Entities', 'Projects', 'Time_Management'];
const STARTER_FILES = [
  ['Networking/Leads.md', '# Leads\n\n## Contacts\n'],
  ['Networking/Events.md', '# Events\n\n## Upcoming\n'],
  ['Entities/Reports.md', ''], // blank until the first review adds a report
];

// The Help Guide, its screenshots and the logo ship in dashboard/defaults.
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
async function createMissingFolders() {
  for (const dir of REQUIRED_DIRS) await fs.promises.mkdir(path.join(ROOT_DIR, dir), { recursive: true });
  for (const [file, content] of STARTER_FILES) {
    await fs.promises.writeFile(path.join(ROOT_DIR, file), content, { encoding: 'utf8', flag: 'wx' }).catch(unlessExists);
  }
  await copyIfMissing(path.join(DEFAULTS_DIR, 'Help Guide.md'), HELP_FILE);
  await copyFolderIfMissing(path.join(DEFAULTS_DIR, 'Screenshots'), path.join(IMAGES_DIR, 'Screenshots'));
  if (!(await findLogo())) await copyIfMissing(path.join(DEFAULTS_DIR, 'Logo.png'), path.join(IMAGES_DIR, 'Logo.png'));
}

createMissingFolders()
  .catch((err) => console.error('Could not create the starting folders:', err.message))
  .finally(() => {
    server.listen(PORT, HOST, () => {
      console.log(`Octapu System Dashboard running at http://${HOST}:${PORT}`);
      console.log(`Reading projects from the directories named in ${OPTIONS_FILE}`);
    });
  });
