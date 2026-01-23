# Origami Projector

Origami Projector (hereafter, Projector) is an editor and expression evaluation system for quickly iterating on code, data, and content.

Projector shortens the conventional cycle in which you edit a text file (e.g., a markdown file), run some code to generate an affected artifact (a HTML file incorporating that content), view the artifact, then edit again.

Edit → Run → View → (repeat)

Projector is aimed at traditional developers, designers, as well as people with a degree of technical proficiency but who do not think of themselves as coders. To that end, Projector is envisioned as a standalone application for performing tasks which are normally done with a terminal.

Projector is designed to coexist with other design and development tools such as code editors (e.g., Microsoft VS Code, NeoVim), text editing applications (Obsidian, iA Writer), and command-line shells (bash).

## Current status

Projector is an experimental application. The initial feature set is small and designed to be reasonably self-consistent, but even an extremely basic file-editing application carries high user expectations. If you find a bug, please report it.

The focus at this early stage is confirming the idea’s viability and working out the proper shape of the tool. The current app experience is all but certain to have bugs and rough edges; hopefully it’s good enough to envision what you’d really like the application to do and be motivated to provide feedback. Experience suggests that feedback will direct the app’s evolution in directions that are hard to imagine at this point, so don’t get too attached to anything yet.

The application should be sufficient to perform basic editing of Origami projects. You should be able to:

- Install the application on macOS with Apple silicon.
- Issue Origami commands and see the result instantly appear in the result pane.
- Edit a text file (.md, .js, .ori, etc.) and see the result automatically reload.
- If the displayed HTML contains links, browse within the local site.

## Out of scope

- Standard file editing tabs (drag and drop, etc.)
- Adjusting or disabling auto-save or auto-reload
- Manually setting the default site for a project
- Window or Linux versions
- Dark mode
- Context menus
- Resizing the 50/50 split of the window panes
- In-app File Explorer
- Reloading project settings if you edit `config.ori` or `package.json` inside the app; you’ll need to close the window and then reopen it to see the changes
- Real code editor
- LSP integration
- Reloading JavaScript modules (other than ones directly loaded by Origami, just like `ori serve watch` does)
- JavaScript module isolation. All modules for all project windows are loaded in a single Node application space; if one project loads JavaScript that manipulates global objects, that might interfere with the running of a project in a different window.
- Build, serve, or deploy a site
- Help

# Projects

Projector’s user model is organized around _projects_: a folder tree of related files, generally identified by its root; see below.

Within a project, Projector can edit text files: plain text, markdown, CSS, JSON, YAML, JavaScript, Origami, etc. Files are always viewed in the context of a project.

## Project root and type

When you open a file or folder, Projector establishes its associated root folder and type based on the file/folder’s location:

1. From the location, Projector walks up the folder hierarchy looking for an Origami configuration file called `config.ori`. If found, the folder containing that file is the project root. The project type will be `origami`. Note: an `origami` project may also have a `package.json` at the root level.
2. From the location, Projector walks up the folder hierarchy looking for an npm `package.json` file. If found, the folder containing that file is the project root. The project type will be `npm`.
3. Otherwise, the file’s containing folder is the project root; or, if the given object was a folder, the folder itself is the project root. The project type will be `folder`.

## Project name

A project’s name is used as a way to identify the project in window title bars and the Open Recent Project submenu.

- For an `origami` or `npm` project with a package.json at its root, the project name is the `name` field from that file.
- Otherwise the friendly name is the name of the project’s root folder. E.g., for `/Users/Alice/hello`, the project name is “hello”.

## Default site

Each project can be associated with an optional _default site_: a tree of resources used to handle absolute local URLs.

When you are editing a file that eventually renders as HTML, the framed page may reference stylesheets, scripts, or other resources with absolute paths like `/assets/styles.css`. Project loads such absolute local URLs from the project’s default site.

Projector currently uses a heuristic to find the default site for a project.

* If the project contains a package.json file with `scripts`, Projector searches the `dev`, `serve`, `start`, or `build` scripts (in that order) for the first script that references an `.ori` file. That `.ori` file will be loaded as the project’s default site. For example, if the script follows the [standard incantation to start a server](https://weborigami.org/cli/incantations#starting-an-origami-server-with-debugging), then the project’s default site will be the same as the one you normally start with `npm run start`.

* If such a site path can’t be found, the project’s default site will be the project’s root folder. That is, absolute local URLs paths will be resolved with the root folder as the root of the site.

# User interface

## Basic application behavior

When you start Projector, it restores the windows that were open when you last quit the application, skipping any projects whose project root folder no longer exists.

When reopening a project window, Projector attempts to restore the state of the window when you closed it. It reopens the most recently opened file, and shows the most recently run command in the command bar. If, in the last session, that command had completed without errors, then it re-runs that command.

### Settings

Projector persists the following settings:

- paths of recent projects
- paths of projects which were open when the application was closed
- paths of the recent files opened within each project
- recent commands used within each project

These settings are saved whenever their values change.

## Menu bar

The application menu bar offers the standard commands for a text editor.

### File menu

- **Open Project Folder…**. Shows a standard File Open dialog to pick an existing folder.
- **Open Recent Project**. A submenu showing the friendly names of recently opened projects.
- **Close**. Closes the current project window.
- **New File**. Clears the text editor.
- **Open File…**. Shows a standard File Open dialog to pick an existing file.
- **Save File As…**. Shows a standard File Save As dialog.

Opening a file via the Open menu implies opening the associated project. If that project is already open in a window, the file is opened in that project window. Otherwise a file opens in a new window for that project.

The Open Recent Project submenu tracks the 10 most recently opened project. The submenu also includes a "Clear Menu" command to clear the recent projects list. Selecting a project from this submenu opens it in a new window (or, if the project is already open, it activates that window). If the project path no longer exists, an error message indicates this, and the item is removed from the recent projects menu.

Using Save As to save a file outside of the project’s folder tree will save that text to the indicated location and close the file in that project window. A project window for the file’s new location will open (or, if that new location’s project is already open, that window will activate).

### Edit menu

- **Undo**
- **Redo**
- **Cut**
- **Copy**
- **Paste**
- **Select All**

### Debug menu

- **Toggle Developer Tools**. Shows standard Chromium Dev Tools.

### Window menu

- **Minimize**
- **Zoom**
- **Bring All to Front**
- **Toggle Full Screen**
- List of friendly names of open project windows. A checkmark is shown next to the active window.

## Project window

Each open project is represented by a single window. The window title bar shows the project’s friendly name.

The window is divided into a 2x2 grid:

- Recent bar in upper left
- Editing area in main part of left side
- Command bar in upper right
- Result pane in main part of right side

## Auto-reload

Projector will detect if you edit project files outside the application and reload the window as appropriate.

## Recent bar

Projector tracks the 10 most recently opened files for a given project. These are rendered as tabs across the top of the editing area. The recent bar shows as many tabs as can fit horizontally; the remainder are clipped.

Each tab displays the name of the associated file, or "Untitled" if the file has not been saved yet.

The active file is always the most recent one, and always shown in the leftmost tab. Opening another file in the project (via File / Open, or by clicking a different tab) makes that new file the recent file, and therefore the active and leftmost tab.

If you select a recent file from the tab bar and that file no longer exists, the tab for that file is removed.

In an `unsaved` project, it is possible to have no file open and so no file tabs visible.

## Editing area

The editing area is a standard text box.

### Auto-save

When you type into the editing area for an existing file, after a short delay the edits will be saved; it is not necessary to use a Save command.

If you are working in a new file, your edits will not be saved until you use the File → Save File As command to save the file.

If you have made changes to a new file but not saved it, attempting to open another file will display a Yes/No/Cancel dialog prompting you to save the changes.

## Command bar

A text box in the upper right lets you enter Origami commands. These are parsed and evaluated as with the `ori` CLI. (Because you are not working inside of a shell program, e.g., bash, you don’t have to worry about a shell parser parsing things such as a parentheses, so you don’t have to quote parentheses.)

When you open a project for the first time, if the project has a default site, then the default command will evaluate that site. E.g., if the default site is defined in `src/site.ori`, then the default command will be `src/site.ori/`. This will cause the site’s default index.html page to appear.

When the keyboard focus is in the command bar, pressing Return evaluates the current command in the context of the project root folder. (An empty command does nothing.)

Each project records the 10 most recent commands for that project. Issuing a command makes it the most recent command.

While the command bar has focus, you can press the Up or Down arrow keys to navigate to, respectively, the previous or next command in the recent command list.

If you have navigated within the result pane (see below), the right side of the command bar shows the current path within the result.

## Result pane

The result pane shows the result of the most recently-issued command: an HTML page, text file, etc.

If the result is an image, its width is constrained to the width of the pane.

### Auto-run

Whenever the active file is saved, after a short delay the result pane will reload to show any effects of the edits.

Before reloading, Projector saves the scroll position of all scrollable elements on the page. After the result pane reloads, if the command and result path have stayed the same (i.e., you are not navigating), then Projector attempts to restore the scroll position of those elements. The goal is to let you continue viewing the same area of the page you were looking at previously.

### Navigation

If the result is an HTML page and you click on a link to navigate, this creates a _result path_: a path inside the result or, possibly, within the default site. This path will be shown on the right of the command bar.

# Error handling

If the main application suffers a top-level unexpected error, it displays an error dialog. It also saves an error report in `~/Library/Application Support/Origami Projector/error.log`.

# Architecture

Projector is an Electron application, so it includes both the Node runtime and the Chromium browser engine.

Some important pieces:

- Main process. This defines overall application behavior, including startup and shutdown.
- Project. An object representing the state of an open project.
- Project window. There is one Electron window for each open project.
- Session. Each project window has an associated browser session.
- Renderer. Each project window has an associated renderer process that can communicate with the main application or, through it, with the associated project or session.
- Client page. The content of each project window is defined with an HTML page that loads client-side JavaScript.

## Dependency notes

- The @weborigami/origami package has a dependency on "sharp", which has an optional dependency on "@emnapi/runtime". There are known issues using sharp in Electron; it appears that npm doesn't always install the @emnapi/runtime package, which causes electron-builder to fail. The package.json contains several workarounds for this, including explicitly installing @emnapi/runtime and sharp; setting `asar` options to unpack these packages; and using the `npmRebuild` and `buildDependenciesFromSource` options. It would be nice to find a cleaner solution in the future.
