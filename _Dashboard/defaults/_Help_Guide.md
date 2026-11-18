# How to use this dashboard

This guide walks through the dashboard from installing it to everyday use. It follows one example from start to finish: a record label called Record Label Studios, run by someone called Hexajessimal. Use your own names as you go.

Everything you see in the dashboard is stored in plain markdown and CSV files in this folder, so you can also open and edit them in any text editor.

## Install Node and run the server

1. Install **Node.js** version 18 or newer from https://nodejs.org. The LTS version is fine.
2. Open a terminal and go to the folder that holds this dashboard.
3. Check Node is installed by running `node --version`.
4. Start the dashboard by running `node _Dashboard/server.js`.

The terminal prints the address of your dashboard, normally `http://127.0.0.1:4173`. Leave the terminal open while you use the dashboard. To stop it, press `Ctrl + C` in the terminal.

[[IMAGE#Screenshots/01-RunServer.png]]

## Launch the dashboard and create your entity

Open the address from [Install Node and run the server](#install-node-and-run-the-server) in your web browser. The first time, you'll see a short setup form.

[[IMAGE#Screenshots/02-Setup.png]]

Fill in:

- **Entity name:** the name of your entity.
- **Entity ID:** a short code using letters, numbers and hyphens. It's suggested from the name, and you can change it. This ID appears at the start of folder names and page titles.
- **Your name:** this becomes a leader, and a status you can assign tasks to.
- **Date format:** how dates are shown and typed.

[[IMAGE#Screenshots/03-SetupFill.png]]

Select **Get started**. The dashboard creates the settings files it needs in the `_Labels` folder and your entity's folder. You can change all of this later in Options.

## View your homepage

**Dashboard**, at the top of the left menu, opens on its **Overview** tab, which shows what matters today. The **Report** tab is described in [Read your report and save it](#read-your-report-and-save-it).

[[IMAGE#Screenshots/04-Homepage.png]]

- **The tiles** along the top show your **Scheduled Projects** (those in a timeframe today), your open and inactive projects, how soon the next Review and Plan are due, and how many tasks are overdue.
- **Timeline** charts your projects by month, with your events and application deadlines as lines.
- **Current plan, Due in the next 7 days, Priorities this month and Overdue tasks** sit below it.
- **The left menu** takes you everywhere else. Review and Plan get a coloured outline when they're due.
- **The Todos list** on the right stays on every page.

Most of this is empty until you've added some work.

## View your entity page

Select your entity under **Entities** in the left menu.

[[IMAGE#Screenshots/05-OrganisationPage.png]]

Every entity and project page has three tabs at the top right:

- **Overview:** the summary and task lists.
- **Scratchpad:** your notes, in separate blocks.
- **Raw:** the whole markdown file.

## Create a new task for your entity

On the Overview, select the plus button beside **Tasks**. A blank task opens at the bottom of the list, ready to type into. Press Return to save it, and another blank task opens so you can keep going. Press Escape when you're done. A blank task that's left empty is removed without saving.

[[IMAGE#Screenshots/06-New Task.png]]

## View your entity task list

Each task you add appears in the Tasks box. The summary above it shows how many are incomplete and how much is done.

[[IMAGE#Screenshots/07-TaskList.png]]

## Assign a task to yourself and select a priority

A new task has no status yet. Select the small caret beside its circle and choose a status. Your name is one of the statuses, in the **ASSIGNED** group.

[[IMAGE#Screenshots/08-AssignTask.png]]

Once a task has a status, a second small dropdown appears beside it. Use that to set a priority of **A**, **B** or **C**.

[[IMAGE#Screenshots/09-AssignPriority.png]]

The same status menu has **Schedule** and **Deadline** options. Each asks for a date, which you can type or choose with the calendar button, and shows it under the task. A task with a date appears in **Due in the next 7 days** and **Overdue tasks** on the Dashboard's Overview. To remove a date, choose the option again and clear the box.

## View your entity-wide todo list

The **Todos** list on the right shows every line, in every entity and non-archived project, that has a status. A task with no status stays in its own list and doesn't appear here.

Use **Filter** to narrow the list, and **Sort** to change the order. Each of **Type**, **Status**, **Priority**, **Entity** and **Project** opens a list where you can tick as many choices as you like. **Type** chooses which status types show, and the others narrow the list further. Leave them on **All** to show everything, or select **Show all** at the top of a list to go back to it. Archived items only appear here when you tick **ARCHIVED** under **Type**, and on other pages only when `SHOWARCHIVED` is ticked in Options.

[[IMAGE#Screenshots/10-TodoList.png]]

## Add notes to your entity document

Open the **Scratchpad** tab and double-click the text in the **Notes** block. Type your notes and select **Save**. Pressing `Ctrl + Enter` also saves, and `Escape` cancels.

Notes are markdown, so `###` at the start of a line makes a heading, for example.

[[IMAGE#Screenshots/11-AddingNotes.png]]

[[IMAGE#Screenshots/12-NotesAdded.png]]

## Add new scratchpad blocks to documents

The Scratchpad can hold as many blocks as you like.

[[IMAGE#Screenshots/13-Scratchpad.png]]

Select the plus button beside **Scratchpad** and give the block a title.

[[IMAGE#Screenshots/14-NewBlock.png]]

Then double-click the new block to fill it in.

[[IMAGE#Screenshots/15-BlockFill.png]]

## View the raw markdown for any entity or project page

Select the **Raw** tab at the top right.

[[IMAGE#Screenshots/16-RawButton.png]]

This shows the whole file at once, nicely laid out. Archived items are left out of this view unless `SHOWARCHIVED` is ticked in Options, as described in [View the options page](#view-the-options-page).

[[IMAGE#Screenshots/17-RawView.png]]

## Edit the raw markdown

Double-click anywhere on the Raw view to edit the file's markdown as plain text. Select **Save**, or press `Ctrl + Enter`. `Escape` cancels. If the file has been changed elsewhere since the page loaded, nothing is saved, so you can't overwrite newer work by accident.

[[IMAGE#Screenshots/18-RawEdit.png]]

## Mark a task as done

Select a task's status name to move it to its next status, or use the caret beside it to choose **DONE**. You can do this in the Todos list or on the page itself.

A finished task moves below the divider in the Todos list and is stamped with the date and time it was closed.

[[IMAGE#Screenshots/19-TaskDone.png]]

## Navigate to projects

Under **Projects** in the left menu, select **All projects**. Your active projects are also listed underneath it for quick access. The list can be filtered by status or searched.

[[IMAGE#Screenshots/20-Projects.png]]

## Create a new project

Select **New project** at the top right.

[[IMAGE#Screenshots/21-NewProject.png]]

Choose the entity it belongs to, give it a title, and choose who owns it. There are two project types:

- **Milestone:** a project with an end, divided into milestones. It can appear on the Timeline and the Plan.
- **Ongoing:** continuous work, kept as simple task lists.

[[IMAGE#Screenshots/22-ProjectFill.png]]

Select **Create project** and the new project opens. The tag beside the title shows whether it's active or inactive, and you can change that with its caret. The project type at the top of the page can also be changed there.

The summary on a Milestone project is a grid. Owner and Project Dependency share the first row, Created and Reviewed the second, and Milestones and Closed the third, with Active Timeframe down the right-hand side.

[[IMAGE#Screenshots/23-MyNewProject.png]]

## Add milestones and milestone tasks to a project

Select the plus button beside **Milestones**. A blank milestone opens, ready to type into. Press Return to save it and start another, or Escape to stop.

[[IMAGE#Screenshots/24-NewMilestone.png]]

Each milestone appears as a coloured block in the progress bar and as its own card below. Use the plus button on a card to add tasks to it, the same way. The minus button deletes the milestone and its tasks after asking. The drag handle reorders cards, and the small arrow collapses them.

The colours show progress: green is complete, yellow is in progress, orange is not started and pink is unplanned, meaning it has no tasks yet.

[[IMAGE#Screenshots/25-Milestones.png]]

## Edit the raw project markdown to add subtasks

The plus button adds top-level tasks only, so subtasks are added by hand. Open the **Raw** tab, double-click to edit, and indent a task underneath the one it belongs to.

[[IMAGE#Screenshots/26-AddingSubTasksInRaw.png]]

Save, and the indented tasks appear nested under their parent on the Overview.

[[IMAGE#Screenshots/27-ShowingSubtasks.png]]

## Set a timeframe for an active project

On the Overview, select the plus button beside **Active Timeframe**, choose a start and end month and year, and select **Add**. A timeframe always runs from the first day of its start month to the last day of its end month. A project can have more than one timeframe.

The timeframe puts the project on the Timeline. It also adds the project to **Priorities this month** while today falls inside it.

[[IMAGE#Screenshots/28-SettingTimeTrame.png]]

## Review your time so far, including new entities and projects

Before reviewing, finish a task or two so there's something to report.

[[IMAGE#Screenshots/29-SecondTaskComplete.png]]

Under **Time Management** in the left menu, Review and Plan are outlined when they're due. The two numbers beside Review are how many projects and how many entities are waiting to be reviewed.

[[IMAGE#Screenshots/30-TimeManagement.png]]

Open **Review**. The top boxes list every project and entity that hasn't been reviewed yet.

[[IMAGE#Screenshots/31-Review.png]]

Select one to open it in an overlay, where you can read and edit it as normal. Select **Mark as reviewed and close** when you're done, or **Close** to leave it on the list.

[[IMAGE#Screenshots/32-ReviewAndClose.png]]

## Document your wins for this period

Further down the Review page, finished tasks since your last review are grouped by status. These come from your projects, including Ongoing ones, your entities and tentacles, and any tasks under a contact or event in Networking.

1. Select **Add to wins** on a box to copy its tasks into the **Wins** text box.
2. Edit the text or add anything else you're proud of.
3. Select **Submit wins and archive**.

Your wins are saved in `_Time_Management/Review.md`. Every finished task, not only those listed, moves to the archived status and disappears from view. Past reviews are on the **History** tab.

Each review also logs figures to `_Entities/Reports.md`: the tasks you completed and those still open, overdue tasks, active projects with nothing finished, how much of your Plan got done, and the wins you logged. [Read your report and save it](#read-your-report-and-save-it) shows how to read them.

There's no screenshot of this step. The Wins box is at the bottom of the Review page.

## Plan the next work period and submit your focuses

Open **Plan**. The top boxes list everything that hasn't been assigned yet: tasks in your active Milestone projects, tasks and status-tagged lines in your entities and tentacles, and tasks under a contact or event in Networking. The small arrow on any box on this page collapses it.

- A project with a timeframe that includes today is outlined and tagged **Suggested**.
- A task that's the last one unfinished in its milestone is outlined too.

[[IMAGE#Screenshots/33-PlanScreen.png]]

Select tasks to move them into **Focus** below, then set a status and priority for each. Anything already assigned is in the Focus automatically. When you're happy, select **Submit focus**.

[[IMAGE#Screenshots/34-FocusChosen.png]]

## Observe new highlighted todos relevant to your focus

Your plan is saved in `_Time_Management/Plan.md`, and can be read back on the **History** tab of the Plan page. The Todos list now outlines items according to your latest plan:

- **Purple:** the plan names this task or its milestone.
- **Cyan:** the plan includes this project, entity or tentacle.
- **Pink:** the task's project isn't active.

[[IMAGE#Screenshots/35-CurrentFocusHighlights.png]]

## Keep ideas in the Incubator

The **Incubator**, near the top of the left menu, holds ideas that aren't projects yet. Select the plus button beside **New idea** and enter a title, the entity it's for, a project it depends on if any, and some notes. Ideas are kept in `_Incubator.md` in the main folder.

[[IMAGE#Screenshots/63-Incubator.png]]

Each idea has two buttons:

- **Promote to Project** asks when it will run and who owns it, and which projects folder to use if you have more than one. It then creates the project with your notes in it, and opens it.
- **Archive Idea** puts the idea aside after asking.

[[IMAGE#Screenshots/64-PromoteIdea.png]]

Either way the idea leaves the page, but stays in the file.

## View the timeline

The Timeline is on the Dashboard's Overview tab. Projects are graded through the colours of their milestones, and a project with no milestones is shown as `N/A` in the key. The tick boxes above it show or hide **Active** and **Inactive** projects, and **Archive** ones while `SHOWARCHIVED` is ticked. Archived projects are green, the complete colour. **3 months**, **6 months** and **12 months** zoom the chart in and out. As you scroll sideways, rows with nothing within two months of the dates on screen are hidden, so the chart stays a sensible height however many years it covers. An event's application deadline is a cyan line until you've applied or it's booked. Its date is purple once it's booked, and grey until then. An event of several days has a line at each end, with a paler band between. Point at a line to see which event it is. Where one item depends on another, it sits underneath with an arrow joining them. Select any bar to open it.

[[IMAGE#Screenshots/38-TimelineView.png]]

At **12 months** you can see a whole year at once:

[[IMAGE#Screenshots/73-TimelineZoom.png]]

## Create a new tentacle

Tentacles are for parts of your entity, such as an artist or a department. On your entity's page, select the plus button at the end of the row of names, and enter a name and an ID.

[[IMAGE#Screenshots/39-NewSubEntity.png]]

It gets its own tab with its own tasks, notes and files.

[[IMAGE#Screenshots/40-NewEntityView.png]]

## Add a todo in a notes section and assign it to yourself

You don't need a task list to create a todo. In any notes, start a line with a status name, exactly as it's written in capitals.

[[IMAGE#Screenshots/41-TodosAnywhere.png]]

After saving, the name becomes a status control and the line appears in your Todos list.

[[IMAGE#Screenshots/42-TodosAnywhere2.png]]

## Add a new lead contact

Open **Leads** in the left menu. Select the plus button beside **New contact** and enter a name. Then double-click any field on the card to fill it in.

[[IMAGE#Screenshots/43-Leads.png]]

## Add a new event

Open **Events** in the left menu and select the plus button beside **New event**, then enter a name. Double-click the fields on the card to fill in the artist, venue, contact, details, payment and tasks.

- **Application Deadline** and **Event Date** have a plus button, or a pencil once they're set, that opens a calendar. Give an Event Date an end date too if the event runs over several days.
- **Application Submitted** and **Booking Confirmed** are tick boxes. The card gets a light blue border once you've applied, and a purple one once it's booked, the same colours as on the Timeline.

[[IMAGE#Screenshots/65-EventDates.png]]

Use the filters at the top, **All**, **Not applied**, **Applied** and **Booked**, to see events at each stage.

[[IMAGE#Screenshots/66-EventFilters.png]]

Events are listed under **Upcoming Events**, soonest first, and move to **Past Events** once their date has gone by. Headings in the file don't change this. If your events have dates you typed yourself, open **Compatibility > Events** and use **Fix issues** to turn them into dates the calendar understands.

## Link a lead in an event and vice versa

Double-click a field and type the name of the other entry in double square brackets. In an event, you might link to the contact like this:

[[IMAGE#Screenshots/44-LinkingLeads.png]]

After saving, it becomes a link that opens that entry and outlines it. To link the other way, type `[[Events#The Name Of The Event]]` in a field on the contact's card.

## All the ways to link

These work anywhere you can write notes:

- `[[Leads#Name]]` links to a contact.
- `[[Events#Name]]` links to an event.
- `[[Leads#Name|the text to show]]` links with your own wording. This works for every kind of `[[ ]]` link.
- `[[#Name]]` looks for that name on the Networking page you're on, then the other one.
- `[[ID]]` opens that entity's page, for example `[[LABEL]]`.
- `[[ID#Tasks]]` opens that entity's task list. Use any heading from `TASKLISTS`.
- `[[ID#Any other heading]]` opens that entity's Scratchpad at that section.
- `[[IMAGE#Screenshots/01-RunServer.png]]` shows an image from the `_Images` folder.
- `[the text to show](https://example.com)` links to a website, and a web address written out in full becomes a link by itself.

A few details:

- Capitals don't matter in a name, but an entity's ID has to be exact.
- A name also finds a heading that adds something in brackets, so `Scott` finds `Scott (SWOLE)`.
- A link that doesn't match anything is left as plain text.

**Project Dependency** is written a little differently. It's the name of a project without its status sign or underscores, such as `LABEL Design A New Logo`.

## View the options page

Open **Options** at the bottom of the left menu. The **General** tab holds:

- `DATEFORMAT`: how dates are shown and typed. They're always stored as `YYYY-MM-DD`.
- `ROUNDUP`: how many days between each Review and Plan.
- `PROJECTS`: the folders that hold projects, separated by commas.
- `TASKLISTS`: the task list headings on entities and Ongoing projects, separated by commas.
- `SHOWARCHIVED`: tick it to keep archived tasks visible on project and entity pages.
- `SYNCCONFLICTS`: tick it to be warned about Syncthing conflicts, as described in [Work together as a team](#work-together-as-a-team).
- `MULTIUSER`: tick it to log in and keep a Changelog of who changed what, as described in [Work together as a team](#work-together-as-a-team).
- `ARCHIVEMODE`: what the **Archive** button on a project does, as described in [Archive a finished project](#archive-a-finished-project).

[[IMAGE#Screenshots/45-Options.png]]

## Add a new projects directory

To keep a separate set of projects, such as merchandise, add a name to `PROJECTS`, separated by a comma, and select **Save**. It gets its own section in the left menu.

Then create a folder with exactly that name, next to your `Projects` folder. Until you do, Compatibility reports it as missing, as shown in [Review project compatibility](#review-project-compatibility).

[[IMAGE#Screenshots/46-NewProjectsDirectory.png]]

The **Statuses** tab sets the status names you can give tasks. Double-click a value to change it, and use the plus and minus buttons to add or remove rows. **Next status** decides what a status moves to when you select it.

[[IMAGE#Screenshots/47-CustomStatuses.png]]

## Add new project leaders

On the **Leaders** tab, select the plus button and enter a name. Leaders can then be chosen as the owner of a project.

Tasks are assigned using statuses, so if you'd like to assign tasks to the new person too, add a status with their name in the **ASSIGNED** type on the Statuses tab.

[[IMAGE#Screenshots/48-NewProjectLeaders.png]]

## Customise your dashboard colours

The **Colours** tab lists every colour the dashboard uses and what it's for. Double-click a colour and enter a 6 character hex value, such as `#00ff6a`. The change shows straight away. One colour often has several uses, and changing it changes them all.

The colours starting `print-` are only used when you print a generated report, described in [Read your report and save it](#read-your-report-and-save-it), so it comes out as dark text on white paper.

[[IMAGE#Screenshots/49-CustomColours.png]]

## Review project compatibility

Under **Compatibility** in the left menu, the three pages check your entity, project and event files are in the format the dashboard expects. Each problem is coloured by what can be done about it:

- **Accent colour:** a missing field, heading or entity file. Select **Fix issues** to add it automatically.
- **Pink:** something you need to change by hand. This example is a directory listed in Options that doesn't exist yet.
- **Orange:** a file or folder that isn't where it's expected to be, or markdown with no clear purpose.

Fix issues only ever adds what's missing and leaves everything else alone. Where it needs a choice, the box has a dropdown:

- **Main file:** a project with no markdown file named after its title. Choose the file that should be the main one, and Fix issues renames it after the project.
- **Owner:** a project whose Owner is missing, empty or not in your leaders. Choose who it belongs to, or leave it for now.

On the **Events** page, Fix issues changes dates you typed yourself, such as `25.07.26` or `11-13.09.26`, into calendar dates. It also adds any missing Application Deadline, Event Date and tick box fields. A date with something else after it, such as a time, is listed for you to change on the Events page.

[[IMAGE#Screenshots/50-ProjectCompatibility.png]]

[[IMAGE#Screenshots/67-CompatibilityEvents.png]]

## The directory structure and naming conventions

Your files are organised like this:

[[IMAGE#Screenshots/51-DirectoryStructure.png]]

- `_Dashboard`: the dashboard's own code.
- `_Entities`: a folder per entity, named after its ID, with tentacles inside their parent, and `Reports.md`.
- `_Images`: pictures used in your notes and this guide.
- `_Labels`: the settings files behind the Options page.
- `_Networking`: `Leads.md` and `Events.md`.
- `_Catalogs`: a CSV file per catalog, named with its tag and name, such as `RLS_Record_Label_Studios.csv`. [Keep a catalog of your releases](#keep-a-catalog-of-your-releases) shows how to use them.
- `Projects`, and any other directory in `PROJECTS`: a folder per project.
- `_Time_Management`: `Review.md` and `Plan.md`.
- `_Incubator.md`: your ideas, from [Keep ideas in the Incubator](#keep-ideas-in-the-incubator).
- `_Archive.md`: the details of archived projects, from [Archive a finished project](#archive-a-finished-project).

A project's folder name holds its status, its entity and its title:

[[IMAGE#Screenshots/52-ProjectFolder.png]]

- It starts with `+` when active and `-` when inactive. The tag beside the project's title changes this for you.
- To archive a project, rename its folder to start with the date, such as `2026-11-30_LABEL_Design_A_New_Logo`.
- Next comes the entity's ID, then an underscore, then the title with underscores for spaces.
- The main markdown file inside is named after the title, such as `Design A New Logo.md`. If there isn't one, the dashboard uses the first file alphabetically and Compatibility asks which file it should be.

An entity's file is `_Entities/ID/Name.md`, using the ID and name from setup.

## Create a new markdown file within an entity or project

A project or entity can hold more than one markdown file. To add one, select the plus button on the row of file tabs, which is above the content. The new file opens straight away with the fields and headings it needs.

You can also put a markdown file in the folder yourself, using any text editor.

[[IMAGE#Screenshots/53-NewMarkdownFile.png]]

Each file then gets its own tab, on every tab of the page, with the main file first.

[[IMAGE#Screenshots/54-NewMarkdownView.png]]

If Compatibility lists a file you've added as **Unknown markdown**, it's only a reminder that the file doesn't use any of the dashboard's fields or headings. It still works.

## Read your report and save it

Each time you submit a Review, a few figures are added to `_Entities/Reports.md`. Open **Dashboard** in the left menu and choose the **Report** tab to see them over time.

[[IMAGE#Screenshots/55-DashboardReport.png]]

The tiles along the top show the latest figures, with an arrow for how each moved since the review before. Green means the change is good, and pink means it isn't.

- **Tasks completed:** finished since the review before.
- **Reviews to clear open tasks:** how many reviews it would take to finish every open task at your recent pace.
- **Plan follow-through:** how many of your Plan's focuses got done, such as `3 of 4`.
- **Stalled projects:** active projects where nothing was finished.
- **Overdue tasks:** open tasks past their deadline or scheduled date.
- **Review streak:** how many reviews in a row you've done on time.

**Task flow** shows each review as a column. The tasks you finished are green at the bottom, and the tasks still open sit above them, split into assigned, waiting and unassigned. The pink line is how many were overdue. Point at a column to see its numbers.

Below it, **Plan follow-through** shows how much of each Plan got done, and **Wins logged** how many wins you wrote down. The **Every report** box at the bottom opens a table of every figure.

[[IMAGE#Screenshots/56-ReportCharts.png]]

Select **Generate report** to save the Overview and Report as a single file, named with today's date. Your browser saves it like any download.

[[IMAGE#Screenshots/57-GenerateReport.png]]

The file opens in any web browser, even with the dashboard closed, so you can keep it or send it to someone. Printing it, including to PDF, gives dark text on white paper.

[[IMAGE#Screenshots/58-ReportDocument.png]]

## Keep a catalog of your releases

A catalog is a table of things you put out, such as releases or products. Under **Catalogs** in the left menu, select **All catalogs**. Each catalog is listed with its tag and how many records it holds, and also appears in the left menu.

[[IMAGE#Screenshots/59-Catalogs.png]]

Select the plus button beside **All catalogs**, type a name and check the tag. The tag is 2 or 3 letters, suggested from the name, and starts every catalog number. Select **Create catalog** and the new catalog opens.

[[IMAGE#Screenshots/60-NewCatalog.png]]

A catalog starts with the columns **Catalog #**, **Image**, **Owner**, **Title**, **Medium** and **Release date**. Double-click any value to change it, and use the minus button at the end of a row to delete a record.

[[IMAGE#Screenshots/61-CatalogTable.png]]

To add records, select the plus button beside the table. A blank record opens with the next catalog number filled in, such as `RLS003`.

1. Type into the first box, and press Tab to move to the next.
2. Press Return to save the record. Another blank record opens, so you can keep adding.
3. Press Escape when you're done.

[[IMAGE#Screenshots/62-CatalogAdd.png]]

To show a picture, put it in the `_Images` folder and write its name in double square brackets, such as `[[IMAGE#Logo.png]]` for your logo. Type dates the same way as everywhere else.

Each catalog is saved as a spreadsheet file in the `_Catalogs` folder, so you can also open it in any spreadsheet program. Columns you add there appear in the dashboard too.

## Work together as a team

Octapu doesn't share files between computers itself. To work as a team, keep the Octapu-System folder in sync with [Syncthing](https://syncthing.net), and run the dashboard on each computer. Two options on the **General** tab of **Options** help with this.

**SYNCCONFLICTS** watches for clashes. If two people change the same file before Syncthing has synced it, Syncthing keeps both versions and names one of them like `First album.sync-conflict-20261117-101500-ABCDEF7.md`. With this ticked, a yellow **Sync conflict** box appears at the top of that project, entity, Leads or Events page. It shows how the two versions differ: lines marked − are only in the current file, and lines marked + are only in the conflict copy.

- **Keep current** keeps the file as it is, and deletes the conflict copy.
- **Use this version** replaces the file with the conflict copy, then deletes the copy.

[[IMAGE#Screenshots/70-SyncConflict.png]]

Either way, copy anything you want from the other version first. Conflict copies are never listed as files of their own.

**MULTIUSER** keeps track of who changed what. With this ticked, everyone is asked to log in the first time they open the dashboard, by choosing their name from **Leaders**. There are no passwords, because Octapu is meant for a team who trust each other. Your name and **Log out** then appear at the bottom of the left menu.

[[IMAGE#Screenshots/68-Login.png]]

Each project, entity, Leads and Events page gets a **Changelog** tab. It lists every change made to that file through the dashboard, newest first, with who made it, which computer they used, and when. Added text is green and removed text is pink. For a changed line, the old text is shown crossed out in pink, with the new text in green below it.

[[IMAGE#Screenshots/69-Changelog.png]]

Changes are saved next to each file, such as `First album-change.LAPTOP.log`, with one log for each computer so that Syncthing never has two people writing to the same log. Changes are kept for twice the number of days set by `ROUNDUP`. Edits made in other apps, such as a text editor, aren't logged.

[Archive a finished project](#archive-a-finished-project) describes the Syncthing setup we recommend, which also keeps archived projects off your computers.

## Archive a finished project

When a project is finished, select **Archive** at the top of its page and confirm. Its **Date Closed** is set to today, and it disappears from the Dashboard, the menu, the projects list and the Todos list. A project with a Date Closed always counts as archived. While `SHOWARCHIVED` is ticked, archived projects still appear on the Timeline, in green.

[[IMAGE#Screenshots/71-ArchiveButton.png]]

What else happens depends on `ARCHIVEMODE` on the **General** tab of **Options**:

- **HEADERS**, the default, copies the project's dates, timeframe, dependency and owner into `_Archive.md` in the main folder, and leaves the folder alone. You can then move the folder off your computer, to a NAS say, and the record stays. Tick `SHOWARCHIVED` to see **Archive Index** in the left menu, which lists them. Its plus button adds an entry by hand, and the minus button removes one. Other projects can depend on an archived one, which shows in their Project Dependency list.
- **FULL** renames the folder to start with today's date instead. Tick `SHOWARCHIVED` to list them under the **Archived** filter of the projects list.

[[IMAGE#Screenshots/72-ArchiveIndex.png]]

### Our recommended setup with Syncthing

Octapu works best combined with Syncthing, especially in **HEADERS** mode. We recommend keeping the whole Octapu-System folder on a NAS drive or a local server, shared as the primary **Send & Receive** folder. On the NAS only, open the folder's **Ignore Patterns** in Syncthing and add the patterns below. Syncthing never sends a file it's told to ignore, so your computers only ever receive what the patterns allow, and don't need patterns of their own. Don't add them on the computers too. Connect each computer to the NAS rather than to each other, so everything goes through it.

Sync every file of your active projects, but only the markdown files of inactive ones, to save disk space. If you have more than one projects directory, repeat these two lines for each, changing `Projects` to its name:

```
!/Projects/+*
!/Projects/-**.md
```

Include all of the system's own files and folders, which start with an underscore:

```
!/_*
```

Finally, ignore everything else:

```
*
```

Keep them in this order, with `*` last, as Syncthing uses the first pattern that matches.

Once a project has been archived, rename its folder **on the NAS** from `+OWNER_ProjectTitle` to the archive date followed by the rest of the name, such as `2026-11-30_LABEL_Design_A_New_Logo`. The NAS then ignores it, so it's removed from your computers while the NAS keeps it, along with its record in `_Archive.md`. Don't rename it on your own computer: the NAS would take that as the project being deleted, and wouldn't receive it under its new name.

## Run an Ongoing project

An Ongoing project is for work that doesn't end, such as social media or admin. Choose **Ongoing** as the Project Type when you create it, or switch an existing project with the **Project Type** dropdown at the top of its page.

Its Overview shows the owner and dates, then a box for each task list named in `TASKLISTS`, which is **Tasks** to begin with. Use a box's plus button to add a task, just as on an entity.

[[IMAGE#Screenshots/74-OngoingProject.png]]

Ongoing projects have no milestones, timeframe or dependency, so they don't appear on the Timeline or the Plan page. Their tasks still appear in the Todos list and on the Review page.

## Make one project depend on another

When one project can't start until another is finished, select the plus button beside **Project Dependency** on its Overview and choose the project it waits for. The list leaves out the project itself and any project that already depends on it. With `ARCHIVEMODE` set to **HEADERS**, archived projects are listed too, marked (archived).

[[IMAGE#Screenshots/75-ChooseDependency.png]]

The dependency then shows as a link on the Overview. On the Timeline the project sits under the one it depends on, with an arrow joining them. Use the pencil to change it, or choose **None** to remove it.

## Cancel or delete a task

The caret beside a task's status opens the menu used in [Assign a task to yourself and select a priority](#assign-a-task-to-yourself-and-select-a-priority). At the bottom are two more choices:

- **Cancel** strikes the task through and unticks it. It stays in the file but drops off the Todos list and out of your progress counts.
- **Delete** removes the line from the file, after asking.

[[IMAGE#Screenshots/76-CancelDelete.png]]

## Add an info note

To make a note stand out, start a quote line with `[!info]`, like this:

```
> [!info] Bandcamp takes its fee monthly, so budget for it every month.
```

It shows with an info icon wherever the file is displayed. The text in the file stays as you wrote it.

[[IMAGE#Screenshots/77-InfoNote.png]]

## Find a project quickly

On a projects list, the buttons along the top show **All**, **Active** or **Inactive** projects, each with a count. Type in the search box to narrow the list by title or entity as you type.

[[IMAGE#Screenshots/78-FindProject.png]]

## Read your entity's tabs

The tabs along the top of an entity's page are coloured by how deep each one is: green for your entity, yellow for its tentacles, orange for theirs, and grey for anything deeper. The open tab is underlined in its colour.

The fourth box in the summary, **Parent**, links to the entity a tentacle belongs to, or says it's at the top level.

[[IMAGE#Screenshots/79-EntityTabs.png]]

## Run the dashboard on another port

If something else on your computer already uses port 4173, start the dashboard on another one by setting `PMS_PORT` first:

- macOS and Linux: `PMS_PORT=8080 node _Dashboard/server.js`
- Windows PowerShell: `$env:PMS_PORT=8080; node _Dashboard/server.js`
- Windows Command Prompt: `set PMS_PORT=8080 && node _Dashboard/server.js`

Then open the address it prints, such as `http://127.0.0.1:8080`.

[[IMAGE#Screenshots/80-OtherPort.png]]

`PMS_HOST` sets which network the dashboard listens on. Leave it as it is, so only your own computer can open the dashboard and change your files.

When you've finished the guide, tick **Mark as read** below it. The green outline around **Help Guide** in the left menu then goes away.

- [ ] Mark as read
