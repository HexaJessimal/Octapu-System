// Files and folders the dashboard relies on that have been renamed, in one table. Until
// Compatibility's Core files page renames one, its old name is still used while it's the only
// one there, so nothing goes missing in the meantime.
'use strict';

const path = require('path');

// `where` is the folder holding it: the entity's own folder, or its _Networking folder.
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
];

const renamed = (key) => RENAMED.find((rule) => rule.key === key);

// The name in use in `dir`: the new one, or the old one while only that exists. `exists`
// checks a path, so a request can remember what it has already checked.
function currentName(dir, key, exists) {
  const rule = renamed(key);
  return !exists(path.join(dir, rule.to)) && exists(path.join(dir, rule.from)) ? rule.from : rule.to;
}

module.exports = { RENAMED, renamed, currentName };
