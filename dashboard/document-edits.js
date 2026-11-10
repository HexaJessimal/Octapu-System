// Structural edits to a project file: its scratchpad blocks, milestones and single-line text.
// Each edit checks the text it replaces is still there, and returns null if it isn't.
'use strict';

const { PLANNING_LINE, setPlanningDate, PRIORITIES, stripComments, titleIndex, findField, setHeaderField, editLine, insertLine, createMatcher, scanLines, parseHeader } = require('./todos');

const HEADER_FIELD = /^\s*\*\*[^*]+\*\*\s*:/;
// Project files also write these with the colon inside the bold. Other files keep such lines
// on their Scratchpad, as Events.md does with its Created line.
const PROJECT_TYPE_FIELD = /^\s*\*\*\s*project type\s*(?:\*\*\s*:|:\s*\*\*)/i;
const PROJECT_HEADER_FIELD = /^\s*\*\*\s*(?:project type|(?:date\s+)?created):\*\*/i;
const SECTION_HEADING = /^#{1,2}\s/; // a level 1 or 2 heading starts a new section
const MILESTONES_HEADING = /^##\s+milestones?\s*$/i;
const MILESTONE_HEADING = /^###\s+(.*?)\s*$/;
const RESERVED_TITLE = /^(milestones?|notes)$/i;

const isReservedTitle = (title) => RESERVED_TITLE.test(title.trim());
const normalTitle = (title) => title.trim().replace(/\s+/g, ' ').toLowerCase();
// True if `title` is one of the task lists named in `taskLists`.
const isTaskList = (taskLists, title) => taskLists.some((name) => normalTitle(name) === normalTitle(title));
function taskListHeading(name) {
  const words = name.trim().split(/\s+/).map((word) => word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  return new RegExp(`^##\\s+${words.join('\\s+')}\\s*$`, 'i');
}

function rawLines(markdown) {
  return markdown.replace(/^﻿/, '').split(/\r\n?|\n/);
}

const isBlank = (line) => line.trim() === '';

// The 1-based number of the last non-blank line in [first, last], or 0 if there's none.
function lastContentLine(raw, first, last) {
  for (let n = last; n >= first; n--) if (!isBlank(raw[n - 1])) return n;
  return 0;
}

// Replaces lines first..last (1-based, inclusive), keeping every other line ending.
function replaceLines(markdown, first, last, lines) {
  const bom = markdown.startsWith('﻿') ? '﻿' : '';
  const body = markdown.slice(bom.length);
  const eol = (body.match(/\r\n?|\n/) || ['\n'])[0];
  const parts = body.split(/(\r\n?|\n)/); // text, ending, text, ending…
  return bom + parts.slice(0, (first - 1) * 2).join('') + lines.join(eol) + parts.slice(last * 2 - 1).join('');
}

// Removes lines first..last (1-based, inclusive) and their line endings.
function removeLines(markdown, first, last) {
  const bom = markdown.startsWith('﻿') ? '﻿' : '';
  const parts = markdown.slice(bom.length).split(/(\r\n?|\n)/);
  return bom + parts.slice(0, (first - 1) * 2).join('') + parts.slice(last * 2).join('');
}

// The row at `line`, if it still has this status and text.
function findRow(markdown, line, status, text, statuses) {
  const item = scanLines(markdown, createMatcher(statuses)).find((i) => i.line === line);
  return item && item.status === status && item.editText === text ? item : null;
}

// Strikes a row through, status and all, and unticks its checkbox. A struck-through row
// no longer counts as a todo or towards milestone progress.
function cancelRow(markdown, line, status, text, statuses) {
  const item = findRow(markdown, line, status, text, statuses);
  if (!item || item.contentAt >= item.contentEnd) return null;
  if (item.cancelled) return markdown;
  return editLine(markdown, line, (row) => {
    let out = row.slice(0, item.contentAt) + '~~' + row.slice(item.contentAt, item.contentEnd) + '~~' + row.slice(item.contentEnd);
    if (item.mark !== null && item.mark !== ' ') out = out.slice(0, item.markAt) + ' ' + out.slice(item.markAt + 1);
    return out;
  });
}

// Removes a row, along with the CLOSED/SCHEDULED/DEADLINE lines that belong to it. Rows
// nested under it stay.
function deleteRow(markdown, line, status, text, statuses) {
  if (!findRow(markdown, line, status, text, statuses)) return null;
  const visible = stripComments(markdown);
  let last = line;
  while (last < visible.length && PLANNING_LINE.test(visible[last])) last++;
  return removeLines(markdown, line, last);
}

// Sets a row's SCHEDULED or DEADLINE date, or removes it if `date` is null.
function setRowDate(markdown, line, status, text, kind, date, statuses) {
  return findRow(markdown, line, status, text, statuses) ? setPlanningDate(markdown, line, kind, date) : null;
}

// The scratchpad's blocks: everything except the header and the Milestones section. Text
// before the first heading is a block with no title (line and title are null).
function parseBlocks(markdown) {
  const raw = rawLines(markdown);
  const visible = stripComments(markdown);
  const title = titleIndex(visible);

  let start = title === -1 ? 0 : title + 1;
  // Blankness is judged on the raw text, so code or a comment straight after the header counts as content.
  const isProject = visible.some((l) => PROJECT_TYPE_FIELD.test(l));
  const isHeader = (l) => HEADER_FIELD.test(l) || (isProject && PROJECT_HEADER_FIELD.test(l));
  while (start < raw.length && (isBlank(raw[start]) || isHeader(visible[start]))) start++;

  const headings = [];
  for (let i = start; i < visible.length; i++) if (SECTION_HEADING.test(visible[i])) headings.push(i);

  const block = (headingIdx, first, end) => {
    const lines = raw.slice(first, end);
    const firstText = lines.findIndex((l) => !isBlank(l));
    const lastText = lastContentLine(lines, 1, lines.length);
    return {
      line: headingIdx === null ? null : headingIdx + 1,
      first: first + 1,
      last: end,
      bodyLine: firstText === -1 ? first + 1 : first + firstText + 1,
      body: firstText === -1 ? '' : lines.slice(firstText, lastText).join('\n'),
    };
  };

  const blocks = [];
  const firstHeading = headings.length ? headings[0] : visible.length;
  if (raw.slice(start, firstHeading).some((l) => !isBlank(l))) {
    blocks.push(Object.assign(block(null, start, firstHeading), { title: null, titleEditable: false }));
  }
  headings.forEach((idx, n) => {
    if (MILESTONES_HEADING.test(visible[idx].trim())) return;
    const end = n + 1 < headings.length ? headings[n + 1] : visible.length;
    const heading = visible[idx].replace(/^#{1,2}\s+/, '').replace(/\s*#*\s*$/, '').trim();
    blocks.push(Object.assign(block(idx, idx + 1, end), { title: heading, titleEditable: !isReservedTitle(heading) }));
  });
  return blocks;
}

// Replaces a block's text, keeping one blank line either side of it.
function setBlockBody(markdown, line, from, to) {
  const target = parseBlocks(markdown).find((b) => b.line === line);
  if (!target || target.body !== from) return null;
  const text = to.replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd();
  // Untitled text starts after the header's blank lines, so it doesn't need its own.
  const lines = text ? [...(line === null ? [] : ['']), ...text.split('\n'), ''] : [''];
  if (target.first > target.last) return text ? insertLine(markdown, line, lines) : markdown;
  return replaceLines(markdown, target.first, target.last, lines);
}

const isRule = (line) => /^\s*-{3,}\s*$/.test(line);

const BOLD_LABEL = /^\s*\*\*\s*([^*]+?)\s*:?\s*\*\*\s*:?\s*(.*)$/;

// Splits an entry's body at each bold line that `isField` accepts. Each field's value is
// the text up to the next one, and `line` is the label's line. Any text before the first
// label is a field with no label, whose `line` is the entry's heading.
function entryFields(raw, visible, entry, isField) {
  const starts = [];
  for (let i = entry.bodyLine - 1; i < entry.lastLine; i++) {
    const match = visible[i].match(BOLD_LABEL);
    if (match && isField(match[1])) starts.push({ at: i, label: match[1], inline: match[2].trim() });
  }
  const trimmed = (from, to) => {
    let a = from;
    let b = to;
    while (a < b && isBlank(raw[a])) a++;
    while (b > a && isBlank(raw[b - 1])) b--;
    return [a, b];
  };
  const fields = [];
  const [introA, introB] = trimmed(entry.bodyLine - 1, starts.length ? starts[0].at : entry.lastLine);
  if (introB > introA) fields.push({ label: null, line: entry.line, bodyLine: introA + 1, lastLine: introB, value: raw.slice(introA, introB).join('\n') });
  starts.forEach((start, n) => {
    const [a, b] = trimmed(start.at + 1, n + 1 < starts.length ? starts[n + 1].at : entry.lastLine);
    const rest = raw.slice(a, b);
    if (start.inline) {
      // "**Date**: 25.07.26" has its value on the label's own line.
      fields.push({ label: start.label, line: start.at + 1, inline: true, bodyLine: start.at + 1, lastLine: Math.max(b, start.at + 1), value: [start.inline, ...rest].join('\n') });
    } else {
      fields.push({ label: start.label, line: start.at + 1, bodyLine: a + 1, lastLine: b, value: rest.join('\n') });
    }
  });
  return fields;
}

// Reads a file made of `##` sections holding entries with headings `level` deep. An entry's
// body runs up to the next entry or section, without the `---` rules that wrap it.
function parseEntries(markdown, level, isField = () => false) {
  const raw = rawLines(markdown);
  const visible = stripComments(markdown);
  const entryHeading = new RegExp(`^#{${level}}\\s+(.*?)\\s*#*\\s*$`);
  const sections = [];
  let section = null;
  let entry = null;

  const finish = (end) => {
    if (!entry) return;
    let first = entry.line;
    while (first < end && isBlank(raw[first])) first++;
    if (first < end && isRule(raw[first])) first++;
    while (first < end && isBlank(raw[first])) first++;
    let last = end;
    while (last > first && isBlank(raw[last - 1])) last--;
    if (last > first && isRule(raw[last - 1])) last--;
    while (last > first && isBlank(raw[last - 1])) last--;
    Object.assign(entry, { bodyLine: first + 1, lastLine: last, end, body: raw.slice(first, last).join('\n') });
    entry.fields = entryFields(raw, visible, entry, isField);
    entry = null;
  };

  visible.forEach((line, i) => {
    const top = line.match(/^(#{1,2})\s+(.*?)\s*#*\s*$/);
    if (top) {
      finish(i);
      if (section) section.end = i;
      section = top[1] === '##' ? { title: top[2], line: i + 1, entries: [] } : null;
      if (section) sections.push(section);
      return;
    }
    const heading = line.match(entryHeading);
    if (heading && section) {
      finish(i);
      entry = { title: heading[1], line: i + 1 };
      section.entries.push(entry);
    }
  });
  finish(visible.length);
  if (section) section.end = visible.length;
  return sections;
}

const cleanFieldText = (to) => to.replace(/\r\n?/g, '\n').replace(/^(?:[ \t]*\n)+/, '').trimEnd();
const allEntries = (markdown, level, isField) => parseEntries(markdown, level, isField).flatMap((s) => s.entries);

// Replaces one field's value. Its label and everything else stay. Returns null if the
// field has changed.
function setEntryField(markdown, level, isField, line, from, to) {
  const field = allEntries(markdown, level, isField).flatMap((e) => e.fields).find((f) => f.line === line);
  if (!field || field.value !== from) return null;
  const text = cleanFieldText(to);
  const lines = text ? text.split('\n') : [''];
  if (field.inline) return replaceLines(markdown, field.bodyLine, field.lastLine, [`**${field.label}**`, ...lines]);
  if (!from) return text ? insertLine(markdown, field.line, lines) : markdown;
  return replaceLines(markdown, field.bodyLine, field.lastLine, lines);
}

// Adds a field the entry doesn't have yet, after the rest of its text.
function addEntryField(markdown, level, isField, line, label, to) {
  const entry = allEntries(markdown, level, isField).find((e) => e.line === line);
  if (!entry) return null;
  const text = cleanFieldText(to);
  return text ? insertLine(markdown, entry.lastLine, ['', `**${label}**`, ...text.split('\n')]) : markdown;
}

// A new entry goes at the end of its section, with each field's label ready to fill in.
function addEntry(markdown, level, sectionTitle, title, labels) {
  const section = parseEntries(markdown, level).find((s) => s.title === sectionTitle);
  if (!section) return null;
  const last = lastContentLine(rawLines(markdown), section.line, section.end);
  const body = labels.flatMap((label) => [`**${label}**`, '']);
  return insertLine(markdown, last, ['', `${'#'.repeat(level)} ${title}`, '---', '', ...body, '---']);
}

// Removes an entry from its heading up to the next one. Returns null if it has changed.
function removeEntry(markdown, level, line, title) {
  const entry = allEntries(markdown, level).find((e) => e.line === line);
  return entry && entry.title === title ? removeLines(markdown, entry.line, entry.end) : null;
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// The last date mentioned in `text`, as YYYY-MM-DD, or null. Reads day-first numeric dates
// (25.07.26, 11-13.09.26), YYYY-MM-DD, and named months (24th July 2027, July 2027).
function latestDate(text) {
  const found = [];
  const add = (year, month, day) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return false;
    found.push(date.toISOString().slice(0, 10));
    return true;
  };
  const numeric = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})(?!\d)/g;
  for (let m = numeric.exec(text); m; m = numeric.exec(text)) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    // In 11-13.09.26 the first attempt reads a month of 13, so retry from the next number.
    if (!add(year, Number(m[2]), Number(m[1]))) numeric.lastIndex = m.index + m[1].length;
  }
  for (const m of text.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) add(Number(m[1]), Number(m[2]), Number(m[3]));
  const named = new RegExp(`(?:(?<!\\d)(\\d{1,2})(?:st|nd|rd|th)?\\s+)?(${MONTH_NAMES.join('|')})[a-z]*\\.?,?\\s+(\\d{4})(?!\\d)`, 'gi');
  for (const m of text.matchAll(named)) {
    const month = MONTH_NAMES.indexOf(m[2].toLowerCase()) + 1;
    const year = Number(m[3]);
    add(year, month, m[1] ? Number(m[1]) : new Date(Date.UTC(year, month, 0)).getUTCDate());
  }
  return found.length ? found.sort()[found.length - 1] : null;
}

// What an event's **Date** field says: the rest of that line, or else the next line.
function eventDateText(body) {
  const lines = body.split('\n');
  const label = /^\s*\*\*\s*Date\s*:?\s*\*\*\s*:?\s*(.*)$/i;
  const at = lines.findIndex((l) => label.test(l));
  if (at === -1) return '';
  const inline = lines[at].match(label)[1].trim();
  if (inline) return inline;
  const next = lines.slice(at + 1).find((l) => !isBlank(l)) || '';
  return next.trim().startsWith('**') ? '' : next.trim();
}

// When an event ends, and whether that's before `today`. A date of "In the past" counts.
function eventTiming(body, today) {
  const text = eventDateText(body);
  const end = latestDate(text);
  return { end, past: /\bin the past\b/i.test(text) || (end !== null && end < today) };
}

// A new block goes at the very end of the file.
function addBlock(markdown, title) {
  const raw = rawLines(markdown);
  const last = lastContentLine(raw, 1, raw.length);
  return last ? insertLine(markdown, last, ['', `## ${title}`]) : insertLine(markdown, null, `## ${title}`);
}

// The Milestones section as 0-based indexes: [start, end).
function findSection(visible, heading) {
  const start = visible.findIndex((l) => heading.test(l.trim()));
  if (start === -1) return null;
  for (let i = start + 1; i < visible.length; i++) if (SECTION_HEADING.test(visible[i])) return { start, end: i };
  return { start, end: visible.length };
}

const milestoneSection = (visible) => findSection(visible, MILESTONES_HEADING);

const NOTES_HEADING = /^##\s+notes\s*$/i;

// A compatibility problem. `fixable` ones carry what Fix issues should add.
const problem = (text) => ({ text, kind: 'error' });
const missingField = (field) => ({ text: `Missing ${field}`, kind: 'fixable', fix: { field } });
const missingSection = (section) => ({ text: `Missing ${section} section`, kind: 'fixable', fix: { section } });
const missingTitle = () => ({ text: 'No page title', kind: 'fixable', fix: { title: true } });

function missingTaskLists(visible, taskLists) {
  return taskLists.filter((name) => !findSection(visible, taskListHeading(name))).map(missingSection);
}

// What keeps an entity's file from working with the dashboard.

function entityProblems(markdown, taskLists) {
  const header = parseHeader(markdown, []);
  const visible = stripComments(markdown);
  const problems = [];
  if (!header.title) problems.push(missingTitle());
  if (!header.createdLine) problems.push(missingField('Date Created'));
  if (!header.dates.reviewed.line) problems.push(missingField('Date Reviewed'));
  return problems.concat(missingTaskLists(visible, taskLists));
}

// A markdown file that doesn't look like part of the dashboard.
const unknownMarkdown = () => ({ text: 'Unknown markdown', kind: 'unexpected' });

// True if a file uses any of the dashboard's fields or sections. "## Notes" alone doesn't
// count, as plenty of other documents have one.
function hasDashboardStructure(markdown, taskLists) {
  const header = parseHeader(markdown, []);
  const visible = stripComments(markdown);
  return Boolean(
    header.createdLine ||
      header.dates.reviewed.line ||
      header.dates.closed.line ||
      header.leader ||
      header.dependency.line ||
      header.timeframe.line ||
      findField(visible, 'Project Type') ||
      findSection(visible, MILESTONES_HEADING) ||
      taskLists.some((name) => findSection(visible, taskListHeading(name)))
  );
}

// What keeps a project's file from working with the dashboard. Ongoing projects have task
// lists in place of the planning fields and sections. `folderType` is the project's own
// type, which a file without one of its own follows.
function projectProblems(markdown, folderOwner, owners, leaders, taskLists, folderType = 'Milestone') {
  const header = parseHeader(markdown, owners);
  const visible = stripComments(markdown);
  const problems = [];
  const type = header.projectType;
  if (!type) problems.push(missingField('Project Type'));
  else if (!type.known) problems.push(problem(`Project Type "${type.value}" isn't Milestone or Ongoing`));
  if (!owners.some((o) => o.id === folderOwner)) problems.push(problem(`Folder's owner "${folderOwner}" isn't in Owners.csv`));
  if (!header.title) problems.push(missingTitle());
  else if (!header.title.owner) problems.push(problem("Page title doesn't start with an owner from Owners.csv"));
  if (!header.leader) problems.push(missingField('Owner'));
  else if (!header.leader.value) problems.push(problem("Owner hasn't been chosen"));
  else if (!leaders.some((l) => l.id === header.leader.value)) problems.push(problem(`Owner "${header.leader.value}" isn't in Leaders.csv`));
  if (!header.createdLine) problems.push(missingField('Date Created'));
  if (!header.dates.reviewed.line) problems.push(missingField('Date Reviewed'));
  if (!header.dates.closed.line) problems.push(missingField('Date Closed'));
  if ((type ? type.known : folderType) === 'Ongoing') return problems.concat(missingTaskLists(visible, taskLists));
  if (!header.dependency.line) problems.push(missingField('Project Dependency'));
  if (!header.timeframe.line) problems.push(missingField('Active Timeframe'));
  if (!findSection(visible, MILESTONES_HEADING)) problems.push(missingSection('Milestones'));
  if (!findSection(visible, NOTES_HEADING)) problems.push(missingSection('Notes'));
  return problems;
}

// How each field is written when Fix issues adds it, in the order they go in a file.
// Project Type takes the value of the project it's in.
const NEW_FIELDS = {
  'Project Type': '**Project Type:**',
  'Date Created': '**Date Created**:',
  'Date Reviewed': '**Date Reviewed**:',
  'Date Closed': '**Date Closed**:',
  'Active Timeframe': '**Active Timeframe**:',
  'Project Dependency': '**Project Dependency**:',
  Owner: '**Owner** :',
};
const BOLD_FIELD = /^\s*\*\*[^*]+(?:\*\*\s*:|:\*\*)/;

// The line new fields go after: the last field above the file's first section, or the title.
function lastHeaderLine(markdown) {
  const lines = stripComments(markdown);
  const title = parseHeader(markdown, []).title.line;
  let last = title;
  for (let n = title + 1; n <= lines.length && !SECTION_HEADING.test(lines[n - 1]); n++) {
    if (BOLD_FIELD.test(lines[n - 1])) last = n;
  }
  return last;
}

// Adds what's missing, leaving everything already in the file as it is.
// `title` is used if the file has none, `owner` is the value of a new Owner field, and
// `projectType` is the value of a new Project Type.
function applyFixes(markdown, problems, { title, owner, projectType = 'Milestone' }) {
  const fixes = problems.filter((p) => p.fix).map((p) => p.fix);
  const wanted = (field) => fixes.some((f) => f.field === field);
  let out = markdown;
  if (fixes.some((f) => f.title)) out = insertLine(out, null, `# ${title}`);

  // A Project Type with no value already has its line.
  const blankType = wanted('Project Type') && findField(stripComments(out), 'Project Type');
  const typeLine = `${NEW_FIELDS['Project Type']} ${projectType}`;
  if (blankType) out = editLine(out, blankType.line, () => typeLine);
  const fields = Object.keys(NEW_FIELDS)
    .filter((field) => wanted(field) && !(field === 'Project Type' && blankType))
    .map((field) => (field === 'Project Type' ? typeLine : field === 'Owner' && owner ? `${NEW_FIELDS.Owner} ${owner}` : NEW_FIELDS[field]));
  if (fields.length) out = insertLine(out, lastHeaderLine(out), fields);

  const sections = fixes.filter((f) => f.section).map((f) => f.section);
  const ordered = [...sections.filter((s) => s === 'Notes'), ...sections.filter((s) => s !== 'Notes')];
  return ordered.reduce(addBlock, out);
}

// Sets a project's type and renames its main heading to suit: "## Milestones" for a
// Milestone project and "## <taskList>" for an Ongoing one. Returns null if the file already
// has both headings, as renaming one would leave two the same.
function setProjectType(markdown, type, taskList) {
  const visible = stripComments(markdown);
  const milestones = findSection(visible, MILESTONES_HEADING);
  const tasks = findSection(visible, taskListHeading(taskList));
  if (milestones && tasks) return null;

  let out = markdown;
  if (type === 'Ongoing' && milestones) out = editLine(out, milestones.start + 1, () => `## ${taskList}`);
  if (type === 'Milestone' && tasks) out = editLine(out, tasks.start + 1, () => '## Milestones');
  if (findField(visible, 'Project Type')) return setHeaderField(out, 'Project Type', type);
  return insertLine(out, parseHeader(out, []).title ? lastHeaderLine(out) : null, `**Project Type:** ${type}`);
}

// ----- commitments: a "## Name" per commitment, each with the fields below -----

const COMMITMENT_FIELDS = { priority: 'Colour', timeframe: 'Active Timeframe', dependency: 'Project Dependency' };
const COMMITMENT_OWNER = 'COMMITMENT';

function parseCommitments(markdown) {
  const visible = stripComments(markdown);
  const heads = [];
  visible.forEach((text, i) => {
    const heading = text.match(/^##\s+(.*?)\s*#*\s*$/);
    if (heading) heads.push({ title: heading[1], line: i + 1 });
  });
  return heads.map((head, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].line - 1 : visible.length;
    const body = visible.slice(head.line, end);
    const fields = {};
    for (const [key, label] of Object.entries(COMMITMENT_FIELDS)) {
      const field = findField(body, label);
      fields[key] = field ? { line: head.line + field.line, at: field.at, value: field.value.trim() } : { line: null, at: 0, value: '' };
    }
    const priority = fields.priority.value.toUpperCase();
    return Object.assign({}, head, { end, fields, priority: PRIORITIES.includes(priority) ? priority : '' });
  });
}

// The commitment a Project Dependency value names, in lowercase, or null if it names a project.
function commitmentNamed(value) {
  const match = value.trim().match(new RegExp(`^${COMMITMENT_OWNER}\\s+(.+)$`, 'i'));
  return match ? match[1].replace(/\s+/g, ' ').toLowerCase() : null;
}

const commitmentAt = (markdown, line, title) => parseCommitments(markdown).find((c) => c.line === line && c.title === title) || null;

// Sets one of a commitment's fields, adding it after the others if it isn't there.
function setCommitmentField(markdown, line, title, key, value) {
  const commitment = commitmentAt(markdown, line, title);
  if (!commitment) return null;
  const field = commitment.fields[key];
  const text = value.trim();
  if (field.line) return editLine(markdown, field.line, (row) => row.slice(0, field.at).trimEnd() + (text ? ` ${text}` : ''));
  if (!text) return markdown;
  const last = Math.max(commitment.line, ...Object.values(commitment.fields).map((f) => f.line || 0));
  return insertLine(markdown, last, `**${COMMITMENT_FIELDS[key]}**: ${text}`);
}

// A new commitment goes at the end, with each field's label ready to fill in.
function addCommitment(markdown, title) {
  const raw = rawLines(markdown);
  const last = lastContentLine(raw, 1, raw.length);
  const lines = [`## ${title}`, ...Object.values(COMMITMENT_FIELDS).map((label) => `**${label}**:`)];
  return last ? insertLine(markdown, last, ['', ...lines]) : insertLine(markdown, null, lines);
}

function removeCommitment(markdown, line, title) {
  const commitment = commitmentAt(markdown, line, title);
  return commitment ? removeLines(markdown, commitment.line, commitment.end) : null;
}

// Renames a commitment, and anything in the same file that depends on it.
function renameCommitment(markdown, line, title, to) {
  if (!commitmentAt(markdown, line, title)) return null;
  const old = title.replace(/\s+/g, ' ').toLowerCase();
  let out = editLine(markdown, line, () => `## ${to}`);
  for (const other of parseCommitments(out)) {
    if (other.fields.dependency.line && commitmentNamed(other.fields.dependency.value) === old) {
      out = setCommitmentField(out, other.line, other.title, 'dependency', `${COMMITMENT_OWNER} ${to}`);
    }
  }
  return out;
}

// A new task goes at the end of its task list's section, which is added if it's missing.
function addTask(markdown, text, list) {
  const raw = rawLines(markdown);
  const section = findSection(stripComments(markdown), taskListHeading(list));
  const row = `- [ ] ${text}`;
  if (section) return insertLine(markdown, lastContentLine(raw, section.start + 1, section.end), row);
  const last = lastContentLine(raw, 1, raw.length);
  const lines = [`## ${list}`, '', row];
  return last ? insertLine(markdown, last, ['', ...lines]) : insertLine(markdown, null, lines);
}

// A new milestone goes at the end of the Milestones section, which is added if it's missing.
function addMilestone(markdown, title) {
  const raw = rawLines(markdown);
  const section = milestoneSection(stripComments(markdown));
  const heading = `### ${title}`;
  if (section) return insertLine(markdown, lastContentLine(raw, section.start + 1, section.end), heading);
  const last = lastContentLine(raw, 1, raw.length);
  const lines = ['## Milestones', heading];
  return last ? insertLine(markdown, last, ['', ...lines]) : insertLine(markdown, null, lines);
}

function milestoneAt(visible, line, title) {
  const section = milestoneSection(visible);
  const idx = line - 1;
  if (!section || idx <= section.start || idx >= section.end) return null;
  const m = visible[idx].match(MILESTONE_HEADING);
  return m && m[1] === title ? { idx, section } : null;
}

// A new checkbox goes after whatever the milestone already holds.
function addMilestoneItem(markdown, line, title, text) {
  const visible = stripComments(markdown);
  const found = milestoneAt(visible, line, title);
  if (!found) return null;
  let end = found.section.end;
  for (let i = found.idx + 1; i < found.section.end; i++) {
    if (/^###\s/.test(visible[i])) {
      end = i;
      break;
    }
  }
  return insertLine(markdown, lastContentLine(rawLines(markdown), line, end), `- [ ] ${text}`);
}

// Removes a milestone's heading and everything under it. The blank lines before the next
// milestone go with it, but those before a following section stay.
function removeMilestone(markdown, line, title) {
  const visible = stripComments(markdown);
  const found = milestoneAt(visible, line, title);
  if (!found) return null;
  for (let i = found.idx + 1; i < found.section.end; i++) {
    if (/^###\s/.test(visible[i])) return removeLines(markdown, line, i);
  }
  return removeLines(markdown, line, lastContentLine(rawLines(markdown), line, found.section.end));
}

// Moves the milestone at position `from` to position `to`. `titles` is the order the page
// was showing. The blank lines between milestones stay where they are.
function moveMilestone(markdown, titles, from, to) {
  const raw = rawLines(markdown);
  const visible = stripComments(markdown);
  const section = milestoneSection(visible);
  if (!section) return null;

  const heads = [];
  for (let i = section.start + 1; i < section.end; i++) if (/^###\s/.test(visible[i])) heads.push(i);
  const current = heads.map((i) => visible[i].match(MILESTONE_HEADING)[1]);
  const same = current.length === titles.length && current.every((t, i) => t === titles[i]);
  if (!same || from >= heads.length || to >= heads.length) return null;

  const chunks = heads.map((head, k) => {
    const lines = raw.slice(head, k + 1 < heads.length ? heads[k + 1] : section.end);
    const size = lastContentLine(lines, 1, lines.length);
    return { content: lines.slice(0, size), gap: lines.slice(size) };
  });
  const order = chunks.slice();
  order.splice(to, 0, order.splice(from, 1)[0]);
  const lines = order.flatMap((chunk, position) => [...chunk.content, ...chunks[position].gap]);
  return replaceLines(markdown, heads[0] + 1, section.end, lines);
}

// Every row with a status or checkbox under a milestone, with that milestone's title.
function milestoneRows(markdown, statuses) {
  const visible = stripComments(markdown);
  const section = milestoneSection(visible);
  if (!section) return [];
  let title = null;
  const titles = new Map();
  for (let i = section.start + 1; i < section.end; i++) {
    const heading = visible[i].match(MILESTONE_HEADING);
    if (heading) {
      title = heading[1];
      titles.delete(i + 1);
    } else if (title !== null) {
      titles.set(i + 1, title);
    }
  }
  return scanLines(markdown, createMatcher(statuses))
    .filter((item) => titles.has(item.line))
    .map((item) => Object.assign(item, { milestone: titles.get(item.line) }));
}

// The most recent date used as a `## YYYY-MM-DD` heading, or null.
function lastReviewDate(markdown) {
  const dates = stripComments(markdown)
    .map((l) => l.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/))
    .filter(Boolean)
    .map((m) => m[1])
    .sort();
  return dates.length ? dates[dates.length - 1] : null;
}

// Reads the outline of one focus entry: owner, then project, then everything nested below it.
function parseFocus(body) {
  const entries = [];
  const open = []; // the indents of the bullets this line could be nested under
  let owner = null;
  let current = null;
  for (const line of body.split('\n')) {
    const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (!bullet) continue;
    const indent = bullet[1].replace(/\t/g, '    ').length;
    while (open.length && open[open.length - 1] >= indent) open.pop();
    const depth = open.length;
    open.push(indent);
    const text = bullet[2].trim();
    if (depth === 0) {
      owner = text;
    } else if (depth === 1) {
      current = { owner, project: text.replace(/\s*:$/, ''), items: [] };
      entries.push(current);
    } else if (current) {
      current.items.push(text);
    }
  }
  return entries;
}

// Logs a review under a `## date` heading, newest first. A second review on the same day
// adds to that day's heading.
function addReview(markdown, date, wins) {
  const raw = rawLines(markdown);
  const visible = stripComments(markdown);
  const lines = wins.split('\n');
  const heading = `## ${date}`;
  const sections = [];
  visible.forEach((l, i) => {
    if (/^##\s/.test(l)) sections.push(i);
  });
  const today = sections.find((i) => visible[i].trim() === heading);
  if (today !== undefined) {
    const next = sections.find((i) => i > today);
    return insertLine(markdown, lastContentLine(raw, today + 1, next === undefined ? raw.length : next), lines);
  }
  if (sections.length) return insertLine(markdown, sections[0] || null, [heading, ...lines, '']);
  const last = lastContentLine(raw, 1, raw.length);
  return last ? insertLine(markdown, last, ['', heading, ...lines]) : insertLine(markdown, null, [heading, ...lines]);
}

// ----- reports: a "## YYYY-MM-DD" entry per review, with a "- Label: value" line per figure -----

// The figures each report holds, in the order they're written. A value is a number, or "-"
// when there was nothing to measure, such as no project closed in the period.
const REPORT_FIELDS = [
  { key: 'completed', label: 'Tasks completed' },
  { key: 'assigned', label: 'Assigned tasks' },
  { key: 'waiting', label: 'Waiting tasks' },
  { key: 'unassigned', label: 'Unassigned tasks' },
  { key: 'overdue', label: 'Overdue tasks' },
  { key: 'active', label: 'Active projects' },
  { key: 'stalled', label: 'Stalled projects' },
  { key: 'scheduled', label: 'Scheduled projects' },
  { key: 'planItems', label: 'Plan focuses' },
  { key: 'planDone', label: 'Plan focuses done' },
  { key: 'wins', label: 'Wins logged' },
];
const REPORT_LINE = /^\s*[-*]\s+([^:]+):\s*(.*?)\s*$/;

// Logs a report under a `## date` heading, newest first. A second review on the same day
// replaces that day's report. An empty file gets a `# Reports` title first.
function addReport(markdown, date, values) {
  const lines = [`## ${date}`, ...REPORT_FIELDS.map(({ key, label }) => `- ${label}: ${values[key] === null ? '-' : values[key]}`)];
  const base = markdown.trim() ? markdown : '# Reports\n';
  const raw = rawLines(base);
  const visible = stripComments(base);
  const sections = [];
  visible.forEach((l, i) => {
    if (/^##\s/.test(l)) sections.push(i);
  });
  const same = sections.find((i) => visible[i].trim() === lines[0]);
  if (same !== undefined) {
    const next = sections.find((i) => i > same);
    return replaceLines(base, same + 1, lastContentLine(raw, same + 1, next === undefined ? raw.length : next), lines);
  }
  if (sections.length) return insertLine(base, sections[0] || null, [...lines, '']);
  return insertLine(base, lastContentLine(raw, 1, raw.length), ['', ...lines]);
}

// Every dated report, oldest first, with each figure as a number or null. Lines it doesn't
// recognise are skipped, so notes can be added by hand.
function parseReports(markdown) {
  const reports = new Map();
  let current = null;
  for (const line of stripComments(markdown)) {
    const heading = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*$/);
    if (heading) {
      current = {};
      reports.set(heading[1], current);
      continue;
    }
    if (SECTION_HEADING.test(line)) current = null;
    const row = current && line.match(REPORT_LINE);
    const field = row && REPORT_FIELDS.find((f) => normalTitle(f.label) === normalTitle(row[1]));
    if (field) current[field.key] = /^\d+(\.\d+)?$/.test(row[2]) ? Number(row[2]) : null;
  }
  return [...reports]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, found]) => ({ date, values: Object.fromEntries(REPORT_FIELDS.map(({ key }) => [key, key in found ? found[key] : null])) }));
}

// Swaps `from`, starting at offset `at`, for `to`.
function swapText(markdown, line, at, from, to) {
  return editLine(markdown, line, (text) => {
    const gap = !from && at > 0 && !/\s/.test(text[at - 1]) ? ' ' : '';
    return text.slice(0, at) + gap + to + text.slice(at + from.length);
  });
}

// Edits one line of text: a page title, a milestone title, a block title or a todo's text.
function editText(markdown, kind, line, from, to, statuses, owners) {
  const visible = stripComments(markdown);
  if (kind === 'title') {
    const { title } = parseHeader(markdown, owners);
    if (!title || title.line !== line || title.rest !== from) return null;
    return swapText(markdown, line, title.restAt, from, to);
  }
  if (kind === 'milestone') {
    if (!milestoneAt(visible, line, from)) return null;
    return swapText(markdown, line, visible[line - 1].match(/^###\s+/)[0].length, from, to);
  }
  if (kind === 'block') {
    const block = parseBlocks(markdown).find((b) => b.line === line);
    if (!block || block.title !== from || !block.titleEditable) return null;
    return swapText(markdown, line, visible[line - 1].match(/^#{1,2}\s+/)[0].length, from, to);
  }
  if (kind === 'entry') {
    const opener = visible[line - 1].match(/^#{3,6}\s+/);
    if (!opener || visible[line - 1].slice(opener[0].length).trimEnd() !== from) return null;
    return swapText(markdown, line, opener[0].length, from, to);
  }
  if (kind === 'todo') {
    const item = scanLines(markdown, createMatcher(statuses)).find((i) => i.line === line);
    if (!item || item.editText !== from) return null;
    return swapText(markdown, line, item.textAt, from, to);
  }
  return null;
}

module.exports = {
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
  latestDate,
  addTask,
  isTaskList,
  addReview,
  REPORT_FIELDS,
  addReport,
  parseReports,
  cancelRow,
  deleteRow,
  editText,
};
