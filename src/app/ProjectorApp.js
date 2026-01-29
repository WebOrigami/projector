import { app, Menu } from "#electron";
import fs from "node:fs";
import path from "node:path";
import AppBase from "./AppBase.js";
import { createMenuTemplate } from "./menu.js";

const settingsFileName = "settings.json";
const settingsPath = path.join(app.getPath("userData"), settingsFileName);

/**
 * Main Projector application object
 *
 * In addition to holding app state, this wires together the window manager, the
 * set of open projects, and the settings storage.
 */
export default class ProjectorApp extends AppBase {
  constructor() {
    super();

    try {
      const json = fs.readFileSync(settingsPath, "utf8");
      const data = JSON.parse(json);
      Object.assign(this._state, data);
    } catch (error) {
      // File doesn't exist or is invalid, will use default state
    }

    // If projects are loaded, the menu will be updated -- but since there may
    // not be any, we initialize the menu to its default state here.
    this.createMenu();
  }

  createMenu() {
    const template = createMenuTemplate(this.state, this._isFileOpen);
    // @ts-ignore
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  async render(state, changed) {
    await super.render(state, changed);

    if (changed.openProjects || changed.recentProjects || changed.projects) {
      this.createMenu();
    }

    if (Object.keys(changed).length > 0) {
      await this.saveSettings();
    }
  }

  // Save updated settings to disk
  async saveSettings() {
    try {
      const json = JSON.stringify(this._state, null, 2);
      await fs.promises.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.promises.writeFile(settingsPath, json, "utf8");
    } catch (error) {
      console.error("Failed to save settings:", error);
    }
  }
}
