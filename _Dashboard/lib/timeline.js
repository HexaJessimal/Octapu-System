// The Timeline: project rows, events and catalog releases.
'use strict';

const path = require('path');
const { parseHeader, STORAGE_FORMAT, parseTimeframes, tentacleChain } = require('../todos');
const { parseEntries, parseEventDate } = require('../document-edits');
const { parseCatalog } = require('../catalogs');
const { at, readIfExists } = require('./context');
const {
  ARCHIVE_PREFIX, NETWORKING, eventValue, eventProgress, isNetworkingField, isArchived,
  listProjects, primaryFile, readProjectFile, readArchive, resolveDependency, readTentacles,
  readArchiveMode, readShowArchived, projectTentacleId, listCatalogs, readCatalogFile,
  tentacleTree,
} = require('./store');

// The tentacle ID an _Archive.md entry's title starts with.
const archiveTentacleId = (title) => title.trim().split(/\s+/)[0];

// Every project's Active Timeframe entries, each row marked active, inactive or archive, and
// with `chain`, the IDs from its top-level tentacle down to its own (or null if its tentacle
// isn't in Tentacles.csv), for grouping the Dashboard's Timeline by any level.
// Archived projects are only included while SHOWARCHIVED is on. They come from _Archive.md
// in HEADERS mode, where the folders may already have gone, and from the archived folders
// themselves in FULL mode.
async function collectTimeline() {
  const rows = [];
  const projects = await listProjects('milestone');
  const fullArchive = (await readArchiveMode()) === 'FULL';
  const showArchived = await readShowArchived();
  const archive = fullArchive ? [] : await readArchive();
  const tentacles = await readTentacles();
  for (const project of projects) {
    const archived = isArchived(project);
    if (archived && !(fullArchive && showArchived)) continue;
    const file = primaryFile(project);
    const content = await readProjectFile(project, file);
    const header = parseHeader(content, []);
    const parsed = parseTimeframes(header.timeframe.value, STORAGE_FORMAT);
    const dependency = resolveDependency(header.dependency.value, projects, archive);
    const kind = archived ? 'archive' : project.name.startsWith('+') ? 'active' : 'inactive';
    const chain = tentacleChain(tentacles, await projectTentacleId(project, tentacles));
    rows.push(Object.assign({ folder: project.folder, file, content, dependency, kind, chain }, parsed));
  }
  if (!fullArchive && showArchived) {
    for (const { title, fields } of archive) {
      const dependency = resolveDependency(fields.dependency.value, projects, archive);
      const chain = tentacleChain(tentacles, archiveTentacleId(title));
      rows.push(Object.assign({ folder: ARCHIVE_PREFIX + title, file: path.basename(at().ARCHIVE_FILE), content: '', dependency, kind: 'archive', archive: { title }, chain }, parseTimeframes(fields.timeframe.value, STORAGE_FORMAT)));
    }
  }
  return rows;
}

// The Timeline rows for one tentacle's page: the projects whose tentacle ID is that tentacle's,
// and archive entries whose title starts with it. Those under it aren't included.
async function tentacleTimeline(id) {
  const tentacles = await readTentacles();
  const projects = await listProjects('milestone');
  const owned = new Set();
  for (const project of projects) if ((await projectTentacleId(project, tentacles)) === id) owned.add(project.folder);
  return (await collectTimeline()).filter((row) => (row.archive ? archiveTentacleId(row.archive.title) === id : owned.has(row.folder)));
}

// Every tentacle, each followed by those under it, with its level: the order the Timeline's
// groups go in, and their names and colours.
const timelineGroups = async () => tentacleTree(await readTentacles()).map(({ id, name, level }) => ({ id, name, level }));

// Each event's Event Date and Application Deadline, for the Timeline's lines. Only dates the
// dashboard wrote are used, so an event shows once Compatibility has converted its dates. A
// deadline only matters until the event has been applied for or booked.
async function timelineEvents() {
  const page = NETWORKING.events;
  const content = await readIfExists(path.join(at().NETWORKING_DIR, page.file));
  if (content === null) return [];
  return parseEntries(content, page.level, isNetworkingField(page))
    .flatMap((s) => s.entries)
    .map((entry) => {
      const progress = eventProgress(entry);
      const date = parseEventDate(eventValue(entry, 'Event Date')) || {};
      const deadline = progress === 'open' ? (parseEventDate(eventValue(entry, 'Application Deadline'), false) || {}).start : null;
      return { title: entry.title, start: date.start || null, end: date.end || null, deadline: deadline || null, booked: progress === 'booked' };
    })
    .filter((e) => e.start || e.deadline);
}

// Every catalog record with a Release date, for the Timeline. A cover in the Image column,
// written [[IMAGE#path]], becomes its address under images/.
async function timelineReleases() {
  const catalogs = await listCatalogs();
  const column = (columns, name) => columns.findIndex((c) => c.toLowerCase() === name);
  const lists = await Promise.all(
    catalogs.map(async (catalog) => {
      const { columns, rows } = parseCatalog(await readCatalogFile(catalog));
      const [date, title, image, number] = ['release date', 'title', 'image', 'catalog #'].map((name) => column(columns, name));
      if (date === -1) return [];
      return rows.flatMap((row) => {
        const day = (parseEventDate(row[date], false) || {}).start;
        if (!day) return [];
        const cover = image === -1 ? null : row[image].match(/^\[\[IMAGE#([^\]|]+)(?:\|[^\]]*)?\]\]$/);
        return [{
          title: (title !== -1 && row[title].trim()) || (number !== -1 && row[number].trim()) || 'Release',
          date: day,
          image: cover ? 'images/' + cover[1].trim().split('/').map(encodeURIComponent).join('/') : null,
          catalog: catalog.name,
        }];
      });
    })
  );
  return lists.flat();
}

module.exports = {
  collectTimeline,
  tentacleTimeline,
  timelineGroups,
  timelineEvents,
  timelineReleases,
};
