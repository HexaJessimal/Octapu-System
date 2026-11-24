// Tasks across files: where statuses count, collecting todos, and changing a task's status.
'use strict';

const path = require('path');
const {
  PRIORITIES, moveToStatus, parseHeader, createMatcher, taskBlockLines, CHECKBOX_ROW, findTodos,
  toggleCheckbox, STORAGE_FORMAT, parseTimeframes, stripComments,
} = require('../todos');
const { parseBlocks, milestoneRows, lastReviewDate, parseFocus, parseEntries } = require('../document-edits');
const { readText, at, readIfExists } = require('./context');
const {
  TENTACLE_PREFIX, NETWORKING_PREFIX, field, NETWORKING, isNetworkingField, isArchived,
  readTaskLists, listProjects, readProjectFile, projectTitle, readStatuses, readTentacles,
  readDateFormat, tentaclePlace, tentacleFiles, updateProjectFile, projectTentacleId,
  projectTentacleName, topTentacleName, networkingPage,
} = require('./store');

// Where statuses count. In project and tentacle files: checkbox rows in milestones and task
// lists. On Contacts and Events: checkbox rows in an entry's Tasks field.
async function taskScope(strict = false) {
  const taskLists = await readTaskLists();
  return { allowed: (markdown) => taskBlockLines(markdown, taskLists), strict };
}
function entryTaskLines(markdown, page) {
  const visible = stripComments(markdown);
  const allowed = new Set();
  for (const entry of parseEntries(markdown, page.level, isNetworkingField(page)).flatMap((s) => s.entries)) {
    for (const field of entry.fields.filter((f) => /^tasks$/i.test(f.label))) {
      for (let line = field.bodyLine; line <= field.lastLine; line++) if (CHECKBOX_ROW.test(visible[line - 1] || '')) allowed.add(line);
    }
  }
  return allowed;
}
const networkingScope = (page) => ({ allowed: (markdown) => entryTaskLines(markdown, page), strict: false });

// Status-prefixed items from every markdown file of every project that isn't archived.
// `find` can be swapped for scanLines to also get checkboxes with no status.
async function collectTodos(find = findTodos) {
  const statuses = await readStatuses();
  const match = createMatcher(statuses, await taskScope());
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
      const content = await readText(path.join(place.dir, file));
      for (const item of find(content, match)) {
        const named = focused && focused.has(focusKey(item.editText || ''));
        items.push(Object.assign(item, { folder: TENTACLE_PREFIX + row.id, file, highlight: focused ? (named ? 'milestone' : 'project') : null, tentacle, tentacleName: topTentacleName(tentacles, row.id) }));
      }
    }
  }
  // Tasks on the Contacts and Events pages, as long as they're inside a contact or an event.
  for (const page of await networkingFiles()) {
    for (const item of find(page.content, createMatcher(statuses, networkingScope(networkingPage(page.folder.slice(NETWORKING_PREFIX.length)))))) {
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

async function changeStatus({ folder, file, line, from, to }) {
  const statuses = await readStatuses();
  if (!statuses.some((s) => s.name === to)) return { code: 400, body: { error: `"${to}" is not in Status.csv.` } };
  return updateProjectFile(folder, file, (content) => moveToStatus(content, line, from, to, statuses, new Date()));
}

// Ticks or unticks a box with no status. Whether ticking gives it a status depends on where
// statuses count in that kind of file: an entry's Tasks in Contacts and Events, or a task list.
async function checkBox({ folder, file, line, text, checked }) {
  const statuses = await readStatuses();
  const page = folder.startsWith(NETWORKING_PREFIX) ? networkingPage(folder.slice(NETWORKING_PREFIX.length)) : null;
  const scope = page ? networkingScope(page) : await taskScope();
  return updateProjectFile(folder, file, (content) => toggleCheckbox(content, line, text, checked, statuses, scope.allowed(content), new Date()));
}

// Every markdown file of every project that isn't archived, with its text.
async function liveProjectFiles() {
  const files = [];
  for (const project of await listProjects()) {
    if (isArchived(project)) continue;
    for (const file of project.files) {
      const full = path.join(project.fullPath, file);
      files.push({ folder: project.folder, name: project.name, ongoing: project.ongoing, file, full, content: await readText(full) });
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

// Every markdown file of every tentacle.
async function allTentacleFiles() {
  const tentacles = await readTentacles();
  const files = [];
  for (const tentacle of tentacles) {
    const place = tentaclePlace(tentacles, tentacle.id);
    if (!place) continue;
    for (const file of await tentacleFiles(place.dir)) {
      const full = path.join(place.dir, file);
      files.push({ folder: TENTACLE_PREFIX + tentacle.id, file, full, name: tentacle.name, content: await readText(full) });
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

module.exports = {
  taskScope,
  entryTaskLines,
  networkingScope,
  collectTodos,
  focusKey,
  readLatestFocus,
  changeStatus,
  checkBox,
  liveProjectFiles,
  taskDue,
  isIncomplete,
  isOpenTask,
  runningTimeframes,
  currentPlan,
  allTentacleFiles,
  networkingFiles,
};
