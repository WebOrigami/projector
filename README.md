# Origami Studio

This prototype is a simple Electron application that can edit a single text file at a time.

## Architecture

- The HTML for the window is completely vanilla HTML and has no CSS or JavaScript.
- Beyond the necessary dependencies for Electron, this project has no other dependencies.

## Basic application behavior

- When the application starts, it opens the most recently opened file. If no files have been opened yet, it opens a new, unsaved file called "Untitled".
- When the last application window closes, the application exits.

## Menu bar

The application menu bar offers the standard commands for a rudimentary text editor.

File menu:

- **New**
- **Open…**. Shows a standard File Open dialog.
- **Open Recent**. A submenu showing recently opened files; see below.
- **Close**. Closes the current window.
- **Save**
- **Save As…**. Shows a standard File Save As dialog.
- **Run**.

Edit menu:

- **Undo**
- **Redo**
- **Cut**
- **Copy**
- **Paste**
- **Select All**

Debug menu:

- **Toggle Developer Tools**

The Open Recent submenu tracks the 10 most recently opened files. Selecting a file from this submenu opens it in the current window. The menu also includes a "Clear Menu" command to clear the recent files list.

## Window state

The window title displays the name of the currently opened file, or "Untitled" if the file has not been saved yet. If the current file has unsaved changes, an circle (`⚫︎`) is appended to the title.

Each window tracks the following state:

- `filePath`: The path of the currently opened file, or `null` if no file is open.
- `dirty`: A boolean indicating whether the file has unsaved changes.

File behavior:

- When a file is opened, its contents are read and displayed in the textarea. The `dirty` state is set to `false`.
- When the user modifies the contents of the textarea, the `dirty` state is set to `true`.
- If the user tries to save the file but the file has not yet been saved (i.e., `filePath` is `null`), a Save As dialog is shown first. The `filePath` is then set to the selected path.
- When the user saves the file via the Save or Save As menu commands, the contents of the textarea are written to the file, and the `dirty` state is set to `false`.
- If the user attempts to create a new file, open an existing file via Open, or close the window while the current file has unsaved changes -- i.e., `dirty` is `true` -- the application prompts the user with a Yes/No/Cancel dialog to "Save changes?" before proceeding.

## Notes

- The @weborigami/origami package has a dependency on "sharp", which has an optional dependency on "@emnapi/runtime". There are known issues using sharp in Electron; it appears that npm doesn't always install the @emnapi/runtime package, which causes electron-builder to fail. The package.json contains several workarounds for this, including explicitly installing @emnapi/runtime and sharp; setting `asar` options to unpack these packages; and using the `npmRebuild` and `buildDependenciesFromSource` options. It would be nice to find a cleaner solution in the future.
