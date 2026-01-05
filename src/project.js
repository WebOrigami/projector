import { Tree } from "@weborigami/async-tree";
import { projectGlobals, projectRoot } from "@weborigami/language";
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
    this.state = {
      command: "",
      dirty: false,
      text: "",
    };
    this._filePath = null;
    this._globals = null;
    this._parent = null;
    this._refreshTimeout = null;
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
    const dirname = path.dirname(this.filePath);
    const root = await projectRoot(dirname);
    const relative = path.relative(root.path, dirname);
    this._parent = await Tree.traversePath(root, relative);
    return this._parent;
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

  restartRefreshTimeout() {
    if (this._refreshTimeout) {
      clearTimeout(this._refreshTimeout);
    }
    this._refreshTimeout = setTimeout(() => {
      this._refreshTimeout = null;
      if (this.filePath && this.command) {
        this.run();
      }
    }, REFRESH_DELAY_MS);
  }

  async run() {
    // Save before running
    if (this.dirty) {
      const saved = await this.save();
      if (!saved) {
        return;
      }
    }

    // Force iframe to reload. Because the frame's origin will be different than
    // the file: origin for the main window, the simplest way to reload it is to
    // reset its src attribute.
    await this.executeJavaScript(`reloadResult();`);
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
    }
    if (changed.text) {
      this.restartRefreshTimeout();
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
