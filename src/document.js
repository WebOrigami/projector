import { basename } from "node:path";

// Document state. A Document doesn't store text directly but gets/sets it via
// the renderer process.
export default class Document {
  constructor(window) {
    this.window = window;
    this.filePath = null;
    this.dirty = false;
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
    return this.filePath ? basename(this.filePath) : "Untitled";
  }
}
