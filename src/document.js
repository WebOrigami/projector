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
    return this.window.webContents.executeJavaScript(
      `document.getElementById('editor').value;`
    );
  }

  async setText(value) {
    await this.window.webContents.executeJavaScript(
      `document.getElementById('editor').value = ${JSON.stringify(value)};`
    );
  }

  get title() {
    return this.filePath ? basename(this.filePath) : "Untitled";
  }
}
