// Statuses, scopes, priorities, timeframes and headers. Run with: node --test _Dashboard/test
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const todos = require('../todos');

const STATUSES = [
  { name: 'TODO', type: 'UNASSIGNED' },
  { name: 'DOING', type: 'ASSIGNED' },
  { name: 'WAIT', type: 'WAITING' },
  { name: 'DONE', type: 'DONE' },
  { name: 'ARCHIVED', type: 'ARCHIVED' },
];

const PROJECT = [
  '# LABEL Album',
  '**Date Reviewed**: 2026-11-01',
  '',
  '## Notes',
  '- [ ] TODO a stray status in notes',
  '- [ ] a plain checkbox',
  '',
  '## Milestones',
  '### Write',
  '- [ ] TODO a real task',
  '- [ ] an untagged task',
  '',
  '## Shopping',
  '- [ ] DONE listed task',
].join('\n');

test('taskBlockLines covers milestones and named task lists only', () => {
  assert.deepEqual([...todos.taskBlockLines(PROJECT, [])].sort((a, b) => a - b), [10, 11]);
  assert.deepEqual([...todos.taskBlockLines(PROJECT, ['shopping'])].sort((a, b) => a - b), [10, 11, 14]);
});

test('scanLines without a scope sees every status', () => {
  const items = todos.scanLines(PROJECT, todos.createMatcher(STATUSES));
  assert.equal(items.find((i) => i.line === 5).status, 'TODO');
  assert.equal(items.find((i) => i.line === 6).status, null);
});

test('scanLines with a scope reads a stray status as a plain checkbox', () => {
  const scope = { allowed: (md) => todos.taskBlockLines(md, []) };
  const items = todos.scanLines(PROJECT, todos.createMatcher(STATUSES, scope));
  const stray = items.find((i) => i.line === 5);
  assert.equal(stray.status, null);
  assert.equal(stray.mark, ' ');
  assert.equal(items.find((i) => i.line === 10).status, 'TODO');
});

test('scanLines with a strict scope skips everything outside it', () => {
  const scope = { allowed: (md) => todos.taskBlockLines(md, []), strict: true };
  const lines = todos.scanLines(PROJECT, todos.createMatcher(STATUSES, scope)).map((i) => i.line);
  assert.deepEqual(lines, [10, 11]);
});

test('the page title is never a todo', () => {
  const items = todos.scanLines('# TODO title\n- [ ] TODO real', todos.createMatcher(STATUSES));
  assert.deepEqual(items.map((i) => i.line), [2]);
});

test('setPriority adds, changes, makes recurring and removes a token', () => {
  const md = '- [ ] TODO pay rent';
  const a = todos.setPriority(md, 1, 'TODO', 'A', STATUSES);
  assert.equal(a, '- [ ] TODO [#A] pay rent');
  const r = todos.setPriority(a, 1, 'TODO', 'R|5D', STATUSES);
  assert.equal(r, '- [ ] TODO [#R|5D] pay rent');
  const item = todos.scanLines(r, todos.createMatcher(STATUSES))[0];
  assert.equal(item.priority, 'R');
  assert.deepEqual(item.recur, { count: 5, unit: 'D' });
  assert.equal(item.text, 'pay rent');
  assert.equal(todos.setPriority(r, 1, 'TODO', null, STATUSES), md);
  assert.equal(todos.setPriority(md, 1, 'DONE', 'A', STATUSES), null, 'a changed status is refused');
});

test('addPeriod clamps to the end of the month', () => {
  assert.equal(todos.addPeriod('2026-01-31', 1, 'M'), '2026-02-28');
  assert.equal(todos.addPeriod('2024-02-29', 1, 'Y'), '2025-02-28');
  assert.equal(todos.addPeriod('2026-12-30', 2, 'W'), '2027-01-13');
  assert.equal(todos.addPeriod('2026-11-24', 10, 'D'), '2026-12-04');
});

test('moveToStatus inserts a keyword on an untagged row and stamps CLOSED', () => {
  const md = '## Milestones\n### One\n- [ ] untagged';
  const out = todos.moveToStatus(md, 3, null, 'DONE', STATUSES, new Date(2026, 10, 24, 9, 5));
  assert.equal(out, '## Milestones\n### One\n- [x] DONE untagged\n  CLOSED: [2026-11-24 Tue 09:05]');
  assert.equal(todos.moveToStatus(md, 3, 'TODO', 'DONE', STATUSES, new Date()), null);
});

test('toggleCheckbox outside a task list only flips the box', () => {
  const allowed = todos.taskBlockLines(PROJECT, []);
  const ticked = todos.toggleCheckbox(PROJECT, 6, 'a plain checkbox', true, STATUSES, allowed, new Date());
  assert.equal(ticked.split('\n')[5], '- [x] a plain checkbox');
  assert.equal(todos.toggleCheckbox(ticked, 6, 'a plain checkbox', false, STATUSES, allowed, new Date()), PROJECT);
  // A stray status is shown as plain text, so that's the text the page sends.
  const stray = todos.toggleCheckbox(PROJECT, 5, 'TODO a stray status in notes', true, STATUSES, allowed, new Date());
  assert.equal(stray.split('\n')[4], '- [x] TODO a stray status in notes');
  assert.equal(todos.toggleCheckbox(PROJECT, 6, 'changed', true, STATUSES, allowed, new Date()), null);
});

test('toggleCheckbox in a task list gives the row the DONE status', () => {
  const allowed = todos.taskBlockLines(PROJECT, []);
  const out = todos.toggleCheckbox(PROJECT, 11, 'an untagged task', true, STATUSES, allowed, new Date(2026, 10, 24, 9, 5));
  assert.deepEqual(out.split('\n').slice(10, 12), ['- [x] DONE an untagged task', '  CLOSED: [2026-11-24 Tue 09:05]']);
  // A row that has a status there goes through api/status instead.
  assert.equal(todos.toggleCheckbox(PROJECT, 10, 'a real task', true, STATUSES, allowed, new Date()), null);
});

test('a task marked done finishes its open subtasks, but not cancelled or finished ones', () => {
  const md = [
    '## Tasks',
    '- [/] DOING parent',
    '  - [ ] TODO child',
    '    - [ ] untagged grandchild',
    '  - [ ] ~~TODO cancelled child~~',
    '  - [x] DONE already done',
    '    CLOSED: [2026-11-01 Sun 10:00]',
    '  - [-] WAIT waiting child',
    '- [ ] TODO sibling',
  ].join('\n');
  const out = todos.moveToStatus(md, 2, 'DOING', 'DONE', STATUSES, new Date(2026, 10, 24, 9, 5));
  const stamp = 'CLOSED: [2026-11-24 Tue 09:05]';
  assert.deepEqual(out.split('\n'), [
    '## Tasks',
    '- [x] DONE parent',
    '  ' + stamp,
    '  - [x] DONE child',
    '    ' + stamp,
    '    - [x] DONE untagged grandchild',
    '      ' + stamp,
    '  - [ ] ~~TODO cancelled child~~',
    '  - [x] DONE already done',
    '    CLOSED: [2026-11-01 Sun 10:00]',
    '  - [x] DONE waiting child',
    '    ' + stamp,
    '- [ ] TODO sibling',
  ]);
  // Moving to a status that isn't done leaves the subtasks alone.
  assert.equal(todos.moveToStatus(md, 2, 'DOING', 'WAIT', STATUSES, new Date()).split('\n')[2], '  - [ ] TODO child');
});

test('timeframes split on commas outside brackets and keep milestone names', () => {
  const value = '2026-01-01 to 2026-03-31 (Write, again; Record), 2026-05-01 to 2026-06-30';
  assert.deepEqual(todos.timeframeEntries(value), ['2026-01-01 to 2026-03-31 (Write, again; Record)', '2026-05-01 to 2026-06-30']);
  assert.deepEqual(todos.splitTimeframe('2026-01-01 to 2026-03-31 (Write; Record)'), { dates: '2026-01-01 to 2026-03-31', milestones: ['Write', 'Record'] });
  assert.deepEqual(todos.splitTimeframe('2026-01-01 to 2026-03-31'), { dates: '2026-01-01 to 2026-03-31', milestones: null });
  assert.equal(todos.timeframeText('2026-01-01 to 2026-03-31', ['A', 'B']), '2026-01-01 to 2026-03-31 (A; B)');
  const { ranges, invalid } = todos.parseTimeframes(value + ', rubbish', 'YYYY-MM-DD');
  assert.equal(ranges.length, 2);
  assert.deepEqual(ranges[0].milestones, ['Write, again', 'Record']);
  assert.deepEqual(invalid, ['rubbish']);
});

test('parseHeader ignores review lines that belong to a section', () => {
  const md = '# LABEL Album\n**Date Reviewed**: 2026-11-01\n\n## Notes\n**Date Reviewed**: 2026-01-01\n**Flagged for Review**: Yes\n';
  const header = todos.parseHeader(md, [{ id: 'LABEL' }]);
  assert.equal(header.title.tentacle, 'LABEL');
  assert.equal(header.title.rest, 'Album');
  assert.equal(header.dates.reviewed.value, '2026-11-01');
  assert.equal(header.flagged, false);
});

test('editEntityCsv adds, refuses duplicates and keeps the last row', () => {
  const csv = 'Name,Directory\r\nRecord Label,Label\r\n';
  const ok = () => null;
  assert.equal(todos.editEntityCsv(csv, { action: 'add', name: 'Freelance', dir: 'Freelance' }, ok).text, 'Name,Directory\r\nRecord Label,Label\r\nFreelance,Freelance\r\n');
  assert.match(todos.editEntityCsv(csv, { action: 'add', name: 'Again', dir: 'label' }, ok).error, /already uses/);
  assert.match(todos.editEntityCsv(csv, { action: 'delete', from: 'Label' }, ok).error, /at least one/);
});
