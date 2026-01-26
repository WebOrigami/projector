# Origami Projector

Origami Projector (hereafter, Projector) is an editor and expression evaluation system for quickly iterating on code, data, and content.

Projector shortens the conventional cycle in which you edit a text file (e.g., a markdown file), save it, run some code to generate an affected artifact (a HTML file incorporating that content), view the artifact, then edit again.

Traditional: Edit → Save → Run → View → (repeat)
Projector: Edit → View → (repeat)

Projector is aimed at developers and designers, as well as people with a degree of technical comfort who do not think of themselves as coders. To that end, Projector is envisioned as a standalone application for performing tasks which are normally done with a terminal.

Projector is designed to coexist with other design and development tools such as code editors (e.g., Microsoft VS Code, NeoVim), text editing applications (Obsidian, iA Writer), and command-line shells (bash).

For the present time, Projector is only available on macOS for Apple Silicon. The projector is architected to allow for the possible addition of Windows and/or Linux versions in the future.

## Current status

The initial feature set is small and designed to be reasonably self-consistent. That said, even an extremely basic file-editing application carries high user expectations.

The focus at this early stage is confirming the idea’s viability and working out the proper shape of the tool. The current app experience is all but certain to have bugs and rough edges; hopefully it’s good enough to envision what you’d really like the application to do and be motivated to provide feedback. If you find a bug, please report it.

Experience suggests that feedback will direct the app’s evolution in directions that are hard to imagine at this point. It’s best to avoid getting too attached to any specific feature designs yet.

The application should let you perform basic editing of typical Origami projects:

- Install the application on macOS with Apple silicon.
- Issue Origami commands and see the result instantly appear in the result pane.
- Edit a text file (.md, .js, .ori, etc.) and see the result automatically reload.
- If the displayed HTML contains links, browse within the local site.
- Use Back/Forward buttons to navigate command results.

## Out of scope

- Standard file tab behavior common in IDEs (drag and drop, Close to Right, etc.)
- Adjusting or disabling auto-save or auto-reload
- Directly specifying the default site for a project
- Window or Linux versions
- Dark mode
- Context menus
- Resizing the 50/50 split of the window panes
- Reloading project settings if you edit `config.ori` or `package.json` inside the app; you’ll need to close the window and then reopen it to see the changes
- In-app File Explorer
- Real code editor
- LSP integration for syntax highlighting and inline errors
- Selectable views (YAML, JSON, SVG diagram, etc.)
- Reloading JavaScript modules (other than ones directly loaded by Origami, just like `ori serve watch` does)
- JavaScript module isolation. All modules for all project windows are loaded in a single Node application space; if one project loads JavaScript that manipulates global state, that might interfere with the running of a project in a different window.
- Build, serve, or deploy a site
- Help

# Projects

Projector’s user model is organized around _projects_: a folder tree of related files, generally identified by its root; see below.

Within a project, Projector can edit text files: plain text, markdown, CSS, JSON, YAML, JavaScript, Origami, etc. Files are always viewed in the context of a project.

## Project root

When you open a file or folder, Projector establishes its associated root folder based on the file/folder’s location:

1. From the location, Projector walks up the folder hierarchy looking for an Origami configuration file called `config.ori`. If found, the folder containing that file is the project root. Note: an `origami` project may also have a `package.json` at the root level.
2. From the location, Projector walks up the folder hierarchy looking for an npm `package.json` file. If found, the folder containing that file is the project root.
3. Otherwise, the file’s containing folder is the project root; or, if the given object was a folder, the folder itself is the project root.

## Project name

A project’s name is used as a way to identify the project in window title bars and the Open Recent Project submenu.

- For an `origami` or `npm` project with a package.json at its root, the project name is the `name` field from that file.
- Otherwise the friendly name is the name of the project’s root folder. E.g., for `/Users/Alice/hello`, the project name is “hello”.

## Default site

Each project can be associated with a _default site_: a tree of resources used to handle absolute local URLs.

If you render an HTML page, it may reference stylesheets, scripts, or other resources with absolute paths like `/assets/styles.css`. Projector needs to load those resources from somewhere — and there may not be any obvious connection between the command (or the active file) and the location of those resources.

Therefore, Projector loads such absolute local URLs from the project’s default site, which it finds with the following heuristic:

- If the project contains a package.json file with `scripts`, Projector searches the `dev`, `serve`, `start`, or `build` scripts (in that order) for the first script that references an `.ori` file. That `.ori` file will be loaded as the project’s default site. For example, if the script follows the [standard incantation to start a server](https://weborigami.org/cli/incantations#starting-an-origami-server-with-debugging), then the project’s default site will be the same as the one you normally start with `npm run start`.

- If such a site path can’t be found, the project’s default site will be the project’s root folder. That is, absolute local URLs paths will be resolved with the root folder as the root of the site.

# User interface

## Basic application behavior

When you start Projector, it restores the project windows that were open when you last quit the application, skipping any project whose root folder no longer exists. Reopening projects is viewed as a non-critical user convenience; even if none of the previous projects exist, no message is shown.

When reopening a project window, Projector attempts to restore the state of the window when you closed it:

* It reopens the most recently opened file.
* It shows the most recently run command in the command bar.
* If in the last session that most recent command had completed without errors, then Projector re-runs that command and displays the result. If, in the last session, the command caused the application to hang or crash, then when restarting Projector displays the command but _not_ run it.

### Settings

Projector persists the following settings:

- paths of recent projects
- paths of projects which were open when the application was closed
- paths of the recent files opened within each project
- recent commands used within each project

These settings are saved whenever their values change.

### File associations

Projector registers itself as a handler for the `.ori` file extension. Double-clicking a file in a folder window should open the project for that file, then open the file in the editor.

On macOS it doesn't appear possible to register a handler for combination extensions like `.ori.html`.

### Auto-reload

Projector will detect if you edit project files outside the application and reload both the editing area and the result pane. This lets you use Projector in parallel with other tools.

Externally editing certain files have additional effects:

* External edits to `package.json` or `config.ori` reload the project. This will pick up changes in, for example, project name or default site.
* External edits to the project’s default site file (e.g., `src/site.ori`) will cause the site to be reloaded.

## Menu bar

The application menu bar offers the standard commands for a text editor.

### File menu

- **Open Project Folder…**. Shows a standard File Open dialog to pick an existing folder.
- **Open Recent Project**. A submenu showing the friendly names of recently opened projects.
- **Close**. Closes the current project window.
- **New File**. Clears the text editor.
- **Open File…**. Shows a standard File Open dialog to pick an existing file.
- **Save File As…**. Shows a standard File Save As dialog.

Opening a folder via the Open menu implies opening the project for the project’s root (see project root, above). If that project is already open in a window, that project window is made active. Otherwise the folder opens in a new window for that project.

The Open Recent Project submenu shows the friendly names of the 10 most recently opened projects. The submenu also includes a "Clear Menu" command to clear the recent projects list. Selecting a project from this submenu opens it. If the project path no longer exists, an error message indicates this, and the project is removed from the recent projects menu.

Using Save As to save a file outside of the project’s folder tree will save that text to the indicated location and close the file in that project window. A project window for the file’s new location will open (or, if that new location’s project is already open, that window will activate).

### Edit menu

The menu bar shows a stock Edit menu with the usual commands: Cut, Copy, Paste, etc.

### View menu

- **Home**. Runs the command that will show the project’s root.
- **Back**. Backs up to the last command and reruns it.
- **Forward**. Navigates forward in the command history.
- **Toggle Developer Tools**. Shows standard Chromium Dev Tools.

The Back/Forward buttons generally emulate standard browser behavior with a back/forward stack.

### Window menu

The Window menu is a stock menu with the usual commands: Minimize, etc.

### Keyboard shortcuts

In addition to the menu item keyboard shortcuts, Projector supports:

* **Command+L**: Moves the focus to the command area and selects the command text.

## Project window

Each open project is represented by a single window. The window title bar shows the project’s friendly name.

The window is divided into a 2x2 grid:

- Recent bar in upper left
- Editing area in main part of left side
- Command bar in upper right
- Result pane in main part of right side

## Recent bar

Projector tracks the 10 most recently opened files for a given project. These are rendered as tabs across the top of the editing area. The recent bar shows as many tabs as can fit horizontally; the remainder are clipped.

Each tab displays the name of the associated file, or "Untitled" if the file has not been saved yet.

The active file is always the most recent one, and always shown in the leftmost tab. Opening another file in the project (via File / Open, or by clicking a different tab) makes that new file the recent file, and therefore the active and leftmost tab.

If you have made changes to a new file but not saved it, attempting to open another file will display a Yes/No/Cancel dialog prompting you to save the changes.

If you select a recent file from the tab bar and that file no longer exists, the tab for that file is removed.

It is possible to have no file open and hence no file tabs visible.

## Editing area

The editing area is a standard, multi-line text box.

### Auto-save

When you type into the editing area for an existing file, after a short (subsecond) delay Projector automatically saves the edits; it is not necessary to use a Save command.

If you are working in a new file, your edits will not be saved until you use the File → Save File As command to save the file.

Stopgap: It’s possible to edit `package.json` and `config.ori` in Projector — but edits you make to those files within the application will _not_ trigger a reload of the project. Reloading is a somewhat expensive operation, and deemed too hard to support with auto-save. You will need to close the project window and reopen it to reload the project with those changes.

## Command bar

A single line text box in the upper right lets you enter Origami commands. These are parsed and evaluated as with the `ori` CLI. (Because you are not working inside of a shell program, e.g., bash, you don’t have to worry about a shell parser parsing things. Among other things, you don’t have to quote parentheses.)

When you open a project for the first time, if the project has a default site, then the default command will evaluate that site. E.g., if the default site is defined in `src/site.ori`, then the default command will be `src/site.ori/`. This will generally cause the site’s default index.html page to appear.

When the keyboard focus is in the command bar, pressing Return evaluates the current command in the context of the project root folder. (An empty command does nothing.)

Each project records the 10 most recent commands for that project. Issuing a command makes it the most recent command.

While the command bar has focus, you can press the Up or Down arrow keys to navigate to, respectively, the previous or next command in the recent command list.

If you have navigated within the result pane (see below), the right side of the command bar shows the current path within the result.

### Back and Forward buttons

Back and Forward buttons like you navigate your command history in the same way you can navigate web history in a browser.

## Result pane

The result pane shows the result of the most recently-issued command: an HTML page, text file, etc.

If the result is an image, its width is constrained to the width of the pane.

### Auto-run

Whenever the active file is saved, after a short delay the result pane will reload to show any effects of the edits.

Before reloading, Projector saves the scroll position of all scrollable elements on the page. After the result pane reloads, if the command and result path have stayed the same (i.e., you are not navigating), then Projector attempts to restore the scroll position of those elements. The goal is to let you continue viewing the same area of the page you were looking at previously.

### Navigation within the result

If you click a link in an HTML result:

* An external link opens in your default browser.
* An internal link is intercepted and handled by modifying the current command. E.g., if the current command is `src/site.ori/` and you click a link to “about.html”, Projector updates the command to `src/site.ori/about.html` and then runs that.

# Error handling

If the main application suffers a top-level unexpected error, it displays an error dialog. It also saves an error report in `~/Library/Application Support/Origami Projector/error.log`.

# Architecture

Projector is an Electron application, so includes both the Node runtime and the Chromium browser engine.

Some important pieces:

- Main process. This defines overall application behavior, including startup and shutdown.
- Project. An object representing the state of an open project.
- Project window. There is one Electron window for each open project.
- Session. Each project window has an associated browser session.
- Renderer. Each project window has an associated renderer process that can communicate with the main application or, through it, with the associated project or session.
- Client page. The content of each project window is defined with an HTML page that loads client-side JavaScript.

## Dependency notes

- The @weborigami/origami package has a dependency on "sharp", which has an optional dependency on "@emnapi/runtime". There are known issues using sharp in Electron; it appears that npm doesn't always install the @emnapi/runtime package, which causes electron-builder to fail. The package.json contains several workarounds for this, including explicitly installing @emnapi/runtime and sharp; setting `asar` options to unpack these packages; and using the `npmRebuild` and `buildDependenciesFromSource` options. It would be nice to find a cleaner solution in the future.
