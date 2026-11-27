// The markdown rules the server and the pages must agree on, written once. Every page loads
// this file (as PMS.rules) and the server requires it, so a task, timeframe or review line is
// read the same way on both sides. Pure functions and patterns: no page, no files.
(function (root, make) {
  'use strict';
  const rules = make();
  if (typeof module === 'object' && module.exports) module.exports = rules;
  else root.PMS = Object.assign(root.PMS || {}, { rules });
})(typeof self === 'undefined' ? this : self, function () {
  'use strict';

  // ---------- tasks ----------

  // A checkbox row: a list item opening with [ ], [x], [/] or [-].
  const CHECKBOX_ROW = /^\s*(?:[-*+]|\d+[.)])\s+\[[ xX/-]\]/;

  // A priority is an org-style [#A] token straight after the status. R is a recurring task,
  // written with how often it comes round: [#R|5D], [#R|2W], [#R|3M], [#R|1Y].
  const PRIORITY = '\\[#(?:[A-C]|R\\|(?:10|[1-9])[DWMY])\\]';
  // The token after a status name, with any bold or italics before it: the priority, and a
  // recurring task's count and unit.
  const PRIORITY_TOKEN = /^((?:\*\*|__|\*|_)?\s*)\[#([A-C]|R\|(10|[1-9])([DWMY]))\]/;
  // A recurring priority as an edit sends it, such as R|5D.
  const RECUR_VALUE = /^R\|(10|[1-9])([DWMY])$/;
  // Any priority token in a line of text, giving its letter (a recurring one gives R).
  const anyPriority = () => /\[#([A-C]|R)(?:\|(?:10|[1-9])[DWMY])?\]/g;

  // A row whose whole text is struck through has been cancelled.
  function isCancelled(text) {
    const t = String(text).trim();
    return t.startsWith('~~') && t.endsWith('~~') && t.length > 4;
  }

  // ---------- a section's review lines ----------

  // A section's own Date Reviewed and Flagged for Review, straight under its heading.
  // Both "**Label**: value" and "**Label:** value" are used in the files.
  const SECTION_REVIEWED = /^\s*\*\*\s*Date Reviewed\s*(?:\*\*\s*:|:\s*\*\*)\s*(.*?)\s*$/i;
  const SECTION_FLAG = /^\s*\*\*\s*Flagged for Review\s*(?:\*\*\s*:|:\s*\*\*)\s*(.*?)\s*$/i;

  // ---------- the Task Archive ----------

  // "<!-- 3 tasks in the Task Archive -->", left where a milestone's archived tasks were. It's a
  // comment, so Obsidian and the dashboard don't show it, but the milestone's progress counts
  // it as that many finished tasks.
  const ARCHIVE_MARKER = /^\s*<!--\s*(\d+)\s+tasks?\s+in the Task Archive\s*-->\s*$/i;
  const archiveMarker = (count) => `<!-- ${count} ${count === 1 ? 'task' : 'tasks'} in the Task Archive -->`;

  // ---------- timeframes ----------

  // The comma-separated entries of an Active Timeframe value, as written.
  // A comma inside a timeframe's brackets of milestone names doesn't start another timeframe.
  function timeframeEntries(value) {
    return String(value).split(/,(?![^()]*\))/).map((v) => v.trim()).filter(Boolean);
  }

  // One timeframe's dates, and the milestones it's limited to: "2026-11-01 to 2027-02-28
  // (Write songs; Record)" covers those two, and with no brackets it covers them all (null).
  function splitTimeframe(entry) {
    const named = String(entry).match(/^(.*?)\s*\(([^()]*)\)\s*$/);
    if (!named) return { dates: String(entry).trim(), milestones: null };
    const milestones = named[2].split(';').map((name) => name.trim()).filter(Boolean);
    return { dates: named[1].trim(), milestones: milestones.length ? milestones : null };
  }

  // A timeframe as written: its dates, then any milestone names in brackets.
  const timeframeText = (dates, milestones) => dates + (milestones && milestones.length ? ` (${milestones.join('; ')})` : '');

  // ---------- project dependencies ----------

  // A Project Dependency value as a list: "MUSART First album (Mix; Release), LABEL Merch Store"
  // depends on two projects, on just those two milestones of the first. Written like an Active
  // Timeframe, so a single name with no brackets, as older files have, is one whole project.
  function dependencyEntries(value) {
    return timeframeEntries(value).map((entry) => {
      const { dates, milestones } = splitTimeframe(entry);
      return { name: dates, milestones };
    });
  }

  // The value written for a list of { name, milestones }.
  const dependencyText = (list) => list.map(({ name, milestones }) => timeframeText(name.trim(), milestones)).join(", ");

  // ---------- milestones ----------

  // The "## Milestones" heading, and each milestone's "###" heading under it.
  const MILESTONES_HEADING = /^##\s+milestones?\s*$/i;
  const MILESTONE_HEADING = /^###\s+(.*?)\s*$/;

  // Indent width with tabs counted as 4 columns.
  function indentOf(line) {
    let n = 0;
    for (const ch of line) {
      if (ch === ' ') n += 1;
      else if (ch === '\t') n += 4;
      else break;
    }
    return n;
  }

  // True if a checkbox's text opens with one of `archived`, the ARCHIVED type's status names.
  function startsWithStatus(text, archived) {
    const words = text.replace(/^[*_\s]+/, '').split(/[\s:*_]/, 1);
    return archived.includes(words[0]);
  }

  // Every ### under "## Milestones" (until the next # or ## heading), with its review lines,
  // its body and how many of its tasks are done. Cancelled tasks don't count. Archived ones
  // (and anything nested under them) count as done, as do the tasks a review moved to the
  // Task Archive. `archived` is the ARCHIVED type's status names.
  function parseMilestones(md, archived) {
    const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
    const result = { found: false, start: -1, end: -1, milestones: [] };

    const start = lines.findIndex((l) => MILESTONES_HEADING.test(l.trim()));
    if (start === -1) return result;
    result.found = true;
    result.start = start;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    result.end = end;

    let current = null;
    let archivedIndent = null; // set while passing an archived row and what's nested under it
    let inMeta = false; // straight after a heading, where its review lines go
    for (let i = start + 1; i < end; i++) {
      const h = lines[i].match(MILESTONE_HEADING);
      if (h) {
        current = { title: h[1], headingLine: i + 1, firstLine: i + 2, body: [], total: 0, done: 0, cancelled: 0, reviewed: null, flagged: false };
        result.milestones.push(current);
        inMeta = true;
        continue;
      }
      if (!current) continue;
      // A milestone's own Date Reviewed and Flagged for Review come first, and aren't its body.
      if (inMeta) {
        const reviewed = lines[i].match(SECTION_REVIEWED);
        const flag = reviewed ? null : lines[i].match(SECTION_FLAG);
        if (reviewed || flag) {
          if (reviewed) current.reviewed = reviewed[1] || null;
          else current.flagged = /^yes$/i.test(flag[1]);
          current.firstLine = i + 2;
          continue;
        }
        inMeta = false;
      }
      current.body.push(lines[i]);
      const moved = lines[i].match(ARCHIVE_MARKER);
      if (moved) {
        current.total += Number(moved[1]);
        current.done += Number(moved[1]);
        continue;
      }
      const m = lines[i].match(/^\s*(?:[-*+]|\d+[.)])\s+\[([ xX/-])\]\s*(.*)$/);
      if (!m) continue;
      if (archivedIndent !== null && indentOf(lines[i]) > archivedIndent) continue;
      archivedIndent = null;
      if (startsWithStatus(m[2], archived)) {
        archivedIndent = indentOf(lines[i]);
        current.total++; // hidden, but still a finished task
        current.done++;
        continue;
      }
      if (isCancelled(m[2])) {
        current.cancelled++;
        continue;
      }
      current.total++;
      if (m[1].toLowerCase() === 'x') current.done++;
    }

    for (const ms of result.milestones) {
      ms.body = ms.body.join('\n');
      ms.state = ms.total === 0 ? 'none' : ms.done === ms.total ? 'done' : ms.done > 0 ? 'partial' : 'todo';
    }
    return result;
  }

  return {
    CHECKBOX_ROW,
    PRIORITY,
    PRIORITY_TOKEN,
    RECUR_VALUE,
    anyPriority,
    isCancelled,
    SECTION_REVIEWED,
    SECTION_FLAG,
    ARCHIVE_MARKER,
    archiveMarker,
    timeframeEntries,
    splitTimeframe,
    timeframeText,
    dependencyEntries,
    dependencyText,
    MILESTONES_HEADING,
    MILESTONE_HEADING,
    indentOf,
    parseMilestones,
  };
});
