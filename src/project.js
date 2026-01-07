import { Tree, toString } from "@weborigami/async-tree";
import {
  compile,
  moduleCache,
  projectGlobals,
  projectRoot,
} from "@weborigami/language";
import { initializeBuiltins } from "@weborigami/origami";
import fs from "node:fs/promises";
import * as path from "node:path";
import * as recentCommands from "./recentCommands.js";
import updateState from "./renderer/updateState.js"; // Shared with renderer
import updateWindowTitle from "./updateWindowTitle.js";

const REFRESH_DELAY_MS = 250;

//
// Project state
//
export default class Project {
  constructor(window) {
    this.window = window;
    // State shared with the renderer
    this.state = {
      command: "",
      dirty: false,
      // error: null,
      text: "",
    };
    this._filePath = null;
    this._globals = null;
    this._parent = null;
    this._refreshTimeout = null;
    this._result = null;
    this._site = null;
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
  set filePath(filePath) {
    this._filePath = filePath;

    // Recalculate these the next time they're requested
    this._parent = null;
    this._globals = null;
    this._site = null;

    updateWindowTitle(this.window);
  }

  executeJavaScript(js) {
    return this.window.webContents.executeJavaScript(js);
  }

  focusCommand() {
    return this.executeJavaScript(`command.focus();`);
  }

  async getGlobals() {
    if (this._globals || this.filePath === null) {
      return this._globals;
    }

    // Need to add Origami builtins to the globals
    initializeBuiltins();

    const dirname = path.dirname(this.filePath);
    this._globals = await projectGlobals(dirname);
    return this._globals;
  }

  async getParent() {
    if (this._parent || this.filePath === null) {
      return this._parent;
    }

    // Traverse from the project root to the current directory.
    const root = await this.getRoot();
    const dirname = path.dirname(this.filePath);
    const relative = path.relative(root.path, dirname);
    this._parent = await Tree.traversePath(root, relative);
    return this._parent;
  }

  async getRoot() {
    if (this.filePath === null) {
      return null;
    }

    const dirname = path.dirname(this.filePath);
    const root = await projectRoot(dirname);
    return root;
  }

  async getSite() {
    if (this._site || this.filePath === null) {
      return this._site;
    }

    const globals = await this.getGlobals();
    if (globals?.$site) {
      this._site = globals.$site;
      return this._site;
    }

    // Look in project root for package.json
    const root = await this.getRoot();
    const packageJson = await root.get("package.json");
    if (!packageJson) {
      return null;
    }

    // Get the `start` script
    let packageData;
    try {
      packageData = JSON.parse(toString(packageJson));
    } catch (error) {
      return null;
    }
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

    this._site = site;
    return this._site;
  }

  // Read file
  async load() {
    this.text = await fs.readFile(this.filePath, "utf8");
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
    const globals = await this.getGlobals();
    const parent = await this.getParent();

    let command = this.command;
    if (command) {
      recentCommands.addCommand(command);
    } else {
      command = `<${this.filePath}>`;
    }

    try {
      this._result = await evaluate(command, {
        enableCaching: false,
        globals,
        mode: "shell",
        parent,
      });
    } catch (error) {
      this._result = error;
    }

    this.reload();
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

  async setState(changes) {
    const { newState, changed } = updateState(this.state, changes);
    this.state = newState;

    if (changed.dirty) {
      updateWindowTitle(this.window);
      if (newState.dirty) {
        this.restartRefreshTimeout();
      }
    }

    this.broadcastState();
  }

  get text() {
    return this.state.text;
  }
  set text(text) {
    this.setState({
      dirty: false, // Setting text resets dirty flag
      text,
    });
  }

  get title() {
    return this.filePath ? path.basename(this.filePath) : "Untitled";
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
