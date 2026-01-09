import { Tree, isUnpackable } from "@weborigami/async-tree";
import {
  compile,
  coreGlobals,
  moduleCache,
  projectConfig,
  projectRoot,
} from "@weborigami/language";
import { initializeBuiltins } from "@weborigami/origami";
import fs from "node:fs/promises";
import * as path from "node:path";
import * as recentCommands from "./recentCommands.js";
import updateState from "./renderer/updateState.js"; // Shared with renderer

const REFRESH_DELAY_MS = 250;

//
// Project state
//
export default class Project {
  constructor(window) {
    this.window = window;
    // State shared with the renderer
    this.state = {};
    this._filePath = null;
    this._globals = null;
    this._packageData = null;
    this._parent = null;
    this._refreshTimeout = null;
    this._result = null;
    this._root = null;
    this._site = null;

    this.setState({
      command: "",
      dirty: false,
      error: false,
      fileName: "",
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
  async load(filePath) {
    this._filePath = filePath;

    let text;
    if (filePath === null) {
      this._globals = null;

      this._root = null;
      this._parent = null;
      this._packageData = null;
      this._site = null;
      text = "";
    } else {
      // As of 2026-01-08, a timing issue requires that we get globals first so
      // that we can then make calls like getParent or getPackageData that
      // require that things like extension handlers are registered. This is
      // because the language package caches the set of globals when it
      // shouldn't.
      this._globals = await getGlobals(filePath);

      this._root = await getRoot(filePath);
      this._parent = await getParent(this._root, filePath);
      this._packageData = await getPackageData(this._root);
      this._site = await getSite(this._globals, this._root, this._packageData);
      text = await fs.readFile(filePath, "utf8");
    }

    this.setState({
      dirty: false,
      fileName: getFileName(filePath),
      projectName: getProjectName(filePath, this._root, this._packageData),
      text,
      textSource: "file",
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

    let errorFlag;
    try {
      this._result = await evaluate(command, {
        enableCaching: false,
        globals: this._globals,
        mode: "shell",
        parent: this._parent,
      });
      errorFlag = false;
    } catch (error) {
      this._result = null;
      errorFlag = true;
    }

    this.setState({ error: errorFlag });
    if (!errorFlag) {
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

async function getGlobals(filePath) {
  // Need to add Origami builtins to the globals before getting them
  initializeBuiltins();

  const globals = await coreGlobals();

  // Now get config. The config.ori file may require access to globals,
  // which will obtain the core globals set above. Once we've got the
  // config, we add it to the globals.
  const dirname = path.dirname(filePath);
  const config = await projectConfig(dirname);

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

async function getRoot(filePath) {
  if (filePath === null) {
    return null;
  }
  const dirname = path.dirname(filePath);
  const root = await projectRoot(dirname);
  return root;
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
  window.setRepresentedFilename(filePath ?? "");
  window.setDocumentEdited(state.dirty);
}
