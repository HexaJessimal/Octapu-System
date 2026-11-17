// Line diffs, per-device change logs and Syncthing conflict copies. Node built-ins only.
'use strict';

// ---------- line diff ----------

// Above this many cells the middle of the two files is shown as one replaced block, so a
// huge rewrite can't stall the server.
const MAX_DIFF_CELLS = 4_000_000;

const splitLines = (text) => (text === '' ? [] : text.replace(/\r?\n$/, '').split(/\r?\n/));

// The changes from `before` to `after` as hunks: { type, oldLine, newLine, removed, added }.
// A hunk with both removed and added lines is a 'change'. Line numbers start at 1.
function diffLines(before, after) {
  const a = splitLines(before);
  const b = splitLines(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const n = endA - start;
  const m = endB - start;
  // Each step is 'same', 'remove' or 'add', walked from the start of the middle section.
  const steps = [];
  if (n * m > MAX_DIFF_CELLS) {
    for (let i = 0; i < n; i++) steps.push('remove');
    for (let j = 0; j < m; j++) steps.push('add');
  } else {
    // lengths[i * (m + 1) + j]: the longest common run of a[i..] and b[j..].
    const lengths = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lengths[i * (m + 1) + j] =
          a[start + i] === b[start + j] ? lengths[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(lengths[(i + 1) * (m + 1) + j], lengths[i * (m + 1) + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && a[start + i] === b[start + j]) {
        steps.push('same');
        i++;
        j++;
      } else if (j < m && (i === n || lengths[i * (m + 1) + j + 1] >= lengths[(i + 1) * (m + 1) + j])) {
        steps.push('add');
        j++;
      } else {
        steps.push('remove');
        i++;
      }
    }
  }

  const hunks = [];
  let hunk = null;
  let i = start;
  let j = start;
  for (const step of steps) {
    if (step === 'same') {
      hunk = null;
      i++;
      j++;
      continue;
    }
    if (!hunk) {
      hunk = { type: '', oldLine: i + 1, newLine: j + 1, removed: [], added: [] };
      hunks.push(hunk);
    }
    if (step === 'remove') hunk.removed.push(a[i++]);
    else hunk.added.push(b[j++]);
  }
  for (const h of hunks) h.type = h.removed.length && h.added.length ? 'change' : h.removed.length ? 'remove' : 'add';
  return hunks;
}

// ---------- change logs ----------

// One log per device, next to the file: "Plan.md" logs to "Plan-change.<DEVICE>.log". Only one
// machine ever writes each log, so Syncthing can't make conflict copies of them.
const logPrefix = (file) => file.replace(/\.md$/i, '') + '-change.';
const logName = (file, device) => `${logPrefix(file)}${device}.log`;
const isLogOf = (file) => (name) => name.startsWith(logPrefix(file)) && name.endsWith('.log') && !name.slice(logPrefix(file).length, -4).includes('.');

// A hostname, or anything else, made safe for a file name and a log line.
const cleanDevice = (name) => (name || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
const cleanField = (text) => String(text).replace(/[|\r\n]+/g, '/').trim();

const MAX_LOGGED_LINES = 400; // one huge rewrite shouldn't swamp the log

// The text of one log entry. Each line is "<mark> <line number> | <text>", where the mark is
// + added, - removed, ~- changed from, or ~+ changed to.
function formatEntry({ time, user, device, hunks }) {
  const lines = [`@ ${time.toISOString()} | ${cleanField(user)} | ${cleanField(device)}`];
  let count = 0;
  for (const h of hunks) {
    const [from, to] = h.type === 'change' ? ['~-', '~+'] : ['-', '+'];
    h.removed.forEach((text, k) => count++ < MAX_LOGGED_LINES && lines.push(`${from} ${h.oldLine + k} | ${text}`));
    h.added.forEach((text, k) => count++ < MAX_LOGGED_LINES && lines.push(`${to} ${h.newLine + k} | ${text}`));
  }
  if (count > MAX_LOGGED_LINES) lines.push(`… ${count - MAX_LOGGED_LINES} more lines`);
  return lines.join('\n') + '\n\n';
}

const MARKS = { '+': 'add', '-': 'remove', '~-': 'from', '~+': 'to' };

// Every entry in a log's text, oldest first: { time, user, device, lines: [{ kind, line, text }], more }.
function parseLog(text) {
  const entries = [];
  let entry = null;
  for (const line of text.split(/\r?\n/)) {
    const head = /^@ (\S+) \| (.*?) \| (.*)$/.exec(line);
    if (head) {
      const time = new Date(head[1]);
      entry = isNaN(time) ? null : { time, user: head[2], device: head[3], lines: [], more: 0 };
      if (entry) entries.push(entry);
      continue;
    }
    if (!entry) continue;
    const row = /^(~-|~\+|\+|-) (\d+) \| ?(.*)$/.exec(line);
    if (row) entry.lines.push({ kind: MARKS[row[1]], line: Number(row[2]), text: row[3] });
    const more = /^… (\d+) more lines$/.exec(line);
    if (more) entry.more = Number(more[1]);
  }
  return entries;
}

// The log's text with a new entry added and anything older than `cutoff` dropped. The
// entries kept are copied as they were, so pruning never rewrites history.
function appendToLog(existing, entry, cutoff) {
  const kept = (existing || '')
    .split(/\n(?=@ )/)
    .filter((chunk) => {
      const head = /^@ (\S+) \|/.exec(chunk);
      return head && new Date(head[1]) >= cutoff;
    })
    .map((chunk) => chunk.replace(/\s*$/, '\n\n'));
  return kept.join('') + formatEntry(entry);
}

// ---------- Syncthing conflict copies ----------

// Syncthing keeps both sides of a clash, naming the other one like
// "Plan.sync-conflict-20261117-101500-ABCDEF7.md".
const CONFLICT_PART = /\.sync-conflict-(\d{8})-(\d{6})-([A-Z0-9]+)(?=\.|$)/;
const isConflictCopy = (name) => CONFLICT_PART.test(name);

// The conflict copy's details if `name` is a copy of `file`, or else null.
function conflictOf(file, name) {
  const match = CONFLICT_PART.exec(name);
  if (!match || name.replace(CONFLICT_PART, '') !== file) return null;
  const [, day, clock, device] = match;
  const when = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)} ${clock.slice(0, 2)}:${clock.slice(2, 4)}:${clock.slice(4)}`;
  return { name, when, device };
}

module.exports = { diffLines, logName, isLogOf, cleanDevice, appendToLog, parseLog, isConflictCopy, conflictOf };
