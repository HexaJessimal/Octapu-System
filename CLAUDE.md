# Octapu System: notes for Claude

A markdown-based project management system (PMS) for an organisation made of entities (orgs/labels) and their "tentacles" (sub-entities). Data are plain markdown and CSV files that the user also edits by hand (e.g. in Obsidian) and shares between machines with Syncthing. `dashboard/` is a local web app that reads and edits those files.

The README is the user-facing reference. Its sections on file layout, code organisation, options and markdown formats are accurate, so read the relevant section before changing behaviour. `Help Guide.md` is the step-by-step guide shown in the app.

## Running
- `node dashboard/server.js` → http://127.0.0.1:4173 (`PMS_PORT`, `PMS_HOST` env vars). No `npm install`; there is no package.json.
- There's no test suite. Verify by running the server and exercising the page or API (curl the `/api/*` routes; POSTs need `Content-Type: application/json` and a matching `Origin`).
- The repo *is* the user's live data. Test against a copy (e.g. `tar` the folder, minus `.git`, into the scratchpad and run there on another `PMS_PORT`), so edits, change logs and conflict files don't land in real files.
- Platform: the user works on Windows (Git Bash + PowerShell). Python is **not** installed; use node for scripts.

## Hard rules / conventions
- **Zero dependencies.** Node built-ins only on the server, plain browser JS (IIFE per file, `'use strict'`) on the client. No build step, no frameworks, no CDN.
- **Data folders vs app**: `Entities/`, `Projects/` (and any other dir named in `PROJECTS`), `Networking/`, `Time_Management/`, `Catalogs/`, `Labels/`, `Images/`, `Help Guide.md` are user data. `dashboard/` is the app. `dashboard/defaults/` holds the shipped Help Guide, screenshots, logo and colours, which are copied in only if missing.
- **Help Guide is duplicated**: `Help Guide.md` (root, the user's copy, which has a "Mark as read" tick) and `dashboard/defaults/Help Guide.md`. Doc changes go in both. Update README too.
- Comments are short, plain English, explaining *why*. Match the existing style; the user cares about tidy, readable code.
- User-visible text uses British spelling (colour, organise).

## Server (`dashboard/server.js`, ~2.4k lines, one file plus helpers)
- Helper modules: `todos.js` (status-prefixed items, header parsing), `document-edits.js` (block/milestone/line edits), `catalogs.js`, `changes.js` (line diff, change logs, Syncthing conflict names).
- Routing is a flat `if (url.pathname === …)` list in `http.createServer`. All POSTs go through `handleEdit(req, res, isValid, apply)`, which checks `isTrustedRequest` (same origin, loopback by default), requires JSON, validates the body with an `isX` predicate, then runs `apply` inside `enqueueWrite` (writes are serialised).
- `apply` returns `{ code, body }`.
- **Writing files**: `writeFileSafely(full, data)` (temp file + rename) for existing files. New files use `fs.promises.writeFile(..., { flag: 'wx' })`. Markdown writes are logged to the changelog (see below), so new markdown write paths must go through `writeFileSafely` or call `recordCreated`.
- **Path safety**: documents are addressed by `{ folder, file }`, never raw paths. `editableFile(folder, file)` resolves them: a project folder name, `entity:<ID>`, or `networking:<page>`. It only matches real listed entries.
- `listMarkdown(dir)` lists the `.md` files of a project or entity folder, skipping Syncthing conflict copies.
- **Options** (`Labels/Options.csv`, `Option,Value`): read fresh on every use via `readOptions()`. On/off options are declared in `SWITCH_OPTIONS` with defaults. The Options page lists them as tick boxes even when absent from the file, and saving adds them. Add a `TOGGLE_NOTES` entry in `public/js/options.js` for each new switch.
- Other label CSVs: `Status.csv`, `Owners.csv` (entities, `id,Name,Parent`), `Leaders.csv` (people, `Tag,Name`), `Colours.csv` (theme).
- `/api/owner-tags.js` is a script every page loads that sets `window.PMS_*` globals (owner IDs, archived statuses, SHOWARCHIVED, MULTIUSER, SYNCCONFLICTS, the logged-in user). Use it for small per-page flags.
- `serveStatic` redirects every `.html` to `setup.html` while first-time setup is needed. When MULTIUSER is on, it redirects to `login.html` if no one is logged in.

## Client (`dashboard/public/`)
- Every page loads `api/components.js`, `js/projects.js` (shared helpers on `window.PMS`: `component`, `getJson`, `postJson`, `readJson`, `escapeHtml`, `setViewInAddress`, …), `api/owner-tags.js`, then page scripts.
- **HTML only in templates**: `public/components/*.html` `<template name="…">`. Use `{{x}}` for escaped values, `{{{x}}}` for raw HTML and `{{#if x}}…{{else}}…{{/if}}` for optional markup. Newlines and indentation are stripped. Render with `PMS.component(name, data)`.
- Document pages (`project.html`, `entity.html`, `networking.html`) share `js/document-view.js`. Each has a `[data-view]` toggle (Overview/List, Scratchpad, Raw, Changelog) and a `draw()` that renders the current view into `#content`. The loaded doc object carries `folder` and `file`.
- `js/changes.js` (`PMS.changes`) provides the Syncthing conflict warning (`#conflicts` above `#content`) and the Changelog view for those pages.
- `js/nav.js` is the left menu, which shows the logged-in user and Log out when MULTIUSER is on. `js/status.js` holds the status controls plus `status.refresh()` / `status.onChange()` for reloading after edits.
- Styling: `public/css/style.css`, using CSS variables (`--green`, `--pink`, `--orange`, `--yellow`, `--accent`, `--surface`, `--border`, `--text-soft`, …).

## Multi-user and Syncthing (added 2026-11)
- NAS read/write modes were considered and **rejected**: Syncthing handles sharing files between machines. Don't reintroduce network-path options.
- `SYNCCONFLICTS` switch: scans the open document's folder for `Name.sync-conflict-YYYYMMDD-HHMMSS-DEVICE.md`. It shows a diff with **Keep current** (deletes the copy) or **Use this version** (writes it over the file, then deletes the copy). API: `GET /api/conflicts`, `POST /api/conflict`.
- `MULTIUSER` switch: login picks a leader from `Leaders.csv`, stored in the `pms_user` cookie. The device is always the server's `os.hostname()`, never user-chosen, so the number of logs stays stable. Every markdown write appends to `<name>-change.<HOSTNAME>.log` next to the file. There is **one log per device** so Syncthing never sees two writers on one log. Entries older than 2 × `ROUNDUP` days are pruned on write. The Changelog view merges every device's log for the file (`GET /api/changelog`).
- User identity reaches the write helpers through `AsyncLocalStorage` (`requestContext`), set in `handleEdit`.
- Trust model: collaborative equals, so no passwords or encryption. The login is identification, not security.
