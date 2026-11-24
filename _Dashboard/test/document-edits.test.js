// Section review lines, blocks, entries, subtasks and the Task Archive.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const edits = require('../document-edits');
const { stripComments } = require('../todos');

const STATUSES = [
  { name: 'TODO', type: 'UNASSIGNED' },
  { name: 'DONE', type: 'DONE' },
  { name: 'ARCHIVED', type: 'ARCHIVED' },
];

test('sectionMeta reads the review lines straight under a heading', () => {
  const visible = stripComments('## Notes\n**Date Reviewed**: 2026-11-01\n**Flagged for Review**: Yes\ntext');
  assert.deepEqual(edits.sectionMeta(visible, 0), { reviewed: '2026-11-01', flagged: true, reviewedLine: 2, flagLine: 3, end: 3 });
});

test('flagging and reviewing a section', () => {
  const md = '# T\n\n## Notes\ntext';
  const flagged = edits.setSectionFlag(md, 3, 'Notes', true);
  assert.equal(flagged, '# T\n\n## Notes\n**Date Reviewed**:\n**Flagged for Review**: Yes\ntext');
  assert.deepEqual(edits.flaggedSections(flagged), [{ line: 3, title: 'Notes', level: 2 }]);
  assert.equal(edits.markSectionReviewed(flagged, 3, 'Notes', '2026-11-24'), '# T\n\n## Notes\n**Date Reviewed**: 2026-11-24\ntext');
  assert.equal(edits.setSectionFlag(md, 3, 'Renamed', true), null);
});

test('a block body starts after its review lines, and editing it keeps them', () => {
  const md = '# T\n\n## Notes\n**Date Reviewed**: 2026-11-01\n\nold text\n';
  const block = edits.parseBlocks(md).find((b) => b.title === 'Notes');
  assert.equal(block.body, 'old text');
  assert.equal(block.reviewed, '2026-11-01');
  assert.equal(edits.setBlockBody(md, 3, 'old text', 'new text'), '# T\n\n## Notes\n**Date Reviewed**: 2026-11-01\n\nnew text\n');
});

test('an entry body skips its review lines', () => {
  const md = '# Contacts\n\n## People\n### Sam\n**Flagged for Review**: Yes\n\nGood drummer\n';
  const entry = edits.parseEntries(md, 3)[0].entries[0];
  assert.equal(entry.flagged, true);
  assert.equal(entry.body, 'Good drummer');
});

const MILESTONES = ['# T', '', '## Milestones', '### One', '- [ ] TODO first', '  - [ ] TODO child', '- [ ] TODO second', ''].join('\n');

test('indentRow moves a row and its children in and out', () => {
  const inward = edits.indentRow(MILESTONES, 7, 'second', 'in', STATUSES);
  assert.equal(inward.split('\n')[6], '  - [ ] TODO second');
  assert.equal(edits.indentRow(inward, 7, 'second', 'out', STATUSES), MILESTONES);
  assert.deepEqual(edits.indentRow(MILESTONES, 5, 'first', 'in', STATUSES), { refused: "There's no task above it at the same level to go under." });
  assert.equal(edits.indentRow(MILESTONES, 5, 'changed', 'in', STATUSES), null);
});

test('reorderRow moves a row with its children', () => {
  const out = edits.reorderRow(MILESTONES, 5, 'first', 7, 'second', true, STATUSES);
  assert.deepEqual(out.split('\n').slice(4, 7), ['- [ ] TODO second', '- [ ] TODO first', '  - [ ] TODO child']);
  assert.ok(edits.reorderRow(MILESTONES, 5, 'first', 6, 'child', false, STATUSES).refused);
});

test('addMilestoneItem nests at the requested depth', () => {
  const out = edits.addMilestoneItem(MILESTONES, 4, 'One', 'new', 1);
  assert.equal(out.split('\n')[7], '  - [ ] new');
  assert.equal(edits.addMilestoneItem(MILESTONES, 4, 'One', 'top').split('\n')[7], '- [ ] top');
});

test('takeArchivedRows leaves a marker that counts the tasks taken', () => {
  const md = ['# T', '', '## Milestones', '### One', '- [x] ARCHIVED old', '  CLOSED: [2026-11-01 Sun 10:00]', '- [ ] TODO keep', ''].join('\n');
  const { markdown, rows } = edits.takeArchivedRows(md, STATUSES);
  assert.deepEqual(rows, [{ block: '### One', lines: ['- [x] ARCHIVED old', '  CLOSED: [2026-11-01 Sun 10:00]'] }]);
  assert.equal(markdown, ['# T', '', '## Milestones', '### One', '- [ ] TODO keep', '<!-- 1 task in the Task Archive -->', ''].join('\n'));
  // A second review adds to the same marker.
  const again = edits.takeArchivedRows(markdown.replace('TODO keep', 'ARCHIVED keep').replace('[ ]', '[x]'), STATUSES);
  assert.match(again.markdown, /<!-- 2 tasks in the Task Archive -->/);
});

test('addTaskArchive puts the newest review first', () => {
  const groups = [{ heading: 'LABEL', files: [], projects: [{ title: 'Album', files: [{ file: 'Album.md', rows: [{ block: '### One', lines: ['- [x] ARCHIVED old'] }] }] }] }];
  const first = edits.addTaskArchive(null, '2026-11-01', groups);
  assert.match(first, /^# Task Archive\n\n## Date archived: 2026-11-01/);
  const second = edits.addTaskArchive(first, '2026-11-24', groups);
  assert.ok(second.indexOf('2026-11-24') < second.indexOf('2026-11-01'));
});
