// Colours: the stylesheet made from a colours file, the shipped themes and renaming old names.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { themeStylesheet, renameColourRows, parseColours } = require('../todos');

const DEFAULTS = path.join(__dirname, '..', 'defaults');
const defaults = parseColours(fs.readFileSync(path.join(DEFAULTS, 'Colours.csv'), 'utf8'));

test('old hue names are ignored, and the background picks light or dark controls', () => {
  const dark = themeStylesheet([{ name: 'bg', colour: '#0b0b0b' }, { name: 'green', colour: '#00ff6a' }, { name: 'complete', colour: '#00FF6A' }]);
  assert.equal(dark, ':root {\n  color-scheme: dark;\n  --bg: #0b0b0b;\n  --complete: #00ff6a;\n}\n');
  assert.match(themeStylesheet([{ name: 'bg', colour: '#f5f3fa' }]), /color-scheme: light;/);
  assert.doesNotMatch(themeStylesheet([{ name: 'text', colour: '#ffffff' }]), /color-scheme/);
});

test('SQUARE sets every corner size to 0', () => {
  const css = themeStylesheet([], { square: true });
  for (const name of ['radius', 'radius-sm', 'radius-xs', 'radius-hair', 'radius-pill']) assert.match(css, new RegExp(`--${name}: 0;`));
  assert.doesNotMatch(themeStylesheet([]), /radius/);
});

test('each shipped theme has every colour the defaults have, with a usable value', () => {
  for (const file of fs.readdirSync(path.join(DEFAULTS, 'themes'))) {
    const rows = parseColours(fs.readFileSync(path.join(DEFAULTS, 'themes', file), 'utf8'));
    assert.deepEqual(rows.map((r) => r.name), defaults.map((d) => d.name), file);
    const css = themeStylesheet(rows);
    for (const d of defaults) assert.match(css, new RegExp(`--${d.name}: #[0-9a-f]{6};`), `${file} ${d.name}`);
  }
});

test('renameColourRows renames old rows, keeps newer ones and adds on-highlight', () => {
  const csv = 'Name,Colour,Used for\r\nborder,#2a2a2a,Borders\r\ngreen,#00ff6a,old\r\npink,#ff0000,old\r\nalert,#ff3d7f,mine\r\n';
  const { text } = renameColourRows(csv, defaults);
  const rows = parseColours(text);
  assert.deepEqual(rows.map((r) => [r.name, r.colour]), [
    ['border', '#2a2a2a'],
    ['on-highlight', '#2a2a2a'],
    ['complete', '#00ff6a'],
    ['alert', '#ff3d7f'],
  ]);
  assert.equal(rows[2].usedFor, defaults.find((d) => d.name === 'complete').usedFor);
  // Nothing left to rename leaves the file as it was.
  assert.equal(renameColourRows(text, defaults).text, text);
});
