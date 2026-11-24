// Reading and writing the data: settings files, project and tentacle folders, the Networking
// and catalog files, safe writes with change logs, and finding an editable document.
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseStatuses, withDefaultStatuses, parseTentacles, parseLeaders, parseOptions, parseHeader,
  withAdvance, tentacleChain, AGENDA_GROUPS,
} = require('../todos');
const { isReservedTitle, ARCHIVE_FIELDS, parseNamedEntries, parseEventDate, isTaskList } = require('../document-edits');
const { isDateColumn, parseCatalogFileName, parseCatalog, nextCatalogNumber } = require('../catalogs');
const { RENAMED, currentName } = require('./renames');
const { diffLines, logName, appendToLog, isConflictCopy } = require('../changes');
const {
  DEVICE, requestContext, DASHBOARD_DIR, ROOT_DIR, dataPaths, readText, readDir, existsNow, disk,
  currentRoot, at, isInside, readIfExists,
} = require('./context');

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
    // Leads.md until the page was renamed, which is read until Core files renames it.
    get file() {
      return currentName(at().NETWORKING_DIR, 'contacts', existsNow);
    },
    level: 3,
    section: /^contacts$/i,
    fields: [
      field('Contact Details'),
      field('Links'),
      field('Events & Associations', /^events( & associations)?$/i),
      field('Notes', /^(.+ )?notes$/i), // also Octapu Notes, Pixelgrinder Notes and Label Notes
      field('Tasks'), // where a contact's tasks count, as on an event
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
const DEFAULT_COLOURS_FILE = path.resolve(DASHBOARD_DIR, 'defaults', 'Colours.csv');
const SETUP_DATE_FORMATS = ['DD.MM.YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const setupFiles = () => ['STATUS_FILE', 'TENTACLES_FILE', 'LEADERS_FILE', 'OPTIONS_FILE', 'COLOURS_FILE'].map((name) => at()[name]);
const FALLBACK_DATE_FORMAT = 'YYYY-MM-DD'; // only used if Options.csv doesn't set DATEFORMAT
const FALLBACK_PROJECT_DIRS = 'Projects'; // only used if Options.csv has no PROJECTS row
const FALLBACK_TASK_LISTS = 'Tasks'; // only used if Options.csv has no TASKLISTS row
// Folders the dashboard uses for something else, so they can't also hold projects.
const RESERVED_DIRS = new Set(
  [DASHBOARD_DIR, ...['NETWORKING_DIR', 'CATALOGS_DIR', 'TIME_MANAGEMENT_DIR'].map((name) => dataPaths(ROOT_DIR)[name]), ...RENAMED.filter((rule) => rule.folder).flatMap((rule) => [rule.to, rule.from])].map((dir) => path.basename(dir).toLowerCase())
);
const ARCHIVED_FOLDER = /^\d{4}[.\-_]\d{2}[.\-_]\d{2}/;
// A project is archived once its folder starts with a date or it has a Date Closed. Either
// way it's hidden from the dashboard, even when SHOWARCHIVED is on.
const isArchived = (project) => ARCHIVED_FOLDER.test(project.name) || project.closed;
const STATUS_PREFIX = /^(\+|-|\d{4}[.\-_]\d{2}[.\-_]\d{2}_?)/;

async function listMarkdown(dir) {
  const entries = await readDir(dir);
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
    entries = await readDir(directory.fullPath);
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
const readProjectFile = (project, file) => readText(path.join(project.fullPath, file));

// One entry per task list, in the order of TASKLISTS, sent separately from the file's other
// blocks. A list the file doesn't have yet comes back empty.
function splitTaskLists(blocks, names) {
  const found = names.map((name) => blocks.find((b) => b.title !== null && isTaskList([name], b.title)));
  return {
    blocks: blocks.filter((b) => !found.includes(b)),
    taskLists: names.map((name, i) => Object.assign({ body: '', bodyLine: null }, found[i], { name })),
  };
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
    return parse(await readText(file));
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

// A YYYY-MM-DD date as a whole number of days, so two can be subtracted.
const dayNumber = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
};

// `date` moved by a number of days, as YYYY-MM-DD.
const shiftDate = (date, days) => new Date((dayNumber(date) + days) * 86400000).toISOString().slice(0, 10);

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

// Writes one at a time, so two quick changes can't overwrite each other.
let writeQueue = Promise.resolve();
function enqueueWrite(task) {
  const run = writeQueue.then(task);
  writeQueue = run.catch(() => {});
  return run;
}

// On Windows a rename over a file fails for a moment while something else has it open, such
// as Syncthing scanning it or Obsidian saving, so it's tried again a few times before giving up.
const RENAME_WAITS = [50, 100, 200, 400, 800];
async function renameOver(from, to) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await disk.rename(from, to);
    } catch (err) {
      if (attempt >= RENAME_WAITS.length || !['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RENAME_WAITS[attempt]));
    }
  }
}

// Writes to a temp file then renames, so a crash can't leave a half-written markdown file.
// A markdown file's change is added to its change log while MULTIUSER is on.
async function writeFileSafely(full, data) {
  const { mode } = await fs.promises.stat(full);
  const before = isMarkdown(full) ? await fs.promises.readFile(full, 'utf8') : null;
  const temp = `${full}.${process.pid}.tmp`;
  try {
    await disk.writeFile(temp, data, { encoding: 'utf8', mode });
    await renameOver(temp, full);
  } catch (err) {
    await disk.rm(temp, { force: true });
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
    await disk.writeFile(temp, text, 'utf8');
    await renameOver(temp, log);
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

const networkingPage = (name) => (Object.hasOwn(NETWORKING, name) ? NETWORKING[name] : null);

const isFolder = (full) => fs.promises.stat(full).then((s) => s.isDirectory(), () => false);

const folderTentacle = (name) => name.replace(STATUS_PREFIX, '').split('_')[0];

const fileTitle = (file) => file.replace(/\.md$/i, '');

// Returns an error message, or null if `text` works as a single line of text.
function lineError(text) {
  if (!text) return 'Enter some text.';
  return /[\r\n]/.test(text) ? 'Keep this to a single line.' : null;
}

// Shared by the three "add something with a name" requests.
function addNamed(body, name, insert) {
  const text = name.trim();
  const error = lineError(text);
  if (error) return { code: 400, body: { error } };
  return updateProjectFile(body.folder, body.file, (content) => insert(content, text));
}

// Applies one row's edit to a label file, creating the file if this is its first row.
async function editLabelFile(file, header, edit, body) {
  const existing = await readIfExists(file);
  const result = edit(existing && existing.trim() ? existing : `${header}\r\n`, body);
  if (result.error) return { code: 400, body: { error: result.error } };
  if (existing === null) {
    await disk.mkdir(path.dirname(file), { recursive: true });
    await disk.writeFile(file, result.text, 'utf8');
  } else {
    await writeFileSafely(file, result.text);
  }
  return { code: 200, body: { ok: true } };
}

// ---------- catalogs ----------

// Every TAG_Name.csv in the _Catalogs folder, by name. Other files there are left alone.
async function listCatalogs() {
  let names;
  try {
    names = (await readDir(at().CATALOGS_DIR)).map((entry) => entry.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return names.map(parseCatalogFileName).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

const readCatalogFile = (catalog) => readText(path.join(at().CATALOGS_DIR, catalog.file));

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

module.exports = {
  AGENDA_HEADER,
  ARCHIVE_PREFIX,
  ARCHIVE_FOLDER,
  INCUBATOR_FOLDER,
  TENTACLE_PREFIX,
  NETWORKING_PREFIX,
  field,
  NETWORKING,
  YES_NO,
  isValidEventValue,
  eventValue,
  eventDateOf,
  eventProgress,
  isNetworkingField,
  DEFAULT_ROUNDUP_DAYS,
  DEFAULT_COLOURS_FILE,
  SETUP_DATE_FORMATS,
  setupFiles,
  FALLBACK_PROJECT_DIRS,
  FALLBACK_TASK_LISTS,
  isArchived,
  STATUS_PREFIX,
  listMarkdown,
  projectDirError,
  parseProjectDirs,
  readOptions,
  splitList,
  readTaskLists,
  readProjectDirs,
  listDirectory,
  listProjects,
  primaryFile,
  readProjectFile,
  splitTaskLists,
  projectTitle,
  projectName,
  readArchive,
  dependableArchive,
  dependencyKey,
  resolveDependency,
  dependencyChoices,
  namedFile,
  mainFirst,
  readStatuses,
  readTentacles,
  readLeaders,
  SWITCH_OPTIONS,
  SWITCH_VALUES,
  CHOICE_OPTIONS,
  readOptionsWithSwitches,
  readArchiveMode,
  readSwitch,
  readShowArchived,
  readRoundupDays,
  readDateFormat,
  dayNumber,
  shiftDate,
  tentaclePlace,
  primaryTentacleFile,
  tentacleFiles,
  enqueueWrite,
  writeFileSafely,
  recordCreated,
  changelogCutoff,
  editableFile,
  updateProjectFile,
  projectTentacleId,
  projectTentacleName,
  topTentacleName,
  networkingPage,
  isFolder,
  folderTentacle,
  fileTitle,
  lineError,
  addNamed,
  editLabelFile,
  listCatalogs,
  readCatalogFile,
  collectCatalogs,
  findCatalog,
  readCatalog,
};
