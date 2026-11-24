// The left menu, the Dashboard, the Plan page and the Help Guide's read tick.
'use strict';

const fs = require('fs');
const { createMatcher, scanLines, formatDate, STORAGE_FORMAT, tentacleChain } = require('../todos');
const { parseBlocks, milestoneRows, lastReviewDate, addReview } = require('../document-edits');
const { HELP_FILE, IMAGES_DIR, disk, at, readIfExists } = require('./context');
const {
  TENTACLE_PREFIX, NETWORKING_PREFIX, isArchived, readProjectDirs, listDirectory, listProjects,
  primaryFile, readProjectFile, projectTitle, readStatuses, readTentacles, readRoundupDays,
  readDateFormat, dayNumber, tentaclePlace, writeFileSafely, recordCreated, projectTentacleName,
  networkingPage, listCatalogs,
} = require('./store');
const {
  taskScope, collectTodos, liveProjectFiles, taskDue, isIncomplete, isOpenTask, runningTimeframes,
  currentPlan, allTentacleFiles, networkingFiles,
} = require('./tasks');
const { incompatibleEvents, incompatibleProjects, incompatibleCoreFiles, incompatibleTentacles } = require('./compatibility');
const { collectToReview, waitingTasks, collectFlaggedSections, readLastReview, doneSinceReview } = require('./review');

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
      waitingTasks: waiting.length + (await collectFlaggedSections()).length,
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

// A log file as dated entries, in file order, for the History tabs.
async function readHistory(file) {
  const text = await readIfExists(file);
  const entries = text === null ? [] : parseBlocks(text).filter((b) => b.title !== null);
  return { entries: entries.map(({ title, body }) => ({ title, body })), dateFormat: await readDateFormat() };
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

  const match = createMatcher(statuses, await taskScope(true));
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
    await disk.mkdir(at().TIME_MANAGEMENT_DIR, { recursive: true });
    await disk.writeFile(at().FOCUS_FILE, updated, 'utf8');
    await recordCreated(at().FOCUS_FILE, updated);
  } else {
    await writeFileSafely(at().FOCUS_FILE, updated);
  }
  return { code: 200, body: { ok: true } };
}

module.exports = {
  findLogo,
  collectNav,
  readHistory,
  splitHelp,
  setHelpRead,
  collectHome,
  collectWeeklyPlan,
  submitWeeklyFocus,
};
