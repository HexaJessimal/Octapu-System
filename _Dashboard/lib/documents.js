// Project, tentacle, Archive Index and Incubator pages, and the edits made on them: blocks,
// milestones, rows, timeframes, new projects and files, change logs and Syncthing conflicts.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  timeframeEntries, timeframeText, parseHeader, createMatcher, scanLines, setPriority, RECUR_VALUE,
  addPeriod, setPlanningDate, setTentacle, setLeader, setDateField, setDependency, dateError,
  formatDate, toStoredDate, STORAGE_FORMAT, projectTitleError, newProjectFiles, leaderTag,
  newTentacleFile, appendTentacleCsv, PROJECT_TYPES, timeframeError, addTimeframe, editTimeframe,
  tentacleChain, cleanName, stripComments, setHeaderField,
} = require('../todos');
const {
  isReservedTitle, parseBlocks, setBlockBody, addBlock, addMilestone, addMilestoneItem,
  removeMilestone, moveRow, promoteRow, linkRowToBlock, finishMilestone, milestoneBody,
  moveMilestone, setProjectType, setRowDate, advanceRecurring, indentRow, reorderRow,
  milestoneTitles, ARCHIVE_FIELDS, INCUBATOR_FIELDS, parseNamedEntries, addNamedEntry, addEntryMark,
  removeNamedEntry, addTask, isTaskList, cancelRow, deleteRow, editText,
} = require('../document-edits');
const { isDateColumn, catalogFileName, catalogError, newCatalogCsv, parseCatalog, editCatalogCsv } = require('../catalogs');
const { renamed } = require('./renames');
const { diffLines, isLogOf, parseLog, conflictOf } = require('../changes');
const { readText, disk, at, isInside, readIfExists } = require('./context');
const {
  ARCHIVE_FOLDER, INCUBATOR_FOLDER, TENTACLE_PREFIX, field, isArchived, STATUS_PREFIX,
  readTaskLists, readProjectDirs, listDirectory, listProjects, primaryFile, readProjectFile,
  splitTaskLists, projectTitle, projectName, readArchive, dependableArchive, dependencyKey,
  resolveDependency, dependencyChoices, mainFirst, readStatuses, readTentacles, readLeaders,
  readArchiveMode, readSwitch, readRoundupDays, readDateFormat, tentaclePlace, primaryTentacleFile,
  tentacleFiles, writeFileSafely, recordCreated, changelogCutoff, editableFile, updateProjectFile,
  isFolder, folderTentacle, lineError, addNamed, listCatalogs, readCatalogFile, findCatalog,
} = require('./store');
const { taskScope } = require('./tasks');
const { pageOfFolder, NOT_FOUND } = require('./networking');

// The folder must match an actual directory entry exactly, which blocks any path tricks.
async function readProject(folder, requestedFile) {
  const projects = await listProjects();
  const project = projects.find((p) => p.folder === folder);
  if (!project) return null;
  const { directory, ongoing } = project;

  const file = requestedFile && project.files.includes(requestedFile) ? requestedFile : primaryFile(project);
  const content = await readProjectFile(project, file);
  const [statuses, tentacles, leaders, dateFormat] = await Promise.all([readStatuses(), readTentacles(), readLeaders(), readDateFormat()]);
  const todos = scanLines(content, createMatcher(statuses, await taskScope())).map((t) => Object.assign(t, { folder, file }));
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
  const content = await readText(path.join(dir, file));
  const [statuses, leaders] = await Promise.all([readStatuses(), readLeaders()]);
  const blocks = parseBlocks(content);
  return Object.assign(base, parseHeader(content, tentacles), {
    file,
    files: mainFirst(files, primaryTentacleFile(tentacle, files)),
    content,
    statuses,
    tentacles,
    leaders,
    todos: scanLines(content, createMatcher(statuses, await taskScope())).map((t) => Object.assign(t, { folder: base.folder, file })),
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
  await disk.mkdir(dir, { recursive: true });
  await disk.writeFile(full, content, { encoding: 'utf8', flag: 'wx' });
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
    await disk.rm(full, { force: true });
    await disk.rmdir(dir).catch(() => {});
    throw err;
  }
  return { code: 200, body: { ok: true, id, root: place.chain[0] } };
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
    await disk.rename(project.fullPath, target);
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
  await disk.writeFile(full, content, { encoding: 'utf8', flag: 'wx' });
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
    await disk.rename(project.fullPath, target);
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
        reviewed: fields.reviewed.value || null,
        flagged: /^yes$/i.test(fields.flagged.value),
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
    await disk.writeFile(path.join(dir, file), content, { encoding: 'utf8', flag: 'wx' });
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

// The milestones a timeframe is limited to, as named in the file, or null for all of them.
// Names that aren't milestones are dropped, and naming every milestone is the same as none.
function chosenMilestones(content, names) {
  if (!Array.isArray(names) || !names.length) return null;
  const titles = milestoneTitles(content);
  const key = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();
  const chosen = titles.filter((title) => names.some((name) => key(name) === key(title)));
  return chosen.length && chosen.length < titles.length ? chosen : null;
}

async function saveTimeframe({ folder, file, start, end, milestones }) {
  const format = await readDateFormat();
  const error = timeframeError(start, end, format);
  if (error) return { code: 400, body: { error } };
  const [from, to] = [toStoredDate(start, format), toStoredDate(end, format)];
  return updateProjectFile(folder, file, (content) => addTimeframe(content, from, to, chosenMilestones(content, milestones)));
}

// Changes or removes one of a project's existing timeframes.
async function changeTimeframe({ folder, file, index, from, start, end, remove, milestones }) {
  if (remove) return updateProjectFile(folder, file, (content) => editTimeframe(content, index, from, null));
  const format = await readDateFormat();
  const error = timeframeError(start, end, format);
  if (error) return { code: 400, body: { error } };
  const dates = `${toStoredDate(start, format)} to ${toStoredDate(end, format)}`;
  return updateProjectFile(folder, file, (content) => editTimeframe(content, index, from, timeframeText(dates, chosenMilestones(content, milestones))));
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

const saveNewMilestone = (body) => addNamed(body, body.title, addMilestone);
const deleteMilestone = (body) => updateProjectFile(body.folder, body.file, (content) => removeMilestone(content, body.line, body.title));
const saveNewItem = (body) => addNamed(body, body.text, (content, text) => addMilestoneItem(content, body.line, body.title, text, body.depth || 0));

// Tab and Shift+Tab, and dragging, on a task. A refusal comes back as a message.
async function shiftRow(edit, body) {
  const statuses = await readStatuses();
  let refused = null;
  const result = await updateProjectFile(body.folder, body.file, (content) => {
    const out = edit(content, statuses);
    if (out && out.refused) {
      refused = out.refused;
      return content;
    }
    return out;
  });
  return refused ? { code: 409, body: { error: refused } } : result;
}
const indentTask = (body) => shiftRow((content, statuses) => indentRow(content, body.line, body.text, body.direction, statuses), body);
const reorderTask = (body) => shiftRow((content, statuses) => reorderRow(content, body.line, body.text, body.toLine, body.toText, body.after, statuses), body);
const saveNewBlock = async (body) => ((await isReservedBlock(body.folder, body.title)) ? RESERVED_ERROR : addNamed(body, body.title, addBlock));
async function saveNewTask(body) {
  const list = (await readTaskLists()).find((name) => isTaskList([name], body.list));
  if (!list) return { code: 400, body: { error: 'Invalid request' } };
  return addNamed(body, body.text, (content, text) => addTask(content, text, list, body.depth || 0));
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
  await disk.mkdir(directory.fullPath, { recursive: true });
  await disk.mkdir(dir);
  try {
    await disk.writeFile(path.join(dir, spec.file), spec.content, 'utf8');
  } catch (err) {
    await disk.rm(dir, { recursive: true, force: true });
    throw err;
  }
  await recordCreated(path.join(dir, spec.file), spec.content);
  return { code: 200, body: { ok: true, folder: directory.prefix + spec.folder } };
}

// A new catalog file with the default columns. The tag is written in capitals.
async function createCatalog({ tag, name }) {
  const upper = tag.trim().toUpperCase();
  const error = catalogError(upper, name);
  if (error) return { code: 400, body: { error } };
  if ((await listCatalogs()).some((c) => c.tag === upper)) return { code: 409, body: { error: `A catalog already uses the tag ${upper}.` } };
  const file = catalogFileName(upper, name);
  await disk.mkdir(at().CATALOGS_DIR, { recursive: true });
  try {
    await disk.writeFile(path.join(at().CATALOGS_DIR, file), newCatalogCsv(), { encoding: 'utf8', flag: 'wx' });
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
  await disk.rm(copy, { force: true });
  return { code: 200, body: { ok: true } };
}

module.exports = {
  readProject,
  listProjectsWithContent,
  readTentacle,
  tentacleError,
  writeTentacleFile,
  createTentacle,
  openFolder,
  changeProjectStatus,
  readArchivePage,
  saveArchiveEntry,
  removeArchiveEntry,
  archiveProject,
  waitingIdeas,
  readIncubatorPage,
  saveIdea,
  archiveIdea,
  promoteIdea,
  saveNewFile,
  savePlanningDate,
  changeProjectType,
  changePriority,
  advanceRecurringTask,
  changeTentacle,
  changeLeader,
  saveTimeframe,
  changeTimeframe,
  saveText,
  saveRawFile,
  saveBlockBody,
  saveNewMilestone,
  deleteMilestone,
  saveNewItem,
  indentTask,
  reorderTask,
  saveNewBlock,
  saveNewTask,
  saveDependency,
  saveMilestoneOrder,
  changeRow,
  moveTask,
  promoteTask,
  linkTaskToBlock,
  finishWholeMilestone,
  promoteMilestone,
  saveDate,
  createProject,
  createCatalog,
  saveCatalogRow,
  readChangelog,
  readConflicts,
  settleConflict,
};
