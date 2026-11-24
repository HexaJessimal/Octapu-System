// First-time setup, the Options page's settings and tables, and preparing an entity's folders.
'use strict';

const fs = require('fs');
const path = require('path');
const {
  parseStatuses, withDefaultStatuses, parseLeaders, parseColours, editColourCsv, parseOptions,
  newOptionsCsv, newStatusCsv, leaderTag, appendTentacleCsv, STATUS_TYPES, editStatusCsv,
  editLeaderCsv, editEntityCsv, isUsableDateFormat, updateOptionsCsv, cleanName,
} = require('../todos');
const { isReservedTitle } = require('../document-edits');
const { ROOT_DIR, ENTITIES_FILE, readText, disk, currentRoot, at, entityDirError, parseEntityRows, readIfExists } = require('./context');
const {
  DEFAULT_ROUNDUP_DAYS, DEFAULT_COLOURS_FILE, SETUP_DATE_FORMATS, setupFiles, FALLBACK_PROJECT_DIRS,
  FALLBACK_TASK_LISTS, projectDirError, splitList, readTentacles, readLeaders, SWITCH_OPTIONS,
  SWITCH_VALUES, CHOICE_OPTIONS, writeFileSafely, editLabelFile,
} = require('./store');
const { tentacleError, writeTentacleFile } = require('./documents');

// The Options page's Entities tab: entities.csv as written, and which folders don't exist yet.
async function readEntityTable() {
  const text = await readIfExists(ENTITIES_FILE);
  const rows = parseEntityRows(text) || [];
  return { exists: text !== null, rows: rows.map((row) => Object.assign(row, { missing: !row.dir || !fs.existsSync(path.join(ROOT_DIR, row.dir)) })) };
}

// Adds, changes or removes a row of entities.csv. Removing one leaves its folder alone. A new
// entity's folder is made if it isn't there, and the page then chooses it, which opens setup.
async function saveEntityRow(body) {
  const result = await editLabelFile(ENTITIES_FILE, 'Name,Directory', (text, b) => editEntityCsv(text, b, entityDirError), body);
  if (result.code !== 200 || body.action !== 'add') return result;
  const dir = body.dir.trim();
  const full = path.join(ROOT_DIR, dir);
  const created = !fs.existsSync(full);
  if (created) await disk.mkdir(full);
  return { code: 200, body: { ok: true, created, dir } };
}

// What the Statuses tab lists, and what its dropdowns offer. Defaults can be chosen as a
// Next status, but only the file's own rows are listed.
async function readStatusTable() {
  const text = await readIfExists(at().STATUS_FILE);
  const rows = text === null ? [] : parseStatuses(text);
  return { exists: text !== null, rows, types: STATUS_TYPES, choices: withDefaultStatuses(rows).map((s) => s.name) };
}

async function readLeaderTable() {
  const text = await readIfExists(at().LEADERS_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseLeaders(text) };
}

async function readColourTable() {
  const text = await readIfExists(at().COLOURS_FILE);
  return { exists: text !== null, rows: text === null ? [] : parseColours(text) };
}

const saveStatusRow = (body) => editLabelFile(at().STATUS_FILE, 'Type,Name,Next', editStatusCsv, body);
const saveLeaderRow = (body) => editLabelFile(at().LEADERS_FILE, 'Tag,Name', editLeaderCsv, body);
const saveColourRow = (body) => editLabelFile(at().COLOURS_FILE, 'Name,Colour,Used for', editColourCsv, body);

async function saveOptions({ values }) {
  let text;
  try {
    text = await readText(at().OPTIONS_FILE);
  } catch (err) {
    if (err.code === 'ENOENT') return { code: 404, body: { error: 'Options.csv not found.' } };
    throw err;
  }
  const known = [...Object.keys(parseOptions(text)), ...Object.keys(SWITCH_OPTIONS), ...Object.keys(CHOICE_OPTIONS)];
  const updates = Object.fromEntries(Object.entries(values).filter(([key]) => known.includes(key)));
  const badSwitch = Object.keys(SWITCH_OPTIONS).find((key) => key in updates && !SWITCH_VALUES.includes(updates[key]));
  if (badSwitch) return { code: 400, body: { error: `${badSwitch} needs TRUE or FALSE.` } };
  const badChoice = Object.keys(CHOICE_OPTIONS).find((key) => key in updates && !CHOICE_OPTIONS[key].values.includes(updates[key]));
  if (badChoice) return { code: 400, body: { error: `${badChoice} needs one of ${CHOICE_OPTIONS[badChoice].values.join(', ')}.` } };
  if ('DATEFORMAT' in updates && !isUsableDateFormat(updates.DATEFORMAT)) {
    return { code: 400, body: { error: 'DATEFORMAT needs a year (YYYY or YY), a month (MM) and a day (DD).' } };
  }
  if ('ROUNDUP' in updates && !/^[1-9]\d*$/.test(updates.ROUNDUP)) {
    return { code: 400, body: { error: 'ROUNDUP needs a whole number of days, 1 or more.' } };
  }
  const dirError = 'PROJECTS' in updates && splitList(updates.PROJECTS).map(projectDirError).find(Boolean);
  if (dirError) return { code: 400, body: { error: `PROJECTS: ${dirError}` } };
  const reservedList = 'TASKLISTS' in updates && splitList(updates.TASKLISTS).find(isReservedTitle);
  if (reservedList) return { code: 400, body: { error: `TASKLISTS: "${reservedList}" is already used for its own section.` } };
  await writeFileSafely(at().OPTIONS_FILE, updateOptionsCsv(text, updates));
  return { code: 200, body: { ok: true } };
}

// What the first-time setup form still needs. It's needed if any expected CSV is missing, or
// no tentacle is at the top level of Tentacles.csv.
async function setupState() {
  const expected = setupFiles();
  const files = await Promise.all(expected.map(readIfExists));
  const missing = expected.filter((_, i) => files[i] === null);
  const [tentacles, leaders] = await Promise.all([readTentacles(), readLeaders()]);
  const tentacle = !tentacles.some((o) => !o.parent);
  return {
    needed: missing.length > 0 || tentacle,
    missing: missing.map((file) => `${path.basename(at().OPTIONS_DIR)}/${path.basename(file)}`),
    fields: { tentacle, leader: leaders.length === 0, dateFormat: missing.includes(at().OPTIONS_FILE) },
    dateFormats: SETUP_DATE_FORMATS,
  };
}

const badSetup = (error, code = 400) => ({ code, body: { error } });

// Creates whatever setupState says is missing, and never replaces an existing file. Each
// file is only created once the ones before it are done, so a failed attempt can be retried.
async function saveSetup(body) {
  const state = await setupState();
  if (!state.needed) return badSetup('Setup is already complete.', 409);
  const { fields, missing } = state;
  const tentacleName = cleanName(body.tentacleName || '');
  const tentacleId = (body.tentacleId || '').trim();
  const leaderName = cleanName(body.leaderName || '');
  if (fields.tentacle) {
    const error = tentacleError(tentacleName, tentacleId);
    if (error) return badSetup(error);
    if ((await readTentacles()).some((o) => o.id.toLowerCase() === tentacleId.toLowerCase())) {
      return badSetup(`A tentacle with the ID "${tentacleId}" already exists.`, 409);
    }
  }
  if (fields.leader && !leaderTag(leaderName)) return badSetup('Enter your name.');
  if (fields.dateFormat && !SETUP_DATE_FORMATS.includes(body.dateFormat)) return badSetup('Choose a date format.');

  await disk.mkdir(at().OPTIONS_DIR, { recursive: true });
  const isMissing = (file) => missing.includes(`${path.basename(at().OPTIONS_DIR)}/${path.basename(file)}`);
  if (isMissing(at().OPTIONS_FILE)) {
    const text = newOptionsCsv({ dateFormat: body.dateFormat, roundup: DEFAULT_ROUNDUP_DAYS, projects: FALLBACK_PROJECT_DIRS, taskLists: FALLBACK_TASK_LISTS });
    await disk.writeFile(at().OPTIONS_FILE, text, 'utf8');
    await disk.mkdir(path.resolve(currentRoot(), FALLBACK_PROJECT_DIRS), { recursive: true });
  }
  if (isMissing(at().COLOURS_FILE)) await disk.copyFile(DEFAULT_COLOURS_FILE, at().COLOURS_FILE);
  if (fields.leader) {
    const result = await saveLeaderRow({ action: 'add', name: leaderName });
    if (result.code !== 200) return result;
  }
  if (isMissing(at().STATUS_FILE)) {
    const [first] = await readLeaders();
    await disk.writeFile(at().STATUS_FILE, newStatusCsv(first ? first.name : ''), 'utf8');
  }
  if (fields.tentacle) {
    try {
      await writeTentacleFile(path.join(at().TENTACLE_DIR, tentacleId), tentacleName);
    } catch (err) {
      if (err.code !== 'EEXIST') throw err; // an existing file is simply kept
    }
    const existing = await readIfExists(at().TENTACLES_FILE);
    const text = appendTentacleCsv(existing && existing.trim() ? existing : 'id,Name,Parent\r\n', { id: tentacleId, name: tentacleName, parent: '' });
    if (existing === null) await disk.writeFile(at().TENTACLES_FILE, text, 'utf8');
    else await writeFileSafely(at().TENTACLES_FILE, text);
  } else if (isMissing(at().TENTACLES_FILE)) {
    await disk.writeFile(at().TENTACLES_FILE, 'id,Name,Parent\r\n', 'utf8');
  }
  return { code: 200, body: { ok: true } };
}

module.exports = {
  readEntityTable,
  saveEntityRow,
  readStatusTable,
  readLeaderTable,
  readColourTable,
  saveStatusRow,
  saveLeaderRow,
  saveColourRow,
  saveOptions,
  setupState,
  saveSetup,
};
