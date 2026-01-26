import {
  isUnpackable,
  keysFromPath,
  toString,
  Tree,
} from "@weborigami/async-tree";
import {
  compile,
  moduleCache,
  projectGlobals,
  projectRootFromPath,
} from "@weborigami/language";
import { dialog, shell } from "electron";
import fs from "node:fs";
import * as path from "node:path";
import * as menu from "./menu.js";
import recent from "./recent.js";
import updateState from "./renderer/updateState.js"; // Shared with renderer
import * as settings from "./settings.js";
import {
  formatError,
  getSitePath,
  preprocessResource,
  resolveHref,
} from "./utilities.js";
import * as windowManager from "./windowManager.js";

const REFRESH_DELAY_MS = 250;

const MAX_RECENT_COMMANDS = 50;
const recentCommandsUpdater = recent(MAX_RECENT_COMMANDS);
const backUpdater = recent(MAX_RECENT_COMMANDS);
const forwardUpdater = recent(MAX_RECENT_COMMANDS);

const MAX_RECENT_FILES = 10;
const recentFilesUpdater = recent(MAX_RECENT_FILES);

/**
 * Project state
 */
export default class Project {
  /**
   * Create a Project instance for the given window and project root path.
   *
   * To be used, the project must be loaded via loadProject(), which is async so
   * can't be called from the constructor.
   *
   * @param {import("electron").BrowserWindow} window
   * @param {string} rootPath
   */
  constructor(window, rootPath) {
    this._window = window;
    this._rootPath = rootPath;

    this._back = [];
    this._filePath = null;
    this._forward = [];
    this._packageData = null;
    this._refreshTimeout = null;
    this._result = null;
    this._root = null;
    this._runVersion = 0;
    this._site = null;

    // State shared with the renderer
    this.state = {};
    this.setState({
      backEnabled: false,
      command: "",
      dirty: false,
      error: null,
      fileName: getFileName(this._filePath),
      forwardEnabled: false,
      lastScroll: null,
      loadedVersion: 0,
      pageTitle: "",
      projectName: "New project",
      recentCommands: [],
      recentFiles: [],
      resultVersion: 0,
      sitePath: null,
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
    return this._window.webContents.send("invoke-page", "setState", snapshot);
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

  // Project window is closing
  close() {
    // Stop any file watching
    // @ts-ignore unwatch() does exist but isn't declared yet
    this._root?.unwatch();

    // Break connection to window
    /** @type {any} */ (this._window) = null;
  }

  get command() {
    return this.state.command;
  }
  set command(command) {
    this.setState({ command });
  }

  get recentCommands() {
    return this.state.recentCommands;
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

  // The page calls this on the project; forward to menu
  async fileOpen() {
    await menu.fileOpen(null, this._window);
  }

  async focusCommand() {
    return this.invokePageMethod("focusCommand");
  }

  async goBack() {
    if (this._back.length === 0) {
      return;
    }

    if (this.state.command !== "") {
      // Add current command to Forward stack
      this._forward = forwardUpdater.add(this._forward, this.state.command);
    }

    const command = this._back.pop();
    const backEnabled = this._back.length > 0;
    const forwardEnabled = this._forward.length > 0;

    await this.setState({
      backEnabled,
      command,
      forwardEnabled,
    });

    await this.run();
  }

  async goForward() {
    if (this._forward.length === 0) {
      return;
    }

    if (this.state.command !== "") {
      // Add current command to Back stack
      this._back = backUpdater.add(this._back, this.state.command);
    }

    const command = this._forward.pop();
    const backEnabled = this._back.length > 0;
    const forwardEnabled = this._forward.length > 0;

    await this.setState({
      backEnabled,
      command,
      forwardEnabled,
    });

    await this.run();
  }

  async goHome() {
    const command = this.state.sitePath ? `${this.state.sitePath}/` : "";
    if (command !== this.state.command) {
      await this.navigateAndRun(command);
    }
  }

  async invokePageFunction(functionName) {
    return this._window.webContents.executeJavaScript(`${functionName}()`);
  }

  async invokePageMethod(...args) {
    await this._window.webContents.send("invoke-page", ...args);
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

  /***
   * Load the most recent existing text file
   */
  async loadMostRecentFile() {
    let filePath = null;
    let text;
    const recentFiles = this.state.recentFiles;
    while (recentFiles.length > 0) {
      filePath = recentFiles.at(-1);
      const loaded = loadFileText(filePath);
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

    this.setState({
      dirty: false,
      fileName: getFileName(filePath),
      recentFiles,
      text: text ?? "",
      textSource: "file",
    });

    await settings.saveProjectSettings(this);
  }

  /**
   * (Re)load the project from the folder with the given root path.
   */
  async loadProject() {
    this._root = await projectRootFromPath(this._rootPath);

    // Force determination of project globals so we can patch them
    await projectGlobals(this._root);
    const globals = /** @type {any}  */ (this._root).globals;
    // Add all Dev globals at top level for convenience and to match CLI
    Object.assign(globals, globals.Dev);

    this._packageData = await getPackageData(this._root);
    const projectName = getProjectName(this._root, this._packageData);

    const sitePath = getSitePath(this._packageData);
    this._site = null;

    const projectSettings = await settings.loadProjectSettings(this._root.path);
    const recentCommands = projectSettings.recentCommands || [];
    const recentFiles = projectSettings.recentFiles || [];

    let command;
    // Use last command if it exists, otherwise run site if that exists
    if (recentCommands.length > 0) {
      command = recentCommands.at(-1);
    } else if (sitePath) {
      command = `${sitePath}/`;
    } else {
      command = "";
    }

    this.setState({
      command,
      projectName,
      recentCommands,
      recentFiles,
      sitePath,
    });

    updateWindow(this);

    // Watch for file changes in the project file tree
    const project = this;
    this._root.addEventListener("change", async (/** @type {any} */ event) => {
      if (!project._window) {
        debugger;
      }
      const { filePath } = event.options;
      this.onChange(filePath);
    });
    // @ts-ignore watch() does exist but isn't declared yet
    this._root.watch();

    if (recentFiles.length > 0) {
      await this.loadMostRecentFile();
    } else if (sitePath) {
      // No recent files, load the site file
      const absolutePath = path.join(this._root.path, sitePath);
      await this.loadFile(absolutePath);
    }

    // If the last run didn't result in an error, auto-run the last command
    if (!projectSettings.lastRunHadError && command) {
      await this.run();
    }
  }

  get name() {
    return this.state.projectName;
  }

  async navigateAndRun(command) {
    if (this.state.command && this.state.command !== "") {
      // Add previous command to Back stack
      this._back = backUpdater.add(this._back, this.state.command);
    }

    // Clear Forward stack
    this._forward = [];

    const backEnabled = this._back.length > 0;
    const forwardEnabled = this._forward.length > 0;

    await this.setState({
      backEnabled,
      command,
      forwardEnabled,
    });

    await this.run();
  }

  /**
   * The user clicked a link with the given href.
   *
   * @param {string} href
   */
  async navigateToHref(href) {
    const command = resolveHref(href, this.state.command, this.state.sitePath);

    if (command === null) {
      // External URL, open in browser
      await shell.openExternal(href);
      return;
    }

    await this.navigateAndRun(command);
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

  async onChange(filePath) {
    if (!this._root) {
      // Project not loaded yet
      return;
    }

    const relativePath = path.relative(this._root.path, filePath);

    const keys = keysFromPath(relativePath);
    if (keys.length > 0 && keys[0].startsWith(".") && keys[0].endsWith("/")) {
      // Ignore changes in root-level dot folders like `.git`
      return;
    }

    if (filePath !== this._filePath) {
      // Editing some file that's not the active file
      await this.clearCacheForFileChange(filePath);

      if (relativePath === "package.json" || relativePath === "config.ori") {
        // Need to reload project: project name, site, and config/globals may
        // have changed.
        await this.loadProject();
        await windowManager.addToRecentProjects(this); // in case name changed
        return;
      }

      if (relativePath === this.state.sitePath) {
        // Will need to reload site
        this._site = null;
      }

      if (!this._refreshTimeout) {
        // If we haven't already queued a refresh, do so now
        this.restartRefreshTimeout();
      }
      return;
    }

    if (this.state.dirty) {
      // User has edited file, ignore external changes
      return;
    }

    // See if file text has actually changed
    const text = loadFileText(filePath);
    if (text === this.state.text) {
      // Change event was result of our own save, ignore
      return;
    }

    // Force reload of current file through our normal path
    await this.loadMostRecentFile();

    await this.clearCacheForFileChange(filePath);
    if (!this._refreshTimeout) {
      // Refresh immediately
      this.refresh();
    }
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

  // Save and tell renderer to reload result pane
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

    const lastScroll = await this.invokePageFunction("getScrollPosition");
    await this.setState({ lastScroll });

    await this.run();
  }

  restartRefreshTimeout() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }
    this._refreshTimeout = setTimeout(async () => {
      this._refreshTimeout = null;
      await this.refresh();
    }, REFRESH_DELAY_MS);
  }

  get result() {
    return this._result;
  }

  get root() {
    return this._root;
  }

  async run() {
    this._runVersion++;
    await settings.saveProjectSettings(this);

    let command = this.state.command;

    if (!command) {
      return;
    }

    let error = null;
    try {
      let result = await evaluate(command, {
        enableCaching: false,
        mode: "shell",
        parent: this._root,
      });
      this._result = await preprocessResource(result);
    } catch (/** @type {any} */ e) {
      this._result = null;
      error = formatError(e);
    }

    let resultVersion = this.state.resultVersion;
    if (!error) {
      // Bump result version to let renderer know to reload result
      resultVersion = this._runVersion;
    }

    const commands = recentCommandsUpdater.add(
      this.state.recentCommands || [],
      command,
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

  // Used by protocol to signal error to renderer
  async setError(error) {
    // Don't overwrite an error already present in state
    if (!this.state.error) {
      await this.setState({ error });
    }
  }

  async setState(changes) {
    const { newState, changed } = updateState(this.state, changes);
    this.state = newState;

    if (changed.dirty) {
      if (newState.dirty) {
        this.restartRefreshTimeout();
      }
    }

    if (changed.loadedVersion) {
      if (
        newState.loadedVersion > 0 &&
        newState.loadedVersion === this._runVersion
      ) {
        // Result has finished loading successfully
        await settings.saveProjectSettings(this);
      }
    }

    updateWindow(this);
    await this.broadcastState();
  }

  // Return the project settings that should be persisted
  get settings() {
    // Remove null (unsaved) files from recent files
    const recentFiles = this.state.recentFiles.filter(
      (filePath) => filePath !== null,
    );

    // If the run version is greater than the loaded version, the last run had
    // an error.
    const lastRunHadError = this._runVersion > this.state.loadedVersion;

    return {
      lastRunHadError,
      recentCommands: this.state.recentCommands,
      recentFiles,
    };
  }

  // Return a promise for the loaded site
  get site() {
    if (!this._site) {
      if (this.state.sitePath) {
        // Load site from path
        this._site = loadSite(this._root, this.state.sitePath);
      } else {
        // Use root as site
        this._site = this._root;
      }
    }

    return this._site;
  }

  get sitePath() {
    return this.state.sitePath;
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
  const { parent } = options;
  const globals = await projectGlobals(parent);
  const fn = compile.expression(source, { ...options, globals });

  let value = await fn();
  if (value instanceof Function) {
    value = await value();
  }

  return value;
}

function getFileName(filePath) {
  return filePath ? path.basename(filePath) : "Untitled";
}

function getProjectName(root, packageData) {
  if (packageData?.name) {
    return packageData.name;
  }

  // Name is the name of the root folder
  const rootPath = root.path;
  return path.basename(rootPath);
}

async function getPackageData(root) {
  const packageJson = await root?.get("package.json");
  return packageJson?.unpack();
}

/**
 * Return the text for the given file, or the empty string for a new file.
 *
 * Returns null if the file couldn't be loaded (e.g., doesn't exist, permission
 * denied), or isn't text.
 *
 * @param {string} filePath
 */
function loadFileText(filePath) {
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

async function loadSite(root, sitePath) {
  // Evaluate the site file to get the site object
  let site;
  try {
    site = await Tree.traversePath(root, sitePath);
    if (isUnpackable(site)) {
      site = await site.unpack();
    }
  } catch (error) {
    return null;
  }

  return site;
}

// Reflect project state in the window
function updateWindow(project) {
  const { _window: window, state } = project;
  try {
    let title = state.projectName;
    if (state.pageTitle && state.pageTitle !== "") {
      title += ` — ${state.pageTitle}`;
    }
    window.setTitle(title);
    window.setDocumentEdited(state.dirty);
  } catch (error) {
    console.error("Failed to update window state:", error);
  }
}
