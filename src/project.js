import { Tree } from "@weborigami/async-tree";
import { projectGlobals, projectRoot } from "@weborigami/language";
import { initializeBuiltins } from "@weborigami/origami";
import * as path from "node:path";
import * as recentCommands from "./recentCommands.js";

//
// Project state
//
export default class Project {
  constructor(window) {
    this.window = window;
    this.state = {
      command: "",
    };
    this._filePath = null;
    this._globals = null;
    this._parent = null;
    this.dirty = false;
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

  async getCommand() {
    return this.executeJavaScript(`command.value;`);
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

  async getText() {
    return this.executeJavaScript(`editor.value;`);
  }

  async nextCommand() {
    const command = await this.getCommand();
    const commands = await recentCommands.getCommands();
    const index = commands.indexOf(command);
    if (index >= 0 && index < commands.length - 1) {
      const nextCommand = commands[index + 1];
      await this.setCommand(nextCommand);
    }
  }

  async previousCommand() {
    const command = await this.getCommand();
    const commands = await recentCommands.getCommands();
    const index = commands.indexOf(command);
    if (index > 0) {
      const previousCommand = commands[index - 1];
      await this.setCommand(previousCommand);
    } else if (commands.length > 0) {
      const lastCommand = commands[commands.length - 1];
      await this.setCommand(lastCommand);
    }
  }

  async run() {
    // Force iframe to reload. Because the frame's origin will be different than
    // the file: origin for the main window, the simplest way to reload it is to
    // reset its src attribute.
    await this.executeJavaScript(`reloadResult();`);
  }

  async setCommand(command) {
    await this.executeJavaScript(`command.value = ${JSON.stringify(command)};`);
  }

  async setText(value) {
    await this.executeJavaScript(`editor.value = ${JSON.stringify(value)};`);
  }

  get title() {
    return this.filePath ? path.basename(this.filePath) : "Untitled";
  }
}
