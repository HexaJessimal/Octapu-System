// Safe writes, and the table of renamed files and folders.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeFileSafely } = require('../lib/store');
const { currentName } = require('../lib/renames');

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

test('an old name is used only while it is the only one there', () => {
  const has = (...names) => (full) => names.includes(path.basename(full));
  assert.equal(currentName('/x', 'options', has('_Labels')), '_Labels');
  assert.equal(currentName('/x', 'options', has('_Labels', '_Options')), '_Options');
  assert.equal(currentName('/x', 'contacts', has()), 'Contacts.md');
  assert.equal(currentName('/x', 'contacts', has('Leads.md')), 'Leads.md');
});
