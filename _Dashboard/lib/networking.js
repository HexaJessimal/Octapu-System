// The Contacts and Events pages: reading them, and editing their entries and event fields.
'use strict';

const path = require('path');
const { createMatcher, scanLines, dateError, formatDate, toStoredDate, STORAGE_FORMAT } = require('../todos');
const {
  parseBlocks, parseEntries, setEntryField, addEntryField, addEntryTask, addEntry, removeEntry, eventTiming,
  eventDateValue, setInlineField,
} = require('../document-edits');
const { at, readIfExists } = require('./context');
const {
  NETWORKING_PREFIX, NETWORKING, YES_NO, isValidEventValue, eventDateOf, eventProgress,
  isNetworkingField, readStatuses, readDateFormat, updateProjectFile, networkingPage, addNamed,
} = require('./store');
const { networkingScope } = require('./tasks');

// A Networking page's entries by section. Events that have happened are moved out of their
// section into `past`, most recent first.
async function readNetworking(name) {
  const page = networkingPage(name);
  if (!page) return null;
  const base = { title: page.title, tab: page.tab, noun: page.noun, location: `_Networking/${page.file}`, dateFormat: await readDateFormat() };
  const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
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
        const fields = found.length ? found : [{ label: spec.label, line: entry.line, value: '', missing: true }];
        // Fields with their own controls go by the page's label, and say if their value
        // is one the control can show.
        return spec.kind ? fields.map((f) => Object.assign(f, { label: spec.label, kind: spec.kind, valid: isValidEventValue(spec.kind, f.value) })) : fields;
      })
    );
  }
  if (name === 'events') {
    // The file's own headings don't matter here: events are listed by date.
    const events = sections.flatMap((s) => s.entries).map((entry) => Object.assign(entry, eventTiming(eventDateOf(entry), today), { progress: eventProgress(entry) }));
    const byStart = (a, b) => (a.start || a.end ? 0 : 1) - (b.start || b.end ? 0 : 1) || (a.start || a.end || '').localeCompare(b.start || b.end || '');
    const upcoming = events.filter((e) => !e.past).sort(byStart);
    const past = events.filter((e) => e.past).sort((a, b) => (b.end || '').localeCompare(a.end || ''));
    return Object.assign(base, {
      folder,
      file: page.file,
      content,
      statuses,
      todos: scanLines(content, createMatcher(statuses, networkingScope(page))).map((t) => Object.assign(t, { folder, file: page.file })),
      sections: upcoming.length ? [{ title: 'Upcoming Events', entries: upcoming }] : [],
      // A new event goes at the end of the file's last heading.
      sectionNames: sectionNames.slice(-1),
      past,
      blocks,
      others: await otherNetworkingTitles(name),
    });
  }
  return Object.assign(base, {
    folder,
    file: page.file,
    content,
    statuses,
    todos: scanLines(content, createMatcher(statuses, networkingScope(page))).map((t) => Object.assign(t, { folder, file: page.file })),
    sections: sections.filter((s) => s.entries.length),
    sectionNames,
    past: [],
    blocks,
    others: await otherNetworkingTitles(name),
  });
}

// The entry names on the other Networking pages, so a [[#reference]] can find its way there.
async function otherNetworkingTitles(name) {
  const others = [];
  for (const other of Object.keys(NETWORKING).filter((key) => key !== name)) {
    const page = NETWORKING[other];
    const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
    if (content === null) continue;
    const sections = parseEntries(content, page.level).filter((s) => !page.section || page.section.test(s.title));
    others.push({ page: other, titles: sections.flatMap((s) => s.entries.map((e) => e.title)) });
  }
  return others;
}

const pageOfFolder = (folder) => (folder.startsWith(NETWORKING_PREFIX) ? networkingPage(folder.slice(NETWORKING_PREFIX.length)) : null);
const NOT_FOUND = { code: 404, body: { error: 'File not found.' } };

// Adds a task to an entry's Tasks field, as a task list's plus button does.
function saveEntryTask(body) {
  const page = pageOfFolder(body.folder);
  if (!page) return NOT_FOUND;
  return addNamed(body, body.text, (content, text) => addEntryTask(content, page.level, isNetworkingField(page), body.line, body.title, text, body.depth || 0));
}

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
  // An entry goes under a `##` heading, so a file with none can't take one yet.
  if (!body.section) return { code: 400, body: { error: `${page.file} needs a ## heading to add ${page.noun}s under.` } };
  // Fields with their own controls start on one line, with Yes/No ones set to No.
  const labels = page.fields.map((f) => (f.kind ? { line: f.kind === 'yesno' ? `**${f.label}**: No` : `**${f.label}**:` } : f.label));
  return addNamed(body, body.title, (content, text) => addEntry(content, page.level, body.section, text, labels));
}

function deleteEntry({ folder, file, line, title }) {
  const page = pageOfFolder(folder);
  if (!page) return NOT_FOUND;
  return updateProjectFile(folder, file, (content) => removeEntry(content, page.level, line, title));
}

// How setInlineField finds the events field at `at` in the page's order, and where it goes.
function eventFieldTarget(at) {
  const fields = NETWORKING.events.fields;
  const earlier = fields.slice(0, at);
  return { label: fields[at].label, matches: (label) => fields[at].match.test(label), before: (label) => earlier.some((f) => f.match.test(label)) };
}

// Saves an event's date or Yes/No field, on one line. Dates arrive in the DATEFORMAT and are
// stored as YYYY-MM-DD. Only Event Date can have an end date, for an event of several days.
async function saveEventField({ line, title, label, start = '', end = '', value = '' }) {
  const page = NETWORKING.events;
  const at = page.fields.findIndex((f) => f.kind && f.label === label);
  if (at === -1) return { code: 400, body: { error: 'Invalid request' } };
  const { kind } = page.fields[at];
  let text = value;
  if (kind === 'yesno') {
    if (!YES_NO.includes(value)) return { code: 400, body: { error: 'Choose Yes or No.' } };
  } else {
    const format = await readDateFormat();
    const first = start.trim();
    const last = kind === 'range' ? end.trim() : '';
    if (!first && last) return { code: 400, body: { error: 'Add the start date as well.' } };
    const error = [first, last].filter(Boolean).map((d) => dateError(d, format)).find(Boolean);
    if (error) return { code: 400, body: { error } };
    const from = first ? toStoredDate(first, format) : null;
    const to = last ? toStoredDate(last, format) : from;
    if (to && to < from) return { code: 400, body: { error: 'The end date is before the start date.' } };
    text = eventDateValue({ start: from, end: to });
  }
  return updateProjectFile(NETWORKING_PREFIX + 'events', page.file, (content) => setInlineField(content, page.level, isNetworkingField(page), line, title, eventFieldTarget(at), text));
}

module.exports = {
  readNetworking,
  pageOfFolder,
  NOT_FOUND,
  saveEntryField,
  saveEntryTask,
  saveNewEntry,
  deleteEntry,
  eventFieldTarget,
  saveEventField,
};
