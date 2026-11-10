// Finds status-prefixed todo items in markdown. Pure functions, no dependencies.
'use strict';

// The status types are fixed. Status names always come from Labels/Status.csv.
const TYPE_MARKS = { UNASSIGNED: ' ', ASSIGNED: '/', WAITING: '-', DONE: 'x', ARCHIVED: 'x' };
const NEXT_TYPE = { UNASSIGNED: 'ASSIGNED', ASSIGNED: 'DONE', WAITING: 'DONE', DONE: 'ARCHIVED' };
const STATUS_TYPES = Object.keys(TYPE_MARKS);

// Dates are always stored this way. DATEFORMAT only affects how the browser shows them.
const STORAGE_FORMAT = 'YYYY-MM-DD';

// A priority is an org-style [#A] token straight after the status. No token means no priority.
const PRIORITIES = ['A', 'B', 'C'];
const PRIORITY_TOKEN = /^((?:\*\*|__|\*|_)?\s*)\[#([A-C])\]/;
const TOKEN_LENGTH = '[#A]'.length;

// Org-style planning lines directly under an item, e.g. "  CLOSED: [2026-09-03 Thu 14:10]".
const PLANNING_LINE = /^\s*(?:CLOSED|SCHEDULED|DEADLINE):/;
const PLANNING_DATE = /(CLOSED|SCHEDULED|DEADLINE):\s*[[<]([^\]>]*)[\]>]/g;

// Minimal CSV reader: handles quoted fields, escaped quotes, CRLF/LF and a BOM.
function parseCsv(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Turns Status.csv text into [{ type, name, next }], in file order, first definition
// winning. Rows whose type isn't one of the fixed types are ignored.
function parseStatuses(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const typeCol = header.indexOf('type');
  const nameCol = header.indexOf('name');
  if (typeCol === -1 || nameCol === -1) return [];
  const nextCol = header.indexOf('next');

  const seen = new Set();
  const statuses = [];
  for (const row of rows.slice(1)) {
    const type = (row[typeCol] || '').trim();
    const name = (row[nameCol] || '').trim();
    if (!Object.keys(TYPE_MARKS).includes(type) || !name || seen.has(name)) continue;
    seen.add(name);
    statuses.push({ type, name, next: (row[nextCol] || '').trim() });
  }
  return statuses;
}

// Reads a label file into [{ id, name }], in file order. `idHeader` names the column
// holding what gets written to the markdown; `Name` is what the dashboard shows. Each
// column in `extras` is added to the result under its lowercase header.
function parseLabelList(csvText, idHeader, extras = []) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idCol = header.indexOf(idHeader);
  const nameCol = header.indexOf('name');
  if (idCol === -1 || nameCol === -1) return [];
  return rows
    .slice(1)
    .map((row) => {
      const item = { id: (row[idCol] || '').trim(), name: (row[nameCol] || '').trim() };
      for (const extra of extras) item[extra] = (row[header.indexOf(extra)] || '').trim();
      return item;
    })
    .filter((o) => o.id)
    .map((o) => Object.assign(o, { name: o.name || o.id }));
}

const parseOwners = (csvText) => parseLabelList(csvText, 'id', ['parent']);
const parseLeaders = (csvText) => parseLabelList(csvText, 'tag');

// A colour as stored: "#" and six lowercase hex digits. Accepts it with or without the "#".
// Returns null if it isn't a 6 character hex value.
function normaliseHex(value) {
  const match = value.trim().match(/^#?([0-9a-f]{6})$/i);
  return match ? `#${match[1].toLowerCase()}` : null;
}

// Colours.csv as rows of { name, colour, usedFor }.
function parseColours(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const column = (row, name) => (row[header.indexOf(name)] || '').trim();
  return rows
    .slice(1)
    .map((row) => ({ name: column(row, 'name'), colour: column(row, 'colour'), usedFor: column(row, 'used for') }))
    .filter((row) => row.name);
}

// The stylesheet that applies Colours.csv. A row with a bad name or colour is left out, so
// that colour falls back to the one in style.css.
function coloursStylesheet(rows) {
  const lines = rows
    .filter((row) => /^[a-z][a-z0-9-]*$/.test(row.name) && normaliseHex(row.colour))
    .map((row) => `  --${row.name}: ${normaliseHex(row.colour)};`);
  return `:root {\n${lines.join('\n')}\n}\n`;
}

// Turns Options.csv text into a { OPTION: value } object.
function parseOptions(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return {};
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const keyCol = header.indexOf('option');
  const valueCol = header.indexOf('value');
  if (keyCol === -1 || valueCol === -1) return {};
  const options = {};
  for (const row of rows.slice(1)) {
    const key = (row[keyCol] || '').trim();
    if (key) options[key] = (row[valueCol] || '').trim();
  }
  return options;
}

// Guarantees every type has a status, so nothing breaks if the CSV is missing, empty or
// leaves a type out. A missing type gets a status named after itself.
function withDefaultStatuses(statuses) {
  const result = statuses.slice();
  for (const type of Object.keys(TYPE_MARKS)) {
    if (!result.some((s) => s.type === type) && !result.some((s) => s.name === type)) {
      result.push({ type, name: type, next: '' });
    }
  }
  return result;
}

// Adds `advance`: the status a one-click transition moves to. That's the CSV's Next value
// if it names a known status, else the first status of the next type in the sequence
// (skipping types with no statuses), else null at the end of the sequence.
function withAdvance(statuses) {
  const names = new Set(statuses.map((s) => s.name));
  return statuses.map((s) => {
    let advance = null;
    if (names.has(s.next) && s.next !== s.name) {
      advance = s.next;
    } else {
      for (let type = NEXT_TYPE[s.type]; type && !advance; type = NEXT_TYPE[type]) {
        const first = statuses.find((c) => c.type === type);
        if (first) advance = first.name;
      }
    }
    return { type: s.type, name: s.name, advance };
  });
}

// Returns the document's lines with everything inside comments blanked out, so line
// numbers and character offsets still match the file. Comment forms: <!-- html -->, %% obsidian %% and
// #+BEGIN_COMMENT blocks. Fenced code is blanked too, and comment markers inside code
// (fenced or inline) don't open a comment.
function stripComments(markdown) {
  const lines = String(markdown).replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
  let closer = null; // '-->' or '%%' while inside a multi-line comment
  let fence = null;
  let inOrgBlock = false;

  return lines.map((line) => {
    if (inOrgBlock) {
      if (/^\s*#\+END_COMMENT\b/i.test(line)) inOrgBlock = false;
      return '';
    }
    if (!closer) {
      if (fence) {
        const close = line.match(/^\s{0,3}(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
        return '';
      }
      const open = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (open) {
        fence = open[1];
        return '';
      }
      if (/^\s*#\+BEGIN_COMMENT\b/i.test(line)) {
        inOrgBlock = true;
        return '';
      }
    }

    let visible = '';
    let i = 0;
    while (i < line.length) {
      if (closer) {
        const end = line.indexOf(closer, i);
        if (end === -1) return visible;
        const stop = end + closer.length;
        visible += ' '.repeat(stop - i);
        i = stop;
        closer = null;
      } else if (line.startsWith('<!--', i)) {
        closer = '-->';
        visible += ' '.repeat(4);
        i += 4;
      } else if (line.startsWith('%%', i)) {
        closer = '%%';
        visible += ' '.repeat(2);
        i += 2;
      } else if (line[i] === '`') {
        // Copy an inline code span whole; an unmatched backtick is just a character.
        const run = line.slice(i).match(/^`+/)[0];
        const end = line.indexOf(run, i + run.length);
        const stop = end === -1 ? i + run.length : end + run.length;
        visible += line.slice(i, stop);
        i = stop;
      } else {
        visible += line[i++];
      }
    }
    return visible;
  });
}

// One markdown line-opener at a time: indent, quote, heading, bullet, number, checkbox, emphasis.
const LINE_OPENER = /^(?:\s+|>\s*|#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|\[[ xX/-]\](?:\s+|$)|\*\*|__|\*(?=\S)|_(?=\S))/;

// Matches any of `names` at the start of a string. Case-sensitive and whole-word, so
// "Jessie has…" and "HOME_DIR" are not keywords. Returns null if there are no names.
function keywordRegex(names) {
  if (!names.length) return null;
  const alternatives = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  return new RegExp('^(' + alternatives.join('|') + ')(?![\\p{L}\\p{N}\'’-]|_[\\p{L}\\p{N}])', 'u');
}

function createMatcher(statuses) {
  const types = new Map(statuses.map((s) => [s.name, s.type]));
  const keyword = keywordRegex([...types.keys()]);

  // Returns the line's status and/or checkbox, or null if it has neither. An untagged
  // checkbox only counts in a list item; `start` is then where a keyword would be inserted.
  return (line) => {
    let rest = line;
    let mark = null;
    let markAt = -1;
    let afterBox = -1;
    let listed = false;
    let contentAt = 0; // where the row's own content starts, including any bold or italics
    let emphasised = false;
    for (let m = rest.match(LINE_OPENER); m; m = rest.match(LINE_OPENER)) {
      const offset = line.length - rest.length;
      if (/^(?:\*\*|__|\*|_)$/.test(m[0])) emphasised = true;
      else if (!emphasised) contentAt = offset + m[0].length;
      const box = m[0].match(/^\[(.)\]/);
      if (box && mark === null) {
        mark = box[1].toLowerCase();
        markAt = offset + 1;
        afterBox = offset + m[0].length;
      } else if (mark === null && /^(?:[-*+]|\d+[.)])\s/.test(m[0])) {
        listed = true;
      }
      rest = rest.slice(m[0].length);
    }
    const hit = keyword && rest.match(keyword);
    if (!hit) {
      if (mark === null || !listed) return null;
      const editText = line.slice(afterBox).trimEnd();
      return {
        status: null,
        type: null,
        mark,
        markAt,
        start: afterBox,
        textAt: afterBox,
        editText,
        contentAt,
        contentEnd: line.trimEnd().length,
        cancelled: /^~~.+~~$/.test(editText),
      };
    }
    const start = line.length - rest.length;
    const nameEnd = start + hit[0].length;
    const afterName = rest.slice(hit[0].length);
    const token = afterName.match(PRIORITY_TOKEN);
    const remainder = (token ? afterName.slice(token[0].length) : afterName).replace(
      /^(?:\*\*|__|\*|_)?\s*(?:[:–—-]\s*)?(?:(?:\*\*|__|\*|_)(?=\s|$))?/,
      ''
    );
    const text = remainder.trim();
    return {
      status: hit[1],
      type: types.get(hit[1]),
      text,
      editText: text,
      textAt: line.length - remainder.trimStart().length,
      contentAt,
      contentEnd: line.trimEnd().length,
      cancelled: false,
      mark,
      markAt,
      start,
      priority: token ? token[2] : null,
      priorityAt: token ? nameEnd + token[0].length - TOKEN_LENGTH : -1,
      priorityInsert: nameEnd + afterName.match(/^(?:\*\*|__|\*|_)?/)[0].length,
    };
  };
}

function planningDates(lines, idx) {
  const dates = [];
  for (let i = idx + 1; i < lines.length && PLANNING_LINE.test(lines[i]); i++) {
    for (const m of lines[i].matchAll(PLANNING_DATE)) dates.push({ kind: m[1], value: m[2].trim() });
  }
  return dates;
}

// The page title is the first H1 that isn't inside a comment or code block.
function titleIndex(lines) {
  return lines.findIndex((l) => /^#\s+\S/.test(l));
}

// Every line with a status or checkbox in one document, with 1-based line numbers.
// The page title is never a todo.
function scanLines(markdown, match) {
  const lines = stripComments(markdown);
  const title = titleIndex(lines);
  const items = [];
  lines.forEach((line, idx) => {
    if (idx === title) return;
    const item = match(line);
    if (item) items.push(Object.assign(item, { line: idx + 1, dates: planningDates(lines, idx) }));
  });
  return items;
}

// Applies `edit` to one line, leaving every other byte, including line endings, alone.
function editLine(markdown, lineNo, edit) {
  const bom = markdown.startsWith('﻿') ? '﻿' : '';
  const parts = markdown.slice(bom.length).split(/(\r\n?|\n)/); // text, ending, text, ending…
  const idx = (lineNo - 1) * 2;
  parts[idx] = edit(parts[idx]);
  return bom + parts.join('');
}

// Only the lines that start with a named status.
function findTodos(markdown, match) {
  return scanLines(markdown, match).filter((i) => i.status);
}

// Sets one line's status to `to`, and its checkbox (if any) to the mark for that status's
// type. `from` is null for an untagged checkbox, where the keyword gets inserted.
// Returns null if the line has changed.
function replaceStatus(markdown, lineNo, from, to, statuses) {
  const target = statuses.find((s) => s.name === to);
  const item = scanLines(markdown, createMatcher(statuses)).find((i) => i.line === lineNo);
  if (!target || !item || item.status !== from) return null;

  return editLine(markdown, lineNo, (line) => {
    let text = line;
    // The keyword sits after the checkbox, so changing it first keeps markAt valid.
    if (from) {
      text = text.slice(0, item.start) + to + text.slice(item.start + from.length);
    } else {
      const rest = text.slice(item.start);
      const gap = /\s/.test(text[item.start - 1]) ? '' : ' ';
      text = text.slice(0, item.start) + gap + to + (rest ? ' ' : '') + rest;
    }
    const mark = TYPE_MARKS[target.type];
    if (item.mark !== null && item.mark !== mark) {
      text = text.slice(0, item.markAt) + mark + text.slice(item.markAt + 1);
    }
    return text;
  });
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

// An org-style timestamp, e.g. [2026-11-08 Sun 14:10], or date-only without the time.
function closedStamp(date, withTime = true) {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${WEEKDAYS[date.getDay()]}`;
  return `[${day}${withTime ? ` ${pad(date.getHours())}:${pad(date.getMinutes())}` : ''}]`;
}

// Sets a row's CLOSED date: updates an existing one, or adds a line after the row's other
// planning lines, indented to sit under the row.
function setClosed(markdown, lineNo, stamp) {
  const visible = stripComments(markdown);
  let last = lineNo;
  for (; last < visible.length && PLANNING_LINE.test(visible[last]); last++) {
    const found = visible[last].match(/CLOSED:\s*\[[^\]]*\]/);
    if (found) {
      const start = found.index;
      return editLine(markdown, last + 1, (text) => text.slice(0, start) + `CLOSED: ${stamp}` + text.slice(start + found[0].length));
    }
  }
  return insertLine(markdown, last, `${visible[lineNo - 1].match(/^\s*/)[0]}  CLOSED: ${stamp}`);
}

// Sets, changes or (with a null `date`) removes a row's SCHEDULED or DEADLINE date. The date
// is YYYY-MM-DD, and a new one goes on its own line after the row's other planning lines.
function setPlanningDate(markdown, lineNo, kind, date) {
  const visible = stripComments(markdown);
  const stamp = date && `${kind}: <${closedStamp(new Date(`${date}T12:00:00`), false).slice(1, -1)}>`;
  const existing = new RegExp(`${kind}:\\s*[<[][^\\]>]*[\\]>]`);
  let last = lineNo;
  for (; last < visible.length && PLANNING_LINE.test(visible[last]); last++) {
    const found = visible[last].match(existing);
    if (!found) continue;
    const at = found.index;
    const end = at + found[0].length;
    if (stamp) return editLine(markdown, last + 1, (text) => text.slice(0, at) + stamp + text.slice(end));
    if (visible[last].replace(found[0], '').trim() === '') return removeLine(markdown, last + 1);
    return editLine(markdown, last + 1, (text) => (text.slice(0, at) + text.slice(end).trimStart()).trimEnd());
  }
  return stamp ? insertLine(markdown, last, `${visible[lineNo - 1].match(/^\s*/)[0]}  ${stamp}`) : markdown;
}

// Removes one whole line, keeping every other line ending.
function removeLine(markdown, lineNo) {
  const eol = (markdown.match(/\r\n?|\n/) || ['\n'])[0];
  const lines = markdown.split(/\r\n?|\n/);
  lines.splice(lineNo - 1, 1);
  return lines.join(eol);
}

// Changes a row's status, and stamps a CLOSED date if it has just entered a DONE type.
function moveToStatus(markdown, lineNo, from, to, statuses, now) {
  const updated = replaceStatus(markdown, lineNo, from, to, statuses);
  if (updated === null) return null;
  const typeOf = (name) => (statuses.find((s) => s.name === name) || {}).type;
  return typeOf(to) === 'DONE' && typeOf(from) !== 'DONE' ? setClosed(updated, lineNo, closedStamp(now)) : updated;
}

// Sets, changes or (with null) removes the priority token on a status line.
// Returns null if the line no longer has that status.
function setPriority(markdown, lineNo, status, priority, statuses) {
  const item = scanLines(markdown, createMatcher(statuses)).find((i) => i.line === lineNo);
  if (!item || !item.status || item.status !== status) return null;

  return editLine(markdown, lineNo, (text) => {
    if (item.priorityAt === -1) {
      if (!priority) return text;
      return text.slice(0, item.priorityInsert) + ' [#' + priority + ']' + text.slice(item.priorityInsert);
    }
    if (priority) return text.slice(0, item.priorityAt + 2) + priority + text.slice(item.priorityAt + 3);
    const before = text.slice(0, item.priorityAt);
    const after = text.slice(item.priorityAt + TOKEN_LENGTH);
    if (!after.trim()) return before.trimEnd();
    return /^\s/.test(after) ? before + after.trimStart() : before.trimEnd() + after;
  });
}

const TIMEFRAME_FIELD = /^\s*\*\*\s*Active Timeframe\s*\*\*\s*:/i;
// Both "**Label**: value" and "**Label:** value" are used in the files.
const CREATED_FIELD = /^\s*\*\*\s*(?:Date\s+)?Created\s*(?:\*\*\s*:|:\s*\*\*)/i;
const PROJECT_TYPES = ['Milestone', 'Ongoing'];
const DATE_FIELDS = { reviewed: 'Date Reviewed', closed: 'Date Closed' };
const HEADER_FIELD_ORDER = ['Date Created', 'Date Reviewed', 'Date Closed', 'Active Timeframe', 'Project Dependency'];

// Finds a "**Label**: value" line. `at` is where the value starts.
function findField(lines, label) {
  const pattern = new RegExp('^(\\s*\\*\\*\\s*' + label + '\\s*(?:\\*\\*\\s*:|:\\s*\\*\\*)\\s*)(.*)$', 'i');
  const idx = lines.findIndex((l) => pattern.test(l));
  if (idx === -1) return null;
  const m = lines[idx].match(pattern);
  return { line: idx + 1, at: m[1].length, value: m[2].trimEnd() };
}

// Adds one or more new lines after line `lineNo`, or at the very top if lineNo is null.
function insertLine(markdown, lineNo, text) {
  const eol = (markdown.match(/\r\n?|\n/) || ['\n'])[0];
  const added = [].concat(text).join(eol);
  return editLine(markdown, lineNo || 1, (line) => (lineNo ? line + eol + added : added + eol + line));
}

// The comma-separated entries of an Active Timeframe value, as written.
function timeframeEntries(value) {
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

// Finds the page title (and the owner keyword opening it), the Active Timeframe field and
// the Owner field. timeframe.anchor is the line a missing timeframe would be added after.
function parseHeader(markdown, owners) {
  const lines = stripComments(markdown);
  const idx = titleIndex(lines);
  let title = null;
  if (idx !== -1) {
    const at = lines[idx].match(/^#\s+/)[0].length;
    const text = lines[idx].slice(at);
    const keyword = keywordRegex(owners.map((o) => o.id));
    const hit = keyword && text.match(keyword);
    const tail = hit ? text.slice(hit[0].length) : text;
    title = {
      line: idx + 1,
      at,
      owner: hit ? hit[1] : null,
      rest: tail.replace(/\s*#*\s*$/, '').trim(),
      restAt: lines[idx].length - tail.trimStart().length,
    };
  }
  const timeframe = lines.findIndex((l) => TIMEFRAME_FIELD.test(l));
  const created = lines.findIndex((l) => CREATED_FIELD.test(l));
  const anchor = created !== -1 ? created + 1 : title ? title.line : null;
  const value = timeframe === -1 ? '' : lines[timeframe].replace(/^[^:]*:/, '').trim();
  const dates = {};
  for (const [key, label] of Object.entries(DATE_FIELDS)) {
    const field = findField(lines, label);
    dates[key] = field ? { line: field.line, value: field.value } : { line: null, value: '' };
  }
  const dependency = findField(lines, 'Project Dependency');
  const type = findField(lines, 'Project Type');
  return {
    title,
    timeframe: { line: timeframe === -1 ? null : timeframe + 1, anchor, value, entries: timeframeEntries(value) },
    leader: findField(lines, 'Owner'),
    createdLine: created === -1 ? null : created + 1,
    dates,
    dependency: dependency ? { line: dependency.line, value: dependency.value } : { line: null, value: '' },
    // `known` is the value as spelled in PROJECT_TYPES, or null if it isn't one of them.
    projectType: type && type.value.trim()
      ? { line: type.line, value: type.value.trim(), known: PROJECT_TYPES.find((t) => t.toLowerCase() === type.value.trim().toLowerCase()) || null }
      : null,
  };
}

const setDateField = (markdown, key, value) => setHeaderField(markdown, DATE_FIELDS[key], value);
const setDependency = (markdown, name) => setHeaderField(markdown, 'Project Dependency', name);

// Sets (or, with an empty value, clears) a header field. A missing field is added after
// the nearest earlier header field, or else after the title.
function setHeaderField(markdown, label, value) {
  const lines = stripComments(markdown);
  const field = findField(lines, label);
  if (field) {
    return editLine(markdown, field.line, (text) => {
      const before = text.slice(0, field.at);
      const after = text.slice(field.at + field.value.length);
      if (!value) return before.trimEnd() + after;
      return before + (/\s$/.test(before) ? '' : ' ') + value + after;
    });
  }
  if (!value) return markdown;
  const earlier = HEADER_FIELD_ORDER.slice(0, HEADER_FIELD_ORDER.indexOf(label)).reverse();
  const anchor = earlier.map((l) => findField(lines, l)).find(Boolean);
  const title = titleIndex(lines);
  return insertLine(markdown, anchor ? anchor.line : title === -1 ? null : title + 1, `**${label}**: ${value}`);
}

// Sets the value of the Owner field. Returns null if the field has changed.
function setLeader(markdown, lineNo, from, to) {
  const leader = findField(stripComments(markdown), 'Owner');
  if (!leader || leader.line !== lineNo || leader.value !== from) return null;
  return editLine(markdown, lineNo, (text) => {
    const before = text.slice(0, leader.at);
    return before + (/\s$/.test(before) ? '' : ' ') + to + text.slice(leader.at + from.length);
  });
}

// Sets the owner keyword in the page title. `from` is null if the title has none yet.
// Returns null if the title has changed.
function setOwner(markdown, lineNo, from, to, owners) {
  const { title } = parseHeader(markdown, owners);
  if (!title || title.line !== lineNo || title.owner !== from) return null;
  return editLine(markdown, lineNo, (text) =>
    from
      ? text.slice(0, title.at) + to + text.slice(title.at + from.length)
      : text.slice(0, title.at) + to + ' ' + text.slice(title.at)
  );
}

// Regex source for a format made of YYYY, YY, MM and DD, and the tokens in capture order.
function dateSource(format) {
  const order = [];
  const source = format.replace(/YYYY|YY|MM|DD|[.*+?^${}()|[\]\\/]/g, (t) => {
    if (!/^[YMD]+$/.test(t)) return '\\' + t;
    order.push(t);
    return t.length === 4 ? '(\\d{4})' : '(\\d{2})';
  });
  return { source, order };
}

// Reads `text` as { Y, M, D }, or null if it doesn't match the format or isn't a real date.
function readDate(text, format) {
  const { source, order } = dateSource(format);
  const m = text.match(new RegExp('^' + source + '$'));
  if (!m) return null;
  const parts = {};
  order.forEach((token, i) => {
    parts[token[0]] = Number(m[i + 1]) + (token === 'YY' ? 2000 : 0);
  });
  if (!parts.Y || !parts.M || !parts.D) return null;
  const date = new Date(Date.UTC(parts.Y, parts.M - 1, parts.D));
  if (date.getUTCFullYear() !== parts.Y || date.getUTCMonth() !== parts.M - 1 || date.getUTCDate() !== parts.D) return null;
  return parts;
}

// A sortable number for a date, or null if it can't be read.
function parseDate(text, format) {
  const parts = readDate(text, format);
  return parts && parts.Y * 10000 + parts.M * 100 + parts.D;
}

function writeDate({ Y, M, D }, format) {
  const year = String(Y).padStart(4, '0');
  return format.replace('YYYY', year).replace('YY', year.slice(-2)).replace('MM', pad(M)).replace('DD', pad(D));
}

// Turns a date typed in the display format into the stored format, or null if unreadable.
function toStoredDate(text, displayFormat) {
  const parts = readDate(text, displayFormat);
  return parts && writeDate(parts, STORAGE_FORMAT);
}

// Returns an error message, or null if the timeframe is valid.
function timeframeError(start, end, format) {
  const from = parseDate(start, format);
  const to = parseDate(end, format);
  if (from === null || to === null) return `Dates must be real dates written as ${format}.`;
  return to < from ? "The end date can't be before the start date." : null;
}

// Returns an error message, or null if `value` is empty or a valid date.
function dateError(value, format) {
  return value && parseDate(value, format) === null ? `Enter a real date written as ${format}.` : null;
}

function formatDate(date, format) {
  return writeDate({ Y: date.getFullYear(), M: date.getMonth() + 1, D: date.getDate() }, format);
}

// Returns an error message, or null if `title` works as a file name on every system.
function projectTitleError(title, noun = 'title') {
  if (!title) return `Enter a ${noun}.`;
  if (title.length > 100) return `Keep the ${noun} to 100 characters or fewer.`;
  if (/[<>:"/\\|?*\u0000-\u001f]/.test(title)) return `A ${noun} can't contain any of these characters: < > : " / \\ | ? *`;
  if (/\.$/.test(title)) return `A ${noun} can't end with a dot.`;
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(title)) return `That ${noun} is a reserved file name. Please choose another.`;
  return null;
}

// The starting content for a new entity's markdown file.
function newEntityFile({ name, today, taskLists }) {
  return `# ${name}\n**Date Created**: ${today}\n**Date Reviewed**:\n\n## Notes\n\n${taskListHeadings(taskLists)}`;
}

// The empty sections a new file starts with, one per task list.
const taskListHeadings = (taskLists) => taskLists.map((name) => `## ${name}\n`).join('\n');

// The folder name, file name and starting content for a new active project.
function newProjectFiles({ ownerId, leaderTag, title, notes, today, projectType, taskLists }) {
  const ongoing = projectType === 'Ongoing';
  const body = notes ? `\n${notes}\n` : '';
  return {
    folder: `+${ownerId}_${title.replace(/\s+/g, '_')}`,
    file: `${title}.md`,
    content:
      `# ${ownerId} ${title}\n` +
      `**Project Type:** ${projectType}\n` +
      `**Date Created**: ${today}\n` +
      '**Date Reviewed**:\n' +
      '**Date Closed**:\n' +
      (ongoing ? '' : '**Active Timeframe**:\n**Project Dependency**:\n') +
      `**Owner** : ${leaderTag}\n\n` +
      `## Notes\n${body}\n` +
      (ongoing ? taskListHeadings(taskLists) : '## Milestones\n'),
  };
}

// True if `format` contains a year, a month and a day that parseDate can read.
function isUsableDateFormat(format) {
  const sample = format.replace('YYYY', '2001').replace('YY', '01').replace('MM', '02').replace('DD', '03');
  return parseDate(sample, format) !== null;
}

// Splits an Active Timeframe value into month-accurate ranges. Entries that can't be read
// with `format` come back in `invalid`, so they can be reported rather than lost.
function parseTimeframes(value, format) {
  const toMonth = (n) => ({ year: Math.floor(n / 10000), month: Math.floor(n / 100) % 100 });
  const monthIndex = (d) => d.year * 12 + d.month - 1; // continuous, so ranges can cross years
  const ranges = [];
  const invalid = [];
  for (const raw of timeframeEntries(value)) {
    const pair = raw.split(/\s+to\s+/i);
    const start = pair.length === 2 ? parseDate(pair[0], format) : null;
    const end = pair.length === 2 ? parseDate(pair[1], format) : null;
    if (start === null || end === null || end < start) invalid.push(raw);
    else ranges.push({ raw, start: toMonth(start), end: toMonth(end), first: monthIndex(toMonth(start)), last: monthIndex(toMonth(end)) });
  }
  return { ranges, invalid };
}

// The ids from an owner's top-level ancestor down to the owner. Null if a parent is
// unknown or the parents form a loop.
function ownerChain(owners, id) {
  const byId = new Map(owners.map((o) => [o.id, o]));
  const chain = [];
  for (let owner = byId.get(id); owner; owner = byId.get(owner.parent)) {
    if (chain.includes(owner.id)) return null;
    chain.unshift(owner.id);
    if (!owner.parent) return chain;
  }
  return null;
}

// Collapses runs of spaces, and trims the ends, as for a name typed into a form.
const cleanName = (text) => String(text).trim().replace(/\s+/g, ' ');

const csvField = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

// Returns Owners.csv text with one more row, following whatever column order the file has.
function appendOwnerCsv(csvText, owner) {
  const bom = csvText.startsWith('﻿') ? '﻿' : '';
  const body = csvText.slice(bom.length);
  const eol = (body.match(/\r\n?|\n/) || ['\r\n'])[0];
  const header = parseCsv(body)[0].map((h) => h.trim().toLowerCase());
  const row = header.map((column) => csvField(owner[column] || '')).join(',');
  return bom + body.replace(/[\r\n]+$/, '') + eol + row + eol;
}

// The Options.csv a new install starts with.
function newOptionsCsv({ dateFormat, roundup, projects, taskLists }) {
  return ['Option,Value', `DATEFORMAT,"${dateFormat}"`, `ROUNDUP,${roundup}`, `PROJECTS,"${projects}"`, `TASKLISTS,"${taskLists}"`, 'SHOWARCHIVED,"FALSE"'].join('\r\n') + '\r\n';
}

// The Status.csv a new install starts with: one status per type, with the ASSIGNED one named
// after the first person, or just ASSIGNED if their name can't be used as a status.
function newStatusCsv(person) {
  const name = person.trim().toUpperCase().replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '');
  const assigned = name && !['TODO', 'WAITING', 'DONE', 'ARCHIVED'].includes(name) ? name : 'ASSIGNED';
  const rows = [
    ['Type', 'Name', 'Next'],
    ['UNASSIGNED', 'TODO', assigned],
    ['ASSIGNED', assigned, 'DONE'],
    ['WAITING', 'WAITING', 'DONE'],
    ['DONE', 'DONE', 'ARCHIVED'],
    ['ARCHIVED', 'ARCHIVED', ''],
  ];
  return rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
}

// Returns Options.csv text with new values for the given keys. Everything else is kept,
// including the line endings and the quoted Value column.
function updateOptionsCsv(csvText, values) {
  const bom = csvText.startsWith('﻿') ? '﻿' : '';
  const body = csvText.slice(bom.length);
  const eol = (body.match(/\r\n?|\n/) || ['\r\n'])[0];
  const rows = parseCsv(body);
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const keyCol = header.indexOf('option');
  const valueCol = header.indexOf('value');
  const quoted = (v) => '"' + v.replace(/"/g, '""') + '"';
  const present = new Set();
  const lines = rows.map((row, i) => {
    if (i === 0) return row.map(csvField).join(',');
    const key = (row[keyCol] || '').trim();
    present.add(key);
    const next = row.slice();
    if (Object.prototype.hasOwnProperty.call(values, key)) next[valueCol] = values[key];
    return next.map((v, col) => (col === valueCol ? quoted(v) : csvField(v))).join(',');
  });
  // An option the file doesn't have yet, such as SHOWARCHIVED in an older file, is added.
  for (const [key, value] of Object.entries(values)) {
    if (present.has(key)) continue;
    const row = header.map(() => '');
    row[keyCol] = key;
    row[valueCol] = value;
    lines.push(row.map((v, col) => (col === valueCol ? quoted(v) : csvField(v))).join(','));
  }
  return bom + lines.join(eol) + (/[\r\n]$/.test(body) ? eol : '');
}

// Appends "start to end" to the Active Timeframe field, adding the field if it's missing.
function addTimeframe(markdown, start, end) {
  const entry = `${start} to ${end}`;
  const { timeframe } = parseHeader(markdown, []);
  if (timeframe.line) {
    return editLine(markdown, timeframe.line, (text) => {
      const hasValue = text.replace(/^[^:]*:/, '').trim() !== '';
      return text.trimEnd() + (hasValue ? ', ' : ' ') + entry;
    });
  }
  return insertLine(markdown, timeframe.anchor, `**Active Timeframe**: ${entry}`);
}

// Replaces the timeframe at `index` with "start to end", or removes it if `entry` is null.
// Returns null if that timeframe is no longer what the page showed.
function editTimeframe(markdown, index, from, entry) {
  const { entries } = parseHeader(markdown, []).timeframe;
  if (entries[index] !== from) return null;
  entries.splice(index, 1, ...(entry ? [entry] : []));
  return setHeaderField(markdown, 'Active Timeframe', entries.join(', '));
}

const STALE_ROW = 'That row has changed in the file, so nothing was updated.';

// Runs `change(rows, columns)` over a CSV's data rows, where `columns` gives the position
// of each named column (added if missing). `change` edits rows in place and returns an
// error message, or nothing if all went well. Other rows and columns are kept.
function editCsv(csvText, names, change) {
  const bom = csvText.startsWith('﻿') ? '﻿' : '';
  const body = csvText.slice(bom.length);
  const eol = (body.match(/\r\n?|\n/) || ['\r\n'])[0];
  const parsed = parseCsv(body);
  const head = parsed[0].slice();
  const columns = {};
  for (const name of names) {
    const at = head.findIndex((h) => h.trim().toLowerCase() === name);
    columns[name] = at === -1 ? head.push(name[0].toUpperCase() + name.slice(1)) - 1 : at;
  }
  const rows = parsed.slice(1).filter((row) => row.some((cell) => cell.trim())).map((row) => head.map((_, i) => row[i] || '').concat(row.slice(head.length)));
  const error = change(rows, columns);
  if (error) return { error };
  return { text: bom + [head, ...rows].map((row) => row.map(csvField).join(',')).join(eol) + eol };
}

// Adds, changes or deletes a row of Status.csv. `from` is the name of the row to change.
// Renaming or deleting a status also updates any other status's Next that points to it.
function editStatusCsv(csvText, { action, from, type, name, next }) {
  return editCsv(csvText, ['type', 'name', 'next'], (rows, col) => {
    const at = action === 'add' ? -1 : rows.findIndex((row) => row[col.name].trim() === from);
    if (action !== 'add' && at === -1) return STALE_ROW;
    const pointAt = (to) => rows.forEach((row) => {
      if (row[col.next].trim() === from) row[col.next] = to;
    });
    if (action === 'delete') {
      rows.splice(at, 1);
      return pointAt('');
    }
    const clean = name.trim().toUpperCase();
    if (!clean) return 'Enter a name.';
    if (!/^[\p{L}\p{N}_-]+$/u.test(clean)) return 'A status name can only use letters, numbers, hyphens and underscores.';
    if (!STATUS_TYPES.includes(type)) return 'Choose a status type.';
    if (rows.some((row, i) => i !== at && row[col.name].trim() === clean)) return `There is already a status called ${clean}.`;

    const defined = rows
      .filter((_, i) => i !== at)
      .map((row) => ({ type: row[col.type].trim(), name: row[col.name].trim() }))
      .filter((s) => STATUS_TYPES.includes(s.type) && s.name)
      .concat({ type, name: clean });
    const target = next === from ? clean : next;
    if (target && !withDefaultStatuses(defined).some((s) => s.name === target)) return `"${target}" isn't a status.`;

    if (action === 'add') {
      const row = rows.length ? rows[0].map(() => '') : Object.values(col).map(() => '');
      rows.push(row);
    } else {
      pointAt(clean);
    }
    const row = rows[action === 'add' ? rows.length - 1 : at];
    row[col.type] = type;
    row[col.name] = clean;
    row[col.next] = target;
    return null;
  });
}

// A leader's tag: a hash, then their name without any punctuation.
function leaderTag(name) {
  const bare = name.replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();
  return bare ? `#${bare}` : '';
}

// Adds, changes or deletes a row of Leaders.csv. `from` is the tag of the row to change.
// Changes one row of Colours.csv. Its rows are fixed, as each is used by the stylesheet.
function editColourCsv(csvText, { from, colour }) {
  return editCsv(csvText, ['name', 'colour'], (rows, col) => {
    const row = rows.find((r) => r[col.name].trim() === from);
    if (!row) return STALE_ROW;
    const clean = normaliseHex(colour);
    if (!clean) return 'Enter a 6 character hex value, such as #a6e3c0.';
    row[col.colour] = clean;
    return null;
  });
}

function editLeaderCsv(csvText, { action, from, name }) {
  return editCsv(csvText, ['tag', 'name'], (rows, col) => {
    const at = action === 'add' ? -1 : rows.findIndex((row) => row[col.tag].trim() === from);
    if (action !== 'add' && at === -1) return STALE_ROW;
    if (action === 'delete') {
      rows.splice(at, 1);
      return null;
    }
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return 'Enter a name.';
    const tag = leaderTag(clean);
    if (!tag) return 'A name needs at least one letter or number.';
    if (rows.some((row, i) => i !== at && row[col.tag].trim() === tag)) return `There is already a leader with the tag ${tag}.`;
    if (action === 'add') rows.push(rows.length ? rows[0].map(() => '') : Object.values(col).map(() => ''));
    const row = rows[action === 'add' ? rows.length - 1 : at];
    row[col.tag] = tag;
    row[col.name] = clean;
    return null;
  });
}

// Every <template name="..."> in a component file, as { name: source }. Line breaks and
// the indentation after them are only for reading, so they're dropped.
function parseComponents(html) {
  const components = {};
  for (const [, name, body] of html.matchAll(/<template name="([\w-]+)">([\s\S]*?)<\/template>/g)) {
    components[name] = body.replace(/\r?\n[ \t]*/g, '');
  }
  return components;
}

module.exports = {
  STATUS_TYPES,
  editStatusCsv,
  editLeaderCsv,
  PRIORITIES,
  PLANNING_LINE,
  withDefaultStatuses,
  closedStamp,
  setClosed,
  moveToStatus,
  titleIndex,
  setPlanningDate,
  timeframeEntries,
  findField,
  setHeaderField,
  editLine,
  insertLine,
  parseCsv,
  csvField,
  cleanName,
  parseStatuses,
  parseOwners,
  parseLeaders,
  parseColours,
  coloursStylesheet,
  parseComponents,
  editColourCsv,
  normaliseHex,
  parseOptions,
  parseHeader,
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
  PROJECT_TYPES,
  newEntityFile,
  appendOwnerCsv,
  DATE_FIELDS,
  timeframeError,
  addTimeframe,
  editTimeframe,
  isUsableDateFormat,
  parseTimeframes,
  ownerChain,
  updateOptionsCsv,
  withAdvance,
  stripComments,
  createMatcher,
  scanLines,
  findTodos,
  replaceStatus,
  setPriority,
};
