import { Tree, isUnpackable } from "@weborigami/async-tree";
import {
  compile,
  coreGlobals,
  formatError,
  moduleCache,
  projectConfig,
  projectRootFromPath,
} from "@weborigami/language";
import { initializeBuiltins } from "@weborigami/origami";
import fs from "node:fs/promises";
import * as path from "node:path";
import * as recentCommands from "./recentCommands.js";
import updateState from "./renderer/updateState.js"; // Shared with renderer

const REFRESH_DELAY_MS = 250;

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

    this.setState({
      command: "",
      dirty: false,
      error: null,
      fileName: getFileName(this._filePath),
      projectName: "New project",
      text: "",
      textSource: "file",
    });
  }

  broadcastState() {
    // We want a copy and can only send structured-clonable data anyway, so we
    // use structuredClone to copy the state.
    const snapshot = structuredClone(this.state);
    return this.window.webContents.send("state:changed", snapshot);
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

  focusCommand() {
    return this.executeJavaScript(`command.focus();`);
  }

  // Read file
  async loadFile(filePath) {
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

    this._filePath = filePath;
    this._fileParent = await getParent(this._root, filePath);

    const text = await fs.readFile(filePath, "utf8");

    this.setState({
      dirty: false,
      fileName: getFileName(filePath),
      text,
      textSource: "file",
    });
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

    this._packageData = await getPackageData(this._root);
    this._site = await getSite(this._globals, this._root, this._packageData);

    this.setState({
      projectName: getProjectName(folderPath, this._root, this._packageData),
    });

    updateWindow(this);
  }

  async nextCommand() {
    const command = this.command;
    const commands = await recentCommands.getCommands();
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
    const command = this.command;
    const commands = await recentCommands.getCommands();
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

  async reload() {
    // Force iframe to reload. Because the frame's origin will be different than
    // the file: origin for the main window, the simplest way to reload it is to
    // reset its src attribute.
    await this.executeJavaScript(`reloadResult();`);
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
    let command = this.command;
    if (command) {
      recentCommands.addCommand(command);
    } else {
      // command = `<${this.filePath}>`;
      return;
    }

    let error;
    try {
      this._result = await evaluate(command, {
        enableCaching: false,
        globals: this._globals,
        mode: "shell",
        parent: this._fileParent,
      });
      error = null;
    } catch (e) {
      this._result = null;
      error = formatError(e);
      // Remove ANSI escape codes from the message.
      error = error.replace(/\x1b\[[0-9;]*m/g, "");
      // Prevent HTML in the error message from being interpreted as HTML.
      error = error.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    this.setState({ error });
    if (!error) {
      this.reload();
    }
  }

  // Write text to file
  async save() {
    try {
      await fs.writeFile(this.filePath, this.text, "utf8");
    } catch (error) {
      dialog.showMessageBox(this.window, {
        type: "error",
        message: "Save Failed",
        detail: `Failed to save file "${this.filePath}": ${error.message}`,
      });
      return false;
    }

    // Mark as clean
    this.dirty = false;

    return true;
  }

  async saveAs(filePath) {
    // Hack: set the filePath first so that save() works correctly
    this._filePath = filePath;
    const saved = await this.save();
    // Then reload the project from the new file path
    await this.load(filePath);
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
    this.broadcastState();
  }

  get site() {
    return this._site;
  }

  get text() {
    return this.state.text;
  }
}

async function evaluate(source, options = {}) {
  const fn = compile.expression(source, options);

  // Reset the module cache so that modules are reloaded on each request
  moduleCache.resetTimestamp();

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

async function getSite(globals, root, packageData) {
  // Check for `$` global first
  if (globals?.$) {
    let site = globals.$;
    if (isUnpackable(site)) {
      site = await site.unpack();
    }
    return site;
  }

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

  // Get the site file
  const sitePath = match[0];
  const siteFile = await Tree.traversePath(root, sitePath);
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
  const { window, filePath, state } = project;

  window.setTitle(state.projectName);
  window.setDocumentEdited(state.dirty);
}
