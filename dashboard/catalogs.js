// Catalogs: one CSV per catalog in the Catalogs folder, named TAG_Name.csv, such as
// "RLS_Record_Label_Studios.csv". Pure text functions only; the server does the file work.
'use strict';

const { parseCsv, csvField, cleanName } = require('./todos');

// The columns a new catalog starts with. A catalog keeps whatever columns its file has, so
// columns added by hand are shown and edited too.
const CATALOG_COLUMNS = ['Catalog #', 'Image', 'Owner', 'Title', 'Medium', 'Release date'];
const NUMBER_COLUMN = 0; // the first column holds each row's catalog number
const FILE_PATTERN = /^([A-Z]{2,3})_(.+)\.csv$/;
const NAME_PATTERN = /^[^\\/:*?"<>|_]+$/; // safe in a file name, and no underscores, which stand for spaces

const csvLine = (values) => values.map((v) => csvField(String(v))).join(',');

// A column holds dates when its heading says so, such as "Release date".
const isDateColumn = (heading) => /\bdate\b/i.test(heading);

// "RLS" and "Record Label Studios" -> "RLS_Record_Label_Studios.csv"
const catalogFileName = (tag, name) => `${tag}_${cleanName(name).replace(/ /g, '_')}.csv`;

// The tag and name a catalog's file name holds, or null if it isn't one.
function parseCatalogFileName(file) {
  const m = file.match(FILE_PATTERN);
  return m ? { file, tag: m[1], name: m[2].replace(/_/g, ' ') } : null;
}

// An error message for a new catalog's tag and name, or null if they can be used.
function catalogError(tag, name) {
  if (!/^[A-Z]{2,3}$/.test(tag)) return 'The tag needs 2 or 3 capital letters, such as RLS.';
  const clean = cleanName(name);
  if (!clean) return 'Enter a name.';
  if (clean.length > 80) return 'Keep the name to 80 characters or fewer.';
  if (!NAME_PATTERN.test(clean)) return 'The name can\'t contain any of \\ / : * ? " < > | or _.';
  return null;
}

// The opening line of a new catalog file.
const newCatalogCsv = () => csvLine(CATALOG_COLUMNS) + '\r\n';

// The headings and rows of a catalog file. Blank lines are skipped, and every row is padded
// or trimmed to the number of headings.
function parseCatalog(text) {
  const all = parseCsv(text).filter((row) => row.some((v) => v.trim() !== ''));
  const columns = all.length ? all[0].map((h) => h.trim()) : CATALOG_COLUMNS.slice();
  const rows = all.slice(1).map((row) => columns.map((_, i) => row[i] || ''));
  return { columns, rows };
}

// The next catalog number: the tag and one more than the highest number used so far, in at
// least three digits, so RLS001 is followed by RLS002.
function nextCatalogNumber(tag, rows) {
  const used = rows.map((row) => row[NUMBER_COLUMN].match(new RegExp(`^${tag}(\\d+)$`, 'i'))).filter(Boolean).map((m) => Number(m[1]));
  return tag + String((used.length ? Math.max(...used) : 0) + 1).padStart(3, '0');
}

// Writes the headings and rows back, with the file's own line endings.
function catalogText(original, columns, rows) {
  const eol = (original.match(/\r\n?|\n/) || ['\r\n'])[0];
  return [columns, ...rows].map(csvLine).join(eol) + eol;
}

// Adds, changes or deletes a row. Returns { text } or { error }.
//   add:    `values`, one per column. A blank catalog number gets the next one.
//   update: the row at `index`, whose catalog number is still `number`, has `column` set to `to`.
//   delete: the row at `index`, whose catalog number is still `number`.
function editCatalogCsv(text, tag, body) {
  const { columns, rows } = parseCatalog(text);
  if (body.action === 'add') {
    const row = columns.map((_, i) => String((body.values || [])[i] || '').trim());
    if (row.every((v) => !v)) return { error: 'Fill in at least one field.' };
    if (!row[NUMBER_COLUMN]) row[NUMBER_COLUMN] = nextCatalogNumber(tag, rows);
    if (rows.some((r) => r[NUMBER_COLUMN].toLowerCase() === row[NUMBER_COLUMN].toLowerCase())) return { error: `${row[NUMBER_COLUMN]} is already in this catalog.` };
    return { text: catalogText(text, columns, [...rows, row]) };
  }
  const row = rows[body.index];
  if (!row || row[NUMBER_COLUMN] !== body.number) return { error: 'That row has changed in the file, so nothing was updated.', code: 409 };
  if (body.action === 'delete') return { text: catalogText(text, columns, rows.filter((_, i) => i !== body.index)) };
  const at = columns.indexOf(body.column);
  if (at === -1) return { error: 'Invalid request' };
  const to = String(body.to).trim();
  if (at === NUMBER_COLUMN) {
    if (!to) return { error: 'A row needs a catalog number.' };
    if (rows.some((r, i) => i !== body.index && r[NUMBER_COLUMN].toLowerCase() === to.toLowerCase())) return { error: `${to} is already in this catalog.` };
  }
  row[at] = to;
  return { text: catalogText(text, columns, rows) };
}

module.exports = {
  CATALOG_COLUMNS,
  isDateColumn,
  catalogFileName,
  parseCatalogFileName,
  catalogError,
  newCatalogCsv,
  parseCatalog,
  nextCatalogNumber,
  editCatalogCsv,
};
