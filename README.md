# Octapu System Dashboard

Version 0.5

A small, self-contained dashboard for the markdown-driven project management system in this folder. Markdown files are the source of truth, so you can keep editing them in any text editor. The dashboard only changes them when you make an edit in it.

- **No build step.** There's nothing to compile or bundle.
- **No dependencies.** It uses only Node's built-in modules, so there's no `npm install` and no `node_modules`.
- **System agnostic.** It runs the same way on Windows, macOS and Linux.
- **Offline.** No CDNs, external fonts or external requests. The one font it uses, Bytesized, ships in `_Dashboard/public/font`.

## First-time setup

1. Install **Node.js 18 or newer** from <https://nodejs.org> (the LTS version is fine).
2. Check it's installed. In a terminal, run:
   ```
   node --version
   ```
   It should print something like `v18.x` or higher.

No packages need installing.

The first time you open the dashboard, a short form asks for your entity's name and ID, your name and a date format. It then creates the CSV files in `_Labels/`, your entity's folder and markdown file, and a `Projects` folder, using sensible defaults for everything else. All of this can be changed later in Options.

The form comes back whenever one of `Status.csv`, `Owners.csv`, `Leaders.csv`, `Options.csv` or `Colours.csv` is missing, or `Owners.csv` has no owner without a `Parent`. It only asks for what's needed and only creates what's missing, so existing files are never replaced.

Each time it starts, the dashboard creates any of these that are missing: the `_Catalogs`, `_Entities`, `_Images`, `_Labels`, `_Networking`, `Projects` and `_Time_Management` folders, starter `_Networking/Leads.md` and `_Networking/Events.md` files, and a blank `_Entities/Reports.md` that each Review adds to. It also copies in `_Help_Guide.md`, the screenshots the guide uses (`_Images/Screenshots`) and a logo (`_Images/Logo.png`) from `_Dashboard/defaults`. The logo is only added if `_Images` has no logo of its own. Anything already there is left alone, so a deleted screenshot comes back but an edited guide is kept. To change what a new install gets, edit the copies in `_Dashboard/defaults`.

A picture named `logo` in `_Images`, such as `_Images/Logo.png`, appears at the bottom of the left menu, with **OCTAPU SYSTEM** beside it in capitals in the Bytesized font, and links to the Dashboard.

## Running the dashboard

From the `Octapu-System` folder, run:

```
node _Dashboard/server.js
```

Then open the address it prints in your browser:

```
http://127.0.0.1:4173
```

Stop the server with `Ctrl + C`.

You can also run it from any directory. Paths are resolved relative to `server.js`, so this works too:

```
node /path/to/Octapu-System/_Dashboard/server.js
```

### Options

You can set these environment variables before running:

| Variable   | Default     | Purpose                                                                                     |
| ---------- | ----------- | ------------------------------------------------------------------------------------------- |
| `PMS_PORT` | `4173`      | Port to listen on                                                                           |
| `PMS_HOST` | `127.0.0.1` | Interface to bind. Keep the default so only this computer can view the dashboard or edit your files through it. |

The syntax depends on your shell:

- macOS / Linux: `PMS_PORT=8080 node _Dashboard/server.js`
- Windows PowerShell: `$env:PMS_PORT=8080; node _Dashboard/server.js`
- Windows cmd: `set PMS_PORT=8080 && node _Dashboard/server.js`

## Task lists

The `TASKLISTS` row in `_Labels/Options.csv` is a comma-separated list of headings, such as `"Tasks,Marketing"`. On entity pages and Ongoing projects, each one gets its own task list box on the Overview, in that order, and is taken off the Scratchpad. A file's `## Heading` for each list is what fills its box, and capitals and extra spaces don't matter. Changes apply on the next page load, with no restart. `Milestones` and `Notes` have their own sections, so they can't be used. If there's no `TASKLISTS` row at all, the dashboard uses `Tasks`.

## How projects are organised

The `PROJECTS` row in `_Labels/Options.csv` says where projects live. It holds a comma-separated list of folder names directly inside `Octapu-System/`, such as `"Projects,Incubator,Merch"`.

A directory can hold both kinds of project. Each file's `**Project Type:**` line decides which kind it is: `Milestone` for a full project with milestones, timeframes and dependencies, or `Ongoing` for a simpler one with a flat Tasks list. See [Ongoing projects](#ongoing-projects). A project with a missing or unknown type shows as a Milestone project and is listed on the Compatibility page.

Every directory gets its own section in the left-hand menu. Changes apply on the next page load, with no restart. A name can't contain a path, and `_Dashboard`, `_Labels`, `_Entities`, `_Networking` and `_Catalogs` can't be used. If there's no `PROJECTS` row at all, the dashboard uses `Projects`.

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

A folder with no markdown file directly inside it, such as one holding only images, isn't treated as a project. The dashboard opens the one whose name matches the title (for example `Project Title.md`), ignoring case and treating underscores as spaces. If none matches, it opens the first `.md` alphabetically, and Compatibility lists the project so you can choose the main file.

## Using the dashboard

### Menu

The sidebar on the left appears on every page:

- **Dashboard:** two tabs, described below. **Overview** shows what matters today, and **Report** charts the figures logged with each Review. The address `?tab=report` opens the Report tab.
- **Incubator:** ideas for projects, described below.
- **Entities:** the top-level owners from `_Labels/Owners.csv`, meaning those with no `Parent`.
- **Time Management:** `Review` and `Plan` are described below. `Review` and `Plan` each turn green in the menu once the number of days set by `ROUNDUP` in `_Labels/Options.csv` has passed since the last entry, or if there's never been one. On the day it's due it says "Due today", and after that it says how overdue it is, such as "Due 2 days ago". For the two days before that it turns yellow and counts down, such as "Due in 2 days".
- **One section per project directory** (`Projects`, for example), in the order `PROJECTS` lists them: `All projects` opens that directory's list, followed by a link to each of its projects with a `+` folder.
- **Archive Index:** after the last project directory, only with `ARCHIVEMODE` set to `HEADERS` while `SHOWARCHIVED` is on. It lists `_Archive.md`, described under Archiving a project.
- **Catalogs:** **All catalogs**, then each catalog by name, described below.
- **Leads** and **Events:** described under Networking below.
- **Compatibility:** `Entities`, `Projects` and `Events`, described below.
- **Options:** tabs for general settings (`_Labels/Options.csv`), statuses, leaders, colours and the review agenda, described below.
- **Help Guide:** a step by step guide to the dashboard, from `_Help_Guide.md` in the main folder, with a numbered contents list under its title linking to each `##` heading. A link written as `[text](#heading-name)` goes to a heading on the same page, and stays in the same tab. Select a screenshot to see it full size in a popup, and select it again, or press Escape, to close it. Edit that file and refresh to change it. Until it's marked as read, the menu link has a green outline. The **Mark as read** checkbox below the guide is the `- [ ] Mark as read` line at the bottom of the file, which ticking it changes. If the line is missing, ticking the box adds it.

### Overview tab

- **Tiles:** **Scheduled Projects**, the number of projects in a timeframe today, comes first. Then **Open projects** and **Inactive projects**, the number of active and inactive projects across every project directory, how many days until the next Review and Plan are due, and the number of overdue tasks. Review and Plan use the `ROUNDUP` number of days from `_Labels/Options.csv`.
- **Timeline:** a Gantt chart that scrolls sideways, with one bar per timeframe in each project's `Active Timeframe`, accurate to the month. Each bar is graded through the project's milestones from left to right, using the same colours as the milestone progress bar. A project with no milestones is `N/A` in the key. Tick boxes above the chart show or hide **Active** and **Inactive** projects and the **Deadlines**, **Bookings** and **Releases** lines, and are remembered in the browser. While `SHOWARCHIVED` is on, archived projects are charted too, in the complete colour, `green`, with an **Archive** box to hide them. An event's Application Deadline is a cyan line until it's been applied for or booked. Its Event Date is a purple line once it's booked, and grey before that. An event of several days has a line at each end, with a paler band between. Point at a line to see the event. Each catalog record with a readable `Release date` is a line in the `text` colour (white on the dark theme). Pointing at it shows a card with the record's `Image` (an `[[IMAGE#...]]` value), `Title` and date, opening to the left near the chart's right edge. Timeframes that aren't written as `YYYY-MM-DD` are listed above the chart. **3 months**, **6 months** and **12 months** set how many months fit across the chart, and the choice is remembered in the browser. It opens at 6, with last month at the left. A row only shows while one of its timeframes is within two months of the months on screen, so scrolling sideways shows and hides rows and the chart only grows as tall as the stretch of time being looked at. If nothing is near, a line above the chart says so. Arrows are only drawn between rows on screen. A chart taller than 12 rows scrolls up and down, with the year and month headings staying in view.
- **Current plan** shows the newest entry in `_Time_Management/Plan.md`, while it's less than `ROUNDUP` days old. After that it links to the Plan page instead.
- **Due in the next 7 days** and **Overdue tasks** list open tasks with a `DEADLINE` or `SCHEDULED` date, from every non-archived project and every entity, soonest first. If a task has both, the deadline counts. Finished, archived and cancelled tasks are left out, and today counts as due, not overdue. Its status can be changed right there.
- **Priorities this month** lists Milestone projects with a timeframe that includes today, and their progress.

### Review

**Projects to review** and **Entities to review** list every non-archived project and every entity with no `Date Reviewed`, or with `**Flagged for Review**: Yes`. The flag button in the Reviewed box on a project or entity Overview adds that line under Date Reviewed, or takes it away. A link opens that page in an overlay, where it can still be edited. **Mark as reviewed and close** sets `Date Reviewed` to today and removes any Flagged for Review line, and **Close** leaves it on the list. This is the only way to set the date in the dashboard, and project and entity pages show it read-only. Beside Review in the menu, a green circle counts the items in **Done since the last review**, below, and the next two numbers count these lists: cyan for projects and purple for entities.

Lists every `DONE` type item in non-archived projects, Ongoing ones included, in entities and tentacles, and under a Leads contact or an Events entry, that was closed since the last review, with one box per status. Reviews are logged in `_Time_Management/Review.md`, newest first, under a `## YYYY-MM-DD` heading, and the latest heading sets the date of the last review.

- **Add to wins** adds that box's items to the wins text as bullet points, and removes the box.
- **Submit** logs the wins under today's date and moves every `DONE` type item in all of those to the first `ARCHIVED` status, including any closed before the last review. The text can't be empty. It also adds a report to `_Entities/Reports.md`, described under **Report tab**. If any file can't be written, the ones already changed are put back.

#### Review agenda

Below the two boxes are cards from `_Time_Management/AgendaItems.csv`, edited on the Options page's **Agenda** tab. Its columns are `Type,Item,Checked`, and spaces around a value are ignored.

- **`text`** items are listed together, in file order, on an **Additional Agenda Items** card, rendered as markdown so links work.
- **`rule`** items each get a card, in file order:
  - `[[REVIEW|Dashboard]]` links to the Dashboard's Overview ("Review Dashboard"). It's checked before entity IDs, ignoring case, so an entity with the ID `DASHBOARD` can't be reviewed on its own.
  - `[[REVIEW|ID]]` lists one entity or tentacle ("Review Entity: <name>").
  - `[[REVIEW|ID#Title]]` lists one non-archived project, matched as a Project Dependency is: the owner ID and title, ignoring case and spacing ("Review Project: <title>").
  - `[[REVIEW_ALL|Group]]` lists a group ("Review All …"). Groups are `Entities` (top-level), `Tentacles` (every owner with a parent) or `Tentacles#ID` (every owner under that one, at any depth), `Active`, `Inactive`, `Scheduled` (planned projects with an Active Timeframe running today), `Deadlines` (events not yet applied for or booked, with an Application Deadline from today on), `Bookings` (booked events not yet over), `Incubator` (ideas with no Archived or Promoted date, linking to the Incubator), `Catalogs` (each catalog with its record count, linking to its table), or a `PROJECTS` directory name (every non-archived project in it). Group names ignore case, and win over a directory of the same name, so a `PROJECTS` directory can't be called one.
  - A rule that can't be read, or names something that doesn't exist, still gets its card, saying what's wrong.
- Projects and entities on a card open the same overlay as the boxes above. Each shows its `Date Reviewed`, and is dimmed when that's on or after the last review's date. The card's number counts those out of its total. Other rows are links, with a date or note: events to their entry on the Events page, ideas to the Incubator, catalogs to their table. Those cards' number counts the links.
- **`Checked`** is `true` or `false`, and a new row starts `false`. The tick box on each card and each text item sets it, and submitting the review sets every row back to `false`. The Agenda tab doesn't show it, and its edits leave it as it is. Saving checks the row is still the one shown, by its place and item, so a file edited elsewhere isn't overwritten.

Both Review and Plan have a **History** tab, showing their log file as one card per date.

### Plan

Offers everything that hasn't been assigned yet, with one box for each source: anything in an `UNASSIGNED` type status, and any unticked checkbox with no status. The boxes cover milestone items in active projects, then every task and status-tagged line in each entity and tentacle, then tasks under a Leads contact or an Events entry. Each item shows its milestone, heading, contact or event beside it. Every box, in this list and in **Focus**, has an arrow to collapse it, remembered in your browser.

- A project with a timeframe that includes today is highlighted and tagged **Suggested**. The colour is `cyan` in Options > Colours.
- An item is highlighted if it's the only incomplete item left in its milestone, in the colour `yellow`. Waiting items count as incomplete, as they do on the milestone progress bars. Cancelled items don't.
- Click an item to move it to the **Focus** list below, where its status and priority can be set as on a project page. The items you pick are remembered in your browser until you submit them.
- Every item on this page with an `ASSIGNED` type status is in the **Focus** list automatically, after anything you've picked. It has no Remove button, and leaves the list when its status changes.
- **Submit focus** logs the list in `_Time_Management/Plan.md`, newest first, under today's date, as an outline of owner (by `Name` from `_Labels/Owners.csv`), then project, then items, with no status tags. Entities and tentacles are listed under their top-level entity, and Leads and Events under `Networking`.

### Report tab

Each Review adds a report to `_Entities/Reports.md`, newest first, under a `## YYYY-MM-DD` heading. A second review on the same day replaces that day's report. The figures are measured just before the review archives anything. The review period runs from the last review to today, or covers the last `ROUNDUP` days for a first review.

```
## 2026-11-10
- Tasks completed: 9
- Assigned tasks: 3
- Waiting tasks: 0
- Unassigned tasks: 0
- Overdue tasks: 1
- Active projects: 2
- Stalled projects: 1
- Scheduled projects: 1
- Plan focuses: 3
- Plan focuses done: 0
- Wins logged: 3
```

- **Tasks completed:** the `DONE` type items the Review page lists, closed since the last review.
- **Assigned, Waiting and Unassigned tasks:** rows with a status of that type, in non-archived projects, entities and tentacles, that aren't cancelled or ticked. Checkboxes with no status aren't counted, so a to-do list in a note doesn't swell the numbers until its items are given a status.
- **Overdue tasks:** open tasks whose `DEADLINE`, or else `SCHEDULED` date, is before today, as on the Overview.
- **Active projects:** non-archived projects whose folder starts with `+`.
- **Stalled projects:** active projects with nothing finished in the period.
- **Scheduled projects:** Milestone projects of any status, as on the Timeline, with an Active Timeframe that overlaps the period.
- **Plan focuses** and **Plan focuses done:** the items in the latest Plan, and how many are done: a task with that text finished, or a milestone of that name with nothing left in it. Both are `-` when no Plan was made since the last review.
- **Wins logged:** the lines in the wins text submitted with the review.

The file can be edited by hand. Lines it doesn't recognise are skipped, and a figure written as `-` is left out of the charts. The file is never flagged on Compatibility.

The **Report** tab draws the file:

- **Tiles:** the latest figures and how each moved since the review before. The arrow shows the direction, and green or pink shows whether that's good.
  - **Tasks completed**, **Stalled projects** and **Overdue tasks** as logged.
  - **Reviews to clear open tasks:** the open tasks divided by the average completed over the last four reviews.
  - **Plan follow-through:** how many of the latest Plan's focuses are done, such as `3 of 4`.
  - **Review streak:** reviews in a row, each within `ROUNDUP` days of the one before.
- **Task flow:** across the full width, a column per review with the tasks completed in that period at the bottom, and the assigned, waiting and unassigned tasks still open at the review stacked above them. A line shows how many are overdue.
- **Plan follow-through:** the share of the Plan's focuses done, as a column per review.
- **Wins logged:** a column per review.
- **Every report:** a table of every figure, newest first, including Active and Scheduled projects, which have no chart of their own.

Point at or tab to a chart to show a line across it at that review, with every value it shows. The charts take their colours from `_Labels/Colours.csv`, matching what each colour means elsewhere: green for done, orange for assigned, yellow for waiting, grey for unassigned and pink for overdue.

**Generate report** saves a single HTML file, named with today's date, holding the Overview and Report tabs as they look at that moment. The table of every report stays on the tab and isn't included. The styles and icons are inside it, so it opens in any browser with the dashboard closed, and can be emailed or kept. Links, menus, hover readouts, the add, drag and collapse buttons, and the Timeline's tick boxes and zoom buttons are left out, as they only work inside the dashboard. The Timeline in the file shows every row, not only those near the months on screen. Printing it, including to PDF, uses dark text on white, from the `print-` colours in `_Labels/Colours.csv`, and shows the whole Timeline.

### Archiving a project

The **Archive** button at the top of a project page asks first, then sets the project's `**Date Closed**:` to today. A project with any Date Closed counts as archived, whatever its folder is called. It's hidden from the Dashboard, the menu, the projects list, the Todos sidebar, Review and the Timeline's Active and Inactive rows, even when `SHOWARCHIVED` is on. What else happens depends on `ARCHIVEMODE` in `_Labels/Options.csv`:

- **`HEADERS`** (the default) copies the project's header into `_Archive.md` in the main folder, and leaves its folder alone. This is for a folder you'll move off this computer, to a NAS say, while Syncthing shares the record:

  ```
  ## LABEL Design A New Logo
  **Date Created**: 2026-11-10
  **Date Closed**: 2026-11-17
  **Active Timeframe**: 2026-11-10 to 2026-11-30
  **Project Dependency**:
  **Owner** : #Hexajessimal
  ```

  The Timeline's Archive rows come from this file, and folders whose names start with a date are ignored. The projects list has no Archived filter. Instead, while `SHOWARCHIVED` is on, **Archive Index** in the menu lists the file, newest first. Its plus button adds an entry by hand, asking for the entity and title, then optionally Date Created, Date Closed, a timeframe, a Project Dependency and an owner. The minus button on an entry removes it from the file after asking. Double-click an entry's name or one of its fields to change it, as written in the file (dates as `YYYY-MM-DD`). A field the entry hasn't got is added in **Raw**, which shows and edits the whole file, as on a project page. In multi-user mode there's a **Changelog** tab too.

  An entry's title is written like a project's name, so a project, or another entry, can depend on it. Its Project Dependency list includes the archive's entries, marked (archived), and the Timeline draws arrows to and from them.
- **`FULL`** also renames the folder to start with today's date, such as `2026-11-17_LABEL_Design_A_New_Logo`, and writes nothing to `_Archive.md`. The Timeline's Archive rows come from those folders and any project with a Date Closed, and while `SHOWARCHIVED` is on the projects list's **Archived** filter lists those folders.

### Incubator

Ideas for projects, kept in `_Incubator.md` in the main folder, one card each. The plus button asks for a title, an entity, a Project Dependency and notes, and adds the idea at the end of the file, creating it if needed:

```
## LABEL Merch Line
**Project Dependency**:

T-shirts first, then hoodies.
```

- **Promote to Project** asks for an Active Timeframe and an owner from `_Labels/Leaders.csv`, and for a directory if `PROJECTS` names more than one. It creates a Milestone project as **New project** does, with the timeframe, dependency and notes filled in, then opens it. The idea gains `**Promoted**: <date>`.
- **Archive Idea** asks first, then adds `**Archived**: <date>`.

Either date hides the idea, which stays in the file. Notes can't hold `#` headings, which would start a new idea.

### Compatibility

**Entities**, **Projects** and **Events** list everything whose markdown doesn't yet fit the dashboard, and why. Only a field's label is needed, not a value. Links open the page so it can be fixed. The lists are worked out fresh each time.

Each issue is coloured by what can be done about it:

- **Accent colour:** a missing field, heading or entity file. These can be fixed automatically, and the box has a **Fix issues** button.
- **Error colour:** anything else in the file that needs changing by hand, such as a value that isn't recognised.
- **Orange** (`orange` in Options > Colours): a file or folder that isn't where it's expected to be.

**Fix issues** only adds what's missing to the file being checked, and leaves everything else in it alone. Fields are added with no value, after the last field at the top of the file, and headings go at the end. A missing entity file is created like a new one, with today's date. A missing `**Project Type:**` is written as the type of the project the file is in, which is `Milestone` for a project with none. A missing, empty or unknown `**Owner**` gets an **Owner** dropdown in the box. With one person in `_Labels/Leaders.csv` they're filled in automatically. With more, choose someone or leave it for now, and a missing field is added blank.

A project with no file named after its title gets a **Main file** dropdown, set to the file it's using for now. Fix issues renames the chosen file to `Title.md` (with its change logs, so its history follows it) and then fixes that file. It won't rename a file over one that already exists.

An entity needs a `#` title, `**Date Created**:`, `**Date Reviewed**:` and a `##` heading for each entry in `TASKLISTS`. It's also listed if its folder or its parent isn't in `_Labels/Owners.csv`, if it has no markdown file, or if its file isn't named after its `Name`.

**Projects** covers every directory in `PROJECTS`, and also lists a directory named there that doesn't exist or can't be used. Every project needs a `**Project Type:**` of `Milestone` or `Ongoing`. Ongoing projects aren't asked for `**Project Dependency**:`, `**Active Timeframe**:`, `## Milestones` or `## Notes`. They need a `##` heading for each entry in `TASKLISTS` instead.

A project needs a folder and page title starting with an `id` from `_Labels/Owners.csv`, an `**Owner**` whose value is a `Tag` from `_Labels/Leaders.csv`, the fields `**Date Created**:`, `**Date Reviewed**:`, `**Date Closed**:`, `**Project Dependency**:` and `**Active Timeframe**:`, and `## Milestones` and `## Notes` sections. The colon can sit inside or outside the bold, and `**Created:**` counts as Date Created.

Every markdown file directly inside a project or entity folder is checked, each in its own box with its name shown. A file beyond the main one is held to the same rules if it uses any of the dashboard's fields, a `## Milestones` section or a `TASKLISTS` heading. Otherwise a project's extra file is left alone, as notes and other documents belong in a project folder too, while an entity's is flagged in orange as **Unknown markdown**. So is any markdown loose in a directory named in `PROJECTS` or in `_Entities/`, apart from `_Entities/Reports.md`. Markdown in subfolders of a project isn't looked at, so a project can keep things like code libraries and their documentation.

### Catalogs

Each catalog is a CSV file in the `_Catalogs` folder, named after its tag and name with underscores for spaces, such as `_Catalogs/RLS_Record_Label_Studios.csv`. Other files in the folder are ignored.

- **All catalogs** lists every catalog with its tag and how many records it holds. The plus button asks for a name and a tag of 2 or 3 letters, suggested from the name's initials, then creates the file and opens it. A tag can only be used by one catalog, and a name can't contain `\ / : * ? " < > |` or `_`.
- **A catalog** is a table of its records. A new catalog has the columns **Catalog #**, **Image**, **Owner**, **Title**, **Medium** and **Release date**, and any column added to the file by hand appears too.
  - Double-click a value to change it. Enter saves and Escape cancels.
  - The plus button opens a blank record at the bottom of the table, with the next catalog number filled in: the tag and one more than the highest number so far, such as `RLS003`. Tab moves between the fields. Return saves it and opens another, until Escape stops. A record with nothing typed is removed without saving.
  - The minus button at the end of a row deletes the record after asking.
  - A catalog number can't be used twice in one catalog.
  - Values show as inline markdown, so `[[IMAGE#Octapu/cover1.png]]` shows that picture from `_Images` and links work.
  - A column with "date" in its name, such as **Release date**, is shown and typed in your `DATEFORMAT`, and stored as `YYYY-MM-DD`.

### Networking

Each page has three tabs. The first lists entries as cards, **Scratchpad** shows everything else in the file, edited as on a project page, and **Raw** shows and edits the whole file.

**Leads** lists each `###` entry under `## Contacts` in `_Networking/Leads.md`, with the fields Contact Details, Links, Events & Associations and Notes. `**Events**` also counts as Events & Associations, and any label ending in Notes, such as `**Octapu Notes**`, counts as Notes and keeps its own name.

**Events** lists each `####` entry in `_Networking/Events.md` in two lists, whatever the file's own `##` headings: **Upcoming Events**, soonest first with undated ones last, and **Past Events**, most recent first, once the Event Date's last day has gone by. Its fields are Artist/s, Application Deadline, Event Date, Application Submitted, Booking Confirmed, Venue, Main Contact, Details, Payment and Tasks.

- **Event Date** and **Application Deadline** are picked from a calendar with the pencil or plus button, and written on one line as `**Event Date**: 2026-07-25`. An Event Date can have an end date too, for an event of several days: `**Event Date**: 2026-09-11 to 2026-09-13`. Clearing both dates leaves the field empty. Dates show in the `DATEFORMAT`.
- **Application Submitted** and **Booking Confirmed** are tick boxes, written as `**Application Submitted**: Yes` or `No`. A card's border turns `cyan` once it's applied for, and `purple` once it's booked, matching the Timeline.
- Filters at the top, **All**, **Not applied**, **Applied** and **Booked**, show events by how far they've got, with a count beside each. Applied means applied for but not yet booked. The filter is kept in the address as `?filter=`.

A date the dashboard can't read is shown in `pink`. **Compatibility > Events** converts dates written by hand, and lists what it can't.

A field is a line holding just that bold label, and its value is the text up to the next field. Double-click a value or an entry's name to edit it. A field the entry doesn't have yet is added the first time you fill it in. Any text before the first field has its own area at the top of the card. Other bold text, such as `**Parking**` inside Details, stays part of the value.

The plus button adds an entry, at the end of the file's last heading on the Events page, and the minus button on a card deletes it after confirming. The `---` lines around an entry stay in the file. Statuses and checkboxes work as they do on project pages, but these files aren't listed in the Todos sidebar. Tasks under a contact or an event do appear on the Plan and Review pages.

A reference in double square brackets becomes a link wherever it appears in the dashboard, and the entry it points to is scrolled to and outlined. `[[Leads#Scheme Boy (Varispeed)]]` links to that heading in `Leads.md`, and `[[Events#Infest|the gig]]` shows "the gig" as the link's text. On a Networking page, `[[#Brawny]]` with no file name looks on that page first, and then on the other one. A name also finds a heading that adds something in brackets, so `Scott` finds `Scott (SWOLE)`. 

A reference starting with an `id` from `_Labels/Owners.csv` links to that owner's page. `[[FISTING]]` opens its Overview, `[[FISTING#Tasks]]` goes to that task list on the Overview if `Tasks` is in `TASKLISTS`, and any other heading, such as `[[OCTAPU#Dates of Note]]`, opens its Scratchpad at that section. If the heading isn't found, the page opens and shows a short message. IDs are case-sensitive, so `FISTING` links and `Fisting` doesn't. The list of IDs is re-read each time a page loads.

A reference that is a project's name, its owner ID and title as used for a Project Dependency, links to that project. It's checked before owner IDs, and capitals and extra spaces don't matter. `[[LABEL Design A New Logo]]` opens its Overview, a milestone heading such as `[[LABEL Design A New Logo#Final Proof]]` (or a task list on an Ongoing project) opens the Overview with that card expanded, scrolled to and outlined, and any other heading opens its Scratchpad at that block. Archived projects aren't linked.

`[[IMAGE#Screenshots/01-RunServer.png]]` shows that picture from the `_Images` folder, kept to a size that fits the page. It can be `.png`, `.jpg`, `.gif` or `.webp`.

Any other reference stays as plain text.

Until it's converted, a hand-written Event Date is read day-first, as `25.07.26`, `31.10.2026`, `11-13.09.26` or `14.05.2027 - 17.05.2027`, or as `2026-07-25` or `23rd-24th July 2027`, with the last date deciding when it's past. `In the past` counts as past. On **Compatibility > Events**, Fix issues renames `**Date**` to `**Event Date**`, converts any of those forms, turns `TBD` or `TBC` into an empty date, and adds missing fields, with the tick boxes set to `No`. A date followed by more text, such as a time, or words like `In the past`, are listed for you to change.

### Options

**General** edits the values in `_Labels/Options.csv`, including the `PROJECTS` directory list. `SHOWARCHIVED`, `SYNCCONFLICTS` and `MULTIUSER` are tick boxes, and `ARCHIVEMODE` is a dropdown of `HEADERS` or `FULL` (see Archiving a project). They're always listed, even if the file doesn't have them yet.

#### Working as a team

Octapu doesn't copy files between computers. Keep the folder in sync with Syncthing, and run the dashboard on each computer.

- **`SYNCCONFLICTS`**: when Syncthing keeps two versions of a file, it names the other one like `Plan.sync-conflict-20261117-101500-ABCDEF7.md`. With this on, a **Sync conflict** box at the top of the project, entity, Leads or Events page shows how the two differ. **Keep current** deletes the copy. **Use this version** saves the copy over the file, then deletes the copy. Conflict copies are never listed as project or entity files.
- **`MULTIUSER`**: each page asks you to log in first, by choosing your name from `_Labels/Leaders.csv`. Your choice is kept in a browser cookie, and **Log out** sits at the bottom of the left menu. There are no passwords, because this identifies who made a change rather than securing anything. Every markdown change made through the dashboard is added to a log next to the file, named `<file name>-change.<computer name>.log`. The computer name is the server's hostname. There's one log per computer, so Syncthing never sees two machines writing the same log. Each log entry has the time, user and computer, then one line per changed line: `+` added, `-` removed, `~-` changed from and `~+` changed to, each with its line number. Entries older than twice `ROUNDUP` days are removed whenever the log is written. The **Changelog** tab on project, entity, Leads and Events pages merges every computer's log for that file, newest first. Changes made in other apps aren't logged.

##### Recommended Syncthing setup

The system works best combined with Syncthing, especially with `ARCHIVEMODE` set to `HEADERS`. Our recommended setup keeps the whole Octapu-System folder on a NAS drive or local server, shared as the primary **Send & Receive** folder, with these ignore patterns set on the NAS only (Syncthing's **Ignore Patterns** tab, saved as `.stignore`). Syncthing never sends an ignored file, so each computer only ever receives the files the patterns allow, without needing patterns of its own. Don't add the patterns to the computers as well, and connect each computer to the NAS rather than to each other, as computers sharing directly would sync everything between them.

Sync every file of active projects, but only the markdown files of inactive ones, to save local disk space. These two lines need repeating for each project directory if `PROJECTS` names more than one:

```
!/Projects/+*
!/Projects/-**.md
```

Include all the system's own files and folders, which all start with an underscore:

```
!/_*
```

Finally, ignore everything else:

```
*
```

The order matters, because Syncthing uses the first pattern that matches, so keep `*` last. The whole file:

```
!/Projects/+*
!/Projects/-**.md
!/_*
*
```

Once a project's header has been archived (the **Archive** button in `HEADERS` mode), rename its folder **on the NAS** from `+OWNER_ProjectTitle` to `YYYY-MM-DD_OWNER_ProjectTitle`, using the archive date. The NAS then ignores it, so the computers delete their copies and the NAS keeps the folder. Don't rename it on a computer: the NAS would receive the old folder's deletion but ignore the new name, and lose the project.

**Statuses** and **Leaders** list `_Labels/Status.csv` and `_Labels/Leaders.csv`. Double-click a value to change it, use the plus button to add a row, and the minus button at the end of a row to delete it after confirming. If a file doesn't exist, adding the first row creates it. Any other rows or columns in the files are kept.

- **Status names** are always uppercase, and can use letters, numbers, hyphens and underscores.
- **Next status** offers every status, including defaults for any type with no row of its own. `Automatic` leaves it blank, which moves to the first status of the next type. Renaming a status updates any `Next` pointing to it, and deleting one clears them.
- **Leader tags** can't be edited. A tag is `#` followed by the name with any punctuation removed, and it changes with the name.

**Agenda** lists `_Time_Management/AgendaItems.csv`, edited in the same way, and creates it with its first row. **Type** is `text`, `REVIEW` or `REVIEW_ALL`: a rule `[[REVIEW|LABEL]]` is shown as the type `REVIEW` and the item `LABEL`, and saved back in that form. For a rule, **Item** is a dropdown of every target the type allows: `Dashboard`, each owner ID and each non-archived project (`ID#Title`) for `REVIEW`, and each group, `Tentacles#ID` for each owner with tentacles, and each `PROJECTS` directory for `REVIEW_ALL`. A target that no longer exists stays in its row's dropdown. Changing a rule's type picks the first target of the new type, and changing it to `text` keeps the target as the text. The Checked column isn't shown.

**Colours** lists every colour on the dashboard, from `_Labels/Colours.csv`, with what each is used for. The list is kept short, so one colour often has several uses, and changing it changes all of them. Double-click a colour to change it. It takes a 6 character hex value, with or without the `#`, and the new colour shows straight away. Paler tints of a colour, such as the current month on the Timeline, are worked out from it. Status and priority tags use the same colours everywhere, including on highlighted items in the Todos sidebar. The `print-` colours are only used when a generated report is printed.

You can also edit the file by hand and refresh the page. The `Name` of each row is how the stylesheet finds it, so it needs to stay as it is. A row that's missing, or whose value isn't a 6 character hex value, uses the built-in colour from `public/css/style.css`. Pale page backgrounds may leave parts the browser draws itself, such as scrollbars and dropdown lists, dark, because the dashboard declares a dark colour scheme.

Status names and leader tags are written into your markdown files. Renaming or deleting one here only changes the CSV, so rows and `Owner` lines still using the old value stop matching until you change them.

### Entity folders

Each owner has a folder named after its `id` inside `_Entities/`, nested inside its parent's folder when it has a `Parent`. For example, `_Entities/OCTAPU/PIXELGRINDER/Pixelgrinder.md`. The markdown file is named after the owner's `Name`; if there's no file with that exact name, the first markdown file in the folder is used. An owner whose `Parent` isn't in the CSV is left out.

Each top-level entity has one page, with a tab for itself and a tab for each owner under it. The tabs are coloured by level, using the priority colours: the top-level entity like priority A, the level below like priority B, the third level orange, and anything deeper grey. The Overview's facts show **Created**, **Reviewed**, **Incomplete tasks** and **Parent**, which links to the parent's tab, or says **None (top level)**.

- **Plus tab:** asks for a name and an ID, then creates the folder and markdown file and adds the row to `_Labels/Owners.csv`. The new file has `Date Created` set to today, `Date Reviewed`, `## Notes` and a heading for each entry in `TASKLISTS`, so it passes the Compatibility check. The ID is suggested from the name. It can use letters, numbers and hyphens, and can't match an existing `id`.
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
- **Archive**, at the top of every tab until the project is archived, archives it after asking. See Archiving a project.
- **Project type** is shown at the top of every tab, and the dropdown changes it. Changing it rewrites `**Project Type:**` in the project's main file and renames its heading to match: `## Milestones` becomes the first heading listed in `TASKLISTS`, and that heading becomes `## Milestones` going the other way. Nothing else in the file changes. A file with both headings is left alone until one is renamed. Items under a `## Milestones` heading only appear on the Overview if they're under a `###` milestone heading.
- **Overview** is the default tab, and shows:
  - a summary card: the title with its status tag, then a three by three grid. Owner and Project Dependency share the first row, Created and Reviewed the second, and Milestones and Closed the third, with the list of active timeframes down the right of all three. Any other `**Key**:` fields in the file follow below, then overall task progress. On a narrow screen the grid drops to two columns, with the timeframes below.
  - a milestone progress bar with one segment per `###` heading under `## Milestones`:

    | Colour | Meaning                                    |
    | ------ | ------------------------------------------ |
    | Green  | every checkbox under it is ticked          |
    | Yellow | some checkboxes are ticked                 |
    | Orange | there are checkboxes but none are ticked   |
    | Pink   | Unplanned: there are no tasks yet          |

  - a card for each milestone.
  - plus buttons to add a milestone, or a checkbox to a milestone. See **Adding with a plus button** below.
  - a grey menu button on each milestone:
    - **Promote to new project** creates a Milestone project in the same directory, titled after the milestone, with the same entity and `**Owner**`, today's Date Created and a Project Dependency on this project. The milestone's lines go under `### Milestone 1`. The milestone is then removed from this file and the new project opens. It needs this project's main file and Owner, and a project with that entity and title mustn't exist.
    - **Mark all as done** moves every open, uncancelled row in the milestone to the first `DONE` status, adding `CLOSED` stamps as a status change does.
    - **Delete** removes it after asking. Its heading and everything under it go, up to the next milestone. Nothing else in the file changes.
  - an arrow to collapse each milestone, remembered in your browser, and a dotted handle to reorder them. Green milestones start collapsed each time the page loads. Drag the handle, or focus it and press the up and down arrow keys. Reordering moves the milestone in the file.
- **Scratchpad** shows everything in the file except the header fields and the Milestones section, as one block per `#` or `##` heading. The plus button adds a block at the end of the file. A block can't be called `Notes` or `Milestones`.
- **Raw** shows the whole markdown file, nicely rendered, on project, entity, Leads and Events pages. Double-click it to edit the file's markdown in one text box. Ctrl+Enter saves and Escape cancels. If the file has changed since the page loaded, nothing is saved. A project or entity folder with more than one markdown file gets a tab for each file above the content, on every tab of the page, with the main file first. The plus button at the end of that row adds a new file, with the fields and headings a project file needs, and opens it.

**Adding with a plus button:** the plus buttons for milestones, a milestone's checkboxes and task list boxes don't open a popup. A blank row appears where the new one will go, already in edit mode, with **Press Esc to abort** under it. Type and press Return to save it, and another blank row opens below so you can keep adding. Press Escape to stop and remove the blank row. A blank row that is left empty, by pressing Return or clicking elsewhere, is removed without saving anything. A collapsed milestone opens while you add to it. The plus buttons for scratchpad blocks, files and entries still use a popup.

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

The sidebar on the right lists every line, in the markdown files of all non-archived projects and every owner in `_Labels/Owners.csv`, that starts with a status named in `_Labels/Status.csv`. The CSV needs `Type` and `Name` columns, and uses `Next` for status changes. Items in archived project folders never appear, whichever filter is selected.

Status names come only from the CSV, which is re-read on every page load, so you can add, rename or remove them at any time. Status types are fixed: `UNASSIGNED`, `ASSIGNED`, `WAITING`, `DONE` and `ARCHIVED`. CSV rows with any other type are ignored. If the CSV is missing, or has no status for a type, a status named after that type is used instead.

When a row enters a `DONE` type status through the dashboard, it gets a `CLOSED` date and time on the line below it. Moving between two `DONE` type statuses keeps the original date.

- Markdown line openers are skipped before looking for the status: indents, `>` quotes, `#` headings, `-` `*` `+` bullets, numbered lists, `[ ]` / `[x]` checkboxes, and bold or italic markers. So `- [ ] **JESSIE** book the venue` counts as `JESSIE`.
- Statuses are case-sensitive whole words: `JESSIE` matches, `Jessie` doesn't.
- Ignored: `<!-- HTML comments -->`, `%% Obsidian comments %%`, `#+BEGIN_COMMENT` blocks, fenced code, and struck-through lines.
- **Filter**: five dropdowns, laid out in two columns with **Sort**. Each opens a list of tick boxes, and you can tick as many as you like. A row shows if it matches any ticked choice in a dropdown, and passes every dropdown.
  - **Type:** the status types. Every type is ticked except `ARCHIVED`, so archived items only show when you tick it. Unticking every type shows nothing.
  - **Status:** statuses from `_Labels/Status.csv`.
  - **Priority:** `A`, `B`, `C`, or **None** for rows without one.
  - **Entity:** the top-level entity in `_Labels/Owners.csv` a row belongs to. A project counts under the owner in its title or folder name, and a tentacle's rows count under its top-level entity. A project whose folder isn't named `OWNER_Title` and whose owner isn't known doesn't appear under any entity.
  - **Project:** projects. It lists only projects with items of a ticked type, and only the ticked entities' projects when any are ticked.

  Each choice shows how many rows it would leave, alongside the other filters. The button shows what's ticked. In Status, Priority, Entity and Project, ticking nothing means **All**. **Show all** at the top of a list ticks every type, or clears the other dropdowns back to All. A click outside, or Escape, closes the list.
- **Sort** by project order, status, status type, or bring any one status or type to the top. Status order follows the CSV.
- `DONE` type statuses always sit at the bottom, below a dividing line, however the list is sorted.

Your filter and sort choices are remembered in the browser.

Each row's outline shows how it relates to the newest dated entry in `_Time_Management/Plan.md`:

| Outline    | Meaning                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Purple     | its project is in the focus, and the focus names this row or the `###` milestone it sits under           |
| Cyan       | its project is in the focus, but this row isn't named                                                    |
| None       | its project is active, but not in the focus                                                              |
| Pink       | its project isn't active                                                                                 |

The focus is read as an outline of owner, then project, then items, so hand edits work as long as they keep that nesting. Names are compared without regard to capitals.

### Archived items

A row with an `ARCHIVED` type status, and anything nested under it, is hidden everywhere, unless `SHOWARCHIVED` is on (see below). On a milestone it still counts as a finished task, and a milestone with only archived checkboxes shows as complete and says **Milestone complete**. Task lists on entities and Ongoing projects leave archived rows out of their progress. It only appears in the Todos sidebar when `ARCHIVED` is ticked under Type in Filter, and in the text box when you double-click a file's **Raw** tab to edit it.

`SHOWARCHIVED` in `_Labels/Options.csv` keeps archived rows visible on project, entity, Leads and Events pages, with their archived icon. It's `TRUE` or `FALSE`, shown as a tick box on the Options page, and is off if the file doesn't have it. Ticking it and saving adds the row to an older file. Progress counts don't change, and the Todos sidebar still uses its own Filter.

### Changing a status

Every highlighted status, in the sidebar and on project pages, has a name and a small caret. Either one rewrites that keyword in the markdown file straight away:

- **Click the caret** to pick any status from the CSV.
- **Click the name** to move to the next status. That's the status in the CSV's `Next` column, or if that's blank, the first status of the next type: `UNASSIGNED` → `ASSIGNED` → `DONE` → `ARCHIVED`, with `WAITING` also moving to `DONE`. The last status of the sequence has nowhere to go, so its name can't be clicked.

The dropdown lists the statuses without type headings. Each shows its type's icon and colour, with a thin line between types. At the bottom:

- **Schedule** and **Deadline** ask for a date and add a `SCHEDULED: <2026-08-13 Thu>` or `DEADLINE: <2026-08-20 Thu>` line below the row, shown under the todo. Choosing one again changes the date, and clearing the date removes it. Every date field has a calendar button, or you can type the date in your `DATEFORMAT`.

### The task menu

Every task row, on document pages and in the Todos sidebar, ends with a grey menu button:

- **Cancel** strikes the whole row through, status included, and unticks its checkbox: `- [ ] ~~JESSIE Book the venue~~`. It then drops off the todo list and out of milestone progress.
- **Delete** asks you to confirm, then removes the row and any `CLOSED`, `SCHEDULED` or `DEADLINE` lines directly below it. Rows nested under it are kept.
- **Move to** (tasks in a Milestone project's milestone) lists the other milestones. The row, the rows nested under it and their planning lines move to the end of the chosen milestone, de-indented to the top level.
- **Promote to new milestone** (the same tasks) removes the row and its own planning lines, adds a `###` milestone named after its text at the end of `## Milestones`, and puts the rows nested under it there, de-indented.
- **Create linked Scratchpad block** (project and entity pages) adds a `## <task text>` block at the end of the file and rewrites the task's text as `[[<project name or entity ID>#<text>|<text>]]`. It's hidden when that block already exists or the text holds a `[[` link, and refused if the text contains `#`, `|`, `[` or `]`.

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

- **Title:** the first `#` heading is the page title, and it's never listed as a todo. If it starts with an `id` from `_Labels/Owners.csv`, the dashboard shows that owner's `Name` with a dropdown for choosing another. The file keeps the `id`.
- **Date Reviewed:** a single date, shown read-only and set from the Review page. The flag button beside it adds `**Flagged for Review**: Yes` on the next line, which puts the project on the Review page until it's next reviewed. Selecting it again removes the line.
- **Date Closed:** a single date, in the `DATEFORMAT` set in `_Labels/Options.csv`. Click the plus to add one or the pencil to change it. Saving an empty box clears the date.
- **Active Timeframe:** empty by default. Click the plus button next to it and choose a start and end month and year. A timeframe always runs from the first day of its start month to the last day of its end month, and is stored as full dates. Each new timeframe is added to the end of the line, separated by a comma. If a file doesn't have the line yet, the first timeframe adds it below `Date Created`. The Overview tab lists the timeframes one per row, each with a pencil to change its dates and a cross to delete it. The file keeps them on the single comma-separated line.
- **Project Dependency:** empty by default. On the Overview tab, the plus button lists every project that isn't archived, apart from this one and any that already depend on it. With `ARCHIVEMODE` set to `HEADERS`, the entries in `_Archive.md` follow, marked (archived). The file stores the other project's name (its folder name without the status prefix and with spaces for underscores), and the Overview shows it as a link. On the Timeline, a dependent project sits directly below its parent, and an arrow runs from the end of the parent project's last bar to the start of the dependent project's first bar, if both have an `Active Timeframe`.
- **Owner:** shown as a `Name` from `_Labels/Leaders.csv`, with a dropdown for choosing another. The file keeps the `Tag`.

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

Each status type has its own checkbox in the markdown, and its own icon in the dashboard, from `_Dashboard/public/img`. Changing a status updates the checkbox to match.

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
_Help_Guide.md         the step by step guide shown in the dashboard
HelpGuide.pdf          the same guide as a PDF, to read or print without the dashboard
_Incubator.md          ideas for projects
_Archive.md            the headers of archived projects (ARCHIVEMODE HEADERS)
_Images/               pictures for [[IMAGE#...]] links, and the logo
_Time_Management/      Plan.md, Review.md and AgendaItems.csv (the review agenda)
_Entities/             a folder for each entity, with tentacles inside, and Reports.md
_Networking/           Leads.md and Events.md
_Catalogs/             a TAG_Name.csv per catalog
_Labels/               the CSV files behind the Options page
_Dashboard/
  server.js            tiny HTTP server (Node built-ins only)
  todos.js             finds status-prefixed items in markdown
  document-edits.js    blocks, milestones and single-line text edits
  catalogs.js          catalog files: names, rows and catalog numbers
  changes.js           line diffs, change logs and Syncthing conflict copies
  defaults/Colours.csv the colours a new install starts with
  public/
    setup.html         first-time setup form
    login.html         multi-user login
    home.html          the Dashboard: Overview, with the Timeline, and Report
    weekly-review.html Review page
    weekly-plan.html   Plan page
    incubator.html     Incubator page
    archive.html       Archive Index page
    networking.html    Leads and Events pages
    compatibility.html Compatibility pages
    help.html          Help Guide
    projects.html      projects list
    catalogs.html      All catalogs
    catalog.html       one catalog's table
    project.html       project page
    entity.html        owner page
    options.html       options form
    components/        every piece of HTML the scripts render, as named templates
    css/style.css      theme
    font/              the Bytesized font for the name beside the logo
    img/               icons
    js/projects.js     helpers shared by every page, including the component renderer
    js/markdown.js     markdown renderer + milestone/meta parsers
    js/nav.js          left-hand menu
    js/setup.js        first-time setup form
    js/login.js        multi-user login form
    js/changes.js      Sync conflict warnings and the Changelog tab
    js/home.js         Overview tab
    js/dashboard.js    Dashboard tabs and Generate report
    js/incubator.js    Incubator page
    js/archive.js      Archive Index page
    js/help.js         Help Guide page
    js/list.js         projects list logic
    js/catalog-list.js All catalogs, and New catalog
    js/catalog.js      a catalog's table: editing, adding and deleting records
    js/new-project.js  New project form
    js/project.js      project page logic
    js/weekly-review.js Review page and its agenda cards
    js/reports.js      Report tab and its charts
    js/weekly-plan.js  Plan page
    js/history.js      History tab on the Review and Plan pages
    js/edit.js         double-click editing and plus buttons
    js/milestones.js   collapsing and reordering milestones
    js/timeline.js     Gantt chart on the Overview tab
    js/entity.js       owner page logic
    js/document-view.js parts shared by project and owner pages
    js/networking.js   Leads and Events pages
    js/compatibility.js Compatibility pages
    js/options.js      options page tabs and form
    js/label-tables.js Statuses, Leaders, Colours and Agenda tables
    js/sidebar.js      todos sidebar
    js/status.js       status name + caret control
```

### How the code is organised

- **HTML** lives in `public/components/*.html`, as `<template name="...">` blocks. A script asks for one by name with `PMS.component('name', { slot: value })`, or `PMS.element` for a live element such as a dialog. Pages load them all through `api/components.js`, so a new or changed template only needs a browser refresh.
- **Slots:** `{{slot}}` is escaped, `{{{slot}}}` is HTML that's already safe, and `{{#if slot}}...{{else}}...{{/if}}` is optional markup. Line breaks and the indentation after them are removed, so a space that matters has to be on the same line as its neighbours.
- **CSS** lives in `public/css/style.css`. The colours come from `_Labels/Colours.csv`. Values only known while the page runs, such as where a Timeline bar starts, are passed in as named custom properties like `--from`, and the stylesheet says what to do with them.
- **JavaScript** lives in `public/js`. Anything used by more than one page goes in `js/projects.js`.
