// Structural edits to a project file: its scratchpad blocks, milestones and single-line text.
// Each edit checks the text it replaces is still there, and returns null if it isn't.
'use strict';

const { CHECKBOX_ROW, MILESTONES_HEADING, MILESTONE_HEADING, SECTION_REVIEWED, SECTION_FLAG, ARCHIVE_MARKER, archiveMarker } = require('./public/js/rules');
const { PLANNING_LINE, setPlanningDate, addPeriod, stripComments, titleIndex, findField, setHeaderField, editLine, insertLine, createMatcher, scanLines, parseHeader, moveToStatus, LEADER_FIELD, OLD_LEADER_FIELD } = require('./todos');

const HEADER_FIELD = /^\s*\*\*[^*]+\*\*\s*:/;
// Project files also write these with the colon inside the bold. Other files keep such lines
// on their Scratchpad, as Events.md does with its Created line.
const PROJECT_TYPE_FIELD = /^\s*\*\*\s*project type\s*(?:\*\*\s*:|:\s*\*\*)/i;
const PROJECT_HEADER_FIELD = /^\s*\*\*\s*(?:project type|(?:date\s+)?created):\*\*/i;
const SECTION_HEADING = /^#{1,2}\s/; // a level 1 or 2 heading starts a new section
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

// The titles of a file's milestones, the ### headings in ## Milestones, in order.
function milestoneTitles(markdown) {
  const visible = stripComments(markdown);
  const section = milestoneSection(visible);
  if (!section) return [];
  const titles = [];
  for (let i = section.start + 1; i < section.end; i++) {
    const heading = visible[i].match(MILESTONE_HEADING);
    if (heading) titles.push(heading[1]);
  }
  return titles;
}

// Moves a recurring task's SCHEDULED date on by its period: from that date, or from `today`
// if it hasn't one. Its status and tick box stay as they are. Returns null if the row has
// changed or isn't recurring.
function advanceRecurring(markdown, line, status, text, statuses, today) {
  const item = findRow(markdown, line, status, text, statuses);
  if (!item || !item.recur) return null;
  const scheduled = item.dates.find((d) => d.kind === 'SCHEDULED');
  const day = scheduled && scheduled.value.match(/\d{4}-\d{2}-\d{2}/);
  return setPlanningDate(markdown, line, 'SCHEDULED', addPeriod(day ? day[0] : today, item.recur.count, item.recur.unit));
}

// Sets a row's SCHEDULED or DEADLINE date, or removes it if `date` is null.
function setRowDate(markdown, line, status, text, kind, date, statuses) {
  return findRow(markdown, line, status, text, statuses) ? setPlanningDate(markdown, line, kind, date) : null;
}

// ----- a section's own review: Date Reviewed and Flagged for Review under its heading -----


// The review lines straight under the heading at 0-based `heading`: its date (or null), whether
// it's flagged, each line's 1-based number, and `end`, the 0-based index after them.
function sectionMeta(visible, heading) {
  const meta = { reviewed: null, flagged: false, reviewedLine: null, flagLine: null, end: heading + 1 };
  for (let i = heading + 1; i < visible.length; i++) {
    const reviewed = visible[i].match(SECTION_REVIEWED);
    const flag = reviewed ? null : visible[i].match(SECTION_FLAG);
    if (reviewed) Object.assign(meta, { reviewed: reviewed[1] || null, reviewedLine: i + 1 });
    else if (flag) Object.assign(meta, { flagged: /^yes$/i.test(flag[1]), flagLine: i + 1 });
    else break;
    meta.end = i + 1;
  }
  return meta;
}

// The heading at 1-based `line`, if its text is still `title`.
function headingAt(visible, line, title) {
  const heading = (visible[line - 1] || '').match(/^#{2,6}\s+(.*?)\s*#*\s*$/);
  return heading && heading[1] === title ? heading : null;
}

// Flags a section for review, or takes the flag away. A flagged section always has a Date
// Reviewed line, empty until it's first reviewed. Returns null if the heading has changed.
function setSectionFlag(markdown, line, title, on) {
  const visible = stripComments(markdown);
  if (!headingAt(visible, line, title)) return null;
  const meta = sectionMeta(visible, line - 1);
  if (!on) return meta.flagLine ? removeLines(markdown, meta.flagLine, meta.flagLine) : markdown;
  if (meta.flagLine) return editLine(markdown, meta.flagLine, () => '**Flagged for Review**: Yes');
  return insertLine(markdown, meta.reviewedLine || line, [...(meta.reviewedLine ? [] : ['**Date Reviewed**:']), '**Flagged for Review**: Yes']);
}

// A section reviewed today: its Date Reviewed set, and its flag taken away.
function markSectionReviewed(markdown, line, title, date) {
  const visible = stripComments(markdown);
  if (!headingAt(visible, line, title)) return null;
  const meta = sectionMeta(visible, line - 1);
  let text = meta.flagLine ? removeLines(markdown, meta.flagLine, meta.flagLine) : markdown;
  if (meta.reviewedLine) return editLine(text, meta.reviewedLine, () => `**Date Reviewed**: ${date}`);
  return insertLine(text, line, `**Date Reviewed**: ${date}`);
}

// Every flagged section in a file: its heading's line and title.
function flaggedSections(markdown) {
  const visible = stripComments(markdown);
  const found = [];
  visible.forEach((text, i) => {
    const heading = text.match(/^#{2,6}\s+(.*?)\s*#*\s*$/);
    if (heading && sectionMeta(visible, i).flagged) found.push({ line: i + 1, title: heading[1], level: text.match(/^#+/)[0].length });
  });
  return found;
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

  const block = (headingIdx, start, end) => {
    const meta = headingIdx === null ? null : sectionMeta(visible, headingIdx);
    const first = meta ? meta.end : start;
    const lines = raw.slice(first, end);
    const firstText = lines.findIndex((l) => !isBlank(l));
    const lastText = lastContentLine(lines, 1, lines.length);
    return {
      line: headingIdx === null ? null : headingIdx + 1,
      first: first + 1,
      last: end,
      bodyLine: firstText === -1 ? first + 1 : first + firstText + 1,
      body: firstText === -1 ? '' : lines.slice(firstText, lastText).join('\n'),
      reviewed: meta ? meta.reviewed : null,
      flagged: meta ? meta.flagged : false,
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
  if (target.first > target.last) return text ? insertLine(markdown, target.first - 1, lines) : markdown;
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
    const meta = sectionMeta(visible, entry.line - 1);
    Object.assign(entry, { reviewed: meta.reviewed, flagged: meta.flagged });
    let first = meta.end;
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

// A new entry goes at the end of its section, with each field's label ready to fill in. A
// field given as { line } is written as that line instead, for fields kept on one line.
function addEntry(markdown, level, sectionTitle, title, labels) {
  const section = parseEntries(markdown, level).find((s) => s.title === sectionTitle);
  if (!section) return null;
  const last = lastContentLine(rawLines(markdown), section.line, section.end);
  const body = labels.flatMap((label) => [typeof label === 'string' ? `**${label}**` : label.line, '']);
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

// ----- event dates: YYYY-MM-DD, or "YYYY-MM-DD to YYYY-MM-DD" for an event of several days -----

const STORED_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRealDate = (value) => STORED_DATE.test(value) && latestDate(value) === value;

// An Event Date or Application Deadline as written by the dashboard: { start, end }, with
// both null when it's blank, or null if it isn't a date the dashboard wrote. A deadline
// (`range` false) is a single date.
function parseEventDate(value, range = true) {
  const text = value.trim();
  if (!text) return { start: null, end: null };
  const [start, end = start, ...rest] = text.split(/\s+to\s+/i);
  if (rest.length || (!range && end !== start) || !isRealDate(start) || !isRealDate(end) || end < start) return null;
  return { start, end };
}

const eventDateValue = ({ start, end }) => (!start ? '' : end && end !== start ? `${start} to ${end}` : start);

// A date written by hand before Event Date was a date field, as { start, end }, or null if
// the text is anything more than a date or two. Reads whatever latestDate does, plus a span
// of days in one month (11-13.09.26, 23rd-24th July 2027). TBD and TBC mean no date yet.
function readOldEventDate(text) {
  const value = text.trim();
  if (!value || /^tb[cd]\.?$/i.test(value)) return { start: null, end: null };
  const one = (part) => {
    const whole = /^(\d{1,2}[./-]\d{1,2}[./-](\d{4}|\d{2})|\d{4}-\d{2}-\d{2}|(\d{1,2}(st|nd|rd|th)?\s+)?[a-z]+\.?,?\s+\d{4})$/i;
    return whole.test(part.trim()) ? latestDate(part) : null;
  };
  const days = value.match(/^(\d{1,2})(?:st|nd|rd|th)?\s*[-–]\s*(\d{1,2})(?:st|nd|rd|th)?((?:[./-]\d{1,2}[./-](?:\d{4}|\d{2}))|(?:\s+[a-z]+\.?,?\s+\d{4}))$/i);
  const [first, last = first, ...more] = days ? [one(days[1] + days[3]), one(days[2] + days[3])] : value.split(/\s+(?:-|–|to)\s+/i).map(one);
  if (more.length || !first || !last || last < first) return null;
  return { start: first, end: last };
}

// When an event starts and ends, and whether it's over by `today`. A value the dashboard
// didn't write is read as well as it can be, until Compatibility converts it, so that
// events don't change lists in the meantime. "In the past" counts as over.
function eventTiming(value, today) {
  const stored = parseEventDate(value);
  if (stored) return { start: stored.start, end: stored.end, past: stored.end !== null && stored.end < today, stored: true };
  const end = latestDate(value);
  return { start: null, end, past: /\bin the past\b/i.test(value) || (end !== null && end < today), stored: false };
}

// Writes a field on one line, "**Label**: value", in place of all the lines of the entry's
// field that `matches`, or adds it after the last field before it in the page's order.
// `before` tells whether a label comes earlier in that order. Returns null if the entry has
// changed.
function setInlineField(markdown, level, isField, entryLine, title, { label, matches, before }, value) {
  const entry = allEntries(markdown, level, isField).find((e) => e.line === entryLine && e.title === title);
  if (!entry) return null;
  const line = `**${label}**: ${value}`.trimEnd();
  // A field's last line can take in the blank lines after it, which are kept as they are.
  const raw = rawLines(markdown);
  const filledEnd = (f) => {
    let end = f.lastLine;
    while (end > f.line && isBlank(raw[end - 1])) end--;
    return end;
  };
  const field = entry.fields.find((f) => f.label !== null && matches(f.label));
  if (field) return replaceLines(markdown, field.line, filledEnd(field), [line]);
  const earlier = entry.fields.filter((f) => f.label !== null && before(f.label));
  if (earlier.length) return insertLine(markdown, filledEnd(earlier[earlier.length - 1]), ['', line]);
  const first = entry.fields.find((f) => f.label !== null);
  return first ? insertLine(markdown, first.line - 1, [line, '']) : insertLine(markdown, entry.lastLine, ['', line]);
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
// The leader's field was called Owner before tentacles. Fix issues renames it, keeping its value.
const oldLeaderField = () => ({ text: `${OLD_LEADER_FIELD} should be ${LEADER_FIELD}`, kind: 'fixable', fix: { renameLeader: true } });

// Renames an Owner field line to Leader, keeping the rest of the line as it is.
function renameOldLeader(markdown, lineNo) {
  return editLine(markdown, lineNo, (text) => text.replace(new RegExp(OLD_LEADER_FIELD, 'i'), LEADER_FIELD));
}

function missingTaskLists(visible, taskLists) {
  return taskLists.filter((name) => !findSection(visible, taskListHeading(name))).map(missingSection);
}

// What keeps a tentacle's file from working with the dashboard.

function tentacleProblems(markdown, taskLists) {
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
function projectProblems(markdown, folderTentacle, tentacles, leaders, taskLists, folderType = 'Milestone') {
  const header = parseHeader(markdown, tentacles);
  const visible = stripComments(markdown);
  const problems = [];
  const type = header.projectType;
  if (!type) problems.push(missingField('Project Type'));
  else if (!type.known) problems.push(problem(`Project Type "${type.value}" isn't Milestone or Ongoing`));
  if (!tentacles.some((o) => o.id === folderTentacle)) problems.push(problem(`Folder's tentacle "${folderTentacle}" isn't in Tentacles.csv`));
  if (!header.title) problems.push(missingTitle());
  else if (!header.title.tentacle) problems.push(problem("Page title doesn't start with a tentacle from Tentacles.csv"));
  // Leader problems let Fix issues set a leader picked on the Compatibility page.
  const leaderProblem = (text) => (leaders.length ? { text, kind: 'fixable', fix: { leader: true }, choose: 'leader' } : problem(text));
  if (!header.leader) problems.push(Object.assign(missingField(LEADER_FIELD), leaders.length ? { choose: 'leader' } : {}));
  else if (!header.leader.value) problems.push(leaderProblem("Leader hasn't been chosen"));
  else if (!leaders.some((l) => l.id === header.leader.value)) problems.push(leaderProblem(`Leader "${header.leader.value}" isn't in Leaders.csv`));
  if (header.leader && !findField(visible, LEADER_FIELD)) problems.push(oldLeaderField());
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
  [LEADER_FIELD]: `**${LEADER_FIELD}** :`,
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
// `title` is used if the file has none, `leader` is the value of a new Leader field, and
// `projectType` is the value of a new Project Type.
function applyFixes(markdown, problems, { title, leader, projectType = 'Milestone' }) {
  const fixes = problems.filter((p) => p.fix).map((p) => p.fix);
  const wanted = (field) => fixes.some((f) => f.field === field);
  let out = markdown;
  if (fixes.some((f) => f.title)) out = insertLine(out, null, `# ${title}`);
  // An old Owner field becomes Leader first, so a leader picked below goes in the renamed line.
  const old = fixes.some((f) => f.renameLeader) && !findField(stripComments(out), LEADER_FIELD) && findField(stripComments(out), OLD_LEADER_FIELD);
  if (old) out = renameOldLeader(out, old.line);
  // A Leader field that's empty or names an unknown leader is only changed once one is picked.
  if (leader && fixes.some((f) => f.leader)) out = setHeaderField(out, LEADER_FIELD, leader);

  // A Project Type with no value already has its line.
  const blankType = wanted('Project Type') && findField(stripComments(out), 'Project Type');
  const typeLine = `${NEW_FIELDS['Project Type']} ${projectType}`;
  if (blankType) out = editLine(out, blankType.line, () => typeLine);
  const fields = Object.keys(NEW_FIELDS)
    .filter((field) => wanted(field) && !(field === 'Project Type' && blankType))
    .map((field) => (field === 'Project Type' ? typeLine : field === LEADER_FIELD && leader ? `${NEW_FIELDS[LEADER_FIELD]} ${leader}` : NEW_FIELDS[field]));
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

// ----- _Archive.md and _Incubator.md: a "## Title" per entry, with bold fields under it -----

// What an archived project's entry keeps from its header, in the order it's written.
const ARCHIVE_FIELDS = { created: 'Date Created', closed: 'Date Closed', timeframe: 'Active Timeframe', dependency: 'Project Dependency', leader: LEADER_FIELD };
// An idea's fields. Archived and Promoted are added with a date, and hide the idea.
const INCUBATOR_FIELDS = { dependency: 'Project Dependency', archived: 'Archived', promoted: 'Promoted', reviewed: 'Date Reviewed', flagged: 'Flagged for Review' };

// Each `##` entry with the fields named in `labels` ({ key: 'Label' }), each field missing
// from the entry coming back with no line. `notes` is the rest of the entry's text.
function parseNamedEntries(markdown, labels) {
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
    const fieldLines = new Set();
    for (const [key, label] of Object.entries(labels)) {
      // An entry written before tentacles may still call its leader Owner.
      const field = findField(body, label) || (label === LEADER_FIELD ? findField(body, OLD_LEADER_FIELD) : null);
      fields[key] = field ? { line: head.line + field.line, at: field.at, value: field.value.trim() } : { line: null, at: 0, value: '' };
      if (field) fieldLines.add(field.line);
    }
    const notes = body.filter((_, k) => !fieldLines.has(k + 1)).join('\n').trim();
    return Object.assign({}, head, { end, fields, notes });
  });
}

// A new entry goes at the end of the file: its `## title`, then `lines`.
function addNamedEntry(markdown, title, lines) {
  const raw = rawLines(markdown);
  const last = lastContentLine(raw, 1, raw.length);
  const entry = [`## ${title}`, ...lines];
  return last ? insertLine(markdown, last, ['', ...entry]) : insertLine(markdown, null, entry);
}

// Removes the entry at `line`, from its heading to the next one. Returns null if the
// entry has changed.
function removeNamedEntry(markdown, labels, line, title) {
  const entry = parseNamedEntries(markdown, labels).find((e) => e.line === line && e.title === title);
  return entry ? removeLines(markdown, entry.line, entry.end) : null;
}

// Adds a field to the entry at `line`, after its heading and any of its other `labels`
// fields. Returns null if the entry has changed.
function addEntryMark(markdown, labels, line, title, label, value) {
  const entry = parseNamedEntries(markdown, labels).find((e) => e.line === line && e.title === title);
  if (!entry) return null;
  const last = Math.max(entry.line, ...Object.values(entry.fields).map((f) => f.line || 0));
  return insertLine(markdown, last, `**${label}**: ${value}`);
}

// A new task goes at the end of its task list's section, which is added if it's missing.
// `depth` nests the new task under the list's last task (1), or under its parent (2), and so on.
function addTask(markdown, text, list, depth = 0) {
  const raw = rawLines(markdown);
  const section = findSection(stripComments(markdown), taskListHeading(list));
  if (section) {
    const at = lastContentLine(raw, section.start + 1, section.end);
    return insertLine(markdown, at, nestedRow(raw, section.start + 1, at, depth) + `- [ ] ${text}`);
  }
  const row = `- [ ] ${text}`;
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
// The indent a new task needs to sit `depth` levels deep at the end of lines first..last
// (1-based): under the last task there, or its parent, and so on, never deeper than one
// below the last task. Two spaces per level, or a tab if the file nests with tabs.
function nestedRow(raw, first, last, depth) {
  if (!depth) return '';
  const rows = [];
  for (let n = first; n <= last; n++) if (CHECKBOX_ROW.test(raw[n - 1] || '')) rows.push(raw[n - 1].match(/^\s*/)[0]);
  if (!rows.length) return '';
  // The last task, and each task it's nested under, from the top level down.
  const chain = [];
  for (const indent of rows) {
    while (chain.length && chain[chain.length - 1].replace(/\t/g, '    ').length >= indent.replace(/\t/g, '    ').length) chain.pop();
    chain.push(indent);
  }
  const parent = chain[Math.min(depth, chain.length) - 1];
  return parent + (parent.includes('\t') ? '\t' : '  ');
}

function addMilestoneItem(markdown, line, title, text, depth = 0) {
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
  const raw = rawLines(markdown);
  const at = lastContentLine(raw, line, end);
  return insertLine(markdown, at, nestedRow(raw, line + 1, at, depth) + `- [ ] ${text}`);
}

// ----- nesting and reordering tasks -----

// The heading a line sits under, as a 0-based index, or -1. Tasks are only moved within one.
function headingAbove(visible, line) {
  for (let i = line - 2; i >= 0; i--) if (/^#{1,6}\s/.test(visible[i])) return i;
  return -1;
}

// A row found by its line and text, whatever its status (an edit names the text it showed).
const rowAtLine = (markdown, line, text, statuses) => scanLines(markdown, createMatcher(statuses)).find((i) => i.line === line && i.editText === text) || null;

// Moves a task, and everything under it, one level in (under the task above it at the same
// level) or out (to its parent's level). Returns null if the row has changed, or { refused }
// saying why it can't move.
function indentRow(markdown, line, text, direction, statuses) {
  if (!rowAtLine(markdown, line, text, statuses)) return null;
  const visible = stripComments(markdown);
  const raw = rawLines(markdown);
  const { first, last, own } = rowExtent(visible, line);
  const isRow = (n) => CHECKBOX_ROW.test(visible[n - 1] || '');
  // The nearest task above at or above this one's level, within the same heading.
  let above = 0;
  for (let n = line - 1; n >= 1; n--) {
    if (/^#{1,6}\s/.test(visible[n - 1])) break;
    if (isRow(n) && indentOf(visible[n - 1]) <= own) {
      above = n;
      break;
    }
  }
  if (direction === 'in') {
    if (!above || indentOf(visible[above - 1]) !== own) return { refused: "There's no task above it at the same level to go under." };
    const step = /^\t/.test(raw[line - 1]) ? '\t' : '  ';
    return replaceLines(markdown, first, last, raw.slice(first - 1, last).map((l) => (isBlank(l) ? l : step + l)));
  }
  if (!own) return { refused: "It's already at the top level." };
  let parent = 0;
  for (let n = line - 1; n >= 1; n--) {
    if (/^#{1,6}\s/.test(visible[n - 1])) break;
    if (isRow(n) && indentOf(visible[n - 1]) < own) {
      parent = n;
      break;
    }
  }
  const width = own - (parent ? indentOf(visible[parent - 1]) : 0);
  return replaceLines(markdown, first, last, raw.slice(first - 1, last).map((l) => (isBlank(l) ? l : dedent(l, width))));
}

// Moves a task, with everything under it, to just before or after another task in the same
// milestone or task list, taking that task's level. Returns null if either row has changed,
// or { refused } saying why it can't move.
function reorderRow(markdown, line, text, toLine, toText, after, statuses) {
  if (!rowAtLine(markdown, line, text, statuses) || !rowAtLine(markdown, toLine, toText, statuses)) return null;
  const visible = stripComments(markdown);
  if (headingAbove(visible, line) !== headingAbove(visible, toLine)) return { refused: 'Tasks can only be moved within their own list or milestone.' };
  const source = rowExtent(visible, line);
  if (toLine >= source.first && toLine <= source.last) return { refused: "A task can't be moved inside itself." };
  const target = rowExtent(visible, toLine);
  const raw = rawLines(markdown);
  const indent = raw[toLine - 1].match(/^\s*/)[0];
  const moved = raw.slice(source.first - 1, source.last).map((l) => (isBlank(l) ? l : indent + dedent(l, source.own)));
  const at = after ? target.last : toLine - 1; // the new rows go after this line
  if (at < source.first) return removeLines(insertLine(markdown, at, moved), source.first + moved.length, source.last + moved.length);
  return insertLine(removeLines(markdown, source.first, source.last), at - moved.length, moved);
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

// ----- moving tasks between milestones, and making them into milestones or blocks -----

const indentOf = (line) => line.match(/^\s*/)[0].replace(/\t/g, '    ').length;

// Takes `width` columns of leading whitespace off a line, so moved rows line up again.
function dedent(line, width) {
  let cut = 0;
  let col = 0;
  while (cut < line.length && col < width && /\s/.test(line[cut])) {
    col += line[cut] === '\t' ? 4 : 1;
    cut++;
  }
  return line.slice(cut);
}

// The 1-based lines a task takes up: its own, then everything indented under it, such as
// its planning lines and subtasks.
function rowExtent(visible, line) {
  const own = indentOf(visible[line - 1]);
  let last = line;
  for (let i = line; i < visible.length; i++) {
    if (isBlank(visible[i])) continue;
    if (indentOf(visible[i]) <= own || SECTION_HEADING.test(visible[i]) || /^#{3,6}\s/.test(visible[i])) break;
    last = i + 1;
  }
  return { first: line, last, own };
}

// Where a milestone's last line is, as a 0-based index of the line after it.
function milestoneEnd(visible, found) {
  for (let i = found.idx + 1; i < found.section.end; i++) if (/^###\s/.test(visible[i])) return i;
  return found.section.end;
}

// Moves a task, and everything under it, to the end of another milestone. Returns null if
// the task or the milestone has changed.
function moveRow(markdown, line, status, text, toLine, toTitle, statuses) {
  if (!findRow(markdown, line, status, text, statuses)) return null;
  const visible = stripComments(markdown);
  const target = milestoneAt(visible, toLine, toTitle);
  if (!target) return null;
  const { first, last, own } = rowExtent(visible, line);
  const raw = rawLines(markdown);
  const moved = raw.slice(first - 1, last).map((l) => dedent(l, own));
  const at = lastContentLine(raw, toLine, milestoneEnd(visible, target));
  if (at >= first && at <= last) return null; // can't move a task into itself
  if (at < first) return removeLines(insertLine(markdown, at, moved), first + moved.length, last + moved.length);
  return insertLine(removeLines(markdown, first, last), at - moved.length, moved);
}

// ----- the Task Archive -----

// Takes every task in an ARCHIVED type status out of a file, each with everything indented
// under it (its dates and subtasks), for a review to move into _Task_Archive.md. `keep` says
// which lines can be taken, as a Contacts or Events task only counts inside an entry. Each
// task comes back as the heading it was under (its block, as written, or null before the
// first heading) and its lines, lined up at the left.
//
// A milestone whose tasks leave keeps a comment counting them (ARCHIVE_MARKER), so it still
// shows as complete rather than as having no tasks.
function takeArchivedRows(markdown, statuses, keep = () => true, scope) {
  const visible = stripComments(markdown);
  const raw = rawLines(markdown);
  const archived = scanLines(markdown, createMatcher(statuses, scope)).filter((item) => item.type === 'ARCHIVED' && keep(item.line));
  const milestones = milestoneSection(visible);
  const rows = [];
  const ranges = [];
  const taken = new Map(); // a milestone heading's 0-based index -> how many tasks left it
  for (const item of archived) {
    if (ranges.length && item.line <= ranges[ranges.length - 1].last) continue; // under one already taken
    const { first, last, own } = rowExtent(visible, item.line);
    let heading = first - 2;
    while (heading >= 0 && !/^#{1,6}\s/.test(visible[heading])) heading--;
    rows.push({ block: heading >= 0 ? visible[heading].trim() : null, lines: raw.slice(first - 1, last).map((l) => dedent(l, own)) });
    ranges.push({ first, last });
    if (milestones && heading > milestones.start && heading < milestones.end && MILESTONE_HEADING.test(visible[heading])) taken.set(heading, (taken.get(heading) || 0) + 1);
  }
  // From the bottom up, so the earlier line numbers still hold.
  let remaining = ranges.reduceRight((text, { first, last }) => removeLines(text, first, last), markdown);
  // Then each milestone's count, also from the bottom up. A heading moves up by the lines
  // taken out above it.
  for (const [heading, count] of [...taken].sort((a, b) => b[0] - a[0])) {
    const above = ranges.filter((r) => r.last <= heading).reduce((n, r) => n + r.last - r.first + 1, 0);
    remaining = addArchiveMarker(remaining, heading - above, count);
  }
  return { markdown: remaining, rows };
}

// Adds `count` to the marker of the milestone whose heading is at 0-based `heading`, or adds
// a marker after the milestone's last line.
function addArchiveMarker(markdown, heading, count) {
  const raw = rawLines(markdown);
  const visible = stripComments(markdown);
  let end = heading + 1;
  while (end < visible.length && !/^#{1,3}\s/.test(visible[end])) end++;
  for (let i = heading + 1; i < end; i++) {
    const found = raw[i].match(ARCHIVE_MARKER);
    if (found) return editLine(markdown, i + 1, () => archiveMarker(Number(found[1]) + count));
  }
  return insertLine(markdown, lastContentLine(raw, heading + 2, end) || heading + 1, archiveMarker(count));
}

// One file's archived tasks: its name, then each block's tasks under the block's heading.
function archivedFileLines({ file, rows }) {
  const lines = [`**File:** ${file}`];
  let block;
  for (const row of rows) {
    if (row.block !== block || lines.length === 1) {
      block = row.block;
      lines.push(`**Block:** ${block || '(before the first heading)'}`);
    }
    lines.push(...row.lines);
  }
  return lines;
}

// Adds one review's archived tasks to _Task_Archive.md, newest first, under the review's
// date. `groups` is a list of { heading, files, projects: [{ title, files }] }: a tentacle
// (or Contacts or Events) with its own files' tasks, then each of its projects'.
function addTaskArchive(markdown, date, groups) {
  const section = [`## Date archived: ${date}`, '', '### Tasks', ''];
  for (const group of groups) {
    section.push(`#### ${group.heading}`);
    for (const file of group.files) section.push(...archivedFileLines(file), '');
    if (!group.files.length) section.push('');
    for (const project of group.projects) {
      section.push(`##### ${project.title}`);
      for (const file of project.files) section.push(...archivedFileLines(file), '');
    }
  }
  if (markdown === null || !markdown.trim()) return ['# Task Archive', '', ...section].join('\n');
  const title = titleIndex(stripComments(markdown));
  return title === -1 ? insertLine(markdown, null, ['# Task Archive', '', ...section]) : insertLine(markdown, title + 1, ['', ...section.slice(0, -1)]);
}

// Makes a task into a new milestone at the end of the Milestones section, named after its
// text. Its subtasks become the milestone's tasks; its own dates are dropped.
function promoteRow(markdown, line, status, text, statuses) {
  const item = findRow(markdown, line, status, text, statuses);
  if (!item) return null;
  const visible = stripComments(markdown);
  const { first, last } = rowExtent(visible, line);
  const raw = rawLines(markdown);
  let from = first; // past the task's own planning lines
  while (from < last && PLANNING_LINE.test(visible[from])) from++;
  const children = raw.slice(from, last);
  const width = Math.min(...children.filter((l) => !isBlank(l)).map(indentOf), Infinity);
  const title = item.editText.replace(/~~/g, '').trim();
  let out = addMilestone(removeLines(markdown, first, last), title);
  if (!children.length) return out;
  const after = stripComments(out);
  const heading = after.map((l, i) => (l.trim() === `### ${title}` ? i + 1 : 0)).filter(Boolean).pop();
  return insertLine(out, heading, children.map((l) => dedent(l, width === Infinity ? 0 : width)));
}

// Adds a "## <task text>" Scratchpad block and makes the task's text a link to it. `target`
// is what the link names: the project's name, or the tentacle's ID.
function linkRowToBlock(markdown, line, status, text, target, statuses) {
  const item = findRow(markdown, line, status, text, statuses);
  if (!item) return null;
  const title = item.editText.trim();
  const linked = swapText(markdown, line, item.textAt, item.editText, `[[${target}#${title}|${title}]]`);
  return addBlock(linked, title);
}

// Moves every open task in a milestone to `done`, from the bottom up so each CLOSED line
// that's added doesn't move the rows still to do.
function finishMilestone(markdown, line, title, done, statuses, now) {
  const visible = stripComments(markdown);
  const found = milestoneAt(visible, line, title);
  if (!found) return null;
  const end = milestoneEnd(visible, found);
  const typeOf = (name) => (statuses.find((s) => s.name === name) || {}).type;
  const rows = scanLines(markdown, createMatcher(statuses))
    .filter((i) => i.line > line && i.line <= end && (i.mark !== null || i.status) && !i.cancelled && !['DONE', 'ARCHIVED'].includes(typeOf(i.status)))
    .sort((a, b) => b.line - a.line);
  return rows.reduce((out, row) => (out === null ? null : moveToStatus(out, row.line, row.status || null, done, statuses, now)), markdown);
}

// A milestone's tasks, as written, for a project made from it.
function milestoneBody(markdown, line, title) {
  const visible = stripComments(markdown);
  const found = milestoneAt(visible, line, title);
  if (!found) return null;
  const raw = rawLines(markdown);
  const end = lastContentLine(raw, line + 1, milestoneEnd(visible, found));
  return end ? raw.slice(line, end) : [];
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

// Reads the outline of one focus entry: tentacle, then project, then everything nested below it.
function parseFocus(body) {
  const entries = [];
  const open = []; // the indents of the bullets this line could be nested under
  let tentacle = null;
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
      tentacle = text;
    } else if (depth === 1) {
      current = { tentacle, project: text.replace(/\s*:$/, ''), items: [] };
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
function editText(markdown, kind, line, from, to, statuses, tentacles) {
  const visible = stripComments(markdown);
  if (kind === 'title') {
    const { title } = parseHeader(markdown, tentacles);
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
  // The value of a "**Label**: value" field, such as an archive entry's. The label stays.
  if (kind === 'value') {
    const field = (visible[line - 1] || '').match(/^(\s*\*\*[^*]+(?:\*\*\s*:|:\*\*))\s*(.*?)\s*$/);
    if (!field || field[2] !== from) return null;
    return editLine(markdown, line, () => (field[1] + ' ' + to).trimEnd());
  }
  return null;
}

module.exports = {
  renameOldLeader,
  isReservedTitle,
  parseBlocks,
  setBlockBody,
  addBlock,
  addMilestone,
  addMilestoneItem,
  removeMilestone,
  moveMilestone,
  moveRow,
  promoteRow,
  linkRowToBlock,
  finishMilestone,
  milestoneBody,
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
  indentRow,
  reorderRow,
  sectionMeta,
  setSectionFlag,
  markSectionReviewed,
  flaggedSections,
  milestoneTitles,
  takeArchivedRows,
  addTaskArchive,
  ARCHIVE_FIELDS,
  INCUBATOR_FIELDS,
  parseNamedEntries,
  addNamedEntry,
  addEntryMark,
  removeNamedEntry,
  parseEntries,
  setEntryField,
  addEntryField,
  addEntry,
  removeEntry,
  eventTiming,
  latestDate,
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
};
