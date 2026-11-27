// Files and folders the dashboard relies on that have been renamed, in one table. Only the new
// names are read: Compatibility's Core files page lists any old name still there and renames it.
'use strict';

const path = require('path');

// `where` is the folder holding it: the entity's own folder, or its _Networking or _Options folder.
// `title` is the old and new word for a file's `# ` title, swapped when it's renamed.
const RENAMED = [
  {
    key: 'options',
    folder: true,
    where: 'root',
    from: '_Labels',
    to: '_Options',
    href: 'options.html',
    why: 'it holds the settings shown on the Options page',
  },
  {
    key: 'tentacles',
    folder: true,
    where: 'root',
    from: '_Entities',
    to: '_Tentacles',
    href: null,
    why: 'the organisations inside an entity are now called tentacles',
  },
  {
    key: 'contacts',
    folder: false,
    where: 'networking',
    from: 'Leads.md',
    to: 'Contacts.md',
    href: 'networking.html?page=contacts',
    why: 'the Leads page is now called Contacts',
    title: ['Leads', 'Contacts'],
  },
  {
    key: 'tentacles-file',
    folder: false,
    where: 'options',
    from: 'Owners.csv',
    to: 'Tentacles.csv',
    href: null,
    why: 'the organisations inside an entity are now called tentacles',
  },
];

// Colours.csv names that described a hue rather than a use, so stopped making sense once the
// colour was changed. Rows with the old names are ignored until Core files renames them.
const RENAMED_COLOURS = [
  ['green', 'complete'],
  ['yellow', 'caution'],
  ['orange', 'pending'],
  ['pink', 'alert'],
  ['purple', 'tentacle'],
  ['cyan', 'project'],
];

const renamed = (key) => RENAMED.find((rule) => rule.key === key);

// The folder holding a rule's file or folder, from an entity's folder and its dataPaths.
function renameDir(rule, root, paths) {
  return rule.where === 'networking' ? paths.NETWORKING_DIR : rule.where === 'options' ? paths.OPTIONS_DIR : root;
}

// The renames still to do in an entity: the old name is there and the new one isn't. Start-up
// and first-time setup leave those alone, so the new name isn't made beside the old one.
function waitingRenames(root, paths, exists) {
  return RENAMED.filter((rule) => {
    const dir = renameDir(rule, root, paths);
    return exists(path.join(dir, rule.from)) && !exists(path.join(dir, rule.to));
  });
}

module.exports = { RENAMED, RENAMED_COLOURS, renamed, renameDir, waitingRenames };
