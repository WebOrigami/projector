import { Tree } from "@weborigami/async-tree";
import {
  compile,
  coreGlobals,
  formatError,
  moduleCache,
  projectConfig,
  projectRootFromPath,
} from "@weborigami/language";
import { initializeBuiltins } from "@weborigami/origami";
import { dialog } from "electron";
import fs from "node:fs/promises";
import * as path from "node:path";
import * as menu from "./menu.js";
import recent from "./recent.js";
import updateState from "./renderer/updateState.js"; // Shared with renderer
import * as settings from "./settings.js";

const REFRESH_DELAY_MS = 250;

const MAX_RECENT_COMMANDS = 50;
const recentCommandsUpdater = recent(MAX_RECENT_COMMANDS);

const MAX_RECENT_FILES = 10;
const recentFilesUpdater = recent(MAX_RECENT_FILES);

/**
 * Project state
 */
export default class Project {
  /**
   * Create a Project instance.
   *
   * To be used, the project must be loaded via loadFile() or loadFolder();
   * those methods are async so they can't be called from the constructor.
   *
   * @param {import("electron").BrowserWindow} window
   */
  constructor(window) {
    this.window = window;

    // State shared with the renderer
    this.state = {};
    this._fileParent = null;
    this._filePath = null;
    this._globals = null;
    this._packageData = null;
    this._refreshTimeout = null;
    this._result = null;
    this._root = null;
    this._site = null;
    this._sitePath = null;

    this.setState({
      command: "",
      dirty: false,
      error: null,
      fileName: getFileName(this._filePath),
      projectName: "New project",
      recentCommands: [],
      recentFiles: [],
      resultVersion: 0,
      text: "",
      textSource: "file",
    });
  }

  /**
   * Send state to page
   */
  async broadcastState() {
    // We can only send structured-clonable data, so we use structuredClone to
    // copy the state.
    const snapshot = structuredClone(this.state);
    return this.window.webContents.send("invoke-page", "setState", snapshot);
  }

  get command() {
    return this.state.command;
  }

  get dirty() {
    return this.state.dirty;
  }
  set dirty(dirty) {
    this.setState({ dirty });
  }

  get filePath() {
    return this._filePath;
  }

  executeJavaScript(js) {
    return this.window.webContents.executeJavaScript(js);
  }

  // The page calls this on the project; forward to menu
  async fileOpen() {
    await menu.fileOpen(null, this.window);
  }

  async focusCommand() {
    return this.invokePageMethod("focusCommand");
  }

  async invokePageMethod(...args) {
    await this.window.webContents.send("invoke-page", ...args);
  }

  // Read file
  async loadFile(filePath) {
    if (this.state.dirty) {
      const shouldContinue = await menu.promptSaveChanges(this.window);
      if (!shouldContinue) {
        return;
      }
    }

    this._filePath = filePath;

    // Update recent files list
    let recentFiles = this.state.recentFiles;
    if (recentFiles.at(-1) === null) {
      // Remove unsaved file entry
      recentFiles.pop();
    }
    // Add new path (possibly null)
    recentFiles = recentFilesUpdater.add(recentFiles, filePath);

    let text;
    if (filePath === null) {
      // New file. The user shouldn't be able to reach this point without having
      // loaded a project folder first.
      this._fileParent = this._root;
      text = "";
    } else {
      // Load existing file

      if (this._root === null) {
        // Load project first
        const folderPath = path.dirname(filePath);
        await this.loadFolder(folderPath);
      } else {
        // Assert that filePath is contained within project root
        const relative = path.relative(this._root.path, filePath);
        if (relative.startsWith("..")) {
          throw new Error(
            `File "${filePath}" is outside of project root "${this._root.path}"`
          );
        }
      }

      this._fileParent = await getParent(this._root, filePath);

      try {
        text = await fs.readFile(filePath, "utf8");
      } catch (error) {
        text = "";
      }
    }

    this.setState({
      dirty: false,
      fileName: getFileName(filePath),
      recentFiles,
      text,
      textSource: "file",
    });

    settings.saveProjectSettings(this);
  }

  /**
   * The project root will be determined from the given folder path. This will
   * typically be the expected root folder, but if a subfolder is provided, the
   * actual root will be determined by looking up the folder hierarchy for the
   * closest config.ori or package.json file.
   */
  async loadFolder(folderPath) {
    // As of 2026-01-08, a timing issue requires that we get globals first so
    // that we can then make calls like getParent or getPackageData that
    // require that things like extension handlers are registered. This is
    // because the language package caches the set of globals when it
    // shouldn't.
    this._globals = await getGlobals(folderPath);

    // Look for root *after* getting globals
    this._root = await projectRootFromPath(folderPath);

    // Arrange for root to use this project's file extension handlers instead of
    // global handlers that might have previously been loaded.
    this._root.handlers = this._globals;

    // Until a file is loaded, use the root as the file parent
    this._fileParent = this._root;

    this._packageData = await getPackageData(this._root);
    this._sitePath = await getSitePath(this._packageData, this._root);
    this._site = null;
    await this.reloadSite();

    const projectSettings = await settings.loadProjectSettings(this._root.path);
    const recentCommands = projectSettings.recentCommands || [];
    const recentFiles = projectSettings.recentFiles || [];
    const command = recentCommands.at(-1) || "";

    this.setState({
      command,
      projectName: getProjectName(folderPath, this._root, this._packageData),
      recentCommands,
      recentFiles,
    });

    updateWindow(this);

    // If the last run didn't result in an error, auto-run the last command
    if (!projectSettings.lastRunHadError && command) {
      this.run();
    }
  }

  get name() {
    return this.state.projectName;
  }

  async nextCommand() {
    const command = this.state.command;
    const commands = this.state.recentCommands || [];
    const index = commands.indexOf(command);
    let nextCommand;
    if (index >= 0 && index < commands.length - 1) {
      nextCommand = commands[index + 1];
    } else {
      nextCommand = "";
    }
    this.setState({ command: nextCommand });
  }

  async previousCommand() {
    const command = this.state.command;
    const commands = this.state.recentCommands || [];
    const index = commands.indexOf(command);
    let previousCommand;
    if (index > 0) {
      previousCommand = commands[index - 1];
    } else if (command === "" && commands.length > 0) {
      previousCommand = commands[commands.length - 1];
    } else {
      return;
    }
    this.setState({ command: previousCommand });
  }

  get recentFiles() {
    return this.state.recentFiles;
  }
  set recentFiles(recentFiles) {
    this.setState({ recentFiles });
  }

  // Save and run
  async refresh() {
    if (!this.filePath) {
      // Refresh disabled until file has been saved
      return;
    }

    // Save before running
    if (this.dirty) {
      const saved = await this.save();
      if (!saved) {
        return;
      }
    }

    this.run();
  }

  async reloadSite() {
    if (this._sitePath) {
      // Load site
      this._site = await loadSite(this._root, this._sitePath);
    } else {
      this._site = null;
    }
  }

  get root() {
    return this._root;
  }

  restartRefreshTimeout() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }
    this._refreshTimeout = setTimeout(() => {
      this._refreshTimeout = null;
      this.refresh();
    }, REFRESH_DELAY_MS);
  }

  get result() {
    return this._result;
  }

  async run() {
    let command = this.state.command;

    if (!command) {
      return;
    }

    let error = null;
    try {
      this._result = await evaluate(command, {
        enableCaching: false,
        globals: this._globals,
        mode: "shell",
        parent: this._fileParent,
      });

      if (this._result instanceof Function) {
        // Invoke the function to get the final desired result
        this._result = await this._result();
      }
    } catch (/** @type {any} */ e) {
      this._result = null;
      error = formatError(e);
      // Remove ANSI escape codes from the message.
      error = error.replace(/\x1b\[[0-9;]*m/g, "");
      // Prevent HTML in the error message from being interpreted as HTML.
      error = error.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    let resultVersion = this.state.resultVersion;
    if (!error) {
      // Bump result version to let renderer know to reload result
      resultVersion++;
    }

    const commands = recentCommandsUpdater.add(
      this.state.recentCommands || [],
      command
    );
    this.setState({
      error,
      recentCommands: commands,
      resultVersion,
    });

    settings.saveProjectSettings(this);
  }

  // Write text to file
  async save() {
    try {
      await fs.writeFile(this.filePath, this.text, "utf8");
    } catch (/** @type {any} */ error) {
      dialog.showMessageBox(this.window, {
        type: "error",
        message: "Save Failed",
        detail: `Failed to save file "${this.filePath}": ${error.message}`,
      });
      return false;
    }

    // Mark as clean
    this.dirty = false;

    // If the user is editing a JavaScript file, reset the module cache so that
    // top-level modules are reloaded on each request. Only top-level modules
    // will be reloaded; to reload modules those depend on will require a more
    // complex solution.
    const extname = path.extname(this.filePath).toLowerCase();
    const jsExtensions = [".cjs", ".js", ".mjs", ".ts"];
    if (jsExtensions.includes(extname)) {
      moduleCache.resetTimestamp();
    }

    // If the user is editing a .ori file, reload the site
    const oriExtensions = [".ori"];
    if (oriExtensions.includes(extname)) {
      await this.reloadSite();
    }

    // If the user is editing a CSS file or any of the above, clear the Chromium cache.
    const cssExtensions = [".css", ".scss", ".sass", ".less"];
    const reloadExtension = [
      ...jsExtensions,
      ...oriExtensions,
      ...cssExtensions,
    ];
    if (reloadExtension.includes(extname)) {
      await clearBrowserCache(this.window);
    }

    return true;
  }

  async saveAs(filePath) {
    // Hack: set the filePath first so that save() works correctly
    this._filePath = filePath;
    const saved = await this.save();
    // Then reload the project from the new file path
    await this.loadFile(filePath);
    return saved;
  }

  async setState(changes) {
    const { newState, changed } = updateState(this.state, changes);
    this.state = newState;

    if (changed.dirty) {
      if (newState.dirty) {
        this.restartRefreshTimeout();
      }
    }

    updateWindow(this);
    await this.broadcastState();
  }

  // Return the project settings that should be persisted
  get settings() {
    // Remove null (unsaved) files from recent files
    const recentFiles = this.state.recentFiles.filter(
      (filePath) => filePath !== null
    );

    return {
      lastRunHadError: this.state.error !== null,
      recentCommands: this.state.recentCommands,
      recentFiles,
    };
  }

  get site() {
    return this._site;
  }

  get text() {
    return this.state.text;
  }
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

async function evaluate(source, options = {}) {
  const fn = compile.expression(source, options);

  let value = await fn();
  if (value instanceof Function) {
    value = await value();
  }

  return value;
}

async function getGlobals(folderPath) {
  // Need to add Origami builtins to the globals before getting them
  initializeBuiltins();

  const globals = await coreGlobals();

  // Now get config. The config.ori file may require access to globals,
  // which will obtain the core globals set above. Once we've got the
  // config, we add it to the globals.
  const config = await projectConfig(folderPath);

  const merged = Object.assign({}, globals, config);
  return merged;
}

function getFileName(filePath) {
  return filePath ? path.basename(filePath) : "Untitled";
}

function getProjectName(filePath, root, packageData) {
  if (!filePath) {
    return "New project";
  }
  if (packageData?.name) {
    return packageData.name;
  }
  if (!root) {
    return "";
  }

  // Name is the name of the root folder
  const rootPath = root.path;
  return path.basename(rootPath);
}

async function getParent(root, filePath) {
  // Traverse from the project root to the current directory.
  const dirname = path.dirname(filePath);
  const relative = path.relative(root.path, dirname);
  return await Tree.traversePath(root, relative);
}

async function getPackageData(root) {
  const packageJson = await root?.get("package.json");
  return packageJson?.unpack();
}

async function getSitePath(packageData, root) {
  // Check for `$` global first
  // if (globals?.$) {
  //   let site = globals.$;
  //   if (isUnpackable(site)) {
  //     site = await site.unpack();
  //   }
  //   return site;
  // }

  // Check if we have package.json data
  if (!packageData) {
    return null;
  }

  // Get the `start` script
  const startScript = packageData.scripts?.start;
  if (!startScript) {
    return null;
  }

  // Look for the first path to a .ori file in the start script
  const sitePathRegex = /[A-Za-z0-9\/\.\-]*\.ori/;
  const match = startScript.match(sitePathRegex);
  if (!match) {
    return null;
  }

  const relativePath = match[0];
  const absolutePath = path.resolve(root.path, relativePath);
  return absolutePath;
}

async function loadSite(root, sitePath) {
  // Get relative path from root to sitePath
  const relative = path.relative(root.path, sitePath);
  const siteFile = await Tree.traversePath(root, relative);
  if (!siteFile) {
    return null;
  }

  // Evaluate the site file to get the site object
  let site;
  try {
    site = await siteFile.unpack();
  } catch (error) {
    return null;
  }

  return site;
}

// Reflect project state in the window
function updateWindow(project) {
  const { window, state } = project;
  window.setTitle(state.projectName);
  window.setDocumentEdited(state.dirty);
}
