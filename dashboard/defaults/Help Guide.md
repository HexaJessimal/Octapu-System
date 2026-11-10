# How to use this dashboard

This guide walks through the dashboard from installing it to everyday use. It follows one example from start to finish: a record label called Record Label Studios, run by someone called Hexajessimal. Use your own names as you go.

Everything you see in the dashboard is stored in plain markdown and CSV files in this folder, so you can also open and edit them in any text editor.

Some screenshots show older wording. The dashboard used to be called PMS, the Dashboard was Home, entities were organisations, tentacles were suborganisations, Networking was Bookings, and Unplanned was No tasks. Those screenshots also show an older left menu, without Dashboard or Catalogs, and an older Todos filter.

## Step 1: Install Node and run the server

1. Install **Node.js** version 18 or newer from https://nodejs.org. The LTS version is fine.
2. Open a terminal and go to the folder that holds this dashboard.
3. Check Node is installed by running `node --version`.
4. Start the dashboard by running `node dashboard/server.js`.

The terminal prints the address of your dashboard, normally `http://127.0.0.1:4173`. Leave the terminal open while you use the dashboard. To stop it, press `Ctrl + C` in the terminal.

[[IMAGE#Screenshots/01-RunServer.png]]

## Step 2: Launch the dashboard and create your entity

Open the address from Step 1 in your web browser. The first time, you'll see a short setup form.

[[IMAGE#Screenshots/02-Setup.png]]

Fill in:

- **Entity name:** the name of your entity.
- **Entity ID:** a short code using letters, numbers and hyphens. It's suggested from the name, and you can change it. This ID appears at the start of folder names and page titles.
- **Your name:** this becomes a leader, and a status you can assign tasks to.
- **Date format:** how dates are shown and typed.

[[IMAGE#Screenshots/03-SetupFill.png]]

Select **Get started**. The dashboard creates the settings files it needs in the `Labels` folder and your entity's folder. You can change all of this later in Options.

## Step 3: View your homepage

**Dashboard**, at the top of the left menu, opens on its **Overview** tab, which shows what matters today. The **Report** tab is described in Step 38.

[[IMAGE#Screenshots/04-Homepage.png]]

- **The tiles** along the top show your **Scheduled Projects** (those in a timeframe today), your open and inactive projects, how soon the next Review and Plan are due, and how many tasks are overdue.
- **Timeline** charts your projects and commitments by month.
- **Current plan, Due in the next 7 days, Priorities this month and Overdue tasks** sit below it.
- **The left menu** takes you everywhere else. Review and Plan get a coloured outline when they're due.
- **The Todos list** on the right stays on every page.

Most of this is empty until you've added some work.

## Step 4: View your entity page

Select your entity under **Entities** in the left menu.

[[IMAGE#Screenshots/05-OrganisationPage.png]]

Every entity and project page has three tabs at the top right:

- **Overview:** the summary and task lists.
- **Scratchpad:** your notes, in separate blocks.
- **Raw:** the whole markdown file.

## Step 5: Create a new task for your entity

On the Overview, select the plus button beside **Tasks**. A blank task opens at the bottom of the list, ready to type into. Press Return to save it, and another blank task opens so you can keep going. Press Escape when you're done. A blank task that's left empty is removed without saving.

[[IMAGE#Screenshots/06-New Task.png]]

## Step 6: View your entity task list

Each task you add appears in the Tasks box. The summary above it shows how many are incomplete and how much is done.

[[IMAGE#Screenshots/07-TaskList.png]]

## Step 7: Assign a task to yourself and select a priority

A new task has no status yet. Select the small caret beside its circle and choose a status. Your name is one of the statuses, in the **ASSIGNED** group.

[[IMAGE#Screenshots/08-AssignTask.png]]

Once a task has a status, a second small dropdown appears beside it. Use that to set a priority of **A**, **B** or **C**.

[[IMAGE#Screenshots/09-AssignPriority.png]]

The same status menu has **Schedule** and **Deadline** options. Each asks for a date, which you can type or choose with the calendar button, and shows it under the task. A task with a date appears in **Due in the next 7 days** and **Overdue tasks** on the Dashboard's Overview. To remove a date, choose the option again and clear the box.

## Step 8: View your entity-wide todo list

The **Todos** list on the right shows every line, in every entity and non-archived project, that has a status. A task with no status stays in its own list and doesn't appear here.

Use **Filter** to narrow the list, and **Sort** to change the order. The tick boxes across the top choose which status types show, and the **Status**, **Priority**, **Entity** and **Project** dropdowns narrow it further. Archived items only appear here when you tick **ARCHIVED**, and on other pages only when `SHOWARCHIVED` is ticked in Options.

[[IMAGE#Screenshots/10-TodoList.png]]

## Step 9: Add notes to your entity document

Open the **Scratchpad** tab and double-click the text in the **Notes** block. Type your notes and select **Save**. Pressing `Ctrl + Enter` also saves, and `Escape` cancels.

Notes are markdown, so `###` at the start of a line makes a heading, for example.

[[IMAGE#Screenshots/11-AddingNotes.png]]

[[IMAGE#Screenshots/12-NotesAdded.png]]

## Step 10: Add new scratchpad blocks to documents

The Scratchpad can hold as many blocks as you like.

[[IMAGE#Screenshots/13-Scratchpad.png]]

Select the plus button beside **Scratchpad** and give the block a title.

[[IMAGE#Screenshots/14-NewBlock.png]]

Then double-click the new block to fill it in.

[[IMAGE#Screenshots/15-BlockFill.png]]

## Step 11: View the raw markdown for any entity or project page

Select the **Raw** tab at the top right.

[[IMAGE#Screenshots/16-RawButton.png]]

This shows the whole file at once, nicely laid out. Archived items are left out of this view unless `SHOWARCHIVED` is ticked in Options, as described in Step 31.

[[IMAGE#Screenshots/17-RawView.png]]

## Step 12: Edit the raw markdown

Double-click anywhere on the Raw view to edit the file's markdown as plain text. Select **Save**, or press `Ctrl + Enter`. `Escape` cancels. If the file has been changed elsewhere since the page loaded, nothing is saved, so you can't overwrite newer work by accident.

[[IMAGE#Screenshots/18-RawEdit.png]]

## Step 13: Mark a task as done

Select a task's status name to move it to its next status, or use the caret beside it to choose **DONE**. You can do this in the Todos list or on the page itself.

A finished task moves below the divider in the Todos list and is stamped with the date and time it was closed.

[[IMAGE#Screenshots/19-TaskDone.png]]

## Step 14: Navigate to projects

Under **Projects** in the left menu, select **All projects**. Your active projects are also listed underneath it for quick access. The list can be filtered by status or searched.

[[IMAGE#Screenshots/20-Projects.png]]

## Step 15: Create a new project

Select **New project** at the top right.

[[IMAGE#Screenshots/21-NewProject.png]]

Choose the entity it belongs to, give it a title, and choose who owns it. There are two project types:

- **Milestone:** a project with an end, divided into milestones. It can appear on the Timeline and the Plan.
- **Ongoing:** continuous work, kept as simple task lists.

[[IMAGE#Screenshots/22-ProjectFill.png]]

Select **Create project** and the new project opens. The tag beside the title shows whether it's active or inactive, and you can change that with its caret. The project type at the top of the page can also be changed there.

The summary on a Milestone project is a grid. Owner and Project Dependency share the first row, Created and Reviewed the second, and Milestones and Closed the third, with Active Timeframe down the right-hand side.

[[IMAGE#Screenshots/23-MyNewProject.png]]

## Step 16: Add milestones and milestone tasks to a project

Select the plus button beside **Milestones**. A blank milestone opens, ready to type into. Press Return to save it and start another, or Escape to stop.

[[IMAGE#Screenshots/24-NewMilestone.png]]

Each milestone appears as a coloured block in the progress bar and as its own card below. Use the plus button on a card to add tasks to it, the same way. The minus button deletes the milestone and its tasks after asking. The drag handle reorders cards, and the small arrow collapses them.

The colours show progress: green is complete, yellow is in progress, orange is not started and pink is unplanned, meaning it has no tasks yet.

[[IMAGE#Screenshots/25-Milestones.png]]

## Step 17: Edit the raw project markdown to add subtasks

The plus button adds top-level tasks only, so subtasks are added by hand. Open the **Raw** tab, double-click to edit, and indent a task underneath the one it belongs to.

[[IMAGE#Screenshots/26-AddingSubTasksInRaw.png]]

Save, and the indented tasks appear nested under their parent on the Overview.

[[IMAGE#Screenshots/27-ShowingSubtasks.png]]

## Step 18: Set a timeframe for an active project

On the Overview, select the plus button beside **Active Timeframe**, choose a start and end month and year, and select **Add**. A timeframe always runs from the first day of its start month to the last day of its end month. A project can have more than one timeframe. The form in this screenshot shows full dates, as it did before months were introduced.

The timeframe puts the project on the Timeline. It also adds the project to **Priorities this month** while today falls inside it.

[[IMAGE#Screenshots/28-SettingTimeTrame.png]]

## Step 19: Review your time so far, including new entities and projects

Before reviewing, finish a task or two so there's something to report.

[[IMAGE#Screenshots/29-SecondTaskComplete.png]]

Under **Time Management** in the left menu, Review and Plan are outlined when they're due. The two numbers beside Review are how many projects and how many entities are waiting to be reviewed.

[[IMAGE#Screenshots/30-TimeManagement.png]]

Open **Review**. The top boxes list every project and entity that hasn't been reviewed yet.

[[IMAGE#Screenshots/31-Review.png]]

Select one to open it in an overlay, where you can read and edit it as normal. Select **Mark as reviewed and close** when you're done, or **Close** to leave it on the list.

[[IMAGE#Screenshots/32-ReviewAndClose.png]]

## Step 20: Document your wins for this period

Further down the Review page, finished tasks since your last review are grouped by status. These come from your projects, including Ongoing ones, your entities and tentacles, and any tasks under a contact or event in Networking.

1. Select **Add to wins** on a box to copy its tasks into the **Wins** text box.
2. Edit the text or add anything else you're proud of.
3. Select **Submit wins and archive**.

Your wins are saved in `Time_Management/Review.md`. Every finished task, not only those listed, moves to the archived status and disappears from view. Past reviews are on the **History** tab.

Each review also logs figures to `Entities/Reports.md`: the tasks you completed and those still open, overdue tasks, active projects with nothing finished, how much of your Plan got done, and the wins you logged. Step 38 shows how to read them.

There's no screenshot of this step, but the Wins box can be seen at the bottom of the Review page in Step 19.

## Step 21: Plan the next work period and submit your focuses

Open **Plan**. The top boxes list everything that hasn't been assigned yet: tasks in your active Milestone projects, tasks and status-tagged lines in your entities and tentacles, and tasks under a contact or event in Networking. The small arrow on any box on this page collapses it.

- A project with a timeframe that includes today is outlined and tagged **Suggested**.
- A task that's the last one unfinished in its milestone is outlined too.

[[IMAGE#Screenshots/33-PlanScreen.png]]

Select tasks to move them into **Focus** below, then set a status and priority for each. Anything already assigned is in the Focus automatically. When you're happy, select **Submit focus**.

[[IMAGE#Screenshots/34-FocusChosen.png]]

## Step 22: Observe new highlighted todos relevant to your focus

Your plan is saved in `Time_Management/Plan.md`, and can be read back on the **History** tab of the Plan page. The Todos list now outlines items according to your latest plan:

- **Purple:** the plan names this task or its milestone.
- **Cyan:** the plan includes this project, entity or tentacle.
- **Pink:** the task's project isn't active.

[[IMAGE#Screenshots/35-CurrentFocusHighlights.png]]

## Step 23: Add commitments to the timeline which are not project-specific

Commitments are things that take up your time without being projects, such as a holiday or a shutdown. Open **Commitments** under Time Management and select the plus button to add one.

[[IMAGE#Screenshots/36-NewCommitments.png]]

On each card you can set:

- **Priority** with the small tag: A, B or C. This sets its colour on the Timeline.
- **Active Timeframe** with the pencil or plus button, choosing a start and end month.
- **Project Dependency** if it relies on a project or another commitment.

Double-click a name to change it. The minus button deletes a commitment after asking.

[[IMAGE#Screenshots/37-Commitments.png]]

## Step 24: View the timeline

The Timeline is on the Dashboard's Overview tab. Projects are graded through the colours of their milestones, and commitments are one solid colour. A project with no milestones is shown as `N/A` in the key. Where one item depends on another, it sits underneath with an arrow joining them. Select any bar to open it.

[[IMAGE#Screenshots/38-TimelineView.png]]

## Step 25: Create a new tentacle

Tentacles are for parts of your entity, such as an artist or a department. On your entity's page, select the plus button at the end of the row of names, and enter a name and an ID.

[[IMAGE#Screenshots/39-NewSubEntity.png]]

It gets its own tab with its own tasks, notes and files.

[[IMAGE#Screenshots/40-NewEntityView.png]]

## Step 26: Add a todo in a notes section and assign it to yourself

You don't need a task list to create a todo. In any notes, start a line with a status name, exactly as it's written in capitals.

[[IMAGE#Screenshots/41-TodosAnywhere.png]]

After saving, the name becomes a status control and the line appears in your Todos list.

[[IMAGE#Screenshots/42-TodosAnywhere2.png]]

## Step 27: Add a new lead contact

Open **Leads** under Networking. Select the plus button beside **New contact** and enter a name. Then double-click any field on the card to fill it in.

[[IMAGE#Screenshots/43-Leads.png]]

## Step 28: Add a new event

Open **Events** under Networking and select the plus button beside **New event**. Enter a name, and choose which heading it goes under if you have more than one. Double-click the fields on the card to fill in the artist, date, venue, contact, details, payment and tasks.

An event moves to **Past events** at the bottom of the page once its date has gone by.

## Step 29: Link a lead in an event and vice versa

Double-click a field and type the name of the other entry in double square brackets. In an event, you might link to the contact like this:

[[IMAGE#Screenshots/44-LinkingLeads.png]]

After saving, it becomes a link that opens that entry and outlines it. To link the other way, type `[[Events#The Name Of The Event]]` in a field on the contact's card.

## Step 30: All the ways to link

These work anywhere you can write notes:

- `[[Leads#Name]]` links to a contact.
- `[[Events#Name]]` links to an event.
- `[[Leads#Name|the text to show]]` links with your own wording. This works for every kind of `[[ ]]` link.
- `[[#Name]]` looks for that name on the Networking page you're on, then the other one.
- `[[ID]]` opens that entity's page, for example `[[LABEL]]`.
- `[[ID#Tasks]]` opens that entity's task list. Use any heading from `TASKLISTS`.
- `[[ID#Any other heading]]` opens that entity's Scratchpad at that section.
- `[[IMAGE#Screenshots/01-RunServer.png]]` shows an image from the `Images` folder.
- `[the text to show](https://example.com)` links to a website, and a web address written out in full becomes a link by itself.

A few details:

- Capitals don't matter in a name, but an entity's ID has to be exact.
- A name also finds a heading that adds something in brackets, so `Scott` finds `Scott (SWOLE)`.
- A link that doesn't match anything is left as plain text.

**Project Dependency** is written a little differently. It's the name of a project, or `COMMITMENT` followed by a commitment's name, such as `COMMITMENT Wintergrind Shutdown`.

## Step 31: View the options page

Open **Options** at the bottom of the left menu. The **General** tab holds:

- `DATEFORMAT`: how dates are shown and typed. They're always stored as `YYYY-MM-DD`.
- `ROUNDUP`: how many days between each Review and Plan.
- `PROJECTS`: the folders that hold projects, separated by commas.
- `TASKLISTS`: the task list headings on entities and Ongoing projects, separated by commas.
- `SHOWARCHIVED`: tick it to keep archived tasks visible on project and entity pages.

[[IMAGE#Screenshots/45-Options.png]]

## Step 32: Add a new projects directory

To keep a separate set of projects, such as ideas you're incubating, add a name to `PROJECTS`, separated by a comma, and select **Save**. It gets its own section in the left menu.

Then create a folder with exactly that name, next to your `Projects` folder. Until you do, Compatibility reports it as missing, as shown in Step 35.

[[IMAGE#Screenshots/46-NewIncubator.png]]

The **Statuses** tab sets the status names you can give tasks. Double-click a value to change it, and use the plus and minus buttons to add or remove rows. **Next status** decides what a status moves to when you select it.

[[IMAGE#Screenshots/47-CustomStatuses.png]]

## Step 33: Add new project leaders

On the **Leaders** tab, select the plus button and enter a name. Leaders can then be chosen as the owner of a project.

Tasks are assigned using statuses, so if you'd like to assign tasks to the new person too, add a status with their name in the **ASSIGNED** type on the Statuses tab.

[[IMAGE#Screenshots/48-NewProjectLeaders.png]]

## Step 34: Customise your dashboard colours

The **Colours** tab lists every colour the dashboard uses and what it's for. Double-click a colour and enter a 6 character hex value, such as `#00ff6a`. The change shows straight away. One colour often has several uses, and changing it changes them all.

The colours starting `print-` are only used when you print a generated report, described in Step 38, so it comes out as dark text on white paper.

[[IMAGE#Screenshots/49-CustomColours.png]]

## Step 35: Review project compatibility

Under **Compatibility** in the left menu, the two pages check your entity and project files are in the format the dashboard expects. Each problem is coloured by what can be done about it:

- **Accent colour:** a missing field, heading or entity file. Select **Fix issues** to add it automatically.
- **Pink:** something you need to change by hand. This example is a directory listed in Options that doesn't exist yet.
- **Orange:** a file or folder that isn't where it's expected to be, or markdown with no clear purpose.

Fix issues only ever adds what's missing and leaves everything else alone.

[[IMAGE#Screenshots/50-ProjectCompatibility.png]]

## Step 36: The directory structure and naming conventions

Your files are organised like this:

[[IMAGE#Screenshots/51-DirectoryStructure.png]]

- `dashboard`: the dashboard's own code.
- `Entities`: a folder per entity, named after its ID, with tentacles inside their parent, and `Reports.md`.
- `Images`: pictures used in your notes and this guide.
- `Labels`: the settings files behind the Options page.
- `Networking`: `Leads.md` and `Events.md`.
- `Catalogs`: a CSV file per catalog, named with its tag and name, such as `RLS_Record_Label_Studios.csv`. Step 39 shows how to use them.
- `Projects`, and any other directory in `PROJECTS`: a folder per project.
- `Time_Management`: `Review.md`, `Plan.md` and `Commitments.md`.

A project's folder name holds its status, its entity and its title:

[[IMAGE#Screenshots/52-ProjectFolder.png]]

- It starts with `+` when active and `-` when inactive. The tag beside the project's title changes this for you.
- To archive a project, rename its folder to start with the date, such as `2026-11-30_LABEL_Design_A_New_Logo`.
- Next comes the entity's ID, then an underscore, then the title with underscores for spaces.
- The main markdown file inside is named after the title, such as `Design A New Logo.md`.

An entity's file is `Entities/ID/Name.md`, using the ID and name from setup.

## Step 37: Create a new markdown file within an entity or project

A project or entity can hold more than one markdown file. To add one, select the plus button on the row of file tabs, which is above the content on an entity and on the **Raw** tab of a project. The new file opens straight away with the fields and headings it needs.

You can also put a markdown file in the folder yourself, using any text editor.

[[IMAGE#Screenshots/53-NewMarkdownFile.png]]

Each file then gets its own tab. On a project, the tabs are on the Raw tab. On an entity, they're on all three tabs.

[[IMAGE#Screenshots/54-NewMarkdownView.png]]

If Compatibility lists a file you've added as **Unknown markdown**, it's only a reminder that the file doesn't use any of the dashboard's fields or headings. It still works.

## Step 38: Read your report and save it

Each time you submit a Review, a few figures are added to `Entities/Reports.md`. Open **Dashboard** in the left menu and choose the **Report** tab to see them over time.

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

## Step 39: Keep a catalog of your releases

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

To show a picture, put it in the `Images` folder and write its name in double square brackets, such as `[[IMAGE#Logo.png]]` for your logo. Type dates the same way as everywhere else.

Each catalog is saved as a spreadsheet file in the `Catalogs` folder, so you can also open it in any spreadsheet program. Columns you add there appear in the dashboard too.

When you've finished the guide, tick **Mark as read** below it. The green outline around **Help Guide** in the left menu then goes away.

- [ ] Mark as read
