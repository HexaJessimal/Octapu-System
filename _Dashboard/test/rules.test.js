// The rules shared by the server and the pages (public/js/rules.js).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../public/js/rules');

test('the priority patterns read letters and recurring periods', () => {
  assert.deepEqual('TODO [#R|10M] x'.slice(5).match(rules.PRIORITY_TOKEN).slice(2), ['R|10M', '10', 'M']);
  assert.equal(new RegExp('^' + rules.PRIORITY + '$').test('[#R|11D]'), false);
  assert.deepEqual([...'a [#A] b [#R|2W]'.matchAll(rules.anyPriority())].map((m) => m[1]), ['A', 'R']);
  assert.ok(rules.RECUR_VALUE.test('R|5D'));
  assert.equal(rules.RECUR_VALUE.test('R|0D'), false);
});

test('cancelled rows and checkbox rows', () => {
  assert.equal(rules.isCancelled(' ~~gone~~ '), true);
  assert.equal(rules.isCancelled('~~~~'), false);
  assert.equal(rules.isCancelled('~~half~~ not'), false);
  assert.ok(rules.CHECKBOX_ROW.test('  1. [/] doing'));
  assert.equal(rules.CHECKBOX_ROW.test('[ ] not a list item'), false);
});

test('archive markers read back the count they were written with', () => {
  assert.equal(rules.archiveMarker(1), '<!-- 1 task in the Task Archive -->');
  assert.equal(rules.archiveMarker(3).match(rules.ARCHIVE_MARKER)[1], '3');
});

test('parseMilestones counts done, cancelled, archived and moved tasks', () => {
  const md = [
    '# T',
    '## Milestones',
    '### One',
    '**Date Reviewed**: 2026-11-01',
    '**Flagged for Review**: Yes',
    '- [x] DONE first',
    '- [ ] ~~dropped~~',
    '- [x] ARCHIVED old',
    '  - [ ] hidden under the archived row',
    '<!-- 2 tasks in the Task Archive -->',
    '- [ ] open',
    '### Two',
    '## Notes',
    '- [ ] not a milestone task',
  ].join('\r\n');
  const { found, milestones } = rules.parseMilestones(md, ['ARCHIVED']);
  assert.equal(found, true);
  const [one, two] = milestones;
  assert.deepEqual(
    { title: one.title, headingLine: one.headingLine, firstLine: one.firstLine, total: one.total, done: one.done, cancelled: one.cancelled, reviewed: one.reviewed, flagged: one.flagged, state: one.state },
    { title: 'One', headingLine: 3, firstLine: 6, total: 5, done: 4, cancelled: 1, reviewed: '2026-11-01', flagged: true, state: 'partial' }
  );
  assert.equal(two.state, 'none');
});
