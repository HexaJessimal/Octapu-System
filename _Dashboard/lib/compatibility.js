// The Compatibility pages: what doesn't match the expected layout, and the fixes for it.
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseHeader, createMatcher, taskBlockLines, findTodos, STORAGE_FORMAT, projectTitleError,
  parseTimeframes, tentacleChain, stripComments, LEADER_FIELD, OLD_LEADER_FIELD,
} = require('../todos');
const {
  tentacleProblems, projectProblems, unknownMarkdown, hasDashboardStructure, applyFixes,
  milestoneTitles, ARCHIVE_FIELDS, parseNamedEntries, renameOldLeader, parseEntries, eventDateValue,
  readOldEventDate, setInlineField,
} = require('../document-edits');
const { RENAMED, renamed } = require('./renames');
const { logName, isLogOf } = require('../changes');
const { readText, disk, currentRoot, at, readIfExists } = require('./context');
const {
  TENTACLE_PREFIX, NETWORKING_PREFIX, NETWORKING, isValidEventValue, isNetworkingField, isArchived,
  STATUS_PREFIX, listMarkdown, parseProjectDirs, readOptions, readTaskLists, listProjects,
  primaryFile, readProjectFile, projectTitle, namedFile, readStatuses, readTentacles, readLeaders,
  tentaclePlace, primaryTentacleFile, tentacleFiles, writeFileSafely, updateProjectFile, isFolder,
  folderTentacle, fileTitle,
} = require('./store');
const { entryTaskLines } = require('./tasks');
const { NOT_FOUND, eventFieldTarget } = require('./networking');
const { writeTentacleFile } = require('./documents');

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
// Milestone names in an Active Timeframe's brackets that aren't milestones in the file. They
// can't be guessed, so they're shown in pink to change by hand.
function unknownTimeframeMilestones(content) {
  const titles = milestoneTitles(content).map((title) => title.trim().toLowerCase());
  return parseTimeframes(parseHeader(content, []).timeframe.value, STORAGE_FORMAT)
    .ranges.flatMap((range) => (range.milestones || []).filter((name) => !titles.includes(name.toLowerCase())))
    .map((name) => ({ text: `Active Timeframe names "${name}", which isn't a milestone`, kind: 'error' }));
}

// Status tags the dashboard doesn't read as tasks, as they aren't on a checkbox in a
// milestone, a task list or (on Contacts and Events) a Tasks field. Each has to be moved or
// untagged by hand, so they're shown in pink.
function strayStatusProblems(content, statuses, allowed) {
  return findTodos(content, createMatcher(statuses))
    .filter((item) => !allowed.has(item.line))
    .map((item) => ({ text: `${item.status} on line ${item.line} isn't in a task list or milestone, so it isn't a task: "${item.text}"`, kind: 'error' }));
}

// Events whose fields need changes, then any status tags outside a Tasks field in Events.md
// or Contacts.md, a box for each file.
async function incompatibleEvents() {
  const statuses = await readStatuses();
  const page = NETWORKING.events;
  const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
  const entries = content === null ? [] : parseEntries(content, page.level, isNetworkingField(page)).flatMap((s) => s.entries);
  const rows = entries
    .map((entry) => ({ entry, problems: eventFixes(entry).problems }))
    .filter(({ problems }) => problems.length)
    .map(({ entry, problems }) => ({ name: entry.title, line: entry.line, problems }));
  let checked = entries.length;
  for (const [name, networking] of Object.entries(NETWORKING)) {
    const text = await readIfExists(path.join(at().NETWORKING_DIR, networking.file));
    if (text === null) continue;
    checked++;
    const problems = strayStatusProblems(text, statuses, entryTaskLines(text, networking));
    if (problems.length) rows.push({ name: networking.file, page: name, problems });
  }
  return { checked, rows };
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
  const [tentacles, leaders, projects, taskLists, statuses] = await Promise.all([readTentacles(), readLeaders(), listProjects(), readTaskLists(), readStatuses()]);
  const rows = [];
  let checked = 0;
  for (const project of projects) {
    const { folder, directory } = project;
    const main = primaryFile(project);
    for (const file of project.files) {
      checked++;
      const content = await readProjectFile(project, file);
      const problems = projectFileProblems(project, file, content, { tentacles, leaders, taskLists });
      problems.push(...strayStatusProblems(content, statuses, taskBlockLines(content, taskLists)));
      problems.push(...unknownTimeframeMilestones(content));
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
  await disk.rename(path.join(dir, file), path.join(dir, target));
  const prefixLength = logName(file, '').length - '.log'.length;
  for (const name of (await fs.promises.readdir(dir)).filter(isLogOf(file))) {
    const device = name.slice(prefixLength, -'.log'.length);
    await disk.rename(path.join(dir, name), path.join(dir, logName(target, device))).catch((err) => {
      console.error(`Could not rename the change log ${name}:`, err.message);
    });
  }
}

// ---------- core files ----------

// Each old name in lib/renames.js is listed on Compatibility's Core files page, and Fix issues
// renames it. A file's change logs are renamed with it, and the old name in its `# ` title is
// changed to the new one.
const renameDir = (rule) => (rule.where === 'networking' ? at().NETWORKING_DIR : currentRoot());
const renameLocation = (rule) => (rule.where === 'networking' ? '_Networking' : '');

async function incompatibleCoreFiles() {
  const rows = [];
  for (const rule of RENAMED) {
    const dir = renameDir(rule);
    if (!fs.existsSync(path.join(dir, rule.from))) continue;
    const both = fs.existsSync(path.join(dir, rule.to));
    const problem = both
      ? { text: `Both ${rule.from} and ${rule.to} exist. Move anything you still need from ${rule.from} into ${rule.to}, then delete ${rule.from}`, kind: 'error' }
      : { text: `${rule.from} should be called ${rule.to}, as ${rule.why}`, kind: 'fixable' };
    rows.push({ key: rule.key, name: rule.from, file: rule.from, directory: renameLocation(rule), href: rule.href, problems: [problem] });
  }
  return { checked: RENAMED.length, rows };
}

async function fixCoreFile(key, file) {
  const rule = renamed(key);
  if (!rule || rule.from !== file) return { code: 400, body: { error: 'Invalid request' } };
  const dir = renameDir(rule);
  if (!fs.existsSync(path.join(dir, rule.from))) return NOT_FOUND;
  if (fs.existsSync(path.join(dir, rule.to))) return { code: 409, body: { error: `${rule.to} already exists, so ${rule.from} wasn't renamed.` } };
  if (rule.folder) {
    try {
      await disk.rename(path.join(dir, rule.from), path.join(dir, rule.to));
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
  const [tentacles, taskLists, statuses] = await Promise.all([readTentacles(), readTaskLists(), readStatuses()]);
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
    const content = await readText(path.join(place.dir, file));
    const problems = tentacleFileProblems(tentacle, files, file, content, taskLists);
    problems.push(...strayStatusProblems(content, statuses, taskBlockLines(content, taskLists)));
    if (file !== expected) problems.push({ text: `File is called "${file}", but Tentacles.csv expects "${expected}"`, kind: 'unexpected' });
    if (problems.length) rows.push({ id: tentacle.id, name: tentacle.name, file, problems });
    for (const extra of files.filter((f) => f !== file)) {
      checked++;
      const extraContent = await readText(path.join(place.dir, extra));
      const found = tentacleFileProblems(tentacle, files, extra, extraContent, taskLists);
      found.push(...strayStatusProblems(extraContent, statuses, taskBlockLines(extraContent, taskLists)));
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

module.exports = {
  incompatibleEvents,
  incompatibleProjects,
  incompatibleCoreFiles,
  incompatibleTentacles,
  fixCompatibility,
};
