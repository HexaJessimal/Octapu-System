# PMS Dashboard

A small, self-contained dashboard for the markdown-driven project management system in this folder. Markdown files are the source of truth, so you can keep editing them in any text editor. The dashboard only changes them when you make an edit in it.

- **No build step.** There's nothing to compile or bundle.
- **No dependencies.** It uses only Node's built-in modules, so there's no `npm install` and no `node_modules`.
- **System agnostic.** It runs the same way on Windows, macOS and Linux.
- **Offline.** No CDNs, web fonts or external requests.

## First-time setup

1. Install **Node.js 18 or newer** from <https://nodejs.org> (the LTS version is fine).
2. Check it's installed. In a terminal, run:
   ```
   node --version
   ```
   It should print something like `v18.x` or higher.

No packages need installing.

The first time you open the dashboard, a short form asks for your entity's name and ID, your name and a date format. It then creates the CSV files in `Labels/`, your entity's folder and markdown file, and a `Projects` folder, using sensible defaults for everything else. All of this can be changed later in Options.

The form comes back whenever one of `Status.csv`, `Owners.csv`, `Leaders.csv`, `Options.csv` or `Colours.csv` is missing, or `Owners.csv` has no owner without a `Parent`. It only asks for what's needed and only creates what's missing, so existing files are never replaced.

Each time it starts, the dashboard creates any of these that are missing: the `Entities`, `Images`, `Labels`, `Networking`, `Projects` and `Time_Management` folders, and starter `Networking/Leads.md` and `Networking/Events.md` files. Anything already there is left alone.

A picture named `logo` in `Images`, such as `Images/Logo.png`, appears at the bottom of the left menu and links to Home.

## Running the dashboard

From the `PMS` folder, run:

```
node dashboard/server.js
```

Then open the address it prints in your browser:

```
http://127.0.0.1:4173
```

Stop the server with `Ctrl + C`.

You can also run it from any directory. Paths are resolved relative to `server.js`, so this works too:

```
node /path/to/PMS/dashboard/server.js
```

### Options

You can set these environment variables before running:

| Variable   | Default     | Purpose                                                                                     |
| ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| `PMS_PORT` | `4173`      | Port to listen on                                                                           |
| `PMS_HOST` | `127.0.0.1` | Interface to bind. Keep the default so only this computer can view the dashboard or edit your files through it. |

The syntax depends on your shell:

- macOS / Linux: `PMS_PORT=8080 node dashboard/server.js`
- Windows PowerShell: `$env:PMS_PORT=8080; node dashboard/server.js`
- Windows cmd: `set PMS_PORT=8080 && node dashboard/server.js`

## Task lists

The `TASKLISTS` row in `Labels/Options.csv` is a comma-separated list of headings, such as `"Tasks,Marketing"`. On entity pages and Ongoing projects, each one gets its own task list box on the Overview, in that order, and is taken off the Scratchpad. A file's `## Heading` for each list is what fills its box, and capitals and extra spaces don't matter. Changes apply on the next page load, with no restart. `Milestones` and `Notes` have their own sections, so they can't be used. If there's no `TASKLISTS` row at all, the dashboard uses `Tasks`.

## How projects are organised

The `PROJECTS` row in `Labels/Options.csv` says where projects live. It holds a comma-separated list of folder names directly inside `PMS/`, such as `"Projects,Incubator,Merch"`.

A directory can hold both kinds of project. Each file's `**Project Type:**` line decides which kind it is: `Milestone` for a full project with milestones, timeframes and dependencies, or `Ongoing` for a simpler one with a flat Tasks list. See [Ongoing projects](#ongoing-projects). A project with a missing or unknown type shows as a Milestone project and is listed on the Compatibility page.

Every directory gets its own section in the left-hand menu. Changes apply on the next page load, with no restart. A name can't contain a path, and `dashboard`, `Labels`, `Entities` and `Networking` can't be used. If there's no `PROJECTS` row at all, the dashboard uses `Projects`.

Each project is a folder inside one of these directories. Markdown files sitting loose in the directory aren't projects. The folder's prefix sets its status:

| Folder name                       | Status   |
| --------------------------------- | -------- |
| `+OWNER_Project_Title`            | Active   |
| `-OWNER_Project_Title`            | Inactive |
| `YYYY-MM-DD_OWNER_Project_Title`  | Archived |

- The date separator for archived folders can be `-`, `.` or `_`, so `2026.11.07_...` works too.
- After the prefix, the first `_` segment is the **owner** and the rest is the **title**. Underscores show as spaces.
- To switch a project between active and inactive, use the tag beside its title on the project page. To archive one, rename its folder.
- The owner in a folder name is set when the project is created. Changing the owner in the page title afterwards doesn't rename the folder, so file sync programs aren't disturbed.

A folder with no markdown file directly inside it, such as one holding only images, isn't treated as a project. The dashboard opens the one whose name matches the title (for example `Project Title.md`). If none matches, it opens the first `.md` alphabetically.

## Using the dashboard

### Menu

The sidebar on the left appears on every page:

- **Home:** a dashboard of what matters today, described below.
- **Entities:** the top-level owners from `Labels/Owners.csv`, meaning those with no `Parent`.
- **Time Management:** `Review`, `Plan` and `Commitments` are described below. `Review` and `Plan` each turn green in the menu once the number of days set by `ROUNDUP` in `Labels/Options.csv` has passed since the last entry, or if there's never been one. On the day it's due it says "Due today", and after that it says how overdue it is, such as "Due 2 days ago". For the two days before that it turns yellow and counts down, such as "Due in 2 days".
- **One section per project directory** (`Projects`, for example), in the order `PROJECTS` lists them: `All projects` opens that directory's list, followed by a link to each of its projects with a `+` folder.
- **Networking:** `Leads` and `Events`, described below.
- **Compatibility:** `Entities` and `Projects`, described below.
- **Options:** tabs for general settings (`Labels/Options.csv`), statuses, leaders and colours, described below.
- **Help Guide:** a step by step guide to the dashboard, from `Help Guide.md` in the main folder. Edit that file and refresh to change it.

### Home

- **Tiles:** the number of active and inactive projects across every project directory, the number of projects in a timeframe today, how many days until the next Review and Plan are due, and the number of overdue tasks. Review and Plan use the `ROUNDUP` number of days from `Labels/Options.csv`.
- **Timeline:** a Gantt chart that scrolls sideways, with one bar per timeframe in each project's `Active Timeframe`, accurate to the month. Each bar is graded through the project's milestones from left to right, using the same colours as the milestone progress bar. A project with no milestones is `N/A` in the key, and commitments appear as solid bars. Timeframes that aren't written as `YYYY-MM-DD` are listed above the chart. A chart taller than 12 rows scrolls up and down, with the year and month headings staying in view.
- **Current plan** shows the newest entry in `Time_Management/Plan.md`, while it's less than `ROUNDUP` days old. After that it links to the Plan page instead.
- **Due in the next 7 days** and **Overdue tasks** list open tasks with a `DEADLINE` or `SCHEDULED` date, from every non-archived project and every entity, soonest first. If a task has both, the deadline counts. Finished, archived and cancelled tasks are left out, and today counts as due, not overdue. Its status can be changed right there.
- **Priorities this month** lists Milestone projects with a timeframe that includes today, and their progress.

### Review

**Projects to review** and **Entities to review** list every non-archived project and every entity with no `Date Reviewed`. A link opens that page in an overlay, where it can still be edited. **Mark as reviewed and close** sets `Date Reviewed` to today, and **Close** leaves it on the list. This is the only way to set the date in the dashboard, and project and entity pages show it read-only. The two numbers beside Review in the menu count these lists: cyan for projects and purple for entities.

Lists every `DONE` type item in non-archived projects, Ongoing ones included, in entities and tentacles, and under a Leads contact or an Events entry, that was closed since the last review, with one box per status. Reviews are logged in `Time_Management/Review.md`, newest first, under a `## YYYY-MM-DD` heading, and the latest heading sets the date of the last review.

- **Add to wins** adds that box's items to the wins text as bullet points, and removes the box.
- **Submit** logs the wins under today's date and moves every `DONE` type item in all of those to the first `ARCHIVED` status, including any closed before the last review. The text can't be empty.

Both Review and Plan have a **History** tab, showing their log file as one card per date.

### Plan

Offers everything that hasn't been assigned yet, with one box for each source: anything in an `UNASSIGNED` type status, and any unticked checkbox with no status. The boxes cover milestone items in active projects, then every task and status-tagged line in each entity and tentacle, then tasks under a Leads contact or an Events entry. Each item shows its milestone, heading, contact or event beside it. Every box, in this list and in **Focus**, has an arrow to collapse it, remembered in your browser.

- A project with a timeframe that includes today is highlighted and tagged **Suggested**. The colour is `cyan` in Options > Colours.
- An item is highlighted if it's the only incomplete item left in its milestone, in the colour `yellow`. Waiting items count as incomplete, as they do on the milestone progress bars. Cancelled items don't.
- Click an item to move it to the **Focus** list below, where its status and priority can be set as on a project page. The items you pick are remembered in your browser until you submit them.
- Every item on this page with an `ASSIGNED` type status is in the **Focus** list automatically, after anything you've picked. It has no Remove button, and leaves the list when its status changes.
- **Submit focus** logs the list in `Time_Management/Plan.md`, newest first, under today's date, as an outline of owner (by `Name` from `Labels/Owners.csv`), then project, then items, with no status tags. Entities and tentacles are listed under their top-level entity, and Leads and Events under `Networking`.

### Commitments

Lists each `##` heading in `Time_Management/Commitments.md`, which is a commitment that isn't a project. Each one has these fields, and all of them can be left empty:

- `**Colour**:` is its priority, `A`, `B` or `C`. On the Timeline its bar is a solid colour instead of a milestone gradient, using the same colours as milestones: `A` is `green`, as for Complete, `B` is `yellow`, as for In progress, and `C` is `pink`, as for Unplanned.
- `**Active Timeframe**:` is written as `YYYY-MM-DD to YYYY-MM-DD`. A date that can't be read is listed above the Timeline, as for a project.
- `**Project Dependency**:` is a project, or `COMMITMENT` followed by another commitment's name.

The plus button adds a commitment and the minus button deletes one after asking. Double-click a name to change it, which also updates anything depending on it. The tag and pencil buttons change the priority, timeframe and dependency.

A project can depend on a commitment too, by choosing it from its Project Dependency list or writing `COMMITMENT` and its name in the file. Dependencies between projects and commitments are drawn as arrows on the Timeline.

### Compatibility

**Entities** and **Projects** list everything whose markdown doesn't yet fit the dashboard, and why. Only a field's label is needed, not a value. Links open the page so it can be fixed. The lists are worked out fresh each time.

Each issue is coloured by what can be done about it:

- **Accent colour:** a missing field, heading or entity file. These can be fixed automatically, and the box has a **Fix issues** button.
- **Error colour:** anything else in the file that needs changing by hand, such as a value that isn't recognised.
- **Orange** (`orange` in Options > Colours): a file or folder that isn't where it's expected to be.

**Fix issues** only adds what's missing to the file being checked, and leaves everything else in it alone. Fields are added with no value, after the last field at the top of the file, and headings go at the end. A missing entity file is created like a new one, with today's date. A missing `**Project Type:**` is written as the type of the project the file is in, which is `Milestone` for a project with none. A missing `**Owner**` is filled in only if `Labels/Leaders.csv` has one person. Otherwise it's added blank, shown as an error until you choose someone from the dropdown on the project page.

An entity needs a `#` title, `**Date Created**:`, `**Date Reviewed**:` and a `##` heading for each entry in `TASKLISTS`. It's also listed if its folder or its parent isn't in `Labels/Owners.csv`, if it has no markdown file, or if its file isn't named after its `Name`.

**Projects** covers every directory in `PROJECTS`, and also lists a directory named there that doesn't exist or can't be used. Every project needs a `**Project Type:**` of `Milestone` or `Ongoing`. Ongoing projects aren't asked for `**Project Dependency**:`, `**Active Timeframe**:`, `## Milestones` or `## Notes`. They need a `##` heading for each entry in `TASKLISTS` instead.

A project needs a folder and page title starting with an `id` from `Labels/Owners.csv`, an `**Owner**` whose value is a `Tag` from `Labels/Leaders.csv`, the fields `**Date Created**:`, `**Date Reviewed**:`, `**Date Closed**:`, `**Project Dependency**:` and `**Active Timeframe**:`, and `## Milestones` and `## Notes` sections. The colon can sit inside or outside the bold, and `**Created:**` counts as Date Created.

Every markdown file directly inside a project or entity folder is checked, each in its own box with its name shown. A file beyond the main one is held to the same rules if it uses any of the dashboard's fields, a `## Milestones` section or a `TASKLISTS` heading. Otherwise it's flagged in orange as **Unknown markdown**, as is any markdown loose in a directory named in `PROJECTS` or in `Entities/`. Markdown in subfolders of a project isn't looked at, so a project can keep things like code libraries and their documentation.

### Networking

Each page has three tabs. The first lists entries as cards, **Scratchpad** shows everything else in the file, edited as on a project page, and **Raw** shows and edits the whole file.

**Leads** lists each `###` entry under `## Contacts` in `Networking/Leads.md`, with the fields Contact Details, Links, Events & Associations and Notes. `**Events**` also counts as Events & Associations, and any label ending in Notes, such as `**Octapu Notes**`, counts as Notes and keeps its own name.

**Events** lists each `####` entry in `Networking/Events.md`, grouped by the file's `##` headings, with the fields Artist/s, Date, Venue, Main Contact, Details, Payment and Tasks. An event moves to **Past events** at the bottom once its `**Date**` has gone by, and a heading with nothing left in it isn't shown.

A field is a line holding just that bold label, and its value is the text up to the next field. Double-click a value or an entry's name to edit it. A field the entry doesn't have yet is added the first time you fill it in. Any text before the first field has its own area at the top of the card. Other bold text, such as `**Parking**` inside Details, stays part of the value.

The plus button adds an entry, asking for a heading on the Events page, and the minus button on a card deletes it after confirming. The `---` lines around an entry stay in the file. Statuses and checkboxes work as they do on project pages, but these files aren't listed in the Todos sidebar. Tasks under a contact or an event do appear on the Plan and Review pages.

A reference in double square brackets becomes a link wherever it appears in the dashboard, and the entry it points to is scrolled to and outlined. `[[Leads#Scheme Boy (Varispeed)]]` links to that heading in `Leads.md`, and `[[Events#Infest|the gig]]` shows "the gig" as the link's text. On a Networking page, `[[#Brawny]]` with no file name looks on that page first, and then on the other one. A name also finds a heading that adds something in brackets, so `Scott` finds `Scott (SWOLE)`. 

A reference starting with an `id` from `Labels/Owners.csv` links to that owner's page. `[[FISTING]]` opens its Overview, `[[FISTING#Tasks]]` goes to that task list on the Overview if `Tasks` is in `TASKLISTS`, and any other heading, such as `[[OCTAPU#Dates of Note]]`, opens its Scratchpad at that section. If the heading isn't found, the page opens and shows a short message. IDs are case-sensitive, so `FISTING` links and `Fisting` doesn't. The list of IDs is re-read each time a page loads.

`[[IMAGE#Screenshots/01-RunServer.png]]` shows that picture from the `Images` folder, kept to a size that fits the page. It can be `.png`, `.jpg`, `.gif` or `.webp`.

Any other reference stays as plain text.

Dates are read day-first, as `25.07.26`, `31.10.2026`, `11-13.09.26` or `14.05.2027 - 17.05.2027`, or as `2026-07-25` or `23rd-24th July 2027`. For a range, the last date counts. A date of `In the past` counts as past, and anything else, such as `TBD`, stays under its heading.

### Options

**General** edits the values in `Labels/Options.csv`, including the `PROJECTS` directory list.

**Statuses** and **Leaders** list `Labels/Status.csv` and `Labels/Leaders.csv`. Double-click a value to change it, use the plus button to add a row, and the minus button at the end of a row to delete it after confirming. If a file doesn't exist, adding the first row creates it. Any other rows or columns in the files are kept.

- **Status names** are always uppercase, and can use letters, numbers, hyphens and underscores.
- **Next status** offers every status, including defaults for any type with no row of its own. `Automatic` leaves it blank, which moves to the first status of the next type. Renaming a status updates any `Next` pointing to it, and deleting one clears them.
- **Leader tags** can't be edited. A tag is `#` followed by the name with any punctuation removed, and it changes with the name.

**Colours** lists every colour on the dashboard, from `Labels/Colours.csv`, with what each is used for. The list is kept short, so one colour often has several uses, and changing it changes all of them. Double-click a colour to change it. It takes a 6 character hex value, with or without the `#`, and the new colour shows straight away. Paler tints of a colour, such as the current month on the Timeline, are worked out from it. Status and priority tags use the same colours everywhere, including on highlighted items in the Todos sidebar.

You can also edit the file by hand and refresh the page. The `Name` of each row is how the stylesheet finds it, so it needs to stay as it is. A row that's missing, or whose value isn't a 6 character hex value, uses the built-in colour from `public/css/style.css`. Pale page backgrounds may leave parts the browser draws itself, such as scrollbars and dropdown lists, dark, because the dashboard declares a dark colour scheme.

Status names and leader tags are written into your markdown files. Renaming or deleting one here only changes the CSV, so rows and `Owner` lines still using the old value stop matching until you change them.

### Entity folders

Each owner has a folder named after its `id` inside `Entities/`, nested inside its parent's folder when it has a `Parent`. For example, `Entities/OCTAPU/PIXELGRINDER/Pixelgrinder.md`. The markdown file is named after the owner's `Name`; if there's no file with that exact name, the first markdown file in the folder is used. An owner whose `Parent` isn't in the CSV is left out.

Each top-level entity has one page, with a tab for itself and a tab for each owner under it.

- **Plus tab:** asks for a name and an ID, then creates the folder and markdown file and adds the row to `Labels/Owners.csv`. The new file has `Date Created` set to today, `Date Reviewed`, `## Notes` and a heading for each entry in `TASKLISTS`, so it passes the Compatibility check. The ID is suggested from the name. It can use letters, numbers and hyphens, and can't match an existing `id`.
- **Overview** works like a project's, without the milestone bar. A box for each heading in `TASKLISTS` takes the place of the milestones. Use a box's plus button to add a task to it, or double-click a task to edit it. If a file doesn't have that heading yet, the first task adds it.
- **Scratchpad** lists the file's other sections, and **Raw** shows the whole file. See the project page's Raw tab below.
- An entity with more than one markdown file has a tab for each above all three views, so any of its files can be viewed and edited as an Overview, Scratchpad or Raw. The plus button at the end of that row adds a new file and opens it.
- Statuses, priorities, checkboxes, Cancel and Delete all work as they do on project pages. Entities have no Date Closed, and Date Reviewed is added to the file the first time it is set.

Status lines in these files also appear in the Todos sidebar, outlined in the same way as a project's when the latest focus includes them.

### Projects list
- Filter the list with **All / Active / Inactive / Archived**. Each button shows how many projects it covers.
- Search by title or owner. The list updates as you type.
- Each project shows its milestones as a bar of coloured segments, using the same colours as its Overview tab. Hover over a segment to see which milestone it is.
- **New project** asks for the entity, title, owner, project type and any notes, then creates `+ORGID_Title/Title.md` in the directory you're viewing, with `Date Created` set to today and every field and heading its project type needs to pass the Compatibility check. The notes go under `## Notes`. A new project starts as active.

### Ongoing projects
Projects with `**Project Type:** Ongoing` use the same folder names, status prefixes and Scratchpad and Raw tabs as any other project, with these differences:

- The Overview shows only the status tag, Owner, Created, Reviewed and Closed, followed by a task list box for each heading in `TASKLISTS`. A box's plus button adds a task to it.
- A `## Milestones` section isn't shown on the Overview or Scratchpad, only in Raw. Rename it to one of the `TASKLISTS` headings, with its items as a flat list, to use it. Compatibility lists any file missing one of those headings.
- The list page shows no milestone bar for them. A new one starts with a heading for each entry in `TASKLISTS` and no Active Timeframe or Project Dependency.
- Their tasks appear in the Todos sidebar. They're also included in Review, both to be marked as reviewed and when finished items are archived.
- They aren't included in the Timeline or on the Plan page, and can't be chosen as a Project Dependency.

### Project page
- **Status** is the tag beside the title on the Overview. On an active or inactive project, its caret offers the other one, which changes the `+` or `-` at the start of the project's folder name. Nothing else about the folder changes. If another program is using the folder, nothing is changed and you're told. Archived projects can't be changed this way.
- **Project type** is shown at the top of every tab, and the dropdown changes it. Changing it rewrites `**Project Type:**` in the project's main file and renames its heading to match: `## Milestones` becomes the first heading listed in `TASKLISTS`, and that heading becomes `## Milestones` going the other way. Nothing else in the file changes. A file with both headings is left alone until one is renamed. Items under a `## Milestones` heading only appear on the Overview if they're under a `###` milestone heading.
- **Overview** is the default tab, and shows:
  - a summary card: the title with its status tag, then owner and milestones, then created, reviewed and closed, then the project dependency and the list of active timeframes side by side, and finally overall task progress
  - a milestone progress bar with one segment per `###` heading under `## Milestones`:

    | Colour | Meaning                                    |
    | ------ | ------------------------------------------ |
    | Green  | every checkbox under it is ticked          |
    | Yellow | some checkboxes are ticked                 |
    | Orange | there are checkboxes but none are ticked   |
    | Pink   | Unplanned: there are no tasks yet          |

  - a card for each milestone.
  - plus buttons to add a milestone, or a checkbox to a milestone.
  - an arrow to collapse each milestone, remembered in your browser, and a dotted handle to reorder them. Green milestones start collapsed each time the page loads. Drag the handle, or focus it and press the up and down arrow keys. Reordering moves the milestone in the file.
- **Scratchpad** shows everything in the file except the header fields and the Milestones section, as one block per `#` or `##` heading. The plus button adds a block at the end of the file. A block can't be called `Notes` or `Milestones`.
- **Raw** shows the whole markdown file, nicely rendered, on project, entity, Leads and Events pages. Double-click it to edit the file's markdown in one text box. Ctrl+Enter saves and Escape cancels. If the file has changed since the page loaded, nothing is saved. A project folder with more than one markdown file gets a tab for each file above the text. The plus button at the end of that row adds a new file, with the fields and headings a project file needs, and opens it.

**Double-click to edit:** page titles, milestone titles, the text of a milestone's checkboxes, scratchpad block titles (except `Notes`) and scratchpad block text all turn into a text box. Save or press Enter (Ctrl + Enter in a block's text) to keep the change, or Cancel or press Escape to discard it. Editing a page title never renames its folder or file.

Struck-through tasks (`- [ ] ~~like this~~`) count as cancelled and are left out of the progress maths.

The pretty view picks up these fields from the top of the file:

```markdown
# Project Name
**Date Created**: 21.06.26
**Owner** : #Name
```

Any other `**Key**: value` lines show up in the summary card too.

### Todos sidebar

The sidebar on the right lists every line, in the markdown files of all non-archived projects and every owner in `Labels/Owners.csv`, that starts with a status named in `Labels/Status.csv`. The CSV needs `Type` and `Name` columns, and uses `Next` for status changes. Items in archived project folders never appear, whichever filter is selected.

Status names come only from the CSV, which is re-read on every page load, so you can add, rename or remove them at any time. Status types are fixed: `UNASSIGNED`, `ASSIGNED`, `WAITING`, `DONE` and `ARCHIVED`. CSV rows with any other type are ignored. If the CSV is missing, or has no status for a type, a status named after that type is used instead.

When a row enters a `DONE` type status through the dashboard, it gets a `CLOSED` date and time on the line below it. Moving between two `DONE` type statuses keeps the original date.

- Markdown line openers are skipped before looking for the status: indents, `>` quotes, `#` headings, `-` `*` `+` bullets, numbered lists, `[ ]` / `[x]` checkboxes, and bold or italic markers. So `- [ ] **JESSIE** book the venue` counts as `JESSIE`.
- Statuses are case-sensitive whole words: `JESSIE` matches, `Jessie` doesn't.
- Ignored: `<!-- HTML comments -->`, `%% Obsidian comments %%`, `#+BEGIN_COMMENT` blocks, fenced code, and struck-through lines.
- **Filter** by any status or status type. `ARCHIVED` type statuses are hidden unless you filter by one, and then only they are shown.
- **Sort** by project order, status, status type, or bring any one status or type to the top. Status order follows the CSV.
- `DONE` type statuses always sit at the bottom, below a dividing line, however the list is sorted.

Your filter and sort choices are remembered in the browser.

Each row's outline shows how it relates to the newest dated entry in `Time_Management/Plan.md`:

| Outline    | Meaning                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Purple     | its project is in the focus, and the focus names this row or the `###` milestone it sits under           |
| Cyan       | its project is in the focus, but this row isn't named                                                    |
| None       | its project is active, but not in the focus                                                              |
| Pink       | its project isn't active                                                                                 |

The focus is read as an outline of owner, then project, then items, so hand edits work as long as they keep that nesting. Names are compared without regard to capitals.

### Archived items

A row with an `ARCHIVED` type status, and anything nested under it, is hidden everywhere. On a milestone it still counts as a finished task, and a milestone with only archived checkboxes shows as complete and says **Milestone complete**. Task lists on entities and Ongoing projects leave archived rows out of their progress. It only appears in the Todos sidebar when an archived status or type is chosen in Filter, and in the text box when you double-click a file's **Raw** tab to edit it.

### Changing a status

Every highlighted status, in the sidebar and on project pages, has a name and a small caret. Either one rewrites that keyword in the markdown file straight away:

- **Click the caret** to pick any status from the CSV.
- **Click the name** to move to the next status. That's the status in the CSV's `Next` column, or if that's blank, the first status of the next type: `UNASSIGNED` → `ASSIGNED` → `DONE` → `ARCHIVED`, with `WAITING` also moving to `DONE`. The last status of the sequence has nowhere to go, so its name can't be clicked.

The dropdown also has these options at the bottom:

- **Schedule** and **Deadline** ask for a date and add a `SCHEDULED: <2026-08-13 Thu>` or `DEADLINE: <2026-08-20 Thu>` line below the row, shown under the todo. Choosing one again changes the date, and clearing the date removes it. Every date field has a calendar button, or you can type the date in your `DATEFORMAT`.
- **Cancel** strikes the whole row through, status included, and unticks its checkbox: `- [ ] ~~JESSIE Book the venue~~`. It then drops off the todo list and out of milestone progress.
- **Delete** asks you to confirm, then removes the row and any `CLOSED`, `SCHEDULED` or `DEADLINE` lines directly below it. Rows nested under it are kept.

If the line has changed in the file since the page loaded, nothing is written. You'll see a message and the page will refresh.

### Project header

The top of each project file follows this pattern:

```markdown
# OWNERID Project Name
**Project Type:** Milestone
**Date Created**: 2026-06-21
**Date Reviewed**: 2026-07-01
**Date Closed**:
**Active Timeframe**: 2026-02-01 to 2026-03-15, 2026-06-01 to 2026-06-30
**Project Dependency**: PIXELGRINDER Project Two
**Owner** : #Name
```

- **Title:** the first `#` heading is the page title, and it's never listed as a todo. If it starts with an `id` from `Labels/Owners.csv`, the dashboard shows that owner's `Name` with a dropdown for choosing another. The file keeps the `id`.
- **Date Reviewed:** a single date, shown read-only and set from the Review page.
- **Date Closed:** a single date, in the `DATEFORMAT` set in `Labels/Options.csv`. Click the plus to add one or the pencil to change it. Saving an empty box clears the date.
- **Active Timeframe:** empty by default. Click the plus button next to it and choose a start and end month and year. A timeframe always runs from the first day of its start month to the last day of its end month, and is stored as full dates. Commitments work the same way. Each new timeframe is added to the end of the line, separated by a comma. If a file doesn't have the line yet, the first timeframe adds it below `Date Created`. The Overview tab lists the timeframes one per row, each with a pencil to change its dates and a cross to delete it. The file keeps them on the single comma-separated line.
- **Project Dependency:** empty by default. On the Overview tab, the plus button lists every project that isn't archived, apart from this one and any that already depend on it, followed by your commitments. A commitment is stored as `COMMITMENT` followed by its name. For a project, the file stores the other project's name (its folder name without the status prefix and with spaces for underscores), and the Overview shows it as a link. On the Timeline, a dependent project sits directly below its parent, and an arrow runs from the end of the parent project's last bar to the start of the dependent project's first bar, if both have an `Active Timeframe`.
- **Owner:** shown as a `Name` from `Labels/Leaders.csv`, with a dropdown for choosing another. The file keeps the `Tag`.

**Dates are always stored in the markdown as `YYYY-MM-DD`.** `DATEFORMAT` only controls how the browser shows dates and how you type them into the dashboard, so changing it never touches your files. If you edit a file by hand, write dates as `YYYY-MM-DD` so the dashboard can read them. Dates in links, URLs and code are shown exactly as written.

`DATEFORMAT` can use `YYYY`, `YY`, `MM` and `DD` with any separators.

### Info icons
`[!info]` in a markdown file shows as an info icon wherever the file is displayed, such as at the start of a `>` quote. The text in the file stays as it is.

### Priorities

Every status has a priority selector next to it. Click it to choose `-` (no priority), `A`, `B` or `C`.

In the markdown, a priority is a token straight after the status, such as `- [/] JESSIE [#A] Book the venue`. `-` means there's no token, so nothing extra is written to your files.

### Dates

The sidebar shows any `CLOSED`, `SCHEDULED` or `DEADLINE` dates set on the lines directly below an item:

```markdown
- [/] JESSIE Book the venue
  SCHEDULED: <2026-08-13 Thu> DEADLINE: <2026-08-20 Thu>
```

### Checkboxes

Each status type has its own checkbox in the markdown, and its own icon in the dashboard, from `dashboard/public/img`. Changing a status updates the checkbox to match.

| Type         | Markdown | Dashboard icon                     |
| ------------ | -------- | ---------------------------------- |
| `UNASSIGNED` | `[ ]`    | `circle-regular-full.svg`          |
| `ASSIGNED`   | `[/]`    | `circle-user-solid-full.svg`       |
| `WAITING`    | `[-]`    | `circle-half-stroke-solid-full.svg`|
| `DONE`       | `[x]`    | `circle-check-solid-full.svg`      |
| `ARCHIVED`   | `[x]`    | `circle-solid-full.svg`            |

- **Click a checkbox that isn't ticked** to move it on. A checkbox with a status moves to its next status, and one without a status goes straight to `DONE` (or the first `DONE` type status, if the CSV has no status with that name).
- **Ticked checkboxes** can't be clicked. Use the status name or caret instead.
- **Checkboxes with no status** show a caret next to them, so you can give them any status from the CSV.

Changes you make to the markdown files or the CSV appear when you refresh the browser. You don't need to restart the server.

## File layout

```
Help Guide.md          the step by step guide shown in the dashboard
Images/                pictures for [[IMAGE#...]] links, and the logo
Time_Management/       Plan.md, Review.md and Commitments.md
Entities/              a folder for each entity, with tentacles inside
Networking/            Leads.md and Events.md
Labels/                the CSV files behind the Options page
dashboard/
  server.js            tiny HTTP server (Node built-ins only)
  todos.js             finds status-prefixed items in markdown
  document-edits.js    blocks, milestones and single-line text edits
  defaults/Colours.csv the colours a new install starts with
  public/
    setup.html         first-time setup form
    home.html          Home, including the Timeline
    weekly-review.html Review page
    weekly-plan.html   Plan page
    commitments.html   Commitments page
    networking.html    Leads and Events pages
    compatibility.html Compatibility pages
    help.html          Help Guide
    projects.html      projects list
    project.html       project page
    entity.html        owner page
    options.html       options form
    components/        every piece of HTML the scripts render, as named templates
    css/style.css      theme
    img/               icons
    js/projects.js     helpers shared by every page, including the component renderer
    js/markdown.js     markdown renderer + milestone/meta parsers
    js/nav.js          left-hand menu
    js/setup.js        first-time setup form
    js/home.js         Home page
    js/commitments.js  Commitments page
    js/help.js         Help Guide page
    js/list.js         projects list logic
    js/new-project.js  New project form
    js/project.js      project page logic
    js/weekly-review.js Review page
    js/weekly-plan.js  Plan page
    js/history.js      History tab on the Review and Plan pages
    js/edit.js         double-click editing and plus buttons
    js/milestones.js   collapsing and reordering milestones
    js/timeline.js     Gantt chart on the Home page
    js/entity.js       owner page logic
    js/document-view.js parts shared by project and owner pages
    js/networking.js   Leads and Events pages
    js/compatibility.js Compatibility pages
    js/options.js      options page tabs and form
    js/label-tables.js Statuses, Leaders and Colours tables
    js/sidebar.js      todos sidebar
    js/status.js       status name + caret control
```

### How the code is organised

- **HTML** lives in `public/components/*.html`, as `<template name="...">` blocks. A script asks for one by name with `PMS.component('name', { slot: value })`, or `PMS.element` for a live element such as a dialog. Pages load them all through `api/components.js`, so a new or changed template only needs a browser refresh.
- **Slots:** `{{slot}}` is escaped, `{{{slot}}}` is HTML that's already safe, and `{{#if slot}}...{{else}}...{{/if}}` is optional markup. Line breaks and the indentation after them are removed, so a space that matters has to be on the same line as its neighbours.
- **CSS** lives in `public/css/style.css`. The colours come from `Labels/Colours.csv`. Values only known while the page runs, such as where a Timeline bar starts, are passed in as named custom properties like `--from`, and the stylesheet says what to do with them.
- **JavaScript** lives in `public/js`. Anything used by more than one page goes in `js/projects.js`.
