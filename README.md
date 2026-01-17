# Origami Projector

Origami Projector (hereafter, “Projector”) is an experimental editor and evaluation system for quickly iterating on code, data, and content.

Projector shortens the conventional cycle in which you edit a text file (e.g., a markdown file), run some code to generate an affected artifact (a HTML file incorporating that content), view the artifact, then edit again.

Edit → Run → View → repeat

Projector is aimed at traditional developers, designers, as well as other people that may have a degree of technical proficiency but do not think of themselves as coders. To that end, Projector is envisioned as a standalone application for performing tasks which are normally done with a terminal.

Projector is designed to coexist with other design and development tools such as IDEs (e.g., Microsoft VS Code, NeoVim), text editing applications (Obsidian, iA Writer), and command-line tools (Origami, node).

## Current status

Projector is an experimental application. The initial feature set is small and designed to be reasonably self-consistent, but even an extremely basic file-editing application carries high user expectations. If you find a bug, please report it.

The focus at this early stage is confirming the idea’s viability and working out the proper shape of the tool. The current app experience is all but certain to have bugs or rough edges, but hopefully it’s good enough to envision what you’d really like the application to do and be motivated to provide feedback. Experience suggests that feedback will direct the app’s evolution in directions that are hard to imagine at this point; don’t get too attached to anything yet.

The application should be sufficient to perform basic editing of Origami projects. You should be able to:

- Install the application on macOS.
- Open and save text files.
- Issue Origami commands and see the results immediately appear in the result pane.
- Edit a text file and automatically reload the result.
- If the displayed HTML contains links, browse within the local site.

Out of scope for now:

- Window or Linux versions
- Dark mode
- Window pane management (showing, hiding, resizing)
- In-app File Explorer
- Watching file edits made outside the application
- Reloading project settings when `config.ori` or `package.json` is edited
- Real code editor
- LSP integration
- JavaScript file cache resets
- Build or serve
- Deploy a site
- Help

# Projects

Projector’s user model is organized around _projects_: a folder tree of related files, generally identified by its root; see below.

Within a project, Projector can edit text files: plain text, markdown, CSS, JSON, YAML, JavaScript, Origami, etc.Files are always viewed in the context of a project.

## Project root and type

For any given file (or folder, in the case of the Open Folder menu item), Projector establishes its associated root folder and type based on the file/folder’s location:

1. From the location, Projector walks up the folder hierarchy looking for an Origami configuration file called `config.ori`. If found, the folder containing that file is the project root. The project type will be `origami`. Note: an `origami` project may also have a `package.json` at the root level.
2. From the location, Projector walks up the folder hierarchy looking for an npm `package.json` file. If found, the folder containing that file is the project root. The project type will be `npm`.
3. Otherwise, the file’s containing folder is the project root; or, if the given object was a folder, the folder itself is the project root. The project type will be `folder`.

## Project name

A project’s name is used as a way to identify the project in window title bars and the Open Recent Project submenu.

- For an `origami` or `npm` project with a package.json at its root, the project name is the `name` field from that file.
- Otherwise the friendly name is the name of the project’s root folder. E.g., for `/Users/Alice/hello`, the project name is “hello”.

## Default site

Each project can be associated with an optional _default site_: a tree of resources used to handle absolute local URLs.

When you are editing a file that eventually renders as HTML, the framed page needs to know where to obtain any stylesheets, scripts, or other resources referenced with absolute paths like `/assets/styles.css`.

Projector uses a heuristic to find the default site for a project.

If the project contains a package.json file with a `start` script, Projector searches that script command for the first path that includes a `.ori` file. If the script follows the [standard incantation to start a server](https://weborigami.org/cli/incantations#starting-an-origami-server-with-debugging), then the project’s default site will be the same as the one you normally start with `npm run start`.

If such a site path can’t be found, the project’s default site will be the project’s root folder. That is, absolute local URLs paths will be resolved with the root folder as the root of the site.

# User interface

## Basic application behavior

When the application starts, it opens a window for the most recently opened project where the project folder still exists. If no such recent project exists, the Open Folder dialog is shown.

When reopening a project window, the most recently opened file in the project is opened, and the most recently run command is shown in the command bar. If the last command run (before closing the project) had completed without errors, then that last command is repeated.

### Settings

The application persists the following settings:

- paths of recent projects
- paths of recent files within each project
- recent commands used within each project

These settings are saved whenever the values change so that they can survive application crashes.

## Menu bar

The application menu bar offers the standard commands for a text editor.

### File menu

- **New**
- **Open File…**. Shows a standard File Open dialog to pick an existing file.
- **Open Folder…**. Shows a standard File Open dialog to pick an existing folder.
- **Open Recent Project**. A submenu showing the friendly names of recently opened projects.
- **Close**. Closes the current window.
- **Save**
- **Save As…**. Shows a standard File Save As dialog.

Opening a file via the Open menu implies opening the associated project. If that project is already open in a window, the file is opened in that project window. Otherwise a file opens in a new window for that project.

The Open Recent Project submenu tracks the 10 most recently opened project. Selecting a project from this submenu opens it in a new window (or, if the project is already open, it activates that window). The submenu also includes a "Clear Menu" command to clear the recent projects list.

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

Each open project is represented by a single window.

The window is divided into a 2x2 grid:

- Tab bar in upper left
- Editing area in main part of left side
- Command bar in upper right
- Result pane in main part of right side

## Title bar

The window shows the project’s friendly name.

## Tab bar

Projector tracks the 10 most recently opened files for a given project. These are rendered as tabs across the top of the editing area. The tab bar shows as many tabs as can fit horizontally; the remainder are clipped.

Each tab displays the name of the associated file, or "Untitled" if the file has not been saved yet. If the file is `dirty` (has unsaved changes), an circle (`⚫︎`) is appended to the title.

The active file is always the most recent one, and always shown in the leftmost tab. Opening another file in the project (via File / Open, or by clicking a different tab) makes that new file the recent file, and therefore the active and leftmost tab.

If the user selects a recent file from either the tab bar or the Open Recent File and that file no longer exists, the file is removed from both locations.

In an `unsaved` project, it is possible to have no file open and so no file tabs visible.

## Editing area

- When a file is opened, its contents are loaded and displayed in the editing area. The `dirty` state is set to `false`.
- When the user modifies the contents of the editing area, the `dirty` state is set to `true`.
- If the user tries to save the file but the file has not yet been saved (i.e., `filePath` is `null`), a Save As dialog is shown first. The `filePath` is then set to the selected path.
- When the user saves the file via the Save or Save As menu commands, the contents of the editing area are written to the file, and the `dirty` state is set to `false`.
- If the user attempts to create a new file, open an existing file via Open, or close the window while the current file has unsaved changes -- i.e., `dirty` is `true` -- the application prompts the user with a Yes/No/Cancel dialog to "Save changes?" before proceeding.

## Command bar

A text box in the upper right lets the user enter Origami commands.

Pressing Return evaluates the current command in the context of the project root folder. (An empty command has no effect.)

Each project records the 10 most recent commands for that project. Issuing a command makes it the most recent command.

While the command bar has focus, the user can press the Up or Down arrow keys to navigate to, respectively, the previous or next command in the recent command list.

## Result pane

The result pane shows the result of the most recently-issued command: an HTML page, text file, etc.

# Error reports

If the main application suffers a top-level unexpected error, it saves an error report in `~/Library/Application Support/Origami Projector/error.log`.

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
