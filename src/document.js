import { Tree } from "@weborigami/async-tree";
import { projectGlobals, projectRoot } from "@weborigami/language";
import * as path from "node:path";

// Document state. A Document doesn't store text directly but gets/sets it via
// the renderer process.
export default class Document {
  constructor(window) {
    this.window = window;
    this.dirty = false;
    this._filePath = null;
    this._globals = null;
    this._parent = null;
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

  async getGlobals() {
    if (this._globals || this.filePath === null) {
      return this._globals;
    }

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
    return this.window.webContents.executeJavaScript(`editor.value;`);
  }

  async run() {
    // Force iframe to reload. Because the frame's origin will be different than
    // the file: origin for the main window, the simplest way to reload it is to
    // reset its src attribute.
    await this.window.webContents.executeJavaScript(`
      result.src = "origami://root";
    `);
  }

  async setText(value) {
    await this.window.webContents.executeJavaScript(
      `editor.value = ${JSON.stringify(value)};`
    );
  }

  get title() {
    return this.filePath ? path.basename(this.filePath) : "Untitled";
  }
}
