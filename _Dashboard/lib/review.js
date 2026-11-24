// The Review page, its agenda, reports and the Task Archive.
'use strict';

const path = require('path');
const {
  parseHeader, createMatcher, scanLines, findTodos, replaceStatus, setDateField, setReviewFlag,
  formatDate, STORAGE_FORMAT, parseTimeframes, tentacleChain, stripComments, AGENDA_GROUPS,
  parseAgenda, parseAgendaRule, editAgendaCsv,
} = require('../todos');
const {
  milestoneRows, lastReviewDate, setSectionFlag, markSectionReviewed, flaggedSections,
  takeArchivedRows, addTaskArchive, addReview, REPORT_FIELDS, addReport, parseReports,
} = require('../document-edits');
const { readText, disk, at, readIfExists } = require('./context');
const {
  AGENDA_HEADER, ARCHIVE_FOLDER, INCUBATOR_FOLDER, TENTACLE_PREFIX, NETWORKING_PREFIX, field,
  isArchived, readProjectDirs, listProjects, primaryFile, readProjectFile, projectTitle,
  projectName, dependencyKey, readStatuses, readTentacles, readRoundupDays, readDateFormat,
  shiftDate, tentaclePlace, primaryTentacleFile, tentacleFiles, writeFileSafely, recordCreated,
  updateProjectFile, projectTentacleName, networkingPage, editLabelFile, collectCatalogs,
} = require('./store');
const {
  taskScope, networkingScope, collectTodos, focusKey, readLatestFocus, liveProjectFiles, taskDue,
  isIncomplete, isOpenTask, runningTimeframes, allTentacleFiles, networkingFiles,
} = require('./tasks');
const { waitingIdeas } = require('./documents');
const { timelineEvents } = require('./timeline');

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
  const content = await readText(path.join(place.dir, file));
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

// A milestone, Scratchpad block, event, contact or idea, flagged for review or not.
const flagSection = ({ folder, file, line, title, on }) => updateProjectFile(folder, file, (content) => setSectionFlag(content, line, title, on));

// A section reviewed: its own date, and for a project or tentacle the file's Date Reviewed too.
function markSectionDone({ folder, file, line, title }) {
  const today = formatDate(new Date(), STORAGE_FORMAT);
  const whole = !folder.startsWith(NETWORKING_PREFIX) && folder !== INCUBATOR_FOLDER && folder !== ARCHIVE_FOLDER;
  return updateProjectFile(folder, file, (content) => {
    const done = markSectionReviewed(content, line, title, today);
    return done !== null && whole ? setDateField(done, 'reviewed', today) : done;
  });
}

// Every flagged section, for the Review page: in live projects' and tentacles' files, on
// Contacts and Events, and in the Incubator. Each has the page that shows it.
async function collectFlaggedSections() {
  const found = [];
  const add = (file, kindOf, href) =>
    flaggedSections(file.content).forEach((s) => found.push({ folder: file.folder, file: file.file, line: s.line, title: s.title, kind: kindOf(s), source: file.name, href: href + '#' + encodeURIComponent(s.title) }));
  const milestoneLines = (content) => {
    const lines = stripComments(content);
    const start = lines.findIndex((l) => /^##\s+milestones?\s*$/i.test(l.trim()));
    if (start === -1) return () => false;
    let end = lines.findIndex((l, i) => i > start && /^#{1,2}\s/.test(l));
    if (end === -1) end = lines.length;
    return (s) => s.level === 3 && s.line - 1 > start && s.line - 1 < end;
  };
  for (const f of await liveProjectFiles()) {
    const inMilestones = milestoneLines(f.content);
    add({ ...f, name: projectTitle(f.folder) }, (s) => (inMilestones(s) ? 'Milestone' : 'Block'), 'project.html?folder=' + encodeURIComponent(f.folder) + '&file=' + encodeURIComponent(f.file));
  }
  const tentacles = await readTentacles();
  for (const f of await allTentacleFiles()) {
    const place = tentaclePlace(tentacles, f.folder.slice(TENTACLE_PREFIX.length));
    const id = f.folder.slice(TENTACLE_PREFIX.length);
    const tab = place.chain[0] === id ? '' : '&tab=' + encodeURIComponent(id);
    add(f, () => 'Block', 'tentacle.html?id=' + encodeURIComponent(place.chain[0]) + tab + '&file=' + encodeURIComponent(f.file));
  }
  for (const f of await networkingFiles()) {
    const name = f.folder.slice(NETWORKING_PREFIX.length);
    const page = networkingPage(name);
    add(f, (s) => (s.level === page.level ? page.noun[0].toUpperCase() + page.noun.slice(1) : 'Block'), 'networking.html?page=' + name);
  }
  const incubator = await readIfExists(at().INCUBATOR_FILE);
  if (incubator !== null) add({ folder: INCUBATOR_FOLDER, file: path.basename(at().INCUBATOR_FILE), content: incubator, name: 'Incubator' }, () => 'Idea', 'incubator.html');
  return found;
}

// Every file a review covers. `sourceOf` names where a line came from, or gives null if the
// line isn't part of anything to review. Projects are named by their folder instead.
async function reviewableFiles() {
  const scope = await taskScope();
  const tentacles = (await allTentacleFiles()).map((f) => Object.assign(f, { sourceOf: () => f.name, scope }));
  // `sourceIn` gives the same for another version of the file's text.
  const networking = (await networkingFiles()).map((f) => {
    const sourceIn = (text) => {
      const entryAt = text === f.content ? f.entryAt : f.entriesIn(text);
      return (line) => {
        const entry = entryAt(line);
        return entry ? `${f.name}: ${entry.title}` : null;
      };
    };
    return Object.assign(f, { sourceOf: sourceIn(f.content), sourceIn, scope: networkingScope(networkingPage(f.folder.slice(NETWORKING_PREFIX.length))) });
  });
  const projects = (await liveProjectFiles()).map((f) => Object.assign(f, { scope }));
  return [...projects, ...tentacles, ...networking];
}

const doneRows = (content, match, sourceOf) => findTodos(content, match).filter((item) => item.type === 'DONE' && (!sourceOf || sourceOf(item.line) !== null));

// Every DONE type item a review would archive, with the date from its CLOSED line, if any.
async function doneItems(statuses) {
  const found = [];
  for (const { folder, file, content, sourceOf, scope } of await reviewableFiles()) {
    for (const item of doneRows(content, createMatcher(statuses, scope), sourceOf)) {
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
    sections: await collectFlaggedSections(),
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
  const target = statuses.find((s) => s.type === 'ARCHIVED').name;
  const today = formatDate(new Date(), STORAGE_FORMAT);
  const figures = await measureReport(statuses, await readLastReview(), today, text);

  const changes = [];
  const taken = []; // { file, rows } for each file with tasks moving to the Task Archive
  let archived = 0;
  for (const f of await reviewableFiles()) {
    // First, tasks that were already ARCHIVED leave for _Task_Archive.md...
    const keep = f.sourceOf ? (line) => f.sourceOf(line) !== null : undefined;
    const match = createMatcher(statuses, f.scope);
    const took = takeArchivedRows(f.content, statuses, keep, f.scope);
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
        await disk.writeFile(at().TASK_ARCHIVE_FILE, updatedTaskArchive, { encoding: 'utf8', flag: 'wx' });
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
      await disk.mkdir(at().TENTACLE_DIR, { recursive: true });
      await disk.writeFile(at().REPORTS_FILE, updatedReports, { encoding: 'utf8', flag: 'wx' });
      await recordCreated(at().REPORTS_FILE, updatedReports);
    } else {
      await writeFileSafely(at().REPORTS_FILE, updatedReports);
    }
    written.push({ full: at().REPORTS_FILE, before: reports });
    if (review === null) {
      await disk.mkdir(at().TIME_MANAGEMENT_DIR, { recursive: true });
      await disk.writeFile(at().REVIEW_FILE, updatedReview, 'utf8');
      await recordCreated(at().REVIEW_FILE, updatedReview);
    } else {
      await writeFileSafely(at().REVIEW_FILE, updatedReview);
    }
  } catch (err) {
    // A Reports.md or _Task_Archive.md this review created is removed again rather than left empty.
    for (const change of written) await (change.before === null ? disk.unlink(change.full) : writeFileSafely(change.full, change.before)).catch(() => {});
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

module.exports = {
  collectToReview,
  waitingTasks,
  readAgendaTable,
  isAgendaRow,
  isAgendaCheck,
  saveAgendaRow,
  checkAgendaItem,
  markReviewed,
  flagForReview,
  flagSection,
  markSectionDone,
  collectFlaggedSections,
  readLastReview,
  doneSinceReview,
  collectWeeklyReview,
  collectReports,
  submitWeeklyReview,
  readTaskArchive,
};
