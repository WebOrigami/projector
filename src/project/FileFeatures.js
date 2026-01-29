import { dialog } from "#electron";
import { toString } from "@weborigami/async-tree";
import { moduleCache } from "@weborigami/language";
import fs from "node:fs";
import * as path from "node:path";
import * as menu from "../app/menu.js";
import * as windowManager from "../app/windowManager.js";
import recent from "../recent.js";

const recentFilesUpdater = recent(10);

/**
 * Mixin defining project feature related to the active file
 */
export default function FileFeatures(Base) {
  return class extends Base {
    constructor(...args) {
      super(...args);

      // Internal state
      this._filePath = null;

      // State shared with the renderer
      Object.assign(this.state, {
        dirty: false,
        fileName: null,
        recentFiles: [],
        text: "",
        textSource: "file",
      });
    }

    async clearCacheForFileChange(filePath) {
      // If a JavaScript file changed, reset the module cache so that top-level
      // modules are reloaded on each request. Only top-level modules will be
      // reloaded; to reload modules those depend on will require a more complex
      // solution.
      const extname = path.extname(filePath).toLowerCase();
      const jsExtensions = [".cjs", ".js", ".mjs", ".ts"];
      if (jsExtensions.includes(extname)) {
        moduleCache.resetTimestamp();
      }

      // If a .ori file changed, reload the site
      const oriExtensions = [".ori"];
      // if (oriExtensions.includes(extname)) {
      //   this._site = null;
      // }

      // If a CSS file or any of the above changed, clear the Chromium cache.
      const cssExtensions = [".css", ".scss", ".sass", ".less"];
      const reloadExtension = [
        ...jsExtensions,
        ...oriExtensions,
        ...cssExtensions,
      ];
      if (reloadExtension.includes(extname)) {
        await clearBrowserCache(this._window);
      }
    }

    get dirty() {
      return this.state.dirty;
    }
    set dirty(dirty) {
      this.setState({ dirty });
    }

    // The page calls this on the project; forward to menu
    async fileOpen() {
      await menu.fileOpen(null, this._window);
    }

    get filePath() {
      return this._filePath;
    }

    // Read file
    async loadFile(filePath) {
      // Assert that we have a project root that contains filePath
      if (!this._root) {
        throw new Error("Tried to load file before loading project");
      }

      if (filePath) {
        const relative = path.relative(this._root.path, filePath);
        if (relative.startsWith("..")) {
          throw new Error(
            `File "${filePath}" is outside of project root "${this._root.path}"`,
          );
        }
      }

      if (this.state.dirty) {
        const shouldContinue = await menu.promptSaveChanges(this._window);
        if (!shouldContinue) {
          return;
        }
      }

      // Add file to recent files list
      let recentFiles = this.state.recentFiles;
      if (recentFiles.at(-1) === null) {
        // Remove unsaved file entry
        recentFiles.pop();
      }
      // Add new path (possibly null)
      recentFiles = recentFilesUpdater.add(recentFiles, filePath);

      await this.setState({ recentFiles });

      // Reload most recent file to load the new file. This handles edge cases
      // like a file that doesn't exist.
      await this.loadMostRecentFile();
    }

    /**
     * Return the text for the given file, or the empty string for a new file.
     *
     * Returns null if the file couldn't be loaded (e.g., doesn't exist, permission
     * denied), or isn't text.
     *
     * @param {string} filePath
     */
    loadFileText(filePath) {
      let result;

      if (filePath === null) {
        // New file
        result = "";
      } else {
        // Load existing file
        try {
          // Don't specify UTF-8 encoding; we want a buffer, not text
          const buffer = fs.readFileSync(filePath);
          // async-tree toString() returns null for non-text files
          result = toString(buffer);
        } catch (error) {
          result = null;
        }
      }

      return result;
    }

    /***
     * Load the most recent existing text file
     */
    async loadMostRecentFile() {
      let filePath = null;
      let text;
      const recentFiles = this.state.recentFiles;
      while (recentFiles.length > 0) {
        filePath = recentFiles.at(-1);
        const loaded = this.loadFileText(filePath);
        if (loaded === null) {
          // File couldn't be loaded (doesn't exist or isn't text), remove from recent files
          recentFiles.pop();
          filePath = null;
        } else {
          // Loaded file successfully
          text = loaded;
          break;
        }
      }

      this._filePath = filePath;
      const fileName = filePath ? path.basename(filePath) : "Untitled";

      this.setState({
        dirty: false,
        fileName,
        recentFiles,
        text: text ?? "",
        textSource: "file",
      });
    }

    get recentFiles() {
      return this.state.recentFiles;
    }
    set recentFiles(recentFiles) {
      this.setState({ recentFiles });
    }

    // Write text to file
    async save() {
      try {
        fs.writeFileSync(this.filePath, this.text, "utf8");
      } catch (/** @type {any} */ error) {
        dialog.showMessageBox(this._window, {
          type: "error",
          message: "Save Failed",
          detail: `Failed to save file "${this.filePath}": ${error.message}`,
        });
        return false;
      }

      // Mark as clean
      await this.setState({ dirty: false });

      // Clear caches as appropriate
      await this.clearCacheForFileChange(this.filePath);

      return true;
    }

    async saveAs(filePath) {
      if (!this._root) {
        return; // shouldn't happen
      }

      // Hack: set the filePath first so that save() works correctly
      const oldPath = this._filePath;
      this._filePath = filePath;
      const saved = await this.save();

      const withinProject = path
        .resolve(this._root.path, filePath)
        .startsWith(path.resolve(this._root.path));

      if (withinProject) {
        // Reload the file from the new file path
        await this.loadFile(filePath);
      } else {
        // File is outside project, remove old path from recent files
        const recentFiles = this.state.recentFiles.filter(
          (path) => path !== oldPath,
        );
        await this.setState({ recentFiles });

        // Tell window manager to open the file in a new project
        await windowManager.openFile(filePath);
      }

      return saved;
    }

    get text() {
      return this.state.text;
    }
  };
}

// Chromium aggressively caches CSS files, and no amount of cache-disabling in
// Electron or via HTTP headers seems to prevent this. As a workaround, we use
// the Chromium DevTools Protocol to clear the browser cache programmatically,
async function clearBrowserCache(window) {
  const dbg = window.webContents.debugger;
  // Attach if not already attached.
  if (!dbg.isAttached()) {
    // Pick a protocol version Electron accepts; 1.3 is commonly used.
    dbg.attach("1.3");
  }
  await dbg.sendCommand("Network.enable");
  await dbg.sendCommand("Network.clearBrowserCache");
}
