// Safe writes, and the table of renamed files and folders.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileSafely, cleanDependencies } = require('../lib/store');
const { waitingRenames } = require('../lib/renames');
const { dataPaths } = require('../lib/context');

test('writeFileSafely tries the rename again while the file is busy', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octapu-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'note.txt');
  fs.writeFileSync(file, 'before');
  const rename = fs.promises.rename;
  let failures = 2;
  t.after(() => (fs.promises.rename = rename));
  fs.promises.rename = (...args) => {
    if (failures-- > 0) return Promise.reject(Object.assign(new Error('busy'), { code: 'EPERM' }));
    return rename(...args);
  };
  await writeFileSafely(file, 'after');
  assert.equal(fs.readFileSync(file, 'utf8'), 'after');
  assert.equal(failures, -1, 'it took a third attempt');
  assert.deepEqual(fs.readdirSync(dir), ['note.txt'], 'no temp file is left behind');
});

test('writeFileSafely gives up on other errors and removes its temp file', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'octapu-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'note.txt');
  fs.writeFileSync(file, 'before');
  const rename = fs.promises.rename;
  t.after(() => (fs.promises.rename = rename));
  fs.promises.rename = () => Promise.reject(Object.assign(new Error('gone'), { code: 'ENOENT' }));
  await assert.rejects(writeFileSafely(file, 'after'), /gone/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'before');
  assert.deepEqual(fs.readdirSync(dir), ['note.txt']);
});

test('old names are never read, only listed while waiting to be renamed', () => {
  const root = path.resolve('/x');
  const paths = dataPaths(root);
  assert.equal(path.basename(paths.OPTIONS_DIR), '_Options');
  assert.equal(path.basename(paths.TENTACLE_DIR), '_Tentacles');
  const has = (...names) => (full) => names.includes(path.relative(root, full).split(path.sep).join('/'));
  const keys = (exists) => waitingRenames(root, paths, exists).map((rule) => rule.key);
  assert.deepEqual(keys(has('_Labels')), ['options']);
  assert.deepEqual(keys(has('_Labels', '_Options')), [], 'both there is an error for Core files, not a rename');
  assert.deepEqual(keys(has('_Networking/Leads.md', '_Options/Owners.csv')), ['contacts', 'tentacles-file']);
  assert.deepEqual(keys(has()), []);
});

test('cleanDependencies checks each choice and tidies its milestones', () => {
  const choices = [
    { id: 'MUSART First album', name: 'MUSART First album', milestones: ['Write', 'Record', 'Mix'] },
    { id: 'LABEL Old Logo', name: 'LABEL Old Logo (archived)', milestones: [] },
  ];
  assert.deepEqual(cleanDependencies([{ name: 'MUSART First album', milestones: ['mix', 'Nope'] }, { name: 'LABEL Old Logo', milestones: null }], choices), {
    list: [{ name: 'MUSART First album', milestones: ['Mix'] }, { name: 'LABEL Old Logo', milestones: null }],
  });
  // Every milestone ticked is the whole project.
  assert.deepEqual(cleanDependencies([{ name: 'MUSART First album', milestones: ['Write', 'Record', 'Mix'] }], choices), { list: [{ name: 'MUSART First album', milestones: null }] });
  assert.ok(cleanDependencies([{ name: 'Elsewhere', milestones: null }], choices).error);
  assert.ok(cleanDependencies([{ name: 'LABEL Old Logo', milestones: null }, { name: 'LABEL Old Logo', milestones: null }], choices).error);
});
